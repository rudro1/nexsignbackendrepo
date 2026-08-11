'use strict';

// ═══════════════════════════════════════════════════════════════
// ADMIN AUTH MIDDLEWARE
// Must be used AFTER auth middleware
// auth → adminAuth → controller
// ═══════════════════════════════════════════════════════════════

const ADMIN_ROLES      = ['admin', 'super_admin'];
const SUPER_ADMIN_ONLY = ['super_admin'];

// ═══════════════════════════════════════════════════════════════
// MAIN — adminAuth
// Allows: admin + super_admin
// ═══════════════════════════════════════════════════════════════
const adminAuth = (req, res, next) => {
  try {
    // ── Must be authenticated first ───────────────────────────
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code:    'NOT_AUTHENTICATED',
        message: 'Authentication required. Please log in.',
      });
    }

    const role = req.user.role;

    // ── Role check ────────────────────────────────────────────
    if (!ADMIN_ROLES.includes(role)) {
      console.warn(
        `🚫 [adminAuth] Access denied → ` +
        `${req.user.email} (${role}) → ` +
        `${req.method} ${req.originalUrl}`
      );

      return res.status(403).json({
        success: false,
        code:    'FORBIDDEN',
        message: 'Admin privileges required to access this resource.',
      });
    }

    // ── Log super admin actions ───────────────────────────────
    if (role === 'super_admin') {
      console.log(
        `👑 [superAdmin] ${req.user.email} → ` +
        `${req.method} ${req.originalUrl}`
      );
    }

    // ── Attach admin context to request ───────────────────────
    req.adminContext = {
      userId:    req.user.id,
      email:     req.user.email,
      role,
      ip:        req.ip ||
                 req.headers['x-forwarded-for'] ||
                 req.socket?.remoteAddress,
      timestamp: new Date().toISOString(),
      isSuperAdmin: role === 'super_admin',
    };

    return next();

  } catch (err) {
    console.error('[adminAuth] Error:', {
      message:  err.message,
      userId:   req.user?._id,
      url:      req.originalUrl,
      ip:       req.ip,
    });

    return res.status(500).json({
      success: false,
      code:    'ADMIN_AUTH_ERROR',
      message: 'Administrative verification failed.',
    });
  }
};

// ═══════════════════════════════════════════════════════════════
// SUPER ADMIN ONLY
// Allows: super_admin only
// ═══════════════════════════════════════════════════════════════
const superAdminOnly = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code:    'NOT_AUTHENTICATED',
        message: 'Authentication required.',
      });
    }

    if (!SUPER_ADMIN_ONLY.includes(req.user.role)) {
      console.warn(
        `🚫 [superAdminOnly] Access denied → ` +
        `${req.user.email} (${req.user.role})`
      );

      return res.status(403).json({
        success: false,
        code:    'SUPER_ADMIN_REQUIRED',
        message: 'Super admin privileges required.',
      });
    }

    console.log(
      `👑 [superAdmin] ${req.user.email} → ` +
      `${req.method} ${req.originalUrl}`
    );

    req.adminContext = {
      userId:       req.user.id,
      email:        req.user.email,
      role:         req.user.role,
      ip:           req.ip || req.headers['x-forwarded-for'],
      timestamp:    new Date().toISOString(),
      isSuperAdmin: true,
    };

    return next();

  } catch (err) {
    console.error('[superAdminOnly] Error:', err.message);
    return res.status(500).json({
      success: false,
      code:    'AUTH_ERROR',
      message: 'Authorization failed.',
    });
  }
};

// ═══════════════════════════════════════════════════════════════
// CAN — Permission helper
// Usage: adminAuth.can(['super_admin'])
// ═══════════════════════════════════════════════════════════════
adminAuth.can = (roles = []) => {
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
        code:    'INSUFFICIENT_PERMISSIONS',
        message: `Required role: ${allowed.join(' or ')}.`,
      });
    }

    next();
  };
};

// ═══════════════════════════════════════════════════════════════
// OWNER OR ADMIN
// Resource owner অথবা admin access করতে পারবে
// Usage: adminAuth.ownerOrAdmin('ownerId')
// ═══════════════════════════════════════════════════════════════
adminAuth.ownerOrAdmin = (ownerField = 'owner') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code:    'NOT_AUTHENTICATED',
        message: 'Authentication required.',
      });
    }

    const isAdmin = ADMIN_ROLES.includes(req.user.role);

    // Admin সব access করতে পারবে
    if (isAdmin) return next();

    // Owner check (resource এ owner field থাকলে)
    const resourceOwner =
      req.resource?.[ownerField] ||
      req.body?.[ownerField] ||
      req.params?.[ownerField];

    if (
      resourceOwner &&
      String(resourceOwner) === String(req.user.id)
    ) {
      return next();
    }

    return res.status(403).json({
      success: false,
      code:    'FORBIDDEN',
      message: 'You do not have permission to access this resource.',
    });
  };
};

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  adminAuth,
  superAdminOnly,
};