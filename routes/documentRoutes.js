

'use strict';

const express            = require('express');
const router             = express.Router();
const multer             = require('multer');
const crypto             = require('crypto');
const { v2: cloudinary } = require('cloudinary');

const Document = require('../models/Document');
const AuditLog = require('../models/AuditLog');
const { auth } = require('../middleware/auth');

const {
  sendSigningEmail,
  sendCompletionEmail,
  sendCCEmail,
  buildEmailPreview,
} = require('../utils/emailService');

const {
  mergeSignaturesIntoPDF,
  appendAuditPage,
} = require('../utils/pdfService');

const { savePdfBuffer, getPdfBytes, sendPdf } = require('../utils/pdfStorage');

// NOTE: Cloudinary is configured globally in index.js.
// Calling cloudinary.config() here again is redundant and was removed (Phase 1 fix).

function checkCloudinary() {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY    ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new Error('Cloudinary is not configured. Check environment variables.');
  }
}

// ═══════════════════════════════════════════════════════════════
// MULTER — PDF only
// ═══════════════════════════════════════════════════════════════
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'), false);
  },
});

// ═══════════════════════════════════════════════════════════════
// MULTER — Image only (logos)
// ═══════════════════════════════════════════════════════════════
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});

// ═══════════════════════════════════════════════════════════════
// MULTER ERROR HANDLER
// ═══════════════════════════════════════════════════════════════
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Max: 15MB for PDF, 5MB for logo.',
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) return res.status(400).json({ success: false, message: err.message });
  next();
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
const FRONT = () =>
  (process.env.FRONTEND_URL || 'https://nexsignfrontend.vercel.app')
    .replace(/\/$/, '');

async function uploadToCloudinary(buffer, options = {}) {
  checkCloudinary();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    stream.end(buffer);
  });
}

function getIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.ip ||
    'Unknown'
  );
}

function parseDevice(ua = '') {
  let device = 'Unknown Device', browser = 'Unknown Browser',
      os = 'Unknown OS', deviceType = 'desktop';

  if (/iPhone/.test(ua)) {
    const m = ua.match(/iPhone\s?OS\s?([\d_]+)/i);
    device = 'iPhone';
    os = m ? `iOS ${m[1].replace(/_/g, '.')}` : 'iOS';
    deviceType = 'mobile';
  } else if (/iPad/.test(ua)) {
    device = 'iPad'; os = 'iPadOS'; deviceType = 'tablet';
  } else if (/Android/.test(ua)) {
    const model = ua.match(/Android[^;]*;\s*([^)]+)\)/)?.[1]?.trim();
    device = model || 'Android Device';
    const ver = ua.match(/Android\s([\d.]+)/)?.[1];
    os = ver ? `Android ${ver}` : 'Android';
    deviceType = /Mobile/.test(ua) ? 'mobile' : 'tablet';
  } else if (/Windows/.test(ua)) {
    device = 'Windows PC';
    const ver = ua.match(/Windows NT ([\d.]+)/)?.[1];
    const wm  = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
    os = `Windows ${wm[ver] || ver || ''}`.trim();
  } else if (/Macintosh|Mac OS X/.test(ua)) {
    device = 'Mac';
    const ver = ua.match(/Mac OS X ([\d_]+)/)?.[1];
    os = ver ? `macOS ${ver.replace(/_/g, '.')}` : 'macOS';
  } else if (/Linux/.test(ua)) {
    device = 'Linux PC'; os = 'Linux';
  }

  if      (/Edg\//.test(ua))     browser = `Edge ${ua.match(/Edg\/([\d.]+)/)?.[1]       || ''}`.trim();
  else if (/OPR\//.test(ua))     browser = `Opera ${ua.match(/OPR\/([\d.]+)/)?.[1]      || ''}`.trim();
  else if (/Chrome\//.test(ua))  browser = `Chrome ${ua.match(/Chrome\/([\d.]+)/)?.[1]  || ''}`.trim();
  else if (/Firefox\//.test(ua)) browser = `Firefox ${ua.match(/Firefox\/([\d.]+)/)?.[1]|| ''}`.trim();
  else if (/Safari\//.test(ua))  browser = `Safari ${ua.match(/Version\/([\d.]+)/)?.[1] || ''}`.trim();

  return { device, browser, os, deviceType, raw: ua };
}

// ═══════════════════════════════════════════════════════════════
// FIX: getGeoLocation — ipapi.co use করা হয়েছে
// ip-api.com Vercel এ often fail করে
// ipapi.co → Vercel serverless এ reliable
// ═══════════════════════════════════════════════════════════════
async function getGeoLocation(ip) {
  try {
    // Local / private IP → dummy data
    const normalizedIp = String(ip || '').replace(/^::ffff:/, '');
    if (
      !ip ||
      ip === 'Unknown' ||
      normalizedIp.startsWith('127.') ||
      ip.startsWith('::1') ||
      ip.startsWith('::') ||
      normalizedIp.startsWith('10.') ||
      normalizedIp.startsWith('192.168.') ||
      ip === 'localhost'
    ) {
      return {
        city:        'Local',
        region:      'Local',
        country:     'Local',
        countryCode: 'XX',
        postalCode:  '0000',
        timezone:    'Asia/Dhaka',
        latitude:    '',
        longitude:   '',
        display:     'Local Development',
      };
    }

    // ✅ Primary: ipapi.co — Vercel এ reliable
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4000);

      const res  = await fetch(
        `https://ipapi.co/${ip}/json/`,
        {
          signal:  controller.signal,
          headers: { 'User-Agent': 'nexsign-app/1.0' },
        },
      );
      clearTimeout(tid);

      if (res.ok) {
        const data = await res.json();

        // ipapi.co error response check
        if (data.error) throw new Error(data.reason || 'ipapi error');

        return {
          city:        data.city         || null,
          region:      data.region       || null,
          country:     data.country_name || null,
          countryCode: data.country_code || null,
          postalCode:  data.postal       || null,
          timezone:    data.timezone     || null,
          latitude:    String(data.latitude  || ''),
          longitude:   String(data.longitude || ''),
          display: [data.city, data.country_name, data.postal]
            .filter(Boolean).join(', '),
        };
      }
    } catch (primaryErr) {
      console.warn('[geo primary ipapi.co failed]', primaryErr.message);
    }

    // ✅ Fallback: ip-api.com
    try {
      const controller2 = new AbortController();
      const tid2 = setTimeout(() => controller2.abort(), 4000);

      const res2  = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,city,regionName,country,countryCode,zip,timezone,lat,lon`,
        { signal: controller2.signal },
      );
      clearTimeout(tid2);

      if (res2.ok) {
        const data2 = await res2.json();
        if (data2.status === 'success') {
          return {
            city:        data2.city        || null,
            region:      data2.regionName  || null,
            country:     data2.country     || null,
            countryCode: data2.countryCode || null,
            postalCode:  data2.zip         || null,
            timezone:    data2.timezone    || null,
            latitude:    String(data2.lat  || ''),
            longitude:   String(data2.lon  || ''),
            display: [data2.city, data2.countryCode, data2.zip]
              .filter(Boolean).join(', '),
          };
        }
      }
    } catch (fallbackErr) {
      console.warn('[geo fallback ip-api.com failed]', fallbackErr.message);
    }

    return null;

  } catch (e) {
    console.warn('[getGeoLocation] failed:', e.message);
    return null;
  }
}
// ✅ Reverse geocode — GPS coordinates থেকে exact location
// BigDataCloud — free, no API key, Vercel এ perfect
async function reverseGeocode(latitude, longitude) {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
      { signal: controller.signal },
    );
    clearTimeout(tid);

    if (!res.ok) return null;
    const data = await res.json();

    // BigDataCloud response structure
    const city       = data.city
                    || data.locality
                    || data.principalSubdivision
                    || null;
    const region     = data.principalSubdivision || null;
    const country    = data.countryName          || null;
    const countryCode= data.countryCode          || null;
    const postalCode = data.postcode             || null;
    const timezone   = data.timezone?.name       || null;

    return {
      city,
      region,
      country,
      countryCode,
      postalCode,
      timezone,
      latitude:  String(latitude),
      longitude: String(longitude),
      display: [city, region, country, postalCode]
        .filter(Boolean).join(', '),
    };
  } catch (e) {
    console.warn('[reverseGeocode] failed:', e.message);
    return null;
  }
}
function emitSocket(req, event, data) {
  try {
    const io = req.app.get('io');
    if (io) io.emit(event, data);
  } catch (_) {}
}

async function safeAuditLog(payload) {
  try { await AuditLog.createLog(payload); }
  catch (e) { console.error('[AuditLog]', e.message); }
}

function sanitizeDoc(doc, visiblePartyIdx = null) {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (Array.isArray(obj.parties)) {
    obj.parties = obj.parties.map((p, i) => {
      const party = { ...p };
      if (i !== visiblePartyIdx) delete party.token;
      return party;
    });
  }
  return obj;
}

const ALLOWED_FIELD_TYPES = new Set([
  'signature', 'initial', 'text', 'date', 'checkbox', 'number',
]);

function validateFields(fields) {
  if (!Array.isArray(fields)) return 'Fields must be an array.';
  for (const f of fields) {
    if (!f.id)   return 'Field missing id.';
    if (!f.type) return `Field ${f.id} missing type.`;
    if (!ALLOWED_FIELD_TYPES.has(f.type))
      return `Field type "${f.type}" is not supported.`;
    if (f.partyIndex === undefined || f.partyIndex === null)
      return `Field ${f.id} missing partyIndex.`;
    if (f.x === undefined || f.y === undefined)
      return `Field ${f.id} missing position (x, y).`;
    if (!f.width || !f.height)
      return `Field ${f.id} missing size (width, height).`;
    if (!f.page) return `Field ${f.id} missing page number.`;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// ── 1. GET ALL DOCUMENTS ────────────────────────────────────────
// router.get('/', auth, async (req, res) => {
//   try {
//     const { status, page = 1, limit = 20 } = req.query;
//     const query = { owner: req.user.id, isTemplate: false };
//     if (status) query.status = status;

//     const skip = (Number(page) - 1) * Number(limit);

//     const [documents, total] = await Promise.all([
//       Document.find(query)
//         .sort({ updatedAt: -1 })
//         .skip(skip)
//         .limit(Number(limit))
//         .select('-fields')
//         .lean(),
//       Document.countDocuments(query),
//     ]);

//     const [totalDocs, pendingDocs, completedDocs] = await Promise.all([
//       Document.countDocuments({ owner: req.user.id, isTemplate: false }),
//       Document.countDocuments({ owner: req.user.id, isTemplate: false, status: 'in_progress' }),
//       Document.countDocuments({ owner: req.user.id, isTemplate: false, status: 'completed' }),
//     ]);

//     return res.json({
//       success: true,
//       documents,
//       pagination: {
//         total, page: Number(page),
//         limit: Number(limit),
//         totalPages: Math.ceil(total / Number(limit)),
//       },
//       stats: {
//         total:     totalDocs,
//         pending:   pendingDocs,
//         completed: completedDocs,
//         draft:     totalDocs - pendingDocs - completedDocs,
//       },
//     });
//   } catch (err) {
//     console.error('[GET /documents]', err.message);
//     return res.status(500).json({ success: false, message: err.message });
//   }
// });
// ── 1. GET ALL DOCUMENTS ─────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const {
      status,
      page  = 1,
      limit = 10,   // ✅ 10 করা হলো — কম data = fast
    } = req.query;

    const query = { owner: req.user.id, isTemplate: false };
    if (status && status !== 'all') query.status = status;

    const pageNum  = Math.max(1, Number(page));
    const limitNum = Math.min(20, Math.max(1, Number(limit))); // max 20
    const skip     = (pageNum - 1) * limitNum;

    // ✅ Parallel queries — একসাথে চালাও
    const [documents, total] = await Promise.all([
      Document.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .select('title status parties ccList companyName companyLogo signedFileUrl createdAt updatedAt sentAt completedAt isTemplate workflowType currentPartyIndex')
        .lean(),
      Document.countDocuments(query),
    ]);

    // ✅ Stats — same query এ
    const [pending, completed, draft] = await Promise.all([
      Document.countDocuments({ owner: req.user.id, isTemplate: false, status: 'in_progress' }),
      Document.countDocuments({ owner: req.user.id, isTemplate: false, status: 'completed'   }),
      Document.countDocuments({ owner: req.user.id, isTemplate: false, status: 'draft'       }),
    ]);

    return res.json({
      success: true,
      documents,
      pagination: {
        total,
        page:       pageNum,
        limit:      limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasMore:    pageNum * limitNum < total,
      },
      stats: {
        total:     total,
        pending,
        completed,
        draft,
      },
    });
  } catch (err) {
    console.error('[GET /documents]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── 2. UPLOAD PDF ───────────────────────────────────────────────
router.post(
  '/upload',
  auth,
  (req, res, next) =>
    pdfUpload.single('file')(req, res, err =>
      handleMulterError(err, req, res, next)
    ),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No PDF file uploaded.' });
      }
      checkCloudinary();
      const result = await uploadToCloudinary(req.file.buffer, {
        resource_type: 'raw',
        folder:        'nexsign/documents',
        format:        'pdf',
      });
      const doc = await Document.create({
        owner:    req.user.id,
        title:    req.file.originalname.replace(/\.pdf$/i, '').trim(),
        fileUrl:  result.secure_url,
        fileId:   result.public_id,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        status:   'draft',
      });
      const cachedName = savePdfBuffer(req.file.buffer, String(doc._id));
      if (cachedName) doc.localPdfPath = cachedName;
      await doc.save();
      return res.status(201).json({ success: true, document: doc });
    } catch (err) {
      console.error('[POST /upload]', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ── 3. UPLOAD LOGO ──────────────────────────────────────────────
router.post(
  '/upload-logo',
  auth,
  (req, res, next) =>
    logoUpload.single('logo')(req, res, err =>
      handleMulterError(err, req, res, next)
    ),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No logo file uploaded.' });
      }
      try { checkCloudinary(); } catch (cfgErr) {
        return res.status(503).json({
          success: false,
          message: 'Logo upload unavailable: ' + cfgErr.message,
        });
      }
      const result = await uploadToCloudinary(req.file.buffer, {
        resource_type:  'image',
        folder:         'nexsign/logos',
        transformation: [{ width: 400, crop: 'limit' }],
      });
      return res.json({ success: true, logoUrl: result.secure_url });
    } catch (err) {
      console.error('[POST /upload-logo]', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ── 3b. EMAIL PREVIEW (sequential documents) ────────────────────
router.post('/email-preview', auth, async (req, res) => {
  try {
    const body = req.body || {};
    const preview = buildEmailPreview('signing_request', {
      to:                  body.recipientEmail || 'signer@example.com',
      signerName:          body.signerName || body.recipientName || 'Signer Name',
      senderName:          body.senderName || req.user.full_name || 'Sender Name',
      senderDesignation:   body.senderDesignation || req.user.designation || '',
      senderEmail:         body.senderEmail || req.user.email,
      docTitle:            body.documentTitle || body.title || 'Document Title',
      actionUrl:           `${FRONT()}/sign/preview-token`,
      companyLogo:         body.companyLogo || req.user.company_logo || '',
      companyName:         body.companyName || req.user.company_name || 'Company Name',
      emailHeaderColor:    body.emailHeaderColor || '#0f172a',
      customMessage:       body.message || '',
      partyNumber:         body.partyNumber || 1,
      totalParties:        body.totalParties || 1,
      useCustomEmailBody:  body.useCustomEmailBody,
      customEmailBody:     body.customEmailBody || '',
      customEmailSubject:  body.customEmailSubject || '',
    });
    return res.json({ success: true, ...preview });
  } catch (err) {
    console.error('[POST /documents/email-preview]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── 4. SEND FOR SIGNING ─────────────────────────────────────────
router.post(
  '/upload-and-send',
  auth,
  (req, res, next) =>
    pdfUpload.single('file')(req, res, err => {
      if (err && err.message === 'Only PDF files are allowed') return next();
      if (err) return handleMulterError(err, req, res, next);
      next();
    }),
  async (req, res) => {
    try {
      const {
        title, parties: partiesRaw, fields: fieldsRaw,
        ccList: ccRaw, totalPages, companyName,
        companyLogo, message, docId, emailHeaderColor,
        useCustomEmailBody, customEmailBody, customEmailSubject,
      } = req.body;

      let parsedParties, parsedFields, parsedCC;
      try {
        parsedParties = JSON.parse(partiesRaw || '[]');
        parsedFields  = JSON.parse(fieldsRaw  || '[]');
        parsedCC      = JSON.parse(ccRaw      || '[]');
      } catch {
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON in parties, fields, or ccList.',
        });
      }

      if (!Array.isArray(parsedParties) || !parsedParties.length) {
        return res.status(400).json({
          success: false, message: 'At least one signer is required.',
        });
      }

      if (parsedFields.length > 0) {
        const fieldErr = validateFields(parsedFields);
        if (fieldErr) return res.status(400).json({ success: false, message: fieldErr });
      }

      let doc = null;
      if (docId && !['undefined', 'null', ''].includes(String(docId))) {
        doc = await Document.findOne({ _id: docId, owner: req.user.id });
      }

      if (!doc && req.file) {
        checkCloudinary();
        const result = await uploadToCloudinary(req.file.buffer, {
          resource_type: 'raw',
          folder:        'nexsign/documents',
          format:        'pdf',
        });
        doc = new Document({
          owner:    req.user.id,
          fileUrl:  result.secure_url,
          fileId:   result.public_id,
          fileName: req.file.originalname,
          fileSize: req.file.size,
        });
        const draftCache = savePdfBuffer(req.file.buffer, 'draft');
        if (draftCache) doc.localPdfPath = draftCache;
      }

      if (!doc) {
        return res.status(400).json({
          success: false, message: 'No document found and no PDF provided.',
        });
      }

      // Ensure local PDF copy exists (Cloudinary raw URLs return 401 when PDF delivery is restricted)
      if (req.file?.buffer) {
        const sendCache = savePdfBuffer(req.file.buffer, String(doc._id || 'send'));
        if (sendCache) doc.localPdfPath = sendCache;
      } else if (!doc.localPdfPath && doc.fileUrl) {
        try {
          const bytes = await getPdfBytes(doc);
          const remoteCache = savePdfBuffer(bytes, String(doc._id));
          if (remoteCache) doc.localPdfPath = remoteCache;
        } catch (localErr) {
          console.warn('[upload-and-send] Could not cache local PDF:', localErr.message);
        }
      }

      const firstToken = crypto.randomBytes(32).toString('hex');

      doc.title             = title?.trim() || doc.title || 'Untitled';
      doc.companyName       = companyName || '';
      doc.companyLogo       = companyLogo || req.user.company_logo || '';
      doc.emailHeaderColor  = emailHeaderColor || doc.emailHeaderColor || '#0f172a';
      doc.message           = message     || '';
      doc.useCustomEmailBody = useCustomEmailBody === true || useCustomEmailBody === 'true';
      doc.customEmailBody    = customEmailBody    || '';
      doc.customEmailSubject = customEmailSubject || '';
      doc.totalPages        = Number(totalPages) || 1;
      doc.fields            = parsedFields.map(f => ({
        id:              f.id,
        type:            f.type,
        partyIndex:      Number(f.partyIndex),
        partyEmail:      f.partyEmail   || null,
        page:            Number(f.page) || 1,
        x:               Number(f.x),
        y:               Number(f.y),
        width:           Number(f.width),
        height:          Number(f.height),
        fontSize:        f.fontSize     || 14,
        fontFamily:      f.fontFamily   || 'Inter',
        fontWeight:      f.fontWeight   || 'normal',
        color:           f.color        || '#000000',
        backgroundColor: f.backgroundColor || 'transparent',
        label:           f.label        || null,
        placeholder:     f.placeholder  || null,
        required:        f.required !== false,
        value:           null,
        filledAt:        null,
      }));
      doc.ccList            = parsedCC;
      doc.status            = 'in_progress';
      doc.currentPartyIndex = 0;
      doc.sentAt            = new Date();
      doc.parties = parsedParties.map((p, i) => ({
        name:           p.name?.trim(),
        email:          p.email?.toLowerCase().trim(),
        designation:    p.designation?.trim() || null,
        order:          i,
        color:          p.color || '#3B82F6',
        status:         i === 0 ? 'sent'    : 'pending',
        token:          i === 0 ? firstToken : null,
        emailSentAt:    i === 0 ? new Date() : null,
        tokenExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      }));

      await doc.save();

      safeAuditLog({
        document_id:    doc._id,
        document_title: doc.title,
        company_name:   doc.companyName,
        action:         'sent',
        performed_by: {
          user_id:     req.user._id,
          name:        req.user.full_name,
          email:       req.user.email,
          designation: req.user.designation,
          role:        'owner',
        },
        cc_list: parsedCC.map(cc => ({
          name: cc.name, email: cc.email, designation: cc.designation,
        })),
        details: {
          total_parties: parsedParties.length,
          total_fields:  parsedFields.length,
        },
      });

      const first = doc.parties[0];
      const signingPayload = {
        recipientEmail:       first.email,
        recipientName:        first.name,
        recipientDesignation: first.designation,
        senderName:           req.user.full_name,
        senderDesignation:    req.user.designation,
        senderEmail:          req.user.email,
        documentTitle:        doc.title,
        signingLink:          `${FRONT()}/sign/${firstToken}`,
        companyLogoUrl:       doc.companyLogo,
        companyName:          doc.companyName,
        emailHeaderColor:     doc.emailHeaderColor,
        partyNumber:          1,
        totalParties:         parsedParties.length,
        message:              doc.message,
        ccList:               parsedCC,
        useCustomEmailBody:   doc.useCustomEmailBody,
        customEmailBody:      doc.customEmailBody,
        customEmailSubject:   doc.customEmailSubject,
      };

      emitSocket(req, 'document:created', {
        documentId: doc._id,
        ownerId:    req.user.id,
        title:      doc.title,
        status:     doc.status,
      });

      const emailResult = await sendSigningEmail(signingPayload);
      if (emailResult?.success === false) {
        return res.status(502).json({
          success:  false,
          message:  `Document saved but signing email failed: ${emailResult.error || 'SMTP error'}. Check SMTP settings on the server.`,
          document: sanitizeDoc(doc),
        });
      }

      res.json({ success: true, document: sanitizeDoc(doc), emailSent: true });

      parsedCC.forEach(cc =>
        sendCCEmail({
          recipientEmail:       cc.email,
          recipientName:        cc.name,
          recipientDesignation: cc.designation,
          documentTitle:        doc.title,
          senderName:           req.user.full_name,
          senderDesignation:    req.user.designation,
          companyLogoUrl:       doc.companyLogo,
          companyName:          doc.companyName,
          emailHeaderColor:     doc.emailHeaderColor,
          parties:              parsedParties,
        }).catch(e => console.error('[upload-and-send] CC email failed:', e.message)),
      );

      return;

    } catch (err) {
      console.error('[POST /upload-and-send]', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ── 5. VALIDATE TOKEN ───────────────────────────────────────────
router.get('/sign/validate/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token || token.length < 10) {
      return res.status(400).json({
        success: false, code: 'INVALID_TOKEN', message: 'Invalid token format.',
      });
    }

    const doc = await Document.findOne({ 'parties.token': token });
    if (!doc) {
      return res.status(404).json({
        success: false, code: 'INVALID_LINK',
        message: 'This signing link is invalid or has expired.',
      });
    }

    const idx   = doc.parties.findIndex(p => p.token === token);
    const party = doc.parties[idx];

    if (!party) {
      return res.status(404).json({
        success: false, code: 'INVALID_LINK', message: 'Signing party not found.',
      });
    }

    if (party.tokenExpiresAt && new Date() > party.tokenExpiresAt) {
      return res.status(410).json({
        success: false, code: 'LINK_EXPIRED',
        message: 'This signing link has expired.',
      });
    }

    if (party.status === 'signed') {
      return res.status(410).json({
        success: false, code: 'ALREADY_SIGNED',
        message: 'This document has already been signed.',
      });
    }

    const ip     = getIP(req);
    const ua     = req.headers['user-agent'] || '';
    const device = parseDevice(ua);

    party.linkClickedAt  = party.linkClickedAt || new Date();
    party.linkClickCount = (party.linkClickCount || 0) + 1;
    party.status         = 'viewed';
    party.ipAddress      = ip;
    if (device.device)  party.device  = device.device;
    if (device.browser) party.browser = device.browser;
    if (device.os)      party.os      = device.os;

    try {
      await doc.save();
    } catch (saveErr) {
      console.error('[GET /sign/validate/:token] save failed:', saveErr.message);
    }

    const safeDocument = sanitizeDoc(doc, idx);
    const partyPayload = { ...party.toObject(), index: idx };

    res.json({
      success:  true,
      document: safeDocument,
      party:    partyPayload,
      geo:      {},
    });

    // Geo enrichment + audit run after response so the signer page loads immediately
    getGeoLocation(ip).then(async (geo) => {
      if (!geo) return;
      try {
        const fresh = await Document.findOne({ 'parties.token': token });
        if (!fresh) return;
        const pIdx = fresh.parties.findIndex(p => p.token === token);
        const p = fresh.parties[pIdx];
        if (!p) return;
        p.city       = geo.city       || null;
        p.region     = geo.region     || null;
        p.country    = geo.country    || null;
        p.postalCode = geo.postalCode || null;
        p.timezone   = geo.timezone   || null;
        p.latitude   = geo.latitude   || null;
        p.longitude  = geo.longitude  || null;
        await fresh.save();
      } catch (geoErr) {
        console.warn('[GET /sign/validate/:token] geo save failed:', geoErr.message);
      }
    }).catch(() => {});

    safeAuditLog({
      document_id:    doc._id,
      document_title: doc.title,
      company_name:   doc.companyName,
      action:         'link_clicked',
      performed_by: {
        name:        party.name,
        email:       party.email,
        designation: party.designation,
        role:        'signer',
        party_index: idx,
        party_color: party.color,
      },
      device: {
        device_name: device.device,
        browser:     device.browser,
        os:          device.os,
        device_type: device.deviceType,
        raw:         ua,
      },
    });

    emitSocket(req, 'document:party_viewed', {
      documentId: String(doc._id),
      partyIndex: idx,
      partyEmail: party.email,
      partyName:  party.name,
      device:     device.device,
    });

    return;

  } catch (err) {
    console.error('[GET /sign/validate/:token]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── 6. PDF PROXY ────────────────────────────────────────────────
router.get('/sign/:token/pdf', async (req, res) => {
  try {
    const doc = await Document
      .findOne({ 'parties.token': req.params.token })
      .select('fileUrl fileId signedFileId title localPdfPath signedFileUrl localSignedPdfPath')
      .lean();

    if (!doc) return res.status(404).send('Not found');

    const buffer = await getPdfBytes(doc);
    return sendPdf(res, buffer, doc.title, { publicAccess: true });
  } catch (err) {
    console.error('[GET /sign/:token/pdf]', err.message);
    return res.status(err.message.includes('not available') ? 404 : 502).send(err.message);
  }
});

// ── 7. SUBMIT SIGNATURE ─────────────────────────────────────────
router.post('/sign/submit', async (req, res) => {
  try {
    const { token, fields, clientTime, latitude, longitude } = req.body;

    if (!token || !fields) {
      return res.status(400).json({
        success: false, message: 'Token and fields are required.',
      });
    }

    if (Array.isArray(fields) && fields.length > 0) {
      const fieldErr = validateFields(fields);
      if (fieldErr) return res.status(400).json({ success: false, message: fieldErr });
    }

    const doc = await Document.findOne({ 'parties.token': token });
    if (!doc) {
      return res.status(404).json({
        success: false, code: 'SESSION_EXPIRED',
        message: 'Signing session expired or invalid.',
      });
    }

    const idx   = doc.parties.findIndex(p => p.token === token);
    const party = doc.parties[idx];

    if (!party) {
      return res.status(404).json({
        success: false, message: 'Signing party not found.',
      });
    }

    if (party.status === 'signed') {
      return res.status(409).json({
        success: false, code: 'ALREADY_SIGNED', message: 'Already signed.',
      });
    }

    const ip     = getIP(req);
    const ua     = req.headers['user-agent'] || '';
    const device = parseDevice(ua);

    // ✅ Server time — always correct, browser time এর উপর depend করে না
    const localTime = new Date().toUTCString();

    // ✅ GPS coordinates আছে → reverse geocode (exact location)
    // না থাকলে → IP based fallback
    let geo = null;

    if (latitude && longitude) {
      console.log(`[geo] GPS coordinates received: ${latitude}, ${longitude}`);
      geo = await reverseGeocode(parseFloat(latitude), parseFloat(longitude));
      if (geo) console.log(`[geo] Reverse geocode success: ${geo.display}`);
    }

    if (!geo) {
      console.log(`[geo] Falling back to IP: ${ip}`);
      geo = await getGeoLocation(ip);
    }

    party.status          = 'signed';
    party.signedAt        = new Date();
    party.token           = null;
    party.ipAddress       = ip;
    party.device          = device.device;
    party.browser         = device.browser;
    party.os              = device.os;
    party.localSignedTime = localTime;

    if (geo) {
      party.city        = geo.city        || null;
      party.region      = geo.region      || null;
      party.country     = geo.country     || null;
      party.postalCode  = geo.postalCode  || null;
      party.timezone    = geo.timezone    || null;
      party.latitude    = geo.latitude    || null;
      party.longitude   = geo.longitude   || null;
    } else {
      console.warn(`[geo] Both GPS and IP geo failed for: ${ip}`);
    }

    // ✅ Fields merge
    if (Array.isArray(fields)) {
      doc.fields = doc.fields.map(existingField => {
        const submitted = fields.find(f => f.id === existingField.id);
        if (submitted && submitted.partyIndex === idx) {
          return {
            ...existingField,
            value:    submitted.value || null,
            filledAt: submitted.value ? new Date() : null,
          };
        }
        return existingField;
      });
    }

    const nextIdx = idx + 1;
    const hasNext = nextIdx < doc.parties.length;

    if (hasNext) {
      const nextToken = crypto.randomBytes(32).toString('hex');
      doc.parties[nextIdx].token          = nextToken;
      doc.parties[nextIdx].status         = 'sent';
      doc.parties[nextIdx].emailSentAt    = new Date();
      doc.parties[nextIdx].tokenExpiresAt =
        new Date(Date.now() + 72 * 60 * 60 * 1000);
      doc.currentPartyIndex = nextIdx;

      await doc.save();

      safeAuditLog({
        document_id:    doc._id,
        document_title: doc.title,
        action:         'signed',
        performed_by: {
          name:        party.name,
          email:       party.email,
          designation: party.designation,
          role:        'signer',
          party_index: idx,
        },
        device: {
          device_name: device.device,
          browser:     device.browser,
          os:          device.os,
        },
        location: {
          ip_address: ip,
          city:       geo?.city,
          region:     geo?.region,
          country:    geo?.country,
          postalCode: geo?.postalCode,
          timezone:   geo?.timezone,
          display:    geo?.display,
        },
        local_time: localTime,
        cc_list: doc.ccList.map(cc => ({
          name: cc.name, email: cc.email, designation: cc.designation,
        })),
      });

      const nextParty = doc.parties[nextIdx];
      try {
        await sendSigningEmail({
          recipientEmail:       nextParty.email,
          recipientName:        nextParty.name,
          recipientDesignation: nextParty.designation,
          senderName:           party.name,
          senderDesignation:    party.designation,
          documentTitle:        doc.title,
          signingLink:          `${FRONT()}/sign/${nextToken}`,
          companyLogoUrl:       doc.companyLogo,
          companyName:          doc.companyName,
          emailHeaderColor:     doc.emailHeaderColor,
          partyNumber:          nextIdx + 1,
          totalParties:         doc.parties.length,
          message:              doc.message,
          ccList:               doc.ccList,
          useCustomEmailBody:   doc.useCustomEmailBody,
          customEmailBody:      doc.customEmailBody,
          customEmailSubject:   doc.customEmailSubject,
        });
      } catch (emailErr) {
        console.error('[sign/submit] Next signer email failed:', emailErr.message);
      }

      emitSocket(req, 'document:party_signed', {
        documentId: String(doc._id),
        partyIndex: idx,
        partyName:  party.name,
        nextSigner: nextParty.email,
      });

      return res.json({
        success: true,
        next:    true,
        message: `Document sent to next signer: ${nextParty.name}`,
        signerInfo: {
          name:     party.name,
          device:   device.device,
          location: geo?.display || 'Unknown',
          time:     localTime,
        },
      });

    } else {
      doc.status      = 'completed';
      doc.completedAt = new Date();
      await doc.save();

      emitSocket(req, 'document:completed', {
        documentId:  String(doc._id),
        ownerId:     String(doc.owner),
        title:       doc.title,
        completedAt: doc.completedAt,
      });

      _finalizeDocument(req, doc).catch(e =>
        console.error('[finalize]', e.message)
      );

      return res.json({
        success:   true,
        completed: true,
        message:   'Document signed and completed!',
        document:  { _id: String(doc._id) },
        signerInfo: {
          name:     party.name,
          device:   device.device,
          location: geo?.display || 'Unknown',
          time:     localTime,
        },
      });
    }

  } catch (err) {
    console.error('[POST /sign/submit]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── 7b. FINALIZE ENDPOINT ───────────────────────────────────────
router.post('/sign/finalize/:docId', async (req, res) => {
  try {
    const { docId } = req.params;

    const doc = await Document.findById(docId);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    if (doc.signedFileUrl) {
      return res.json({
        success: true, alreadyDone: true, signedPdfUrl: doc.signedFileUrl,
      });
    }

    if (doc.status !== 'completed') {
      return res.status(400).json({
        success: false, message: 'Document is not completed yet.',
      });
    }

    res.json({ success: true, message: 'Finalization started.' });

    _finalizeDocument(req, doc).catch(e =>
      console.error('[finalize endpoint]', e.message)
    );

  } catch (err) {
    console.error('[POST /sign/finalize/:docId]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── 8. GET DOCUMENT PDF (owner preview) ─────────────────────────
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id,
      owner: req.user.id,
    }).select('fileUrl fileId signedFileId title localPdfPath signedFileUrl localSignedPdfPath status')
      .lean();

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    const preferSigned = req.query.signed === '1' && doc.status === 'completed';
    const buffer = await getPdfBytes(doc, { preferSigned });
    return sendPdf(res, buffer, doc.title);
  } catch (err) {
    console.error('[GET /documents/:id/pdf]', err.message);
    return res.status(502).json({ success: false, message: err.message });
  }
});

// ── 9. GET SINGLE DOCUMENT ──────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id, owner: req.user.id,
    }).lean();

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    return res.json({ success: true, document: sanitizeDoc(doc) });
  } catch (err) {
    console.error('[GET /documents/:id]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── 9. AUDIT LOG ────────────────────────────────────────────────
router.get('/:id/audit', auth, async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id, owner: req.user.id,
    }).lean();

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    const events = [];
    events.push({
      action: 'created', label: 'Document Created',
      actor: { name: 'System', role: 'system' },
      timestamp: doc.createdAt,
    });

    for (const p of doc.parties) {
      if (p.emailSentAt) events.push({
        action: 'email_sent', label: 'Email Sent',
        actor: { name: p.name, email: p.email },
        timestamp: p.emailSentAt,
      });
      if (p.linkClickedAt) events.push({
        action: 'link_clicked', label: 'Link Clicked',
        actor: { name: p.name, email: p.email },
        timestamp: p.linkClickedAt,
      });
      if (p.signedAt) events.push({
        action: 'signed', label: 'Document Signed',
        actor: {
          name: p.name, email: p.email, designation: p.designation,
        },
        timestamp:  p.signedAt,
        localTime:  p.localSignedTime,
        device:     p.device,
        browser:    p.browser,
        os:         p.os,
        ipAddress:  p.ipAddress,
        location: {
          city:       p.city,
          region:     p.region,
          country:    p.country,
          postalCode: p.postalCode,
          latitude:   p.latitude,
          longitude:  p.longitude,
          timezone:   p.timezone,
          display: [p.city, p.region, p.country, p.postalCode]
            .filter(Boolean).join(', '),
        },
      });
    }

    if (doc.status === 'completed') {
      events.push({
        action: 'completed', label: 'Document Completed',
        actor: { name: 'System', role: 'system' },
        timestamp: doc.completedAt || doc.updatedAt,
      });
    }

    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return res.json({
      success: true,
      audit: {
        document: {
          _id:         doc._id,
          title:       doc.title,
          status:      doc.status,
          companyName: doc.companyName,
          companyLogo: doc.companyLogo,
          createdAt:   doc.createdAt,
          completedAt: doc.completedAt,
        },
        parties:       doc.parties,
        ccList:        doc.ccList,
        events,
        signedFileUrl: doc.signedFileUrl,
      },
    });
  } catch (err) {
    console.error('[GET /documents/:id/audit]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── 10. UPDATE DOCUMENT ─────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const {
      title, parties, fields, ccList,
      companyLogo, companyName, message, totalPages,
    } = req.body;

    const updates = {};
    if (title       !== undefined) updates.title       = title;
    if (parties     !== undefined) updates.parties     = parties;
    if (fields      !== undefined) updates.fields      = fields;
    if (ccList      !== undefined) updates.ccList      = ccList;
    if (companyLogo !== undefined) updates.companyLogo = companyLogo;
    if (companyName !== undefined) updates.companyName = companyName;
    if (message     !== undefined) updates.message     = message;
    if (totalPages  !== undefined) updates.totalPages  = Number(totalPages);

    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    return res.json({ success: true, document: sanitizeDoc(doc) });
  } catch (err) {
    console.error('[PUT /documents/:id]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── 11. DELETE DOCUMENT ─────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.user.id });

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    if (doc.status === 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a document that is currently in progress.',
      });
    }

    try {
      if (doc.fileId) {
        await cloudinary.uploader.destroy(doc.fileId, { resource_type: 'raw' });
      }
    } catch (e) { console.error('[Cloudinary delete]', e.message); }

    await Document.findByIdAndDelete(doc._id);

    safeAuditLog({
      document_id:    doc._id,
      document_title: doc.title,
      action:         'deleted',
      performed_by: {
        user_id: req.user._id,
        name:    req.user.full_name,
        email:   req.user.email,
        role:    'owner',
      },
    });

    emitSocket(req, 'document:deleted', {
      documentId: String(doc._id),
      ownerId:    req.user.id,
    });

    return res.json({ success: true, message: 'Document deleted.' });
  } catch (err) {
    console.error('[DELETE /documents/:id]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL — Finalize
// ═══════════════════════════════════════════════════════════════
async function _finalizeDocument(req, doc) {
  try {
    console.log(`[finalize] Starting: ${doc._id}`);

    // ✅ Fresh doc load
    const freshDoc = await Document.findById(doc._id);
    if (!freshDoc) {
      console.error('[finalize] Document not found:', doc._id);
      return;
    }

    // ✅ Already finalized check
    if (freshDoc.signedFileUrl) {
      console.log(`[finalize] Already done: ${doc._id}`);
      return;
    }

    // ✅ Step 1: PDF fetch + merge
    // fetchPdfBytes এ 55s timeout আছে — কিন্তু Vercel 60s এ kill করে
    // তাই আলাদা timeout দাও
    console.log(`[finalize] Step 1: Merging signatures...`);
    const mergedBytes = await Promise.race([
      mergeSignaturesIntoPDF(freshDoc, freshDoc.fields),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('mergeSignaturesIntoPDF timeout')), 25_000)
      ),
    ]);
    console.log(`[finalize] Step 1 done`);

    // ✅ Step 2: Audit page
    console.log(`[finalize] Step 2: Appending audit page...`);
    let finalBuffer;
    try {
      finalBuffer = await Promise.race([
        appendAuditPage(mergedBytes, freshDoc),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('appendAuditPage timeout')), 10_000)
        ),
      ]);
    } catch (auditErr) {
      console.error('[finalize] Audit page failed, using merged only:', auditErr.message);
      finalBuffer = Buffer.from(mergedBytes);
    }
    console.log(`[finalize] Step 2 done, size: ${finalBuffer.length}`);

    // ✅ Step 3: Upload to Cloudinary
    console.log(`[finalize] Step 3: Uploading to Cloudinary...`);
    const uploaded = await Promise.race([
      uploadToCloudinary(finalBuffer, {
        resource_type: 'raw',
        folder:        'nexsign/completed',
        public_id:     `signed_${freshDoc._id}_${Date.now()}`,
        format:        'pdf',
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Cloudinary upload timeout')), 20_000)
      ),
    ]);
    console.log(`[finalize] Step 3 done: ${uploaded.secure_url}`);

    // ✅ Step 4: Save URL — এটা সবার আগে save করো
    // Email fail হলেও URL save থাকবে
    freshDoc.signedFileUrl = uploaded.secure_url;
    freshDoc.localSignedPdfPath = savePdfBuffer(finalBuffer, `signed_${freshDoc._id}`);
    await freshDoc.save();
    console.log(`[finalize] signedFileUrl saved to DB`);

    // ✅ Socket emit — dashboard update হবে
    emitSocket(req, 'document:finalized', {
      documentId:   String(freshDoc._id),
      ownerId:      String(freshDoc.owner),
      signedPdfUrl: uploaded.secure_url,
    });

    // ✅ Step 5: Build audit info
    const partiesWithAudit = freshDoc.parties.map(p => ({
      name:        p.name,
      email:       p.email,
      designation: p.designation,
      status:      p.status,
      signedAt:    p.signedAt,
      auditInfo: {
        device:   p.device        || null,
        browser:  p.browser       || null,
        os:       p.os            || null,
        location: [p.city, p.region, p.country]
          .filter(Boolean).join(', ') || null,
        postal:   p.postalCode      || null,
        time:     p.localSignedTime || null,
        ip:       p.ipAddress       || null,
      },
    }));

    // ✅ Step 6: Emails — parallel but don't block
    console.log(`[finalize] Step 4: Sending emails...`);
    const emailTargets = [
      ...freshDoc.parties.map(p => ({
        recipientEmail:       p.email,
        recipientName:        p.name,
        recipientDesignation: p.designation,
        isCC:                 false,
      })),
      ...freshDoc.ccList.map(cc => ({
        recipientEmail:       cc.email,
        recipientName:        cc.name,
        recipientDesignation: cc.designation,
        isCC:                 true,
      })),
    ];

    const emailResults = await Promise.allSettled(
      emailTargets.map(t =>
        sendCompletionEmail({
          recipientEmail:       t.recipientEmail,
          recipientName:        t.recipientName,
          recipientDesignation: t.recipientDesignation,
          documentTitle:        freshDoc.title,
          pdfBuffer:            finalBuffer,
          signedPdfUrl:         uploaded.secure_url,
          companyLogoUrl:       freshDoc.companyLogo,
          companyName:          freshDoc.companyName,
          parties:              partiesWithAudit,
          ccList:               freshDoc.ccList,
          isCC:                 t.isCC,
        })
      )
    );

    emailResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        console.log(`[finalize] Email OK: ${emailTargets[i].recipientEmail}`);
      } else {
        console.error(`[finalize] Email FAIL: ${emailTargets[i].recipientEmail}`, r.reason?.message);
      }
    });

    // ✅ Audit log
    safeAuditLog({
      document_id:    freshDoc._id,
      document_title: freshDoc.title,
      action:         'completed',
      performed_by:   { name: 'System', role: 'system' },
      details: {
        signed_pdf_url: uploaded.secure_url,
        total_signers:  freshDoc.parties.length,
        emails_sent:    emailResults.filter(r => r.status === 'fulfilled').length,
      },
    });

    console.log(`[finalize] All done: ${freshDoc._id}`);

  } catch (err) {
    console.error('[_finalizeDocument] FATAL:', err.message);
  }
}

module.exports = router;