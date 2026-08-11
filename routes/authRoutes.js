'use strict';

const express   = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const router    = express.Router();

const {
  login,
  register,
  googleAuth,
  syncPassword,
  getMe,
  updateProfile,
  changePassword,
  logout,
} = require('../controllers/authController');

const { auth } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════
// RATE LIMITERS
// ═══════════════════════════════════════════════════════════════
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator: (req) =>
    ipKeyGenerator(
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
    ),
  message: {
    success: false,
    code:    'RATE_LIMITED',
    message: 'Too many attempts. Please try again after 15 minutes.',
  },
});

const updateLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             30,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    code:    'RATE_LIMITED',
    message: 'Too many requests. Please slow down.',
  },
});

// ═══════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ═══════════════════════════════════════════════════════════════
router.post('/register',      authLimiter, register);
router.post('/login',         authLimiter, login);
router.post('/google',        authLimiter, googleAuth);

// ✅ sync-password route add
router.post('/sync-password', authLimiter, syncPassword);

// ═══════════════════════════════════════════════════════════════
// PROTECTED ROUTES
// ═══════════════════════════════════════════════════════════════
router.get('/me',              auth, getMe);
router.put('/profile',         auth, updateLimiter, updateProfile);
router.put('/change-password', auth, authLimiter,   changePassword);
router.post('/logout',         auth, logout);

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════
router.get('/health', (_req, res) => {
  res.json({
    success:   true,
    status:    'Auth service OK',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;