'use strict';

const crypto          = require('crypto');
const { v2: cloudinary } = require('cloudinary');
const Template        = require('../models/Template');
const TemplateCampaign = require('../models/TemplateCampaign');
const TemplateSession = require('../models/TemplateSession');
const User            = require('../models/User');

let pdfService = null;
try { pdfService = require('../utils/pdfService'); } catch { /* optional */ }

let emailService = {};
try { emailService = require('../utils/emailService'); } catch { /* optional */ }

const { getPdfBytes, sendPdf } = require('../utils/pdfStorage');
const { links } = require('../utils/appUrls');
const { ensurePublicSlug, generateSignCode } = require('../utils/signLinks');

const {
  sendEmployeeSigningEmail,
  sendEmailDeliveryFailureNotice,
  sendCampaignBossEmail,
  sendCampaignApproverEmail,
} = emailService;

const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const generateToken = () => crypto.randomBytes(32).toString('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resolveCampaignLogo(campaign, ownerUser) {
  return campaign?.companyLogo || ownerUser?.company_logo || '';
}

async function findBossContext(token) {
  const campaign = await TemplateCampaign.findOne({
    bossToken: token,
    status:    'boss_pending',
    isDeleted: false,
  });
  if (campaign) return { type: 'campaign', doc: campaign };

  const template = await Template.findOne({
    bossToken: token,
    status:    'boss_pending',
    isDeleted: false,
  });
  if (template) return { type: 'template', doc: template };

  return null;
}

const getIP = req =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  req.headers['x-real-ip'] || req.ip || 'Unknown';

async function uploadSignaturePng(base64DataUrl, folder = 'nexsign/signatures') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder },
      (err, result) => err ? reject(err) : resolve(result),
    );
    const base64 = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');
    stream.end(Buffer.from(base64, 'base64'));
  });
}

async function dispatchEmployeeEmailForCampaign({ session, campaign, bossUser }) {
  const expiryDays = campaign.signingConfig?.expiryDays || 30;
  const expiryDate = new Date(Date.now() + expiryDays * 86_400_000)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const sc = campaign.signingConfig || {};
  const useCustom = !!(campaign.useCustomEmailBody || sc.useCustomEmailBody);
  const customBody = campaign.customEmailBody || sc.customEmailBody || '';
  const customSubject = campaign.customEmailSubject || sc.customEmailSubject || '';

  if (!session.signCode) {
    session.signCode = generateSignCode();
    await session.save();
  }

  let slug = null;
  if (campaign.sourceTemplateId) {
    const tpl = await Template.findById(campaign.sourceTemplateId).select('publicSlug title');
    if (tpl) {
      if (!tpl.publicSlug) {
        await ensurePublicSlug(Template, tpl, tpl.title);
        await tpl.save();
      }
      slug = tpl.publicSlug;
    }
  }

  const logo = resolveCampaignLogo(campaign, bossUser);

  let reviewPdfBuffer = null;
  try {
    reviewPdfBuffer = await getPdfBytes({
      fileUrl:            campaign.bossSignedFileUrl || campaign.fileUrl,
      filePublicId:       campaign.bossSignedFilePublicId || campaign.filePublicId,
      localPdfPath:       campaign.localBossSignedPdfPath || campaign.localPdfPath,
      localBossSignedPdfPath: campaign.localBossSignedPdfPath,
      bossSignedFileUrl:  campaign.bossSignedFileUrl,
    }, { preferSigned: true });
  } catch (e) {
    console.warn('[dispatchEmployeeEmailForCampaign] Review PDF not loaded:', e.message);
  }

  const payload = {
    employeeEmail:       session.recipientEmail,
    employeeName:        session.recipientName,
    employeeDesignation: session.recipientDesignation || '',
    documentTitle:       campaign.title,
    signingLink:         slug && session.signCode
      ? links.templateSign({ publicSlug: slug, signCode: session.signCode })
      : links.templateSign(session.token),
    bossName:            campaign.boss?.name || bossUser.full_name || 'Authoriser',
    bossDesignation:     campaign.boss?.designation || '',
    bossEmail:           campaign.boss?.email || bossUser.email,
    companyName:         campaign.companyName || '',
    companyLogoUrl:      logo,
    companyLogo:         logo,
    ownerCompanyLogo:    bossUser?.company_logo || '',
    emailHeaderColor:    campaign.emailHeaderColor || '#0f172a',
    message:             campaign.message || '',
    expiryDate,
    useCustomEmailBody:  useCustom,
    customEmailBody:     customBody,
    customEmailSubject:  customSubject,
    pdfBuffer:           reviewPdfBuffer,
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
    session.addAuditEntry('link_sent', { note: `Email delivered to ${session.recipientEmail}` });
  } else {
    session.emailDelivered = false;
    session.emailError     = result?.error || 'Delivery failed';
    session.addAuditEntry('link_sent', { note: `Email FAILED: ${session.emailError}` });
  }
  await session.save();
}

/** After boss signs or boss signature reused — start approver chain or send to employees */
async function advanceCampaignPipeline(campaign, ownerUser, req) {
  if (campaign.approvers?.length > 0) {
    campaign.status = 'approver_pending';
    campaign.currentApproverIndex = 0;
    await campaign.save();
    await emailCurrentApprover(campaign, ownerUser);
    return { phase: 'approver_pending' };
  }

  return distributeCampaignToEmployees(campaign, ownerUser, req);
}

async function emailCurrentApprover(campaign, ownerUser) {
  const idx = campaign.currentApproverIndex;
  const approver = campaign.approvers[idx];
  if (!approver || approver.status !== 'pending') return;

  const previous = campaign.approvers
    .slice(0, idx)
    .filter(a => a.status === 'approved')
    .map(a => a.name)
    .join(', ');

  await sendCampaignApproverEmail?.({
    approverEmail:       approver.email,
    approverName:        approver.name,
    approverDesignation: approver.designation || '',
    documentTitle:       campaign.title,
    approvalLink:        links.approverReview(approver.token),
    companyName:         campaign.companyName,
    companyLogoUrl:      resolveCampaignLogo(campaign, ownerUser),
    ownerCompanyLogo:    ownerUser?.company_logo || '',
    emailHeaderColor:    campaign.emailHeaderColor,
    stepNumber:          idx + 1,
    totalSteps:          campaign.approvers.length,
    isLastApprover:      idx === campaign.approvers.length - 1,
    previousApprovers:   previous,
    ownerName:           ownerUser?.full_name || ownerUser?.name,
  });
}

async function findApproverContext(token) {
  const campaign = await TemplateCampaign.findOne({
    'approvers.token': token,
    status: 'approver_pending',
    isDeleted: false,
  });
  if (campaign) return { type: 'campaign', doc: campaign };

  const template = await Template.findOne({
    'approvers.token': token,
    status: 'approver_pending',
    isDeleted: false,
  });
  if (template) return { type: 'template', doc: template };

  return null;
}

function buildFieldsForApproverPayload(doc) {
  const bossSig = doc.bossSignature?.signatureImageUrl || null;
  return (doc.fields || []).map(raw => {
    const f = pdfService?.plainField ? pdfService.plainField(raw) : (raw?.toObject ? raw.toObject() : { ...raw });
    let value = f.value || null;
    const isBoss = !f.assignedTo || f.assignedTo === 'boss';
    if (
      isBoss &&
      (f.type === 'signature' || f.type === 'initial' || f.type === 'initials') &&
      bossSig
    ) {
      value = bossSig;
    }
    return {
      id:         f.id,
      type:       f.type,
      page:       f.page || 1,
      assignedTo: f.assignedTo || 'employee',
      label:      f.label || '',
      required:   f.required !== false,
      value:      value || null,
      x:          f.x,
      y:          f.y,
      width:      f.width,
      height:     f.height,
    };
  });
}

function approverPayload(ctx, idx) {
  const doc = ctx.doc;
  const approver = doc.approvers[idx];
  const employeeCount = doc.recipients?.length || 0;
  const bossSig = doc.bossSignature || null;
  const fields  = buildFieldsForApproverPayload(doc);
  const bossFields     = fields.filter(f => f.assignedTo === 'boss' || !f.assignedTo);
  const employeeFields = fields.filter(f => f.assignedTo === 'employee');

  return {
    approver: {
      name: approver.name,
      email: approver.email,
      designation: approver.designation,
    },
    campaign: {
      title:       doc.title,
      companyName: doc.companyName,
      companyLogo: doc.companyLogo,
      stepNumber:  idx + 1,
      totalSteps:  doc.approvers.length,
      isLast:      idx === doc.approvers.length - 1,
      employeeCount,
      totalPages:  doc.totalPages || 1,
      bossSigned:  !!doc.bossSignedFileUrl,
      bossSignature: bossSig ? {
        signedAt: bossSig.signedAt,
        name:     doc.boss?.name || '',
      } : null,
      previousApprovers: doc.approvers
        .slice(0, idx)
        .filter(a => a.status === 'approved')
        .map(a => ({ name: a.name, approvedAt: a.approvedAt })),
      fieldSummary: {
        bossFields:     bossFields.length,
        employeeFields: employeeFields.length,
        bossFilled:     bossFields.filter(f => f.value).length,
      },
    },
    fields,
  };
}

async function distributeCampaignToEmployees(campaign, ownerUser, req) {
  const expiryDays = campaign.signingConfig?.expiryDays || 30;
  const expiresAt  = new Date(Date.now() + expiryDays * 86_400_000);

  const sessionDocs = campaign.recipients.map(r => ({
    template:             campaign.sourceTemplateId,
    campaignId:           campaign._id,
    templateId:           campaign.sourceTemplateId,
    recipientName:        r.name,
    recipientEmail:       r.email,
    recipientDesignation: r.designation || '',
    token:                generateToken(),
    signCode:             generateSignCode(),
    status:               'pending',
    expiresAt,
    sentAt:               new Date(),
    auditLog: [{
      action: 'link_sent', timestamp: new Date(), note: 'Campaign batch — sending email',
    }],
  }));

  const sessions = await TemplateSession.insertMany(sessionDocs);

  const { queueEmployeeSessionEmails } = require('./templateController');
  queueEmployeeSessionEmails({
    sessions,
    template: campaign,
    bossUser: ownerUser,
    req,
    dispatchFn: ({ session, template, bossUser }) =>
      dispatchEmployeeEmailForCampaign({ session, campaign: template, bossUser }),
  });

  campaign.status = 'active';
  campaign.sentAt = new Date();
  campaign.stats.pending = campaign.recipients.length;
  await campaign.save();

  return {
    phase:        'active',
    emailsSent:   0,
    emailsQueued: true,
    emailsFailed: 0,
    failedRecipients: [],
  };
}

// ════════════════════════════════════════════════════
// POST /api/templates/:id/reuse
// ════════════════════════════════════════════════════
const reuseTemplate = asyncHandler(async (req, res) => {
  const source = await Template.findOne({
    _id: req.params.id, owner: req.user._id, isDeleted: false,
  });

  if (!source) {
    return res.status(404).json({ success: false, message: 'Template not found.' });
  }

  if (!source.bossSignedFileUrl && source.status === 'boss_pending') {
    return res.status(400).json({
      success: false,
      message: 'Boss must sign the master template before reuse, or use a completed template.',
    });
  }

  const {
    title, recipients, ccList, message, approvers,
    bossSignMode = 'reuse', boss,
    useCustomEmailBody, customEmailBody, customEmailSubject,
  } = req.body;

  const parsedRecipients = Array.isArray(recipients) ? recipients : [];
  if (!parsedRecipients.length) {
    return res.status(400).json({ success: false, message: 'At least one employee is required.' });
  }

  const parsedApprovers = (Array.isArray(approvers) ? approvers : []).map((a, i) => ({
    name:        String(a.name || '').trim(),
    email:       String(a.email || '').trim().toLowerCase(),
    designation: String(a.designation || '').trim(),
    order:       i,
    token:       generateToken(),
    status:      'pending',
  })).filter(a => a.name && a.email);

  const bossInfo = {
    name:        boss?.name?.trim()        || req.user.full_name || req.user.name || '',
    email:       boss?.email?.trim().toLowerCase() || req.user.email,
    designation: boss?.designation?.trim() || req.user.designation || '',
  };

  const mode = bossSignMode === 'new' ? 'new' : 'reuse';

  if (mode === 'reuse' && !source.bossSignedFileUrl) {
    return res.status(400).json({
      success: false,
      message: 'No previous boss signature found. Choose "New boss sign" instead.',
    });
  }

  const campaign = await TemplateCampaign.create({
    sourceTemplateId: source._id,
    owner:            req.user._id,
    title:            title?.trim() || `${source.title} — ${new Date().toLocaleDateString()}`,
    fileUrl:          source.fileUrl,
    filePublicId:     source.filePublicId,
    localPdfPath:     source.localPdfPath,
    localBossSignedPdfPath: source.localBossSignedPdfPath,
    fields:           source.fields,
    totalPages:       source.totalPages,
    companyName:      source.companyName,
    companyLogo:      source.companyLogo,
    emailHeaderColor: source.emailHeaderColor,
    message:          message ?? source.message,
    useCustomEmailBody: useCustomEmailBody ?? source.signingConfig?.useCustomEmailBody ?? false,
    customEmailBody:    customEmailBody ?? source.signingConfig?.customEmailBody ?? '',
    customEmailSubject: customEmailSubject ?? source.signingConfig?.customEmailSubject ?? '',
    signingConfig:    source.signingConfig,
    recipients:       parsedRecipients,
    ccList:           Array.isArray(ccList) ? ccList : source.ccList,
    bossSignMode:     mode,
    boss:             bossInfo,
    approvers:        parsedApprovers,
    stats:            { totalRecipients: parsedRecipients.length, pending: parsedRecipients.length },
  });

  if (mode === 'reuse') {
    campaign.bossSignedFileUrl       = source.bossSignedFileUrl;
    campaign.bossSignedFilePublicId  = source.bossSignedFilePublicId || '';
    campaign.bossSignature           = source.bossSignature;
    campaign.localBossSignedPdfPath  = source.localBossSignedPdfPath;
    const result = await advanceCampaignPipeline(campaign, req.user, req);
    return res.status(201).json({
      success:  true,
      message:  result.phase === 'approver_pending'
        ? `Campaign created. First approver (${parsedApprovers[0]?.name}) has been emailed.`
        : `Campaign created. ${result.emailsSent} employee email(s) sent.`,
      campaign: campaign.toJSON(),
      ...result,
    });
  }

  // New boss must sign
  campaign.bossToken = generateToken();
  campaign.status    = 'boss_pending';
  await campaign.save();

  await sendCampaignBossEmail?.({
    bossEmail:       bossInfo.email,
    bossName:        bossInfo.name,
    documentTitle:   campaign.title,
    signingLink:     links.bossSign(campaign.bossToken),
    companyName:     campaign.companyName,
    companyLogoUrl:   resolveCampaignLogo(campaign, req.user),
    ownerCompanyLogo: req.user.company_logo || '',
    emailHeaderColor: campaign.emailHeaderColor,
    ownerName:       req.user.full_name || req.user.name,
    employeeCount:   parsedRecipients.length,
    approverCount:   parsedApprovers.length,
  });

  return res.status(201).json({
    success:  true,
    message:  `Campaign created. Signing link sent to ${bossInfo.name} (${bossInfo.email}).`,
    campaign: campaign.toJSON(),
  });
});

// ════════════════════════════════════════════════════
// GET /api/templates/:id/campaigns
// ════════════════════════════════════════════════════
const listCampaigns = asyncHandler(async (req, res) => {
  const source = await Template.findOne({
    _id: req.params.id, owner: req.user._id, isDeleted: false,
  });
  if (!source) {
    return res.status(404).json({ success: false, message: 'Template not found.' });
  }

  const campaigns = await TemplateCampaign.find({
    sourceTemplateId: source._id,
    owner:            req.user._id,
    isDeleted:        false,
  }).sort({ createdAt: -1 }).lean();

  return res.json({ success: true, campaigns });
});

// ════════════════════════════════════════════════════
// GET /api/template-campaigns/boss/validate/:token
// POST /api/template-campaigns/boss/sign/:token
// ════════════════════════════════════════════════════
const validateBossToken = asyncHandler(async (req, res) => {
  const ctx = await findBossContext(req.params.token);

  if (!ctx) {
    return res.status(404).json({ success: false, message: 'Invalid or expired boss signing link.' });
  }

  const { doc, type } = ctx;
  const owner = type === 'campaign'
    ? await User.findById(doc.owner).select('full_name email').lean()
    : await User.findById(doc.owner).select('full_name email').lean();

  const boss = type === 'campaign'
    ? doc.boss
    : (doc.boss?.email ? doc.boss : { name: owner?.full_name, email: owner?.email });

  return res.json({
    success: true,
    campaign: {
      title:         doc.title,
      companyName:   doc.companyName,
      companyLogo:   resolveCampaignLogo(doc, owner),
      fileUrl:       doc.fileUrl,
      boss,
      approverCount: doc.approvers?.length || 0,
      employeeCount: doc.recipients?.length || 0,
      ownerName:     owner?.full_name || '',
      sourceType:    type,
      fields:        (doc.fields || []).filter(f => f.assignedTo === 'boss'),
      totalPages:    doc.totalPages || 1,
    },
  });
});

const bossSignCampaign = asyncHandler(async (req, res) => {
  const { signatureDataUrl, fieldValues } = req.body;
  if (!signatureDataUrl) {
    return res.status(400).json({ success: false, message: 'Signature is required.' });
  }

  const ctx = await findBossContext(req.params.token);
  if (!ctx) {
    return res.status(404).json({ success: false, message: 'Invalid boss signing link.' });
  }

  const { doc, type } = ctx;
  const ownerUser = await User.findById(doc.owner).lean();

  if (type === 'template') {
    const { performBossSignOnTemplate } = require('./templateController');
    const result = await performBossSignOnTemplate(doc, {
      signatureDataUrl,
      fieldValues,
      bossUser: ownerUser,
      req,
    });
    return res.json({
      success: true,
      message: result.message,
      ...result,
    });
  }

  let signatureImageUrl = null;
  try {
    const uploaded = await uploadSignaturePng(signatureDataUrl, 'nexsign/boss-signatures');
    signatureImageUrl = uploaded.secure_url;
  } catch (e) {
    console.error('[bossSignCampaign]', e.message);
  }

  const { embedBossSignatureOnRecord } = require('./templateController');
  const embed = await embedBossSignatureOnRecord(doc, signatureDataUrl, fieldValues);

  const campaign = doc;
  campaign.bossSignature = {
    signatureImageUrl,
    signedAt:  new Date(),
    ipAddress: getIP(req),
  };
  campaign.bossSignedFileUrl = embed.bossSignedFileUrl;
  if (embed.bossSignedFilePublicId) {
    campaign.bossSignedFilePublicId = embed.bossSignedFilePublicId;
  }
  if (embed.localBossSignedPdfPath) {
    campaign.localBossSignedPdfPath = embed.localBossSignedPdfPath;
  }
  campaign.bossToken = null;
  await campaign.save();

  const result = await advanceCampaignPipeline(campaign, ownerUser, req);

  return res.json({
    success: true,
    message: result.phase === 'approver_pending'
      ? 'Signed! Approver chain started.'
      : `Signed! ${result.emailsSent || 0} employee email(s) sent.`,
    ...result,
  });
});

// ════════════════════════════════════════════════════
// GET /api/template-campaigns/approve/validate/:token
// POST /api/template-campaigns/approve/:token
// ════════════════════════════════════════════════════
const validateApproverToken = asyncHandler(async (req, res) => {
  const ctx = await findApproverContext(req.params.token);

  if (!ctx) {
    return res.status(404).json({ success: false, message: 'Invalid approval link.' });
  }

  const { doc } = ctx;
  const idx = doc.approvers.findIndex(a => a.token === req.params.token);
  const approver = doc.approvers[idx];

  if (idx !== doc.currentApproverIndex) {
    return res.status(403).json({
      success: false,
      message: 'It is not your turn yet. Previous approvers must complete first.',
    });
  }

  if (approver.status !== 'pending') {
    return res.status(410).json({ success: false, message: 'This approval link has already been used.' });
  }

  if (!doc.bossSignedFileUrl) {
    return res.status(409).json({
      success: false,
      message: 'Authoriser has not signed yet. Please wait for the signed PDF before approving.',
    });
  }

  return res.json({
    success: true,
    ...approverPayload(ctx, idx),
  });
});

const approveCampaign = asyncHandler(async (req, res) => {
  const { note, approved = true, reason } = req.body;

  const ctx = await findApproverContext(req.params.token);

  if (!ctx) {
    return res.status(404).json({ success: false, message: 'Invalid approval link.' });
  }

  const { doc, type } = ctx;
  const idx = doc.approvers.findIndex(a => a.token === req.params.token);
  if (idx !== doc.currentApproverIndex) {
    return res.status(403).json({ success: false, message: 'Not your turn in the approval chain.' });
  }

  const approver = doc.approvers[idx];
  if (approver.status !== 'pending') {
    return res.status(410).json({ success: false, message: 'Already processed.' });
  }

  if (!approved) {
    approver.status = 'declined';
    approver.declineReason = reason || '';
    approver.approvedAt = new Date();
    doc.status = type === 'template' ? 'archived' : 'cancelled';
    await doc.save();
    return res.json({ success: true, message: 'Approval declined. Employee emails will not be sent.' });
  }

  approver.status = 'approved';
  approver.approvedAt = new Date();
  approver.note = note || '';
  // Keep token — required by schema; status 'approved' invalidates the link

  const ownerUser = await User.findById(doc.owner).lean();

  if (idx < doc.approvers.length - 1) {
    doc.currentApproverIndex = idx + 1;
    await doc.save();
    if (type === 'campaign') {
      await emailCurrentApprover(doc, ownerUser);
    } else {
      const { emailTemplateApprover } = require('./templateController');
      await emailTemplateApprover(doc, ownerUser);
    }
    return res.json({
      success: true,
      message: `Approved. Next approver (${doc.approvers[idx + 1].name}) has been notified.`,
    });
  }

  doc.currentApproverIndex = idx;
  await doc.save();

  if (type === 'campaign') {
    const result = await distributeCampaignToEmployees(doc, ownerUser, req);
    return res.json({
      success: true,
      message: `Approved. All ${result.emailsSent} employee email(s) have been sent.`,
      ...result,
    });
  }

  const { distributeTemplateEmployees } = require('./templateController');
  const result = await distributeTemplateEmployees(doc, ownerUser, req);
  return res.json({
    success: true,
    message: `Approved. All ${result.emailsSent} employee email(s) have been sent.`,
    ...result,
  });
});

// ════════════════════════════════════════════════════
// GET /api/template-campaigns/pdf/:token
// ════════════════════════════════════════════════════
const getCampaignPdf = asyncHandler(async (req, res) => {
  const { token } = req.params;

  let doc = await TemplateCampaign.findOne({
    $or: [{ bossToken: token }, { 'approvers.token': token }],
    isDeleted: false,
  });

  let title = 'document';
  let isApproverView = false;

  if (doc) {
    title = doc.title;
    isApproverView = doc.approvers?.some(a => a.token === token) || false;
  } else {
    doc = await Template.findOne({
      'approvers.token': token,
      status: 'approver_pending',
      isDeleted: false,
    });
    if (doc) {
      title = doc.title;
      isApproverView = true;
    }
  }

  if (!doc) return res.status(404).send('Not found');

  // Boss signing page — show original PDF before authoriser signs
  if (doc.bossToken === token) {
    const record = {
      fileUrl:      doc.fileUrl,
      filePublicId: doc.filePublicId,
      localPdfPath: doc.localPdfPath,
    };
    const buffer = await getPdfBytes(record);
    return sendPdf(res, buffer, title, { publicAccess: true });
  }

  // Approver review — full PDF: authoriser sign/text + employee field markers
  if (isApproverView) {
    if (!doc.bossSignedFileUrl) {
      return res.status(409).send(
        'Authoriser has not signed yet. You can approve only after the signed PDF is ready.',
      );
    }

    if (!pdfService?.buildApproverReviewPdf) {
      return res.status(503).send('PDF review service is unavailable.');
    }

    try {
      const originalRecord = {
        fileUrl:      doc.fileUrl,
        filePublicId: doc.filePublicId || doc.fileId,
        fileId:       doc.filePublicId || doc.fileId,
        localPdfPath: doc.localPdfPath,
      };
      const baseBytes = await getPdfBytes(originalRecord);
      const buffer    = await pdfService.buildApproverReviewPdf(baseBytes, doc);
      return sendPdf(res, buffer, title, { publicAccess: true });
    } catch (err) {
      console.error('[getCampaignPdf] Approver review PDF failed:', err.message);
      return res.status(502).send(
        'Could not build the review PDF. Please try again or contact support.',
      );
    }
  }

  return res.status(404).send('Not found');
});

module.exports = {
  reuseTemplate,
  listCampaigns,
  validateBossToken,
  bossSignCampaign,
  validateApproverToken,
  approveCampaign,
  getCampaignPdf,
};
