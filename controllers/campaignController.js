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

const { getPdfBytes, sendPdf, savePdfBuffer } = require('../utils/pdfStorage');

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

const FRONT = () =>
  (process.env.FRONTEND_URL || 'http://127.0.0.1:5174').replace(/\/$/, '');

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

  const payload = {
    employeeEmail:       session.recipientEmail,
    employeeName:        session.recipientName,
    employeeDesignation: session.recipientDesignation || '',
    documentTitle:       campaign.title,
    signingLink:         `${FRONT()}/template-sign/${session.token}`,
    bossName:            campaign.boss?.name || bossUser.full_name || 'Authoriser',
    bossDesignation:     campaign.boss?.designation || '',
    bossEmail:           campaign.boss?.email || bossUser.email,
    companyName:         campaign.companyName || '',
    companyLogoUrl:      campaign.companyLogo || '',
    emailHeaderColor:    campaign.emailHeaderColor || '#0f172a',
    message:             campaign.message || '',
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
    approvalLink:        `${FRONT()}/template-campaign/approve/${approver.token}`,
    companyName:         campaign.companyName,
    companyLogoUrl:      campaign.companyLogo,
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

function approverPayload(ctx, idx) {
  const doc = ctx.doc;
  const approver = doc.approvers[idx];
  const isTemplate = ctx.type === 'template';
  const employeeCount = isTemplate
    ? (doc.recipients?.length || 0)
    : (doc.recipients?.length || 0);

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
    },
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
    status:               'pending',
    expiresAt,
    sentAt:               new Date(),
    auditLog: [{
      action: 'link_sent', timestamp: new Date(), note: 'Campaign batch — sending email',
    }],
  }));

  const sessions = await TemplateSession.insertMany(sessionDocs);
  const failed = [];
  let emailsSent = 0;

  for (const session of sessions) {
    const result = await dispatchEmployeeEmailForCampaign({
      session, campaign, bossUser: ownerUser,
    });
    await recordSessionEmailResult(session, result);
    if (result?.success) emailsSent += 1;
    else failed.push({ name: session.recipientName, email: session.recipientEmail, error: result?.error });
  }

  campaign.status = 'active';
  campaign.sentAt = new Date();
  campaign.stats.pending = campaign.recipients.length;
  await campaign.save();

  if (failed.length) {
    await sendEmailDeliveryFailureNotice?.({
      ownerEmail: ownerUser.email,
      ownerName:  ownerUser.full_name || ownerUser.name,
      docTitle:   campaign.title,
      failed,
      totalCount: sessions.length,
    });
  }

  return { phase: 'active', emailsSent, emailsFailed: failed.length, failedRecipients: failed };
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
    campaign.bossSignedFileUrl = source.bossSignedFileUrl;
    campaign.bossSignature     = source.bossSignature;
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
    signingLink:     `${FRONT()}/template-campaign/boss/${campaign.bossToken}`,
    companyName:     campaign.companyName,
    companyLogoUrl:  campaign.companyLogo,
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
  const campaign = await TemplateCampaign.findOne({
    bossToken: req.params.token, status: 'boss_pending', isDeleted: false,
  }).populate('owner', 'full_name email');

  if (!campaign) {
    return res.status(404).json({ success: false, message: 'Invalid or expired boss signing link.' });
  }

  return res.json({
    success: true,
    campaign: {
      title:       campaign.title,
      companyName: campaign.companyName,
      companyLogo: campaign.companyLogo,
      fileUrl:     campaign.fileUrl,
      boss:        campaign.boss,
      approverCount: campaign.approvers?.length || 0,
      employeeCount: campaign.recipients?.length || 0,
      ownerName:   campaign.owner?.full_name || '',
    },
  });
});

const bossSignCampaign = asyncHandler(async (req, res) => {
  const { signatureDataUrl, fieldValues } = req.body;
  if (!signatureDataUrl) {
    return res.status(400).json({ success: false, message: 'Signature is required.' });
  }

  const campaign = await TemplateCampaign.findOne({
    bossToken: req.params.token, status: 'boss_pending', isDeleted: false,
  });
  if (!campaign) {
    return res.status(404).json({ success: false, message: 'Invalid boss signing link.' });
  }

  const ownerUser = await User.findById(campaign.owner).lean();
  let signatureImageUrl = null;
  try {
    const uploaded = await uploadSignaturePng(signatureDataUrl, 'nexsign/boss-signatures');
    signatureImageUrl = uploaded.secure_url;
  } catch (e) {
    console.error('[bossSignCampaign]', e.message);
  }

  let bossSignedFileUrl = campaign.fileUrl;
  if (pdfService?.embedBossSignature) {
    try {
      const mergedBytes = await Promise.race([
        pdfService.embedBossSignature({
          fileUrl:     campaign.fileUrl,
          signatureDataUrl,
          fields:      (campaign.fields || []).filter(f => f.assignedTo === 'boss'),
          fieldValues: Array.isArray(fieldValues) ? fieldValues : [],
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 25_000)),
      ]);

      const pdfResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'raw', folder: 'nexsign/boss-signed',
            public_id: `campaign_boss_${campaign._id}_${Date.now()}`, format: 'pdf',
          },
          (err, result) => err ? reject(err) : resolve(result),
        );
        stream.end(Buffer.from(mergedBytes));
      });
      bossSignedFileUrl = pdfResult.secure_url;
    } catch (e) {
      console.error('[bossSignCampaign] PDF embed failed:', e.message);
    }
  }

  campaign.bossSignature = {
    signatureImageUrl,
    signedAt: new Date(),
    ipAddress: getIP(req),
  };
  campaign.bossSignedFileUrl = bossSignedFileUrl;
  campaign.bossToken = null;
  await campaign.save();

  const result = await advanceCampaignPipeline(campaign, ownerUser, req);

  return res.json({
    success: true,
    message: result.phase === 'approver_pending'
      ? 'Signed! Approver chain started.'
      : `Signed! ${result.emailsSent} employee email(s) sent.`,
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

  return res.json({
    success: true,
    ...approverPayload(ctx, idx),
    pdfUrl: `${process.env.API_URL || 'http://localhost:5001'}/api/template-campaigns/pdf/${req.params.token}`,
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
    doc.status = 'cancelled';
    await doc.save();
    return res.json({ success: true, message: 'Approval declined. Employee emails will not be sent.' });
  }

  approver.status = 'approved';
  approver.approvedAt = new Date();
  approver.note = note || '';
  approver.token = null;

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
  let campaign = await TemplateCampaign.findOne({
    $or: [
      { bossToken: req.params.token },
      { 'approvers.token': req.params.token },
    ],
    isDeleted: false,
  });

  let record = null;
  let title = 'document';

  if (campaign) {
    record = {
      fileUrl: campaign.bossSignedFileUrl || campaign.fileUrl,
      localPdfPath: campaign.localBossSignedPdfPath || campaign.localPdfPath,
      bossSignedFileUrl: campaign.bossSignedFileUrl,
    };
    title = campaign.title;
  } else {
    const template = await Template.findOne({
      'approvers.token': req.params.token,
      status: 'approver_pending',
      isDeleted: false,
    });
    if (template) {
      record = {
        fileUrl: template.bossSignedFileUrl || template.fileUrl,
        localPdfPath: template.localBossSignedPdfPath || template.localPdfPath,
        bossSignedFileUrl: template.bossSignedFileUrl,
      };
      title = template.title;
    }
  }

  if (!record) return res.status(404).send('Not found');

  const buffer = await getPdfBytes(record, { preferSigned: !!record.bossSignedFileUrl });
  return sendPdf(res, buffer, title, { publicAccess: true });
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
