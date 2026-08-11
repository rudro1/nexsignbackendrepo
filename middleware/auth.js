'use strict';

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// ═══════════════════════════════════════════════════════════════
// HELPER — extract token from header or cookie
// ═══════════════════════════════════════════════════════════════
function extractToken(req) {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1].trim();
  }

  // 2. Cookie fallback (optional)
  if (req.cookies && req.cookies.nexsign_token) {
    return req.cookies.nexsign_token;
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// MAIN AUTH MIDDLEWARE
// Verifies JWT → attaches req.user
// ═══════════════════════════════════════════════════════════════
const auth = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        code:    'NO_TOKEN',
        message: 'Unauthorized: No token provided.',
      });
    }

    // ── Verify JWT ─────────────────────────────────────────────
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const isExpired = err.name === 'TokenExpiredError';
      return res.status(401).json({
        success: false,
        code:    isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        message: isExpired
          ? 'Session expired. Please log in again.'
          : 'Invalid token. Please log in again.',
      });
    }

    // ── Attach user from DB (fresh data) ──────────────────────
    // Lean query → fast, no mongoose overhead
    const user = await User.findById(decoded.id || decoded._id)
      .select('_id full_name email role is_active company_name company_logo designation')
      .lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        code:    'USER_NOT_FOUND',
        message: 'User no longer exists. Please log in again.',
      });
    }

    if (user.is_active === false) {
      console.warn(`[auth] Blocked inactive user: ${user.email}`);
      return res.status(403).json({
        success: false,
        code:    'ACCOUNT_DISABLED',
        message: 'Your account has been disabled. Contact support.',
      });
    }

    // ── Attach to request ─────────────────────────────────────
    req.user = {
      id:           String(user._id),
      _id:          user._id,
      full_name:    user.full_name,
      email:        user.email,
      role:         user.role,
      company_name: user.company_name,
      company_logo: user.company_logo,
      designation:  user.designation,
    };

    next();
  } catch (err) {
    console.error('[auth] Middleware error:', err.message);
    return res.status(500).json({
      success: false,
      code:    'AUTH_ERROR',
      message: 'Authentication error. Please try again.',
    });
  }
};

// ═══════════════════════════════════════════════════════════════
// OPTIONAL AUTH
// Same as auth but does NOT block if no token
// req.user = null if unauthenticated
// ═══════════════════════════════════════════════════════════════
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      req.user = null;
      return next();
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      req.user = null;
      return next();
    }

    const user = await User.findById(decoded.id || decoded._id)
      .select('_id full_name email role is_active company_name company_logo designation')
      .lean();

    req.user = user && user.is_active
      ? {
          id:           String(user._id),
          _id:          user._id,
          full_name:    user.full_name,
          email:        user.email,
          role:         user.role,
          company_name: user.company_name,
          company_logo: user.company_logo,
          designation:  user.designation,
        }
      : null;

    next();
  } catch {
    req.user = null;
    next();
  }
};

// ═══════════════════════════════════════════════════════════════
// ROLE GUARD
// Usage: requireRole('admin') or requireRole(['admin','super_admin'])
// Must be used AFTER auth middleware
// ═══════════════════════════════════════════════════════════════
const requireRole = (roles) => {
  const allowed = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code:    'NOT_AUTHENTICATED',
        message: 'Authentication required.',
      });
    }

    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        code:    'FORBIDDEN',
        message: `Access denied. Required role: ${allowed.join(' or ')}.`,
      });
    }

    next();
  };
};

// ═══════════════════════════════════════════════════════════════
// SELF OR ADMIN
// User can access own resource, admin can access all
// Usage: requireSelfOrAdmin('userId') — param name
// ═══════════════════════════════════════════════════════════════
const requireSelfOrAdmin = (paramName = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code:    'NOT_AUTHENTICATED',
        message: 'Authentication required.',
      });
    }

    const targetId = req.params[paramName];
    const isSelf   = String(req.user.id) === String(targetId);
    const isAdmin  = ['admin', 'super_admin'].includes(req.user.role);

    if (!isSelf && !isAdmin) {
      return res.status(403).json({
        success: false,
        code:    'FORBIDDEN',
        message: 'You do not have permission to access this resource.',
      });
    }

    next();
  };
};

module.exports = {
  auth,
  optionalAuth,
  requireRole,
  requireSelfOrAdmin,
};