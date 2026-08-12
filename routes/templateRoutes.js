'use strict';

const express = require('express');
const router  = express.Router();

// FIX #1: was `require('../middleware/auth')` (whole object) — crashed Express
// Now correctly destructures the `auth` function
const { auth } = require('../middleware/auth');

const ctrl = require('../controllers/templateController');

// ── Authenticated routes (boss / admin) ──────────────────────────────────────
router.post  ('/',                               auth, ctrl.createTemplate);
router.get   ('/',                               auth, ctrl.getTemplates);
router.post  ('/email-preview',                  auth, ctrl.previewEmployeeEmail);
router.post  ('/:id/reuse',                      auth, require('../controllers/campaignController').reuseTemplate);
router.get   ('/:id/campaigns',                  auth, require('../controllers/campaignController').listCampaigns);
router.get   ('/:id',                            auth, ctrl.getTemplate);
router.delete('/:id',                            auth, ctrl.deleteTemplate);
router.post  ('/:id/boss-sign',                  auth, ctrl.bossSign);
router.post  ('/:id/email-preview',             auth, ctrl.previewEmployeeEmail);
router.post  ('/:id/resend-failed',              auth, ctrl.resendFailedEmails);

// FIX #4: resend param was :sid — kept compatible, renamed to :sessionId for clarity
router.post  ('/:id/sessions/:sessionId/resend', auth, ctrl.resendEmail);
router.post  ('/:id/sessions/:sessionId/resend-signed', auth, ctrl.resendSignedCopy);
router.get   ('/:id/sessions/:sessionId/pdf', auth, ctrl.getSessionSignedPdf);
router.get   ('/:id/pdf',                         auth, ctrl.getOwnerTemplatePdf);

router.get   ('/:id/sessions',                      auth, ctrl.getTemplateSessions);
router.get   ('/:id/audit',                         auth, ctrl.getTemplateAudit);

// FIX #4: PUT /:id — was missing entirely; updateTemplate stub
// (wire to ctrl.updateTemplate when controller function is added)
router.put   ('/:id', auth, async (req, res) => {
  if (typeof ctrl.updateTemplate === 'function') {
    return ctrl.updateTemplate(req, res);
  }
  // Graceful fallback until controller function is implemented
  try {
    const Template = require('../models/Template');
    const allowed  = ['title', 'description', 'message', 'ccList', 'companyName', 'companyLogo'];
    const update   = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const template = await Template.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user._id, status: { $in: ['draft', 'boss_pending'] } },
      { $set: update },
      { new: true },
    ).lean();
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found or not editable.' });
    }
    return res.json({ success: true, data: template });
  } catch (e) {
    console.error('[PUT /:id]', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

// FIX #4: POST /:id/distribute — was missing entirely
// Distribute = boss already signed, now manually trigger sending to all employees
router.post  ('/:id/distribute', auth, async (req, res) => {
  if (typeof ctrl.distribute === 'function') {
    return ctrl.distribute(req, res);
  }
  return res.status(501).json({
    success: false,
    message: 'Distribute endpoint not yet implemented. Use boss-sign to auto-distribute.',
  });
});

// ── Public signing routes (token-based, no auth header) ──────────────────────
// FIX #2: paths now match frontend apiClient.js exactly:
//   validateEmployeeToken → GET  /templates/sign/validate/:token
//   submitEmployeeSignature → POST /templates/sign/submit/:token
//   declineEmployee         → POST /templates/sign/decline/:token
//   getPdfProxyUrl          → GET  /templates/sign/:token/pdf
router.get   ('/sign/validate/:token',          ctrl.getSessionByToken);
router.post  ('/sign/submit/:token',            ctrl.employeeSign);
router.post  ('/sign/decline/:token',           ctrl.employeeDecline);
router.get   ('/sign/:token/pdf',               ctrl.getTemplatePdf);

module.exports = router;