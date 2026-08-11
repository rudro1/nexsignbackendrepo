

const mongoose        = require('mongoose');
const crypto          = require('crypto');
const { v2: cloudinary } = require('cloudinary');
const Template        = require('../models/Template');
const TemplateSession = require('../models/TemplateSession');
const User            = require('../models/User');
const AuditLog        = require('../models/AuditLog');

// ─── Safe imports (pdfService may not exist yet) ──────────────
let pdfService = null;
try {
  pdfService = require('../utils/pdfService');
} catch (e) {
  console.warn('[templateController] pdfService not found:', e.message);
}

// ─── Safe email imports ───────────────────────────────────────
let emailService = {};
try {
  emailService = require('../utils/emailService');
} catch (e) {
  console.warn('[templateController] emailService not found:', e.message);
}

const {
  sendBossApprovalEmail,
  sendEmployeeSigningEmail,
  sendCompletionEmail,
  sendCCEmail,
  sendDeclinedEmail,
} = emailService;

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════
const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const generateToken = () =>
  crypto.randomBytes(32).toString('hex');

const getIP = req =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  req.headers['x-real-ip'] ||
  req.ip ||
  'Unknown';

// ── Device parser ─────────────────────────────────
function parseDevice(ua = '') {
  let device = 'Unknown', browser = 'Unknown',
      os = 'Unknown', deviceType = 'desktop';

  if      (/iPhone/.test(ua))   { device = 'iPhone';  os = 'iOS';     deviceType = 'mobile';  }
  else if (/iPad/.test(ua))     { device = 'iPad';    os = 'iPadOS';  deviceType = 'tablet';  }
  else if (/Android/.test(ua))  {
    device = ua.match(/Android[^;]*;\s*([^)]+)\)/)?.[1]?.trim() || 'Android';
    os     = `Android ${ua.match(/Android\s([\d.]+)/)?.[1] || ''}`.trim();
    deviceType = /Mobile/.test(ua) ? 'mobile' : 'tablet';
  }
  else if (/Windows/.test(ua))  { device = 'Windows PC'; os = 'Windows'; }
  else if (/Mac/.test(ua))      { device = 'Mac';         os = 'macOS';   }
  else if (/Linux/.test(ua))    { device = 'Linux PC';    os = 'Linux';   }

  if      (/Edg\//.test(ua))     browser = `Edge ${ua.match(/Edg\/([\d.]+)/)?.[1]       || ''}`.trim();
  else if (/OPR\//.test(ua))     browser = `Opera ${ua.match(/OPR\/([\d.]+)/)?.[1]      || ''}`.trim();
  else if (/Chrome\//.test(ua))  browser = `Chrome ${ua.match(/Chrome\/([\d.]+)/)?.[1]  || ''}`.trim();
  else if (/Firefox\//.test(ua)) browser = `Firefox ${ua.match(/Firefox\/([\d.]+)/)?.[1]|| ''}`.trim();
  else if (/Safari\//.test(ua))  browser = `Safari ${ua.match(/Version\/([\d.]+)/)?.[1] || ''}`.trim();

  return { device, browser, os, deviceType, isMobile: deviceType === 'mobile' };
}

// ── Geo lookup — ipapi.co (reliable on Vercel) ────
async function getGeoInfo(ip) {
  try {
    const clean = ip?.replace('::ffff:', '').trim() || '';
    if (!clean || clean === '127.0.0.1' || clean === '::1'
        || clean.startsWith('192.168.') || clean.startsWith('10.')) {
      return {
        city: 'Local', country: 'Dev',
        postalCode: '0000', timezone: 'UTC',
        region: '', display: 'Local Dev',
      };
    }

    // Primary: ipapi.co
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 4000);
      const res  = await fetch(`https://ipapi.co/${clean}/json/`, {
        signal:  ctrl.signal,
        headers: { 'User-Agent': 'nexsign/1.0' },
      });
      clearTimeout(tid);
      if (res.ok) {
        const d = await res.json();
        if (!d.error) return {
          city:       d.city         || '',
          country:    d.country_name || '',
          postalCode: d.postal       || '',
          region:     d.region       || '',
          timezone:   d.timezone     || 'UTC',
          latitude:   String(d.latitude  || ''),
          longitude:  String(d.longitude || ''),
          display:    [d.city, d.country_name].filter(Boolean).join(', '),
        };
      }
    } catch {}

    // Fallback: ip-api.com
    try {
      const ctrl2 = new AbortController();
      const tid2  = setTimeout(() => ctrl2.abort(), 4000);
      const res2  = await fetch(
        `http://ip-api.com/json/${clean}?fields=status,city,regionName,country,zip,timezone,lat,lon`,
        { signal: ctrl2.signal },
      );
      clearTimeout(tid2);
      if (res2.ok) {
        const d2 = await res2.json();
        if (d2.status === 'success') return {
          city:       d2.city       || '',
          country:    d2.country    || '',
          postalCode: d2.zip        || '',
          region:     d2.regionName || '',
          timezone:   d2.timezone   || 'UTC',
          latitude:   String(d2.lat || ''),
          longitude:  String(d2.lon || ''),
          display:    [d2.city, d2.country].filter(Boolean).join(', '),
        };
      }
    } catch {}

    return {};
  } catch {
    return {};
  }
}

const FRONT = () =>
  (process.env.FRONTEND_URL || 'https://nexsignfrontend.vercel.app')
    .replace(/\/$/, '');

// ── Safe audit log ────────────────────────────────
async function safeAuditLog(payload) {
  try {
    await AuditLog.create({
      document_id:        payload.document_id    || null,
      document_title:     payload.document_title || null,
      is_template_action: true,
      action:             payload.action,
      performed_by:       payload.performed_by   || {},
      device:             payload.device         || {},
      location:           payload.location       || {},
      local_time:         payload.local_time     || null,
    });
  } catch (e) {
    console.error('[AuditLog]', e.message);
  }
}

// ── Safe emit socket ──────────────────────────────
function emitSocket(req, event, data) {
  try {
    const io = req.app.get('io');
    if (io) io.emit(event, data);
  } catch {}
}

// ── Upload PNG buffer to Cloudinary ──────────────
async function uploadSignaturePng(base64DataUrl, folder = 'nexsign/signatures') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder },
      (err, result) => err ? reject(err) : resolve(result),
    );
    // Convert base64 dataUrl → buffer
    const base64 = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');
    stream.end(Buffer.from(base64, 'base64'));
  });
}

// ════════════════════════════════════════════════════
// 1. CREATE TEMPLATE
// POST /api/templates
// ════════════════════════════════════════════════════
const createTemplate = asyncHandler(async (req, res) => {
  const {
    title, description,
    fileUrl, filePublicId, fileName, fileSize,
    fields,                    // ✅ unified fields array (assignedTo: boss/employee)
    recipients, ccList,
    signingConfig, totalPages,
    companyName, companyLogo, message,
  } = req.body;

  // ── Validation ────────────────────────────────────
  if (!title?.trim())
    return res.status(400).json({ success: false, message: 'Title is required.' });
  if (!fileUrl)
    return res.status(400).json({ success: false, message: 'PDF file is required.' });

  const parsedRecipients = Array.isArray(recipients) ? recipients : [];
  if (!parsedRecipients.length)
    return res.status(400).json({ success: false, message: 'At least one recipient is required.' });

  // Duplicate email check
  const emails = parsedRecipients.map(r => r.email?.toLowerCase().trim());
  if (new Set(emails).size !== emails.length)
    return res.status(400).json({ success: false, message: 'Duplicate recipient emails found.' });

  const parsedFields     = Array.isArray(fields)     ? fields     : [];
  const parsedCC         = Array.isArray(ccList)      ? ccList      : [];
  const parsedConfig     = signingConfig || {};
  const bossSignsFirst   = parsedConfig.bossSignsFirst !== false;

  const template = await Template.create({
    title:        title.trim(),
    description:  description || '',
    owner:        req.user._id,
    fileUrl,
    filePublicId: filePublicId || '',
    fileName:     fileName     || '',
    fileSize:     fileSize     || 0,
    fields:       parsedFields,
    recipients:   parsedRecipients,
    ccList:       parsedCC,
    companyName:  companyName  || '',
    companyLogo:  companyLogo  || '',
    message:      message      || '',
    signingConfig: {
      bossSignsFirst,
      expiryDays:   parsedConfig.expiryDays   || 30,
      allowDecline: parsedConfig.allowDecline !== false,
      reminderDays: parsedConfig.reminderDays || 3,
      emailSubject: parsedConfig.emailSubject || '',
      emailMessage: parsedConfig.emailMessage || '',
    },
    totalPages: Number(totalPages) || 1,
    status:     bossSignsFirst ? 'boss_pending' : 'active',
    stats: {
      totalRecipients: parsedRecipients.length,
      pending:         parsedRecipients.length,
      signed:          0, declined: 0, viewed: 0,
    },
  });

  // Send boss approval email
  if (bossSignsFirst) {
    try {
   await sendBossApprovalEmail?.({
    // ✅ FIXED
    bossEmail:     req.user.email,
    bossName:      req.user.full_name || req.user.name || 'Boss',
    bossDesignation: req.user.designation || '',
    documentTitle: template.title,
    signingLink:   `${FRONT()}/templates/${template._id}`,
    employeeCount: parsedRecipients.length,
    senderName:    req.user.full_name || req.user.name || 'Boss',
    companyName:   template.companyName || '',
    companyLogoUrl: template.companyLogo || '',
    message:       template.message || '',
  });
    } catch (e) {
      console.error('[createTemplate] Boss email failed:', e.message);
    }
  }

  return res.status(201).json({
    success:  true,
    message:  'Template created successfully.',
    template: template.toJSON(),
  });
});

// ════════════════════════════════════════════════════
// 2. GET ALL TEMPLATES
// GET /api/templates
// ════════════════════════════════════════════════════
const getTemplates = asyncHandler(async (req, res) => {
  const {
    status, page = 1, limit = 10, search,
  } = req.query;

  const filter = { owner: req.user._id, isDeleted: false };
  if (status && status !== 'all') filter.status = status;
  if (search) filter.title = { $regex: search.trim(), $options: 'i' };

  const pageNum  = Math.max(1, Number(page));
  const limitNum = Math.min(50, Math.max(1, Number(limit)));
  const skip     = (pageNum - 1) * limitNum;

  const [templates, total] = await Promise.all([
    Template.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-fields -recipients') // ✅ large arrays exclude করো list এ
      .lean({ virtuals: true }),
    Template.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    templates,
    pagination: {
      total,
      page:       pageNum,
      limit:      limitNum,
      totalPages: Math.ceil(total / limitNum),
      hasMore:    pageNum * limitNum < total,
    },
  });
});

// ════════════════════════════════════════════════════
// 3. GET SINGLE TEMPLATE
// GET /api/templates/:id
// ════════════════════════════════════════════════════
const getTemplate = asyncHandler(async (req, res) => {
  const template = await Template.findOne({
    _id:       req.params.id,
    isDeleted: false,
  })
    .populate('owner', 'full_name email avatar')
    .lean({ virtuals: true });

  if (!template)
    return res.status(404).json({ success: false, message: 'Template not found.' });

  // ✅ Owner OR admin can view
  const isOwner = template.owner._id.toString() === req.user._id.toString();
  const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
  if (!isOwner && !isAdmin)
    return res.status(403).json({ success: false, message: 'Access denied.' });

  // Attach live session stats
  const sessionStats = await TemplateSession.getTemplateStats(template._id);

  return res.json({
    success:  true,
    template: { ...template, sessionStats },
  });
});

// ════════════════════════════════════════════════════
// 4. UPDATE TEMPLATE
// PUT /api/templates/:id
// ════════════════════════════════════════════════════
const updateTemplate = asyncHandler(async (req, res) => {
  const template = await Template.findOne({
    _id:       req.params.id,
    owner:     req.user._id,
    isDeleted: false,
  });

  if (!template)
    return res.status(404).json({ success: false, message: 'Template not found.' });

  // ✅ Only draft/boss_pending can be edited
  if (!['draft', 'boss_pending'].includes(template.status))
    return res.status(400).json({
      success: false,
      message: 'Cannot edit an active or completed template.',
    });

  const ALLOWED = [
    'title', 'description', 'fields',
    'recipients', 'ccList', 'signingConfig',
    'totalPages', 'companyName', 'companyLogo', 'message',
  ];

  ALLOWED.forEach(key => {
    if (req.body[key] !== undefined) template[key] = req.body[key];
  });

  await template.save();

  return res.json({
    success:  true,
    message:  'Template updated.',
    template: template.toJSON(),
  });
});

// ════════════════════════════════════════════════════
// 5. DELETE TEMPLATE
// DELETE /api/templates/:id
// ════════════════════════════════════════════════════
const deleteTemplate = asyncHandler(async (req, res) => {
  const template = await Template.findOne({
    _id:       req.params.id,
    owner:     req.user._id,
    isDeleted: false,
  });

  if (!template)
    return res.status(404).json({ success: false, message: 'Template not found.' });

  // ✅ Active templates cannot be deleted — too many sessions in progress
  if (template.status === 'active')
    return res.status(400).json({
      success: false,
      message: 'Cannot delete an active template. Archive it first.',
    });

  await template.softDelete();

  return res.json({ success: true, message: 'Template deleted.' });
});

// ════════════════════════════════════════════════════
// 6. BOSS SIGN
// POST /api/templates/:id/boss-sign
// ════════════════════════════════════════════════════
const bossSign = asyncHandler(async (req, res) => {
  const { signatureDataUrl, fieldValues } = req.body;

  if (!signatureDataUrl)
    return res.status(400).json({ success: false, message: 'Signature is required.' });

  const template = await Template.findOne({
    _id:       req.params.id,
    owner:     req.user._id,
    isDeleted: false,
  });

  if (!template)
    return res.status(404).json({ success: false, message: 'Template not found.' });

  if (!['boss_pending', 'draft'].includes(template.status))
    return res.status(400).json({
      success: false,
      message: 'Template is not awaiting boss signature.',
    });

  const ip         = getIP(req);
  const ua         = req.headers['user-agent'] || '';
  const geo        = await getGeoInfo(ip);
  const deviceInfo = parseDevice(ua);

  // ── Step 1: Upload boss signature PNG to Cloudinary ────────
  let signatureImageUrl      = null;
  let signatureImagePublicId = '';
  try {
    const uploaded       = await uploadSignaturePng(
      signatureDataUrl,
      'nexsign/boss-signatures',
    );
    signatureImageUrl      = uploaded.secure_url;
    signatureImagePublicId = uploaded.public_id;
  } catch (e) {
    console.error('[bossSign] Signature upload failed:', e.message);
    // Continue — signature URL will be null but we can still proceed
  }

  // ── Step 2: Embed boss signature into PDF ──────────────────
  let bossSignedFileUrl = template.fileUrl; // fallback to original
  if (pdfService?.embedBossSignature) {
    try {
     // এই পুরো pdfService call টা replace করো:
const mergedBytes = await Promise.race([
  pdfService.embedBossSignature({
    fileUrl:          template.fileUrl,
    signatureDataUrl,
    fields:           (template.fields || [])
                        .filter(f => f.assignedTo === 'boss'),
    fieldValues:      Array.isArray(fieldValues) ? fieldValues : [],
  }),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('embedBossSignature timeout')), 25_000)
  ),
]);

      // Upload merged PDF to Cloudinary
      const pdfResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'raw',
            folder:        'nexsign/boss-signed',
            public_id:     `boss_signed_${template._id}_${Date.now()}`,
            format:        'pdf',
          },
          (err, result) => err ? reject(err) : resolve(result),
        );
        stream.end(Buffer.from(mergedBytes));
      });

      bossSignedFileUrl             = pdfResult.secure_url;
      template.bossSignedFileUrl    = bossSignedFileUrl;
      template.bossSignedFilePublicId = pdfResult.public_id;

    } catch (e) {
      console.error('[bossSign] PDF embed failed, using original:', e.message);
      // fallback: use original PDF
      template.bossSignedFileUrl = template.fileUrl;
    }
  } else {
    // pdfService not available — use original PDF
    template.bossSignedFileUrl = template.fileUrl;
  }

  // ── Step 3: Update template ────────────────────────────────
  template.bossSignature = {
    signatureImageUrl,
    signedAt:   new Date(),
    ipAddress:  ip,
    city:       geo.city    || '',
    country:    geo.country || '',
    device:     deviceInfo.device,
    browser:    deviceInfo.browser,
    os:         deviceInfo.os,
  };
  template.status  = 'active';
  template.sentAt  = new Date();
  await template.save();

  // ── Step 4: Create sessions for all recipients ─────────────
  const expiryDays = template.signingConfig?.expiryDays || 30;
  const expiresAt  = new Date(Date.now() + expiryDays * 86_400_000);

  const sessionDocs = template.recipients.map(r => ({
    template:             template._id,
    recipientName:        r.name,
    recipientEmail:       r.email,
    recipientDesignation: r.designation || '',
    token:                generateToken(),
    status:               'pending',
    expiresAt,
    sentAt:               new Date(),
    auditLog: [{
      action:    'link_sent',
      timestamp: new Date(),
      note:      `Sent by ${req.user.full_name || req.user.email}`,
    }],
  }));

  const sessions = await TemplateSession.insertMany(sessionDocs);

  // ── Step 5: Send emails to employees ──────────────────────
  const emailResults = await Promise.allSettled(
    sessions.map(session =>
     sendEmployeeSigningEmail?.({
    // ✅ FIXED: correct parameter names
    employeeEmail:   session.recipientEmail,
    employeeName:    session.recipientName,
    documentTitle:   template.title,
    signingLink:     `${FRONT()}/template-sign/${session.token}`,
    bossName:        req.user.full_name || req.user.name || 'Your Manager',
    bossDesignation: req.user.designation || '',
    companyName:     template.companyName || '',
    companyLogoUrl:  template.companyLogo || '',
  })
    )
  );

  const emailsSent   = emailResults.filter(r => r.status === 'fulfilled').length;
  const emailsFailed = emailResults.filter(r => r.status === 'rejected').length;
  if (emailsFailed > 0) {
    console.error(`[bossSign] ${emailsFailed} emails failed`);
  }

  // ── Step 6: Emit socket ────────────────────────────────────
  emitSocket(req, 'template:activated', {
    templateId:  String(template._id),
    ownerId:     String(req.user._id),
    title:       template.title,
    totalCount:  sessions.length,
    emailsSent,
  });

  // ── Step 7: Audit log ──────────────────────────────────────
  safeAuditLog({
    action:         'boss_signed_template',
    document_id:    template._id,
    document_title: template.title,
    performed_by: {
      user_id: req.user._id,
      name:    req.user.full_name || req.user.name,
      email:   req.user.email,
      role:    'boss',
    },
    device: {
      device_name: deviceInfo.device,
      browser:     deviceInfo.browser,
      os:          deviceInfo.os,
    },
    location: {
      ip_address: ip,
      city:       geo.city,
      country:    geo.country,
      display:    geo.display,
    },
  });

  return res.json({
    success:       true,
    message:       `Boss signed. ${emailsSent}/${sessions.length} emails sent.`,
    sessionsCount: sessions.length,
    emailsSent,
    template:      template.toJSON(),
  });
});

// ════════════════════════════════════════════════════
// 7. GET SESSIONS
// GET /api/templates/:id/sessions
// ════════════════════════════════════════════════════
const getTemplateSessions = asyncHandler(async (req, res) => {
  const template = await Template.findOne({
    _id:       req.params.id,
    owner:     req.user._id,
    isDeleted: false,
  });

  if (!template)
    return res.status(404).json({ success: false, message: 'Template not found.' });

  const { status, page = 1, limit = 50, search } = req.query;

  const filter = {
    template:  template._id,
    isDeleted: { $ne: true },
  };
  if (status && status !== 'all') filter.status = status;
  if (search) {
    filter.$or = [
      { recipientName:  { $regex: search.trim(), $options: 'i' } },
      { recipientEmail: { $regex: search.trim(), $options: 'i' } },
    ];
  }

  const pageNum  = Math.max(1, Number(page));
  const limitNum = Math.min(100, Number(limit));
  const skip     = (pageNum - 1) * limitNum;

  const [sessions, total, stats] = await Promise.all([
    TemplateSession.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-auditLog -fieldValues') // exclude heavy fields in list
      .lean({ virtuals: true }),
    TemplateSession.countDocuments(filter),
    TemplateSession.getTemplateStats(template._id),
  ]);

  return res.json({
    success: true,
    sessions,
    stats,
    pagination: {
      total,
      page:       pageNum,
      limit:      limitNum,
      totalPages: Math.ceil(total / limitNum),
      hasMore:    pageNum * limitNum < total,
    },
  });
});

// ════════════════════════════════════════════════════
// 8. VALIDATE SESSION TOKEN (public)
// GET /api/templates/sign/validate/:token
// ════════════════════════════════════════════════════
const getSessionByToken = asyncHandler(async (req, res) => {
  const session = await TemplateSession.findByToken(req.params.token);

  if (!session)
    return res.status(404).json({
      success: false, code: 'INVALID_LINK',
      message: 'Invalid or expired signing link.',
    });

  // Expiry check
  if (new Date() > session.expiresAt) {
    if (!['expired', 'signed', 'declined'].includes(session.status)) {
      await session.markExpired();
    }
    return res.status(410).json({
      success: false, code: 'LINK_EXPIRED',
      message: 'This signing link has expired.',
    });
  }

  if (session.status === 'signed')
    return res.status(410).json({
      success: false, code: 'ALREADY_SIGNED',
      message: 'You have already signed this document.',
    });

  if (session.status === 'declined')
    return res.status(410).json({
      success: false, code: 'ALREADY_DECLINED',
      message: 'You have already declined this document.',
    });

  // Mark viewed
  const ip         = getIP(req);
  const ua         = req.headers['user-agent'] || '';
  const geo        = await getGeoInfo(ip);
  const deviceInfo = parseDevice(ua);

  await session.markViewed({
    ipAddress:  ip,
    userAgent:  ua,
    location:   geo,
    deviceInfo,
    localTime:  new Date().toUTCString(),
  });

  // Return safe data
  const tmpl = session.template;
  const templateObj = typeof tmpl.toObject === 'function'
    ? tmpl.toObject({ virtuals: true })
    : { ...tmpl };

  return res.json({
    success: true,
    session: {
      _id:                  String(session._id),
      recipientName:        session.recipientName,
      recipientEmail:       session.recipientEmail,
      recipientDesignation: session.recipientDesignation,
      status:               session.status,
      expiresAt:            session.expiresAt,
      viewedAt:             session.viewedAt,
    },
    template: {
      _id:          String(templateObj._id),
      title:        templateObj.title,
      description:  templateObj.description,
      companyName:  templateObj.companyName || '',
      companyLogo:  templateObj.companyLogo || '',
      message:      templateObj.message     || '',
      // ✅ Use boss-signed PDF — employees see PDF with boss signature already
      fileUrl:      templateObj.bossSignedFileUrl || templateObj.fileUrl,
      // ✅ Only employee fields
      fields:       (templateObj.fields || []).filter(f => f.assignedTo === 'employee'),
      totalPages:   templateObj.totalPages   || 1,
      signingConfig: templateObj.signingConfig || {},
    },
  });
});

// ════════════════════════════════════════════════════
// 9. EMPLOYEE SIGN (public)
// POST /api/templates/sign/submit/:token
// ════════════════════════════════════════════════════
// ════════════════════════════════════════════════════
// 9. EMPLOYEE SIGN (public)
// POST /api/templates/sign/submit/:token
// ════════════════════════════════════════════════════
const employeeSign = asyncHandler(async (req, res) => {
  const {
    signatureDataUrl, fieldValues,
    latitude, longitude, clientTime,
  } = req.body;

  const session = await TemplateSession.findByToken(req.params.token);

  if (!session)
    return res.status(404).json({
      success: false, code: 'INVALID_LINK',
      message: 'Invalid signing link.',
    });

  if (new Date() > session.expiresAt) {
    await session.markExpired();
    return res.status(410).json({
      success: false, code: 'LINK_EXPIRED',
      message: 'Signing link has expired.',
    });
  }

  if (session.status === 'signed')
    return res.status(409).json({
      success: false, code: 'ALREADY_SIGNED',
      message: 'Already signed.',
    });

  if (session.status === 'declined')
    return res.status(409).json({
      success: false, code: 'ALREADY_DECLINED',
      message: 'Already declined.',
    });

  const ip         = getIP(req);
  const ua         = req.headers['user-agent'] || '';
  const geo        = await getGeoInfo(ip);
  const deviceInfo = parseDevice(ua);
  const localTime  = clientTime || new Date().toUTCString();

  // ── Load template ──────────────────────────────────
  const template = await Template.findById(
    session.template._id || session.template
  );
  if (!template)
    return res.status(404).json({
      success: false,
      message: 'Template not found.',
    });

  // ── Employee fields filter ─────────────────────────
  const employeeFields = (template.fields || [])
    .filter(f => f.assignedTo === 'employee');

  // ── Required fields validation ─────────────────────
  const hasSignatureField = employeeFields.some(
    f => f.type === 'signature' || f.type === 'initial'
  );

  if (hasSignatureField && !signatureDataUrl) {
    return res.status(400).json({
      success: false,
      message: 'Signature is required.',
    });
  }

  const parsedFieldValues = Array.isArray(fieldValues) ? fieldValues : [];

  const missing = employeeFields.filter(f => {
    if (!f.required) return false;
    if (f.type === 'signature' || f.type === 'initial') {
      return !signatureDataUrl;
    }
    const fv = parsedFieldValues.find(v => v.fieldId === f.id);
    return !fv?.value;
  });

  if (missing.length > 0) {
    return res.status(400).json({
      success: false,
      message: `${missing.length} required field(s) incomplete.`,
      missingFields: missing.map(f => ({
        id: f.id, type: f.type, page: f.page,
      })),
    });
  }

  // ── Respond immediately to user ────────────────────
  res.json({
    success:   true,
    message:   'Document signed successfully! A copy will be emailed to you.',
    signedAt:  new Date(),
  });

  // ══════════════════════════════════════════════════
  // BACKGROUND — PDF generation + emails
  // ══════════════════════════════════════════════════
  setImmediate(async () => {
    try {

      // ── Step 1: Upload signature to Cloudinary ──────
      let signatureImageUrl      = null;
      let signatureImagePublicId = '';

      if (signatureDataUrl) {
        try {
          const uploaded        = await uploadSignaturePng(
            signatureDataUrl,
            'nexsign/employee-signatures',
          );
          signatureImageUrl      = uploaded.secure_url;
          signatureImagePublicId = uploaded.public_id;
        } catch (e) {
          console.error('[employeeSign] Signature upload failed:', e.message);
          // signatureDataUrl থেকেই embed করব
        }
      }

      // ── Step 2: Mark session as signed ─────────────
      await session.markSigned({
        signatureImageUrl,
        signatureImagePublicId,
        fieldValues: parsedFieldValues,
        meta: {
          ipAddress:  ip,
          userAgent:  ua,
          location:   geo,
          deviceInfo,
          localTime,
        },
      });

      // ── Step 3: Build fields with values for PDF ───
      // employee fields + values merge করো
      const fieldsWithValues = employeeFields.map(field => {
        // signature/initial field
        if (field.type === 'signature' || field.type === 'initial') {
          return {
            ...field.toObject ? field.toObject() : field,
            // ✅ FIX: Cloudinary URL না, original base64 use করো
            value: signatureDataUrl || null,
          };
        }
        // other fields — fieldValues array থেকে value নাও
        const fv = parsedFieldValues.find(v => v.fieldId === field.id);
        return {
          ...field.toObject ? field.toObject() : field,
          value: fv?.value || field.value || null,
        };
      });

      // ── Step 4: Build sessionDoc for audit page ─────
      // ✅ FIX: parties array তৈরি করো
      const sessionDoc = {
        _id:         template._id,
        title:       template.title,
        companyName: template.companyName || '',
        status:      'completed',
        completedAt: new Date(),
        ccList:      template.ccList || [],
        parties: [
          // Boss party
          {
            name:            template.owner
                               ? (await User.findById(template.owner)
                                    .select('full_name email designation')
                                    .lean()
                                 )?.full_name || 'Authoriser'
                               : 'Authoriser',
            email:           template.bossSignature?.signatureImageUrl
                               ? template.bossSignature.signatureImageUrl
                               : '',
            designation:     '',
            status:          'signed',
            signedAt:        template.bossSignature?.signedAt,
            ipAddress:       template.bossSignature?.ipAddress || '',
            city:            template.bossSignature?.city      || '',
            country:         template.bossSignature?.country   || '',
            device:          template.bossSignature?.device    || '',
            browser:         template.bossSignature?.browser   || '',
            os:              template.bossSignature?.os        || '',
            localSignedTime: template.bossSignature?.signedAt
                               ? new Date(template.bossSignature.signedAt).toUTCString()
                               : '',
          },
          // Employee party
          {
            name:            session.recipientName,
            email:           session.recipientEmail,
            designation:     session.recipientDesignation || '',
            status:          'signed',
            signedAt:        session.signedAt || new Date(),
            ipAddress:       ip,
            city:            geo?.city    || '',
            country:         geo?.country || '',
            device:          deviceInfo?.device  || '',
            browser:         deviceInfo?.browser || '',
            os:              deviceInfo?.os      || '',
            localSignedTime: localTime,
          },
        ],
      };

      // ── Step 5: Generate PDF ────────────────────────
      // ✅ FIX: generateEmployeePdf(source, fields, sessionDoc)
      // — 3 separate arguments, NOT an object
      let signedFileUrl = null;
      let pdfBuffer     = null;

      if (pdfService?.generateEmployeePdf) {
        try {
          // ✅ FIX: correct arguments order
          const pdfBytes = await Promise.race([
            pdfService.generateEmployeePdf(
              template.bossSignedFileUrl || template.fileUrl,  // arg1: source URL
              fieldsWithValues,                                 // arg2: fields array
              sessionDoc,                                       // arg3: audit data
            ),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('generateEmployeePdf timeout')),
                25_000,
              )
            ),
          ]);

          pdfBuffer = Buffer.from(pdfBytes);

          // Upload to Cloudinary
          const pdfResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                resource_type: 'raw',
                folder:        'nexsign/employee-signed',
                public_id:     `employee_${session._id}_${Date.now()}`,
                format:        'pdf',
              },
              (err, result) => err ? reject(err) : resolve(result),
            );
            stream.end(pdfBuffer);
          });

          signedFileUrl              = pdfResult.secure_url;
          session.signedFileUrl      = signedFileUrl;
          session.signedFilePublicId = pdfResult.public_id;
          await session.save();

        } catch (e) {
          console.error('[employeeSign] PDF generation failed:', e.message);
        }
      }

      // ── Step 6: Update template stats ──────────────
      await template.recalculateStats();

      // ── Step 7: Completion email to employee ───────
      try {
        await sendCompletionEmail?.({
          recipientEmail:       session.recipientEmail,
          recipientName:        session.recipientName,
          recipientDesignation: session.recipientDesignation || '',
          documentTitle:        template.title,
          pdfBuffer:            pdfBuffer || null,
          signedPdfUrl:         signedFileUrl || template.bossSignedFileUrl || '',
          companyName:          template.companyName || '',
          companyLogoUrl:       template.companyLogo || '',
          parties:              sessionDoc.parties,
        });
      } catch (e) {
        console.error('[employeeSign] Completion email failed:', e.message);
      }

      // ── Step 8: If all signed → owner + CC emails ──
      const freshTemplate = await Template.findById(template._id);
      if (freshTemplate?.status === 'completed') {
        try {
          const owner = await User.findById(template.owner);

          // Owner notification
          await sendCompletionEmail?.({
            recipientEmail:  owner?.email,
            recipientName:   owner?.full_name || 'Owner',
            documentTitle:   template.title,
            pdfBuffer:       null,
            signedPdfUrl:    signedFileUrl || '',
            companyName:     template.companyName || '',
            companyLogoUrl:  template.companyLogo || '',
            parties:         sessionDoc.parties,
          });

          // ✅ FIX: CC emails with PDF attachment
          await Promise.allSettled(
            (template.ccList || []).map(cc =>
              sendCompletionEmail?.({
                recipientEmail:  cc.email,
                recipientName:   cc.name  || cc.email,
                documentTitle:   template.title,
                pdfBuffer:       pdfBuffer || null,
                signedPdfUrl:    signedFileUrl || '',
                companyName:     template.companyName || '',
                companyLogoUrl:  template.companyLogo || '',
                isCC:            true,
                parties:         sessionDoc.parties,
              })
            )
          );

        } catch (e) {
          console.error('[employeeSign] Owner/CC email failed:', e.message);
        }
      }

      // ── Step 9: Audit log ───────────────────────────
      safeAuditLog({
        action:         'employee_signed_template',
        document_id:    template._id,
        document_title: template.title,
        performed_by: {
          name:  session.recipientName,
          email: session.recipientEmail,
          role:  'employee',
        },
        device: {
          device_name: deviceInfo.device,
          browser:     deviceInfo.browser,
          os:          deviceInfo.os,
        },
        location: {
          ip_address: ip,
          city:       geo?.city,
          country:    geo?.country,
          display:    geo?.display,
        },
        local_time: localTime,
      });

      // ── Step 10: Socket emit ────────────────────────
      emitSocket(
        { app: { get: () => null } },
        'template:employee_signed',
        {
          templateId:  String(template._id),
          ownerId:     String(template.owner),
          signerName:  session.recipientName,
          signerEmail: session.recipientEmail,
          signedCount: freshTemplate?.stats?.signed || 0,
          totalCount:  freshTemplate?.stats?.totalRecipients || 0,
        },
      );

    } catch (err) {
      console.error('[employeeSign background]', err.message, err.stack);
    }
  });
});

// ════════════════════════════════════════════════════
// 10. EMPLOYEE DECLINE (public)
// POST /api/templates/sign/decline/:token
// ════════════════════════════════════════════════════
const employeeDecline = asyncHandler(async (req, res) => {
  const { reason = '' } = req.body;

  const session = await TemplateSession.findByToken(req.params.token);
  if (!session)
    return res.status(404).json({ success: false, message: 'Invalid signing link.' });

  if (['signed', 'declined', 'expired'].includes(session.status))
    return res.status(400).json({
      success: false,
      message: `This document is already ${session.status}.`,
    });

  const ip         = getIP(req);
  const ua         = req.headers['user-agent'] || '';
  const geo        = await getGeoInfo(ip);
  const deviceInfo = parseDevice(ua);

  await session.markDeclined(reason, {
    ipAddress: ip, userAgent: ua,
    location: geo, deviceInfo,
    localTime: new Date().toUTCString(),
  });

  // Update template stats
  const template = await Template.findById(
    session.template._id || session.template
  );
  if (template) {
    await template.recalculateStats();

    // Notify owner
    emitSocket({ app: { get: () => null } }, 'template:declined', {
      templateId:  String(template._id),
      ownerId:     String(template.owner),
      signerName:  session.recipientName,
      signerEmail: session.recipientEmail,
      reason,
    });

    // Send declined email to owner
    try {
      const owner = await User.findById(template.owner);
      await sendDeclinedEmail?.({
        ownerEmail:  owner?.email,
        ownerName:   owner?.full_name || owner?.name,
        signerName:  session.recipientName,
        signerEmail: session.recipientEmail,
        title:       template.title,
        reason,
      });
    } catch (e) {
      console.error('[employeeDecline] Email failed:', e.message);
    }
  }

  return res.json({ success: true, message: 'Document declined.' });
});

// ════════════════════════════════════════════════════
// 11. RESEND EMAIL
// POST /api/templates/:id/sessions/:sessionId/resend
// ════════════════════════════════════════════════════
const resendEmail = asyncHandler(async (req, res) => {
  const template = await Template.findOne({
    _id:       req.params.id,
    owner:     req.user._id,
    isDeleted: false,
  });

  if (!template)
    return res.status(404).json({ success: false, message: 'Template not found.' });

  const session = await TemplateSession.findOne({
    _id:       req.params.sessionId,
    template:  template._id,
    isDeleted: { $ne: true },
  });

  if (!session)
    return res.status(404).json({ success: false, message: 'Session not found.' });

  if (session.status === 'signed')
    return res.status(400).json({ success: false, message: 'Recipient has already signed.' });

  if (session.status === 'expired') {
    // ✅ Regenerate token + extend expiry
    session.token     = generateToken();
    session.status    = 'pending';
    session.expiresAt = new Date(Date.now() + 7 * 86_400_000);
  } else {
    // Just extend expiry
    session.expiresAt = new Date(
      Math.max(session.expiresAt.getTime(), Date.now()) + 7 * 86_400_000,
    );
  }

  await session.addReminder({ note: `Reminder by ${req.user.email}` });
  await session.save();

await sendEmployeeSigningEmail?.({
    // ✅ FIXED
    employeeEmail:   session.recipientEmail,
    employeeName:    session.recipientName,
    documentTitle:   template.title,
    signingLink:     `${FRONT()}/template-sign/${session.token}`,
    bossName:        req.user.full_name || req.user.name || 'Your Manager',
    bossDesignation: req.user.designation || '',
    companyName:     template.companyName || '',
    companyLogoUrl:  template.companyLogo || '',
  });

  return res.json({
    success: true,
    message: `Reminder sent to ${session.recipientEmail}.`,
    reminderCount: session.reminderCount,
  });
});

// ════════════════════════════════════════════════════
// 12. GET TEMPLATE PDF PROXY (public)
// GET /api/templates/sign/:token/pdf
// ════════════════════════════════════════════════════
const getTemplatePdf = asyncHandler(async (req, res) => {
  try {
    const session = await TemplateSession.findOne({
      token:     req.params.token,
      isDeleted: { $ne: true },
    }).populate('template', 'fileUrl bossSignedFileUrl title');

    if (!session)
      return res.status(404).send('Not found');

    const tmpl  = session.template;
    const url   = tmpl.bossSignedFileUrl || tmpl.fileUrl;

    if (!url) return res.status(404).send('PDF not available');

    const response = await fetch(url);
    if (!response.ok) return res.status(502).send('PDF fetch failed');

    const buffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `inline; filename="${tmpl.title || 'document'}.pdf"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(Buffer.from(buffer));

  } catch (err) {
    console.error('[getTemplatePdf]', err.message);
    return res.status(500).send(err.message);
  }
});

// ════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════
module.exports = {
  createTemplate,
  getTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  bossSign,
  getTemplateSessions,
  getSessionByToken,
  employeeSign,
  employeeDecline,
  resendEmail,
  getTemplatePdf,
};
