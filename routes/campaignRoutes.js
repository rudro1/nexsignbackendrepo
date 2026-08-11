'use strict';

const express = require('express');
const router  = express.Router();
const { auth } = require('../middleware/auth');
const campaignCtrl = require('../controllers/campaignController');
const templateCtrl = require('../controllers/templateController');

// Reuse — mounted under /api/templates/:id/reuse via templateRoutes
// Public campaign signing routes
router.get ('/boss/validate/:token',  campaignCtrl.validateBossToken);
router.post('/boss/sign/:token',      campaignCtrl.bossSignCampaign);
router.get ('/approve/validate/:token', campaignCtrl.validateApproverToken);
router.post('/approve/:token',        campaignCtrl.approveCampaign);
router.get ('/pdf/:token',            campaignCtrl.getCampaignPdf);

module.exports = router;
