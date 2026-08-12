

const mongoose        = require('mongoose');
const crypto          = require('crypto');
const { v2: cloudinary } = require('cloudinary');
const Template        = require('../models/Template');
const TemplateSession = require('../models/TemplateSession');
const TemplateCampaign = require('../models/TemplateCampaign');
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

const { getPdfBytes, sendPdf, savePdfBuffer } = require('../utils/pdfStorage');
const { links } = require('../utils/appUrls');
const {
  resolveSigningLocation,
  toAuditLocation,
  toSignerAuditFields,
} = require('../utils/geoService');

const {
  sendBossApprovalEmail,
  sendEmployeeSigningEmail,
  sendEmailDeliveryFailureNotice,
  sendCompletionEmail,
  sendCCEmail,
  sendDeclinedEmail,
  sendCampaignBossEmail,
  sendCampaignApproverEmail,
  buildEmailPreview,
} = emailService;

const sleep = ms => new Promise(r => setTimeout(r, ms));

const EMAIL_BATCH_DELAY_MS = 800;

/** Send signing emails in background with delay (avoids SMTP rate limits + Vercel timeout) */
function queueEmployeeSessionEmails({
  sessions,
  template,
  bossUser,
  req,
  dispatchFn = dispatchEmployeeEmail,
}) {
  setImmediate(async () => {
    const failed = [];
    let emailsSent = 0;

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      try {
        const result = await dispatchFn({ session, template, bossUser });
        await recordSessionEmailResult(session, result);
        if (result?.success) {
          emailsSent += 1;
          console.log(`[emailBatch] Sent to ${session.recipientEmail} (${i + 1}/${sessions.length})`);
        } else {
          failed.push({
            name:  session.recipientName,
            email: session.recipientEmail,
            error: result?.error || 'Delivery failed',
          });
        }
      } catch (e) {
        console.error(`[emailBatch] Failed for ${session.recipientEmail}:`, e.message);
        failed.push({
          name:  session.recipientName,
          email: session.recipientEmail,
          error: e.message,
        });
      }
      if (i < sessions.length - 1) await sleep(EMAIL_BATCH_DELAY_MS);
    }

    const emailsFailed = failed.length;
    if (emailsFailed > 0) {
      console.error(`[emailBatch] ${emailsFailed}/${sessions.length} emails failed`);
      try {
        await sendEmailDeliveryFailureNotice?.({
          ownerEmail: bossUser.email,
          ownerName:  bossUser.full_name || bossUser.name || 'Template Owner',
          docTitle:   template.title,
          failed,
          totalCount: sessions.length,
        });
      } catch (noticeErr) {
        console.error('[emailBatch] Owner notice failed:', noticeErr.message);
      }
      emitSocket(req, 'template:email_failed', {
        templateId: String(template._id),
        ownerId:    String(bossUser._id || bossUser.id),
        failed,
        emailsSent,
        totalCount: sessions.length,
      });
    }

    emitSocket(req, 'template:employees_emailed', {
      templateId: String(template._id),
      ownerId:    String(bossUser._id || bossUser.id),
      emailsSent,
      totalCount: sessions.length,
    });
  });
}

function resolveTemplateLogo(template, ownerUser) {
  return template?.companyLogo || ownerUser?.company_logo || '';
}

function resolveBossInfo(req, bossFromBody = {}) {
  return {
    name:        String(bossFromBody.name || req.user.full_name || req.user.name || '').trim(),
    email:       String(bossFromBody.email || req.user.email || '').trim().toLowerCase(),
    designation: String(bossFromBody.designation || req.user.designation || '').trim(),
  };
}

/** Send one employee signing email with one automatic retry */
async function dispatchEmployeeEmail({ session, template, bossUser }) {
  const expiryDays = template.signingConfig?.expiryDays || 30;
  const expiryDate = new Date(Date.now() + expiryDays * 86_400_000)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const sc = template.signingConfig || {};
  const useCustom = !!(template.useCustomEmailBody || sc.useCustomEmailBody);
  const customBody = template.customEmailBody || sc.customEmailBody || '';
  const customSubject = template.customEmailSubject || sc.customEmailSubject || '';

  const payload = {
    employeeEmail:       session.recipientEmail,
    employeeName:        session.recipientName,
    employeeDesignation: session.recipientDesignation || '',
    documentTitle:       template.title,
    signingLink:         links.templateSign(session.token),
    bossName:            bossUser.full_name || bossUser.name || 'Your Manager',
    bossDesignation:     bossUser.designation || '',
    bossEmail:           bossUser.email,
    companyName:         template.companyName || '',
    companyLogoUrl:      resolveTemplateLogo(template, bossUser),
    ownerCompanyLogo:    bossUser?.company_logo || '',
    emailHeaderColor:    template.emailHeaderColor || '#0f172a',
    message:             template.message || sc.emailMessage || '',
    expiryDate,
    useCustomEmailBody:  useCustom,
    customEmailBody:     customBody,
    customEmailSubject:  customSubject,
  };

  let result = await sendEmployeeSigningEmail?.(payload);
  if (!result?.success) {
    await sleep(2000);
    result = await sendEmployeeSigningEmail?.(payload);
  }
  return result || { success: false, error: 'Email service unavailable' };
}

async function recordSessionEmailResult(session, result) {
  session.emailAttempts = (session.emailAttempts || 0) + 1;
  session.lastEmailAttemptAt = new Date();
  if (result?.success) {
    session.emailDelivered = true;
    session.emailError     = '';
    session.sentAt         = session.sentAt || new Date();
    session.addAuditEntry('link_sent', {
      note: `Email delivered to ${session.recipientEmail}`,
    });
  } else {
    session.emailDelivered = false;
    session.emailError     = result?.error || 'Delivery failed';
    session.addAuditEntry('link_sent', {
      note: `Email FAILED for ${session.recipientEmail}: ${session.emailError}`,
    });
  }
  await session.save();
}

async function emailTemplateApprover(template, ownerUser) {
  const idx = template.currentApproverIndex;
  const approver = template.approvers?.[idx];
  if (!approver || approver.status !== 'pending') return;

  const previous = template.approvers
    .slice(0, idx)
    .filter(a => a.status === 'approved')
    .map(a => a.name)
    .join(', ');

  await sendCampaignApproverEmail?.({
    approverEmail:       approver.email,
    approverName:        approver.name,
    approverDesignation: approver.designation || '',
    documentTitle:       template.title,
    approvalLink:        links.approverReview(approver.token),
    companyName:         template.companyName,
    companyLogoUrl:      resolveTemplateLogo(template, ownerUser),
    ownerCompanyLogo:    ownerUser?.company_logo || '',
    emailHeaderColor:    template.emailHeaderColor,
    stepNumber:          idx + 1,
    totalSteps:          template.approvers.length,
    isLastApprover:      idx === template.approvers.length - 1,
    previousApprovers:   previous,
    ownerName:           ownerUser?.full_name || ownerUser?.name,
  });
}

/** Create sessions + email all template recipients (master template batch) */
async function distributeTemplateEmployees(template, bossUser, req) {
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
      note:      'Session created — sending email',
    }],
  }));

  const sessions = await TemplateSession.insertMany(sessionDocs);

  queueEmployeeSessionEmails({ sessions, template, bossUser, req });

  template.status = 'active';
  template.sentAt = template.sentAt || new Date();
  template.currentApproverIndex = -1;
  await template.save();

  emitSocket(req, 'template:activated', {
    templateId:  String(template._id),
    ownerId:     String(bossUser._id || bossUser.id),
    title:       template.title,
    totalCount:  sessions.length,
    emailsQueued: true,
  });

  return {
    phase:         'active',
    sessionsCount: sessions.length,
    emailsSent:    0,
    emailsQueued:  true,
    emailsFailed:  0,
    failedRecipients: [],
  };
}

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

// ── Safe audit log ────────────────────────────────
async function safeAuditLog(payload) {
  try {
    const loc = payload.location || {};
    const normalized = loc.ip_address || loc.city
      ? (loc.ip_address ? loc : toAuditLocation(loc, loc.ip || loc.ip_address))
      : toAuditLocation(loc, null);

    await AuditLog.create({
      document_id:        payload.document_id    || null,
      document_title:     payload.document_title || null,
      template_id:        payload.template_id    || null,
      session_id:         payload.session_id     || null,
      is_template_action: true,
      action:             payload.action,
      performed_by:       payload.performed_by   || {},
      device:             payload.device         || {},
      location:           normalized,
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
    companyName, companyLogo, message, emailHeaderColor,
    approvers: approversRaw,
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

  const parsedApprovers = (Array.isArray(approversRaw) ? approversRaw : [])
    .map((a, i) => ({
      name:        String(a.name || '').trim(),
      email:       String(a.email || '').trim().toLowerCase(),
      designation: String(a.designation || '').trim(),
      order:       i,
      token:       generateToken(),
      status:      'pending',
    }))
    .filter(a => a.name && a.email);

  const bossInfo  = resolveBossInfo(req, req.body.boss || {});
  const bossToken = bossSignsFirst ? generateToken() : null;

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
    boss:         bossInfo,
    bossToken,
    companyName:  companyName  || '',
    companyLogo:  companyLogo || req.user.company_logo || '',
    emailHeaderColor: emailHeaderColor || '#0f172a',
    message:      message      || '',
    signingConfig: {
      bossSignsFirst,
      expiryDays:   parsedConfig.expiryDays   || 30,
      allowDecline: parsedConfig.allowDecline !== false,
      reminderDays: parsedConfig.reminderDays || 3,
      emailSubject: parsedConfig.emailSubject || '',
      emailMessage: parsedConfig.emailMessage || '',
      useCustomEmailBody: !!parsedConfig.useCustomEmailBody,
      customEmailBody:    parsedConfig.customEmailBody    || '',
      customEmailSubject: parsedConfig.customEmailSubject || '',
    },
    totalPages: Number(totalPages) || 1,
    approvers:  parsedApprovers,
    status:     bossSignsFirst ? 'boss_pending' : 'active',
    stats: {
      totalRecipients: parsedRecipients.length,
      pending:         parsedRecipients.length,
      signed:          0, declined: 0, viewed: 0,
    },
  });

  try {
    const bytes = await getPdfBytes({
      fileUrl:      template.fileUrl,
      filePublicId: template.filePublicId,
    });
    template.localPdfPath = savePdfBuffer(bytes, String(template._id));
    await template.save();
  } catch (cacheErr) {
    console.warn('[createTemplate] Could not cache local PDF:', cacheErr.message);
  }

  // Send boss approval email
  if (bossSignsFirst) {
    try {
   await sendCampaignBossEmail?.({
    bossEmail:       bossInfo.email,
    bossName:        bossInfo.name || 'Authoriser',
    bossDesignation: bossInfo.designation || '',
    documentTitle:   template.title,
    signingLink:     links.bossSign(bossToken),
    employeeCount:   parsedRecipients.length,
    approverCount:   parsedApprovers?.length || 0,
    ownerName:       req.user.full_name || req.user.name || 'Sender',
    companyName:     template.companyName || '',
    companyLogoUrl:  resolveTemplateLogo(template, req.user),
    ownerCompanyLogo: req.user.company_logo || '',
    emailHeaderColor: template.emailHeaderColor || '#0f172a',
    message:         template.message || '',
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
// BOSS SIGN HELPERS
// ════════════════════════════════════════════════════
async function embedBossSignatureOnRecord(record, signatureDataUrl, fieldValues = []) {
  const pdfSource = {
    fileUrl:      record.fileUrl,
    filePublicId: record.filePublicId || record.fileId,
    fileId:         record.filePublicId || record.fileId,
    localPdfPath: record.localPdfPath,
  };

  if (!pdfService?.embedBossSignature) {
    throw new Error('PDF signature embedding is not available on this server.');
  }

  try {
    const mergedBytes = await Promise.race([
      pdfService.embedBossSignature({
        fileUrl:         pdfSource,
        signatureDataUrl,
        fields:          (record.fields || []).filter(f => f.assignedTo === 'boss'),
        fieldValues:     Array.isArray(fieldValues) ? fieldValues : [],
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('embedBossSignature timeout')), 25_000),
      ),
    ]);

    const pdfResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder:        'nexsign/boss-signed',
          public_id:     `boss_signed_${record._id}_${Date.now()}`,
          format:        'pdf',
        },
        (err, result) => (err ? reject(err) : resolve(result)),
      );
      stream.end(Buffer.from(mergedBytes));
    });

    const localPath = savePdfBuffer(Buffer.from(mergedBytes), `boss_${record._id}`);

    return {
      bossSignedFileUrl:       pdfResult.secure_url,
      bossSignedFilePublicId:  pdfResult.public_id,
      localBossSignedPdfPath:  localPath,
      mergedBytes,
    };
  } catch (e) {
    console.error('[embedBossSignatureOnRecord] PDF embed failed:', e.message);
    throw new Error(`Could not embed authoriser signature into PDF: ${e.message}`);
  }
}

async function advanceTemplateAfterBossSign(template, bossUser, req, auditMeta = {}) {
  const { ip, geo, deviceInfo } = auditMeta;

  if (template.approvers?.length > 0) {
    template.status = 'approver_pending';
    template.currentApproverIndex = 0;
    template.bossToken = null;
    await template.save();
    await emailTemplateApprover(template, bossUser);

    safeAuditLog({
      action:         'boss_signed_template',
      document_id:    template._id,
      document_title: template.title,
      performed_by: {
        user_id: bossUser._id,
        name:    bossUser.full_name || bossUser.name,
        email:   bossUser.email,
        role:    'boss',
      },
      device: {
        device_name: deviceInfo?.device,
        browser:     deviceInfo?.browser,
        os:          deviceInfo?.os,
      },
    });

    return {
      phase:    'approver_pending',
      message:  `Boss signed! First approver (${template.approvers[0].name}) has been emailed.`,
      template: template.toJSON(),
    };
  }

  template.status = 'active';
  template.sentAt = new Date();
  template.bossToken = null;
  await template.save();

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
      note:      'Session created — sending email',
    }],
  }));

  const sessions = await TemplateSession.insertMany(sessionDocs);

  queueEmployeeSessionEmails({ sessions, template, bossUser, req });

  safeAuditLog({
    action:         'boss_signed_template',
    document_id:    template._id,
    document_title: template.title,
    performed_by: {
      user_id: bossUser._id,
      name:    bossUser.full_name || bossUser.name,
      email:   bossUser.email,
      role:    'boss',
    },
    device: {
      device_name: deviceInfo?.device,
      browser:     deviceInfo?.browser,
      os:          deviceInfo?.os,
    },
    location: {
      ip_address: ip,
      city:       geo?.city,
      country:    geo?.country,
      display:    geo?.display,
    },
  });

  return {
    phase:            'active',
    sessionsCount:    sessions.length,
    emailsSent:       0,
    emailsQueued:     true,
    emailsFailed:     0,
    failedRecipients: [],
    template:         template.toJSON(),
    message:          `Boss signed! Sending signing links to ${sessions.length} employees…`,
  };
}

async function performBossSignOnTemplate(template, { signatureDataUrl, fieldValues, bossUser, req }) {
  const ip         = getIP(req);
  const ua         = req.headers['user-agent'] || '';
  const geo        = await getGeoInfo(ip);
  const deviceInfo = parseDevice(ua);

  let signatureImageUrl = null;
  try {
    const uploaded = await uploadSignaturePng(signatureDataUrl, 'nexsign/boss-signatures');
    signatureImageUrl = uploaded.secure_url;
  } catch (e) {
    console.error('[bossSign] Signature upload failed:', e.message);
  }

  const embed = await embedBossSignatureOnRecord(template, signatureDataUrl, fieldValues);
  template.bossSignedFileUrl       = embed.bossSignedFileUrl;
  template.bossSignedFilePublicId  = embed.bossSignedFilePublicId || template.bossSignedFilePublicId;
  if (embed.localBossSignedPdfPath) {
    template.localBossSignedPdfPath = embed.localBossSignedPdfPath;
  }

  template.bossSignature = {
    signatureImageUrl,
    signedAt:   new Date(),
    ipAddress:  ip,
    city:       geo?.city    || '',
    region:     geo?.region  || '',
    country:    geo?.country || '',
    postalCode: geo?.postalCode || '',
    timezone:   geo?.timezone   || '',
    latitude:   geo?.latitude   || '',
    longitude:  geo?.longitude  || '',
    device:     deviceInfo.device,
    browser:    deviceInfo.browser,
    os:         deviceInfo.os,
  };
  await template.save();

  return advanceTemplateAfterBossSign(template, bossUser, req, { ip, geo, deviceInfo });
}

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

  const result = await performBossSignOnTemplate(template, {
    signatureDataUrl,
    fieldValues,
    bossUser: req.user,
    req,
  });

  return res.json({ success: true, ...result });
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
// 7b. GET TEMPLATE AUDIT TRAIL
// GET /api/templates/:id/audit
// ════════════════════════════════════════════════════
const getTemplateAudit = asyncHandler(async (req, res) => {
  const template = await Template.findOne({
    _id:       req.params.id,
    owner:     req.user._id,
    isDeleted: false,
  }).lean();

  if (!template)
    return res.status(404).json({ success: false, message: 'Template not found.' });

  const [sessions, dbLogs] = await Promise.all([
    TemplateSession.find({ template: template._id, isDeleted: { $ne: true } })
      .select('recipientName recipientEmail recipientDesignation status signedAt viewedAt sentAt declinedAt signingMeta auditLog')
      .lean(),
    AuditLog.find({ template_id: template._id })
      .sort({ timestamp: -1 })
      .limit(300)
      .lean(),
  ]);

  const events = [];

  if (template.bossSignature?.signedAt) {
    const bs = template.bossSignature;
    events.push({
      _id:        `boss-${template._id}`,
      action:     'boss_signed',
      label:      'Boss / Authoriser Signed',
      actorName:  'Authoriser (Boss)',
      actorEmail: '',
      timestamp:  bs.signedAt,
      ip:         bs.ipAddress || '',
      ipAddress:  bs.ipAddress || '',
      city:       bs.city || '',
      region:     bs.region || '',
      country:    bs.country || '',
      postalCode: bs.postalCode || '',
      timezone:   bs.timezone || '',
      latitude:   bs.latitude || '',
      longitude:  bs.longitude || '',
      device:     bs.device || '',
      browser:    bs.browser || '',
      os:         bs.os || '',
      localTime:  bs.signedAt ? new Date(bs.signedAt).toUTCString() : '',
    });
  }

  for (const s of sessions) {
    if (s.sentAt) {
      events.push({
        _id:         `sent-${s._id}`,
        action:      'sent',
        label:       'Signing Link Sent',
        actorName:   s.recipientName,
        actorEmail:  s.recipientEmail,
        timestamp:   s.sentAt,
      });
    }
    if (s.viewedAt) {
      events.push({
        _id:         `viewed-${s._id}`,
        action:      'viewed',
        label:       'Link Opened',
        actorName:   s.recipientName,
        actorEmail:  s.recipientEmail,
        timestamp:   s.viewedAt,
      });
    }
    if (s.signedAt) {
      const loc = s.signingMeta?.location || {};
      const dev = s.signingMeta?.deviceInfo || {};
      events.push({
        _id:         `signed-${s._id}`,
        action:      'signed',
        label:       'Employee Signed',
        actorName:   s.recipientName,
        actorEmail:  s.recipientEmail,
        designation: s.recipientDesignation || '',
        timestamp:   s.signedAt,
        ip:          s.signingMeta?.ipAddress || '',
        ipAddress:   s.signingMeta?.ipAddress || '',
        city:        loc.city || '',
        region:      loc.region || '',
        country:     loc.country || '',
        postalCode:  loc.postalCode || '',
        timezone:    loc.timezone || '',
        latitude:    loc.latitude || '',
        longitude:   loc.longitude || '',
        device:      dev.device || '',
        browser:     dev.browser || '',
        os:          dev.os || '',
        localTime:   s.signingMeta?.localTime || '',
        geoSource:   loc.display ? 'resolved' : '',
      });
    }
    if (s.declinedAt) {
      events.push({
        _id:         `declined-${s._id}`,
        action:      'declined',
        label:       'Employee Declined',
        actorName:   s.recipientName,
        actorEmail:  s.recipientEmail,
        timestamp:   s.declinedAt,
      });
    }
    for (const entry of s.auditLog || []) {
      events.push({
        _id:        `audit-${s._id}-${entry.timestamp}`,
        action:     entry.action === 'link_sent' ? 'sent'
          : entry.action === 'link_opened' ? 'viewed'
          : entry.action === 'signed' ? 'signed'
          : entry.action === 'declined' ? 'declined'
          : entry.action,
        label:      entry.action.replace(/_/g, ' '),
        actorName:  s.recipientName,
        actorEmail: s.recipientEmail,
        timestamp:  entry.timestamp,
        ip:         entry.ipAddress || '',
        ipAddress:  entry.ipAddress || '',
        city:       entry.location?.city || '',
        region:     entry.location?.region || '',
        country:    entry.location?.country || '',
        device:     entry.deviceInfo?.device || '',
        browser:    entry.deviceInfo?.browser || '',
        os:         entry.deviceInfo?.os || '',
        localTime:  entry.localTime || '',
        note:       entry.note || '',
      });
    }
  }

  for (const log of dbLogs) {
    const actor = log.performed_by || {};
    const loc   = log.location || {};
    const dev   = log.device || {};
    events.push({
      _id:        String(log._id),
      action:     (log.action || '').replace('_template', '').replace('employee_signed', 'signed').replace('boss_signed', 'boss_signed'),
      label:      log.action?.replace(/_/g, ' ') || 'Event',
      actorName:  actor.name || 'System',
      actorEmail: actor.email || '',
      timestamp:  log.timestamp || log.createdAt,
      ip:         loc.ip || actor.ip || '',
      ipAddress:  loc.ip || '',
      city:       loc.city || '',
      region:     loc.region || '',
      country:    loc.country || '',
      postalCode: loc.postalCode || '',
      device:     dev.device_name || dev.device || '',
      browser:    dev.browser || '',
      os:         dev.os || '',
      localTime:  log.local_time || '',
      note:       log.note || '',
    });
  }

  // De-dupe by _id and sort newest first
  const seen = new Set();
  const unique = events.filter(e => {
    const key = e._id || `${e.action}-${e.timestamp}-${e.actorEmail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return res.json({
    success: true,
    audit: { events: unique },
  });
});

async function resolveSessionTemplateContext(session) {
  const tmpl = session.template;
  let templateObj = typeof tmpl?.toObject === 'function'
    ? tmpl.toObject({ virtuals: true })
    : { ...(tmpl || {}) };

  if (session.campaignId) {
    const campaign = await TemplateCampaign.findById(session.campaignId).lean();
    if (campaign) {
      templateObj = {
        ...templateObj,
        title:             campaign.title,
        message:           campaign.message,
        useCustomEmailBody: campaign.useCustomEmailBody,
        customEmailBody:    campaign.customEmailBody,
        customEmailSubject: campaign.customEmailSubject,
        companyName:       campaign.companyName,
        companyLogo:       campaign.companyLogo,
        emailHeaderColor:  campaign.emailHeaderColor,
        fields:            campaign.fields,
        totalPages:        campaign.totalPages,
        fileUrl:           campaign.fileUrl           || templateObj.fileUrl,
        filePublicId:      campaign.filePublicId      || templateObj.filePublicId,
        localPdfPath:      campaign.localPdfPath      || templateObj.localPdfPath,
        localBossSignedPdfPath:
          campaign.localBossSignedPdfPath || templateObj.localBossSignedPdfPath,
        bossSignedFileUrl: campaign.bossSignedFileUrl || templateObj.bossSignedFileUrl,
        bossSignature:     campaign.bossSignature,
        ccList:            campaign.ccList,
        signingConfig:     campaign.signingConfig,
        _campaignId:       String(campaign._id),
      };
    }
  }

  return templateObj;
}

/** Boss-signed PDF source record for employee PDF generation */
function buildBossPdfSource(template) {
  return {
    fileUrl:            template.bossSignedFileUrl || template.fileUrl,
    filePublicId:       template.filePublicId,
    localPdfPath:       template.localPdfPath,
    localSignedPdfPath: template.localBossSignedPdfPath,
    bossSignedFileUrl:  template.bossSignedFileUrl,
  };
}

/** Build merged field list (boss + employee) with values for PDF embedding */
function buildTemplateFieldsWithValues(template, session, { signatureDataUrl = null } = {}) {
  const bossSigUrl = template.bossSignature?.signatureImageUrl || null;

  return (template.fields || [])
    .filter(f => f.assignedTo === 'boss' || f.assignedTo === 'employee')
    .map(field => {
      const plain = field.toObject ? field.toObject() : { ...field };

      if (plain.assignedTo === 'boss') {
        if (plain.type === 'signature' || plain.type === 'initial') {
          return { ...plain, value: bossSigUrl || plain.value || null };
        }
        return { ...plain, value: plain.value || null };
      }

      // employee fields
      if (plain.type === 'signature' || plain.type === 'initial') {
        return {
          ...plain,
          value: signatureDataUrl || session.signatureImageUrl || plain.value || null,
        };
      }
      const fv = (session.fieldValues || []).find(v => v.fieldId === plain.id);
      return { ...plain, value: fv?.value || plain.value || null };
    });
}

/** Build employee signed PDF bytes + audit sessionDoc */
async function buildEmployeeSessionPdf(session, template, { signatureDataUrl = null } = {}) {
  if (!pdfService?.generateEmployeePdf) {
    throw new Error('PDF service unavailable.');
  }

  const fieldsWithValues = buildTemplateFieldsWithValues(template, session, { signatureDataUrl });

  const ownerUser = template.owner
    ? await User.findById(template.owner).select('full_name email designation').lean()
    : null;

  const geo        = session.signingMeta?.location || {};
  const deviceInfo = session.signingMeta?.deviceInfo || {};
  const ip         = session.signingMeta?.ipAddress || '';
  const localTime  = session.signingMeta?.localTime || session.signedAt?.toUTCString?.() || '';

  const employeeAudit = toSignerAuditFields(geo, ip, deviceInfo, localTime);

  const sessionDoc = {
    _id:         template._id,
    title:       template.title,
    companyName: template.companyName || '',
    status:      'completed',
    completedAt: session.signedAt || new Date(),
    ccList:      template.ccList || [],
    parties: [
      {
        name:            ownerUser?.full_name || 'Authoriser',
        email:           ownerUser?.email || '',
        designation:     ownerUser?.designation || 'Authoriser',
        role:            'Authoriser',
        status:          'signed',
        signedAt:        template.bossSignature?.signedAt,
        ipAddress:       template.bossSignature?.ipAddress || '',
        city:            template.bossSignature?.city      || '',
        region:          template.bossSignature?.region    || '',
        country:         template.bossSignature?.country   || '',
        postalCode:      template.bossSignature?.postalCode || '',
        timezone:        template.bossSignature?.timezone  || '',
        latitude:        template.bossSignature?.latitude  || '',
        longitude:       template.bossSignature?.longitude || '',
        device:          template.bossSignature?.device    || '',
        browser:         template.bossSignature?.browser   || '',
        os:              template.bossSignature?.os        || '',
        localSignedTime: template.bossSignature?.signedAt
          ? new Date(template.bossSignature.signedAt).toUTCString()
          : '',
      },
      {
        name:            session.recipientName,
        email:           session.recipientEmail,
        designation:     session.recipientDesignation || 'Employee',
        role:            'Employee',
        status:          'signed',
        signedAt:        session.signedAt || new Date(),
        localSignedTime: session.signingMeta?.localTime
          || (session.signedAt ? new Date(session.signedAt).toUTCString() : ''),
        geoSource:       geo.source || 'unknown',
        ...employeeAudit,
      },
    ],
  };

  const pdfBytes = await Promise.race([
    pdfService.generateEmployeePdf(
      buildBossPdfSource(template),
      fieldsWithValues,
      sessionDoc,
    ),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('generateEmployeePdf timeout')), 45_000),
    ),
  ]);

  return {
    pdfBuffer:  Buffer.from(pdfBytes),
    sessionDoc,
  };
}

/** Save employee signed PDF locally (+ Cloudinary when possible) */
async function persistEmployeeSessionPdf(session, pdfBuffer) {
  session.localSignedPdfPath = savePdfBuffer(pdfBuffer, `employee_${session._id}`);

  try {
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
    session.signedFileUrl      = pdfResult.secure_url;
    session.signedFilePublicId = pdfResult.public_id;
  } catch (e) {
    console.error('[persistEmployeeSessionPdf] Cloudinary upload failed:', e.message);
  }

  await session.save();
  return session;
}

/** Ensure signed session has a stored PDF; (re)generate to include all signatures */
async function ensureEmployeeSessionPdf(session, template) {
  const { pdfBuffer } = await buildEmployeeSessionPdf(session, template);
  return persistEmployeeSessionPdf(session, pdfBuffer);
}

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
  const templateObj = await resolveSessionTemplateContext(session);

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
    latitude, longitude, clientTime, auditMeta,
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
  const deviceInfo = parseDevice(ua);
  const localTime  = clientTime || new Date().toUTCString();
  const geo        = await resolveSigningLocation(ip, latitude, longitude);
  if (auditMeta?.timezone && !geo.timezone) geo.timezone = auditMeta.timezone;

  // ── Load template (campaign overlay for reuse batches) ──
  const template = await resolveSessionTemplateContext(session);
  if (!template?._id) {
    return res.status(404).json({ success: false, message: 'Template not found.' });
  }

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

      // ── Step 3–5: Generate & store signed PDF ───────
      let signedFileUrl = null;
      let pdfBuffer     = null;
      let sessionDoc    = null;

      try {
        const built = await buildEmployeeSessionPdf(session, template, { signatureDataUrl });
        pdfBuffer  = built.pdfBuffer;
        sessionDoc = built.sessionDoc;
        await persistEmployeeSessionPdf(session, pdfBuffer);
        signedFileUrl = session.signedFileUrl;
      } catch (e) {
        console.error('[employeeSign] PDF generation failed:', e.message);
      }

      // ── Step 6: Update template stats ──────────────
      let freshTemplate = null;
      try {
        const templateDoc = await Template.findById(template._id);
        if (templateDoc) {
          freshTemplate = await templateDoc.recalculateStats();
        }
      } catch (e) {
        console.error('[employeeSign] Stats update failed:', e.message);
        freshTemplate = await Template.findById(template._id);
      }

      const owner = template.owner
        ? await User.findById(template.owner).select('full_name email company_logo').lean()
        : null;

      // Prefer in-memory PDF; fall back to stored copy for email attachment
      let emailPdfBuffer = pdfBuffer;
      if (!emailPdfBuffer) {
        try {
          emailPdfBuffer = await getPdfBytes({
            fileUrl:      session.signedFileUrl,
            filePublicId: session.signedFilePublicId,
            localPdfPath: session.localSignedPdfPath,
          });
        } catch (e) {
          console.error('[employeeSign] Could not load stored PDF for email:', e.message);
        }
      }

      const signedPdfUrlForEmail = signedFileUrl || session.signedFileUrl || '';
      const partiesForEmail      = sessionDoc?.parties || [];

      // ── Step 7: Completion email to employee ───────
      try {
        if (emailPdfBuffer || signedPdfUrlForEmail) {
          await sendCompletionEmail?.({
            recipientEmail:       session.recipientEmail,
            recipientName:        session.recipientName,
            recipientDesignation: session.recipientDesignation || '',
            documentTitle:        template.title,
            pdfBuffer:            emailPdfBuffer || null,
            signedPdfUrl:         signedPdfUrlForEmail || template.bossSignedFileUrl || '',
            companyName:          template.companyName || '',
            companyLogoUrl:       resolveTemplateLogo(template, owner),
            ownerCompanyLogo:     owner?.company_logo || '',
            parties:              partiesForEmail,
          });
          console.log(`[employeeSign] Completion email sent to ${session.recipientEmail}`);
        } else {
          console.error('[employeeSign] No signed PDF available — completion email skipped');
        }
      } catch (e) {
        console.error('[employeeSign] Completion email failed:', e.message);
      }

      // ── Step 8: If all signed → owner + CC emails ──
      if (freshTemplate?.status === 'completed') {
        try {
          // Owner notification
          await sendCompletionEmail?.({
            recipientEmail:   owner?.email,
            recipientName:    owner?.full_name || 'Owner',
            documentTitle:    template.title,
            pdfBuffer:        emailPdfBuffer || null,
            signedPdfUrl:     signedPdfUrlForEmail,
            companyName:      template.companyName || '',
            companyLogoUrl:   resolveTemplateLogo(template, owner),
            ownerCompanyLogo: owner?.company_logo || '',
            parties:          partiesForEmail,
          });

          // CC emails with PDF attachment
          await Promise.allSettled(
            (template.ccList || []).map(cc =>
              sendCompletionEmail?.({
                recipientEmail:   cc.email,
                recipientName:    cc.name || cc.email,
                documentTitle:    template.title,
                pdfBuffer:        emailPdfBuffer || null,
                signedPdfUrl:     signedPdfUrlForEmail,
                companyName:      template.companyName || '',
                companyLogoUrl:   resolveTemplateLogo(template, owner),
                ownerCompanyLogo: owner?.company_logo || '',
                isCC:             true,
                parties:          partiesForEmail,
              }),
            ),
          );
        } catch (e) {
          console.error('[employeeSign] Owner/CC email failed:', e.message);
        }
      }

      // ── Step 9: Audit log ───────────────────────────
      safeAuditLog({
        action:         'employee_signed_template',
        document_id:    template._id,
        template_id:    template._id,
        session_id:     session._id,
        document_title: template.title,
        performed_by: {
          name:  session.recipientName,
          email: session.recipientEmail,
          role:  'employee',
        },
        device: {
          device_name: deviceInfo.device,
          device_type: deviceInfo.deviceType || (deviceInfo.isMobile ? 'mobile' : 'desktop'),
          browser:     deviceInfo.browser,
          os:          deviceInfo.os,
        },
        location:     toAuditLocation(geo, ip),
        local_time:   localTime,
      });

      // ── Step 10: Socket emit ────────────────────────
      emitSocket(
        { app: { get: () => null } },
        'template:employee_signed',
        {
          templateId:    String(template._id),
          sessionId:     String(session._id),
          ownerId:       String(template.owner),
          signerName:    session.recipientName,
          signerEmail:   session.recipientEmail,
          signedFileUrl: signedPdfUrlForEmail || null,
          signedCount:   freshTemplate?.stats?.signed || 0,
          totalCount:    freshTemplate?.stats?.totalRecipients || 0,
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
// 11a-b. GET TEMPLATE MASTER PDF (owner — boss-signed base)
// GET /api/templates/:id/pdf
// ════════════════════════════════════════════════════
const getOwnerTemplatePdf = asyncHandler(async (req, res) => {
  try {
    const template = await Template.findOne({
      _id:       req.params.id,
      owner:     req.user._id,
      isDeleted: false,
    }).lean();

    if (!template)
      return res.status(404).json({ success: false, message: 'Template not found.' });

    const record = {
      fileUrl:            template.bossSignedFileUrl || template.fileUrl,
      filePublicId:       template.filePublicId,
      localPdfPath:       template.localPdfPath,
      localSignedPdfPath: template.localBossSignedPdfPath,
      bossSignedFileUrl:  template.bossSignedFileUrl,
    };

    const buffer = await getPdfBytes(record, { preferSigned: !!template.bossSignedFileUrl });
    const safeName = (template.title || 'template').replace(/[^a-zA-Z0-9._-]/g, '_');
    return sendPdf(res, buffer, safeName);
  } catch (err) {
    console.error('[getOwnerTemplatePdf]', err.message);
    return res.status(502).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════
// 11a. GET EMPLOYEE SIGNED PDF (owner)
// GET /api/templates/:id/sessions/:sessionId/pdf
// ════════════════════════════════════════════════════
const getSessionSignedPdf = asyncHandler(async (req, res) => {
  try {
    const template = await Template.findOne({
      _id:       req.params.id,
      owner:     req.user._id,
      isDeleted: false,
    }).lean();

    if (!template)
      return res.status(404).json({ success: false, message: 'Template not found.' });

    let session = await TemplateSession.findOne({
      _id:       req.params.sessionId,
      template:  template._id,
      isDeleted: { $ne: true },
    });

    if (!session)
      return res.status(404).json({ success: false, message: 'Session not found.' });

    if (session.status !== 'signed')
      return res.status(400).json({ success: false, message: 'Employee has not signed yet.' });

    const templateCtx = await resolveSessionTemplateContext({
      template,
      campaignId: session.campaignId,
    });

    session = await ensureEmployeeSessionPdf(session, templateCtx);

    const buffer = await getPdfBytes({
      fileUrl:      session.signedFileUrl,
      filePublicId: session.signedFilePublicId,
      localPdfPath: session.localSignedPdfPath,
    });

    const safeName = `${template.title}_${session.recipientName}`
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    return sendPdf(res, buffer, safeName);
  } catch (err) {
    console.error('[getSessionSignedPdf]', err.message);
    return res.status(502).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════
// 11b. RESEND SIGNED COPY TO EMPLOYEE
// POST /api/templates/:id/sessions/:sessionId/resend-signed
// ════════════════════════════════════════════════════
const resendSignedCopy = asyncHandler(async (req, res) => {
  const template = await Template.findOne({
    _id:       req.params.id,
    owner:     req.user._id,
    isDeleted: false,
  }).lean();

  if (!template)
    return res.status(404).json({ success: false, message: 'Template not found.' });

  let session = await TemplateSession.findOne({
    _id:       req.params.sessionId,
    template:  template._id,
    isDeleted: { $ne: true },
  });

  if (!session)
    return res.status(404).json({ success: false, message: 'Session not found.' });

  if (session.status !== 'signed')
    return res.status(400).json({ success: false, message: 'Employee has not signed yet.' });

  const templateCtx = await resolveSessionTemplateContext({
    template,
    campaignId: session.campaignId,
  });

  try {
    session = await ensureEmployeeSessionPdf(session, templateCtx);
    const { sessionDoc } = await buildEmployeeSessionPdf(session, templateCtx);
    const pdfBuffer = await getPdfBytes({
      fileUrl:      session.signedFileUrl,
      filePublicId: session.signedFilePublicId,
      localPdfPath: session.localSignedPdfPath,
    });

    await sendCompletionEmail?.({
      recipientEmail:       session.recipientEmail,
      recipientName:        session.recipientName,
      recipientDesignation: session.recipientDesignation || '',
      documentTitle:        template.title,
      pdfBuffer,
      signedPdfUrl:         session.signedFileUrl || '',
      companyName:          template.companyName || '',
      companyLogoUrl:       resolveTemplateLogo(template, req.user),
      ownerCompanyLogo:     req.user?.company_logo || '',
      parties:              sessionDoc.parties,
    });

    return res.json({
      success: true,
      message: `Signed copy sent to ${session.recipientEmail}.`,
    });
  } catch (err) {
    console.error('[resendSignedCopy]', err.message);
    return res.status(502).json({
      success: false,
      message: `Could not send signed copy: ${err.message}`,
    });
  }
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

  const result = await dispatchEmployeeEmail({
    session,
    template,
    bossUser: req.user,
  });
  await recordSessionEmailResult(session, result);

  if (!result?.success) {
    return res.status(502).json({
      success: false,
      message: `Could not deliver email to ${session.recipientEmail}. ${result?.error || ''}`.trim(),
      emailDelivered: false,
      emailError:     result?.error || 'Delivery failed',
    });
  }

  return res.json({
    success: true,
    message: `Email sent to ${session.recipientEmail}.`,
    reminderCount:  session.reminderCount,
    emailDelivered: true,
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
    }).populate('template', 'fileUrl filePublicId bossSignedFileUrl title localPdfPath localBossSignedPdfPath');

    if (!session)
      return res.status(404).send('Not found');

    session.template = session.template || { _id: session.templateId };
    const tmpl = await resolveSessionTemplateContext(session);
    if (!tmpl) return res.status(404).send('PDF not available');

    const record = {
      fileUrl:            tmpl.bossSignedFileUrl || tmpl.fileUrl,
      filePublicId:       tmpl.filePublicId,
      localPdfPath:       tmpl.localPdfPath,
      localSignedPdfPath: tmpl.localBossSignedPdfPath,
      bossSignedFileUrl:  tmpl.bossSignedFileUrl,
    };

    let buffer;
    try {
      buffer = await getPdfBytes(record, { preferSigned: !!tmpl.bossSignedFileUrl });
    } catch (fetchErr) {
      const cacheId = tmpl._campaignId || tmpl._id;
      if (cacheId && tmpl.fileUrl) {
        try {
          const bytes = await getPdfBytes({
            fileUrl:      tmpl.fileUrl,
            filePublicId: tmpl.filePublicId,
          });
          const filename = savePdfBuffer(bytes, String(cacheId));
          if (tmpl._campaignId) {
            await TemplateCampaign.updateOne(
              { _id: tmpl._campaignId },
              { localPdfPath: filename },
            );
          } else if (tmpl._id) {
            await Template.updateOne({ _id: tmpl._id }, { localPdfPath: filename });
          }
          buffer = bytes;
        } catch {
          throw fetchErr;
        }
      } else {
        throw fetchErr;
      }
    }
    return sendPdf(res, buffer, tmpl.title, { publicAccess: true });
  } catch (err) {
    console.error('[getTemplatePdf]', err.message);
    return res.status(502).send(err.message);
  }
});

// ════════════════════════════════════════════════════
// 13. EMAIL PREVIEW (owner — before/after send)
// POST /api/templates/email-preview
// POST /api/templates/:id/email-preview
// ════════════════════════════════════════════════════
const previewEmployeeEmail = asyncHandler(async (req, res) => {
  const bossUser = req.user;
  let template = null;

  if (req.params.id) {
    template = await Template.findOne({
      _id: req.params.id, owner: req.user._id, isDeleted: false,
    }).lean();
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found.' });
    }
  }

  const body = req.body || {};
  const employee = body.employee || {};
  const expiryDays = template?.signingConfig?.expiryDays || body.expiryDays || 30;
  const expiryDate = new Date(Date.now() + expiryDays * 86_400_000)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const sc = template?.signingConfig || {};
  const useCustom = body.useCustomEmailBody ?? template?.useCustomEmailBody ?? sc.useCustomEmailBody ?? false;
  const customBody = body.customEmailBody ?? template?.customEmailBody ?? sc.customEmailBody ?? '';
  const customSubject = body.customEmailSubject ?? template?.customEmailSubject ?? sc.customEmailSubject ?? '';

  const preview = buildEmailPreview?.('employee_signing_request', {
    to:                  employee.email || 'employee@company.com',
    employeeName:        employee.name || 'Employee Name',
    employeeDesignation: employee.designation || '',
    docTitle:            body.documentTitle || template?.title || 'Document Title',
    actionUrl:           links.templateSignPreview(),
    bossName:            body.bossName || bossUser.full_name || 'Manager Name',
    bossDesignation:     body.bossDesignation || bossUser.designation || '',
    companyName:         body.companyName || template?.companyName || 'Company Name',
    companyLogo:         body.companyLogo || template?.companyLogo || bossUser.company_logo || '',
    emailHeaderColor:    body.emailHeaderColor || template?.emailHeaderColor || '#0f172a',
    customMessage:       body.message || template?.message || sc.emailMessage || '',
    expiryDate,
    useCustomEmailBody:  useCustom,
    customEmailBody:     customBody,
    customEmailSubject:  customSubject,
  });

  if (!preview) {
    return res.status(503).json({ success: false, message: 'Email preview unavailable.' });
  }

  return res.json({ success: true, ...preview });
});

// ════════════════════════════════════════════════════
// 14. RESEND ALL FAILED EMPLOYEE EMAILS
// POST /api/templates/:id/resend-failed
// ════════════════════════════════════════════════════
const resendFailedEmails = asyncHandler(async (req, res) => {
  const template = await Template.findOne({
    _id: req.params.id, owner: req.user._id, isDeleted: false,
  });

  if (!template) {
    return res.status(404).json({ success: false, message: 'Template not found.' });
  }

  const sessions = await TemplateSession.find({
    template:       template._id,
    emailDelivered: { $ne: true },
    status:         { $in: ['pending', 'viewed', 'expired'] },
    isDeleted:      { $ne: true },
  });

  if (!sessions.length) {
    return res.json({ success: true, message: 'No failed emails to resend.', resent: 0 });
  }

  const failed = [];
  let resent = 0;

  for (const session of sessions) {
    if (session.status === 'expired' || !session.token) {
      session.token     = generateToken();
      session.status    = 'pending';
      session.expiresAt = new Date(Date.now() + 7 * 86_400_000);
    }

    const result = await dispatchEmployeeEmail({ session, template, bossUser: req.user });
    await recordSessionEmailResult(session, result);

    if (result?.success) resent += 1;
    else failed.push({ name: session.recipientName, email: session.recipientEmail, error: result?.error });
  }

  if (failed.length) {
    await sendEmailDeliveryFailureNotice?.({
      ownerEmail: req.user.email,
      ownerName:  req.user.full_name || req.user.name,
      docTitle:   template.title,
      failed,
      totalCount: sessions.length,
    });
  }

  return res.json({
    success: true,
    message: `Resent ${resent}/${sessions.length} failed emails.`,
    resent,
    stillFailed: failed.length,
    failedRecipients: failed,
  });
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
  getTemplateAudit,
  getSessionByToken,
  getSessionSignedPdf,
  getOwnerTemplatePdf,
  resendSignedCopy,
  employeeSign,
  employeeDecline,
  resendEmail,
  resendFailedEmails,
  previewEmployeeEmail,
  getTemplatePdf,
  distributeTemplateEmployees,
  emailTemplateApprover,
  performBossSignOnTemplate,
  embedBossSignatureOnRecord,
  queueEmployeeSessionEmails,
};
