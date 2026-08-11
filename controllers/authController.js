'use strict';

const User = require('../models/User');
const jwt  = require('jsonwebtoken');

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════
function generateToken(user, expiresIn = '30d') {
  return jwt.sign(
    {
      id:    String(user._id),
      email: user.email,
      role:  user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn },
  );
}

function userResponse(user) {
  return {
    id:                String(user._id),
    name:              user.full_name || '',
    full_name:         user.full_name || '',
    email:             user.email,
    role:              user.role              || 'user',
    photoURL:          user.avatar            || null,
    avatar:            user.avatar            || null,
    company_name:      user.company_name      || null,
    company_logo:      user.company_logo      || null,
    designation:       user.designation       || null,
    phone:             user.phone             || null,
    is_email_verified: user.is_email_verified ?? false,
    isVerified:        user.is_email_verified ?? false,
    stats:             user.stats             || {},
    last_login:        user.last_login        || null,
    createdAt:         user.createdAt,
  };
}

function getRequestMeta(req) {
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip']  ||
    req.ip                    ||
    req.socket?.remoteAddress ||
    'Unknown';
  return { ip, userAgent: req.headers['user-agent'] || '' };
}

// ════════════════════════════════════════════════════════════════
// POST /auth/register
// ════════════════════════════════════════════════════════════════
exports.register = async (req, res) => {
  try {
    const { name, full_name, email, password,
            company_name, designation, phone } = req.body;

    const resolvedName = (full_name || name || '').trim();

    if (!resolvedName || !email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        code:    'VALIDATION_ERROR',
        message: 'Name, email and password are required.',
      });
    }
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        code:    'WEAK_PASSWORD',
        message: 'Password must be at least 6 characters.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing   = await User.findOne({ email: cleanEmail }).select('_id').lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        code:    'EMAIL_EXISTS',
        message: 'This email is already registered.',
      });
    }

    const user = await User.create({
      full_name:         resolvedName,
      email:             cleanEmail,
      password,
      role:              'user',
      company_name:      company_name?.trim() || null,
      designation:       designation?.trim()  || null,
      phone:             phone?.trim()        || null,
      is_email_verified: false,
    });

    const { ip, userAgent } = getRequestMeta(req);
    user.last_login        = new Date();
    user.last_login_ip     = ip;
    user.last_login_device = userAgent.substring(0, 200);
    await user.save();

    return res.status(201).json({
      success: true,
      message: 'Registration successful.',
      token:   generateToken(user),
      user:    userResponse(user),
    });

  } catch (err) {
    console.error('[Register]', err.message);
    if (err.code === 11000) {
      return res.status(409).json({
        success: false, code: 'EMAIL_EXISTS',
        message: 'This email is already registered.',
      });
    }
    return res.status(500).json({
      success: false, code: 'SERVER_ERROR',
      message: 'Registration failed. Please try again.',
    });
  }
};

// ════════════════════════════════════════════════════════════════
// POST /auth/login
// ════════════════════════════════════════════════════════════════
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({
        success: false, code: 'VALIDATION_ERROR',
        message: 'Email and password are required.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user       = await User.findByEmailWithPassword(cleanEmail);

    if (!user) {
      return res.status(401).json({
        success: false, code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }
    if (!user.is_active) {
      return res.status(403).json({
        success: false, code: 'ACCOUNT_DISABLED',
        message: 'Your account has been disabled. Contact support.',
      });
    }
    if (!user.password) {
      return res.status(401).json({
        success: false, code: 'GOOGLE_ONLY',
        message: 'This account uses Google sign-in. Please use Google login.',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false, code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    const { ip, userAgent } = getRequestMeta(req);
    user.last_login        = new Date();
    user.last_login_ip     = ip;
    user.last_login_device = userAgent.substring(0, 200);
    await user.save();

    return res.json({
      success: true,
      message: 'Login successful.',
      token:   generateToken(user),
      user:    userResponse(user),
    });

  } catch (err) {
    console.error('[Login]', err.message);
    return res.status(500).json({
      success: false, code: 'SERVER_ERROR',
      message: 'Login failed. Please try again.',
    });
  }
};

// ════════════════════════════════════════════════════════════════
// POST /auth/google
// ✅ ONLY email required — everything else optional
// ════════════════════════════════════════════════════════════════
exports.googleAuth = async (req, res) => {
  try {
    // ✅ Log করো — Vercel function logs এ দেখা যাবে
    console.log('[Google Auth] body:', JSON.stringify(req.body));

    const { name, email, photoURL } = req.body;

    // ✅ ONLY email check
    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        code:    'VALIDATION_ERROR',
        message: 'Email is required.',
      });
    }

    const cleanEmail   = email.toLowerCase().trim();
    const resolvedName = (name || cleanEmail.split('@')[0] || 'User').trim();
    const { ip, userAgent } = getRequestMeta(req);

    let user = await User.findOne({ email: cleanEmail });

    if (!user) {
      // ── New user create ────────────────────────────────
      user = await User.create({
        full_name:         resolvedName,
        email:             cleanEmail,
        avatar:            photoURL  || null,
        googleId:          null,
        role:              'user',
        is_email_verified: true,
        is_active:         true,
        // ✅ password: null — model এ required নেই এখন
      });
      console.log('[Google Auth] New user:', cleanEmail);

    } else {
      // ── Existing user ──────────────────────────────────
      if (user.is_active === false) {
        return res.status(403).json({
          success: false, code: 'ACCOUNT_DISABLED',
          message: 'Account disabled. Contact support.',
        });
      }

      let changed = false;
      if (photoURL && !user.avatar) {
        user.avatar = photoURL;
        changed = true;
      }
      if (!user.is_email_verified) {
        user.is_email_verified = true;
        changed = true;
      }
      if (changed) await user.save();
    }

    user.last_login        = new Date();
    user.last_login_ip     = ip;
    user.last_login_device = userAgent.substring(0, 200);
    await user.save();

    console.log('[Google Auth] Success:', cleanEmail);

    return res.json({
      success: true,
      message: 'Google authentication successful.',
      token:   generateToken(user),
      user:    userResponse(user),
    });

  } catch (err) {
    console.error('[Google Auth]', err.message, err.stack);

    // ── Race condition: duplicate key ──────────────────────
    if (err.code === 11000) {
      try {
        const cleanEmail = req.body.email?.toLowerCase().trim();
        const user = await User.findOne({ email: cleanEmail });
        if (user) {
          user.last_login = new Date();
          await user.save();
          return res.json({
            success: true,
            message: 'Google authentication successful.',
            token:   generateToken(user),
            user:    userResponse(user),
          });
        }
      } catch (e) {
        console.error('[Google Auth] Recovery failed:', e.message);
      }
    }

    return res.status(500).json({
      success: false, code: 'SERVER_ERROR',
      message: 'Google authentication failed. Please try again.',
    });
  }
};

// ════════════════════════════════════════════════════════════════
// POST /auth/sync-password
// ════════════════════════════════════════════════════════════════
exports.syncPassword = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({
        success: false, code: 'VALIDATION_ERROR',
        message: 'Email and password are required.',
      });
    }
    if (password.length < 6) {
      return res.status(400).json({
        success: false, code: 'WEAK_PASSWORD',
        message: 'Password must be at least 6 characters.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user       = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(404).json({
        success: false, code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }
    if (!user.is_active) {
      return res.status(403).json({
        success: false, code: 'ACCOUNT_DISABLED',
        message: 'Account disabled.',
      });
    }

    user.password   = password;
    user.last_login = new Date();
    await user.save();

    return res.json({
      success: true,
      message: 'Password synced.',
      token:   generateToken(user),
      user:    userResponse(user),
    });

  } catch (err) {
    console.error('[SyncPassword]', err.message);
    return res.status(500).json({
      success: false, code: 'SERVER_ERROR',
      message: 'Password sync failed.',
    });
  }
};

// ════════════════════════════════════════════════════════════════
// GET /auth/me
// ════════════════════════════════════════════════════════════════
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password -email_verification_token -password_reset_token -password_reset_expires')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false, code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    return res.json({ success: true, user: userResponse(user) });

  } catch (err) {
    console.error('[GetMe]', err.message);
    return res.status(500).json({
      success: false, code: 'SERVER_ERROR',
      message: 'Failed to fetch user.',
    });
  }
};

// ════════════════════════════════════════════════════════════════
// PUT /auth/profile
// ════════════════════════════════════════════════════════════════
exports.updateProfile = async (req, res) => {
  try {
    const { name, full_name, company_name, company_logo,
            designation, phone, avatar, photoURL } = req.body;

    const updates      = {};
    const resolvedName = full_name || name;
    const resolvedAva  = avatar    || photoURL;

    if (resolvedName?.trim())        updates.full_name    = resolvedName.trim();
    if (company_name !== undefined)  updates.company_name = company_name?.trim()  || null;
    if (company_logo !== undefined)  updates.company_logo = company_logo           || null;
    if (designation  !== undefined)  updates.designation  = designation?.trim()   || null;
    if (phone        !== undefined)  updates.phone        = phone?.trim()          || null;
    if (resolvedAva  !== undefined)  updates.avatar       = resolvedAva            || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false, code: 'NO_CHANGES',
        message: 'No fields to update.',
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true },
    ).select('-password -email_verification_token -password_reset_token');

    if (!user) {
      return res.status(404).json({
        success: false, code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    return res.json({
      success: true,
      message: 'Profile updated.',
      user:    userResponse(user),
    });

  } catch (err) {
    console.error('[UpdateProfile]', err.message);
    return res.status(500).json({
      success: false, code: 'SERVER_ERROR',
      message: 'Profile update failed.',
    });
  }
};

// ════════════════════════════════════════════════════════════════
// PUT /auth/change-password
// ════════════════════════════════════════════════════════════════
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false, code: 'VALIDATION_ERROR',
        message: 'Current and new password are required.',
      });
    }
    if (new_password.length < 6) {
      return res.status(400).json({
        success: false, code: 'WEAK_PASSWORD',
        message: 'New password must be at least 6 characters.',
      });
    }

    const user = await User.findByEmailWithPassword(req.user.email);

    if (!user) {
      return res.status(404).json({
        success: false, code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    const isMatch = await user.comparePassword(current_password);
    if (!isMatch) {
      return res.status(401).json({
        success: false, code: 'WRONG_PASSWORD',
        message: 'Current password is incorrect.',
      });
    }

    user.password = new_password;
    await user.save();

    return res.json({
      success: true,
      message: 'Password changed.',
      token:   generateToken(user),
    });

  } catch (err) {
    console.error('[ChangePassword]', err.message);
    return res.status(500).json({
      success: false, code: 'SERVER_ERROR',
      message: 'Password change failed.',
    });
  }
};

// ════════════════════════════════════════════════════════════════
// POST /auth/logout
// ════════════════════════════════════════════════════════════════
exports.logout = async (req, res) => {
  res.clearCookie('nexsign_token');
  return res.json({ success: true, message: 'Logged out.' });
};