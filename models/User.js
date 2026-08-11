'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    full_name: {
      type:      String,
      required:  [true, 'Full name is required'],
      trim:      true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,
      lowercase: true,
      trim:      true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please enter a valid email',
      ],
    },
    password: {
      type:    String,
      // ✅ Google login এ password required নয়
      // required function সম্পূর্ণ বাদ
      default: null,
      select:  false,
    },
    googleId: {
      type:    String,
      default: null,
    },
    role: {
      type:    String,
      enum:    ['user', 'admin', 'super_admin'],
      default: 'user',
    },

    avatar: {
      type:    String,
      default: null,
    },
    company_name: {
      type:    String,
      trim:    true,
      default: null,
    },
    company_logo: {
      type:    String,
      default: null,
    },
    designation: {
      type:    String,
      trim:    true,
      default: null,
    },
    phone: {
      type:    String,
      trim:    true,
      default: null,
    },

    is_active: {
      type:    Boolean,
      default: true,
    },
    is_email_verified: {
      type:    Boolean,
      default: false,
    },
    email_verification_token: {
      type:    String,
      default: null,
      select:  false,
    },
    password_reset_token: {
      type:    String,
      default: null,
      select:  false,
    },
    password_reset_expires: {
      type:    Date,
      default: null,
      select:  false,
    },

    stats: {
      total_documents:     { type: Number, default: 0 },
      completed_documents: { type: Number, default: 0 },
      pending_documents:   { type: Number, default: 0 },
      total_templates:     { type: Number, default: 0 },
    },

    last_login: {
      type:    Date,
      default: null,
    },
    last_login_ip: {
      type:    String,
      default: null,
    },
    last_login_device: {
      type:    String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// ── Indexes ───────────────────────────────────────────────────
userSchema.index({ email:     1 });
userSchema.index({ googleId:  1 });
userSchema.index({ role:      1 });
userSchema.index({ createdAt: -1 });

// ── Pre-save: Hash password ───────────────────────────────────
userSchema.pre('save', async function (next) {
  // Password নেই বা change হয়নি → skip
  if (!this.password)                    return next();
  if (!this.isModified('password'))      return next();
  // Already hashed → skip
  if (this.password.startsWith('\$2'))    return next();

  try {
    const salt    = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ── Method: Compare Password ──────────────────────────────────
userSchema.methods.comparePassword = async function (entered) {
  if (!this.password) return false;
  return bcrypt.compare(entered, this.password);
};

// ── Method: Public Profile ────────────────────────────────────
userSchema.methods.getPublicProfile = function () {
  return {
    _id:               this._id,
    full_name:         this.full_name,
    email:             this.email,
    role:              this.role,
    avatar:            this.avatar,
    company_name:      this.company_name,
    company_logo:      this.company_logo,
    designation:       this.designation,
    phone:             this.phone,
    is_active:         this.is_active,
    is_email_verified: this.is_email_verified,
    stats:             this.stats,
    last_login:        this.last_login,
    createdAt:         this.createdAt,
  };
};

// ── Method: Update Stats ──────────────────────────────────────
userSchema.methods.updateStats = async function (field, increment = 1) {
  const valid = [
    'total_documents', 'completed_documents',
    'pending_documents', 'total_templates',
  ];
  if (!valid.includes(field)) return;
  this.stats[field] = (this.stats[field] || 0) + increment;
  await this.save();
};

// ── Static: Find by Email with password ──────────────────────
userSchema.statics.findByEmailWithPassword = function (email) {
  return this.findOne({ email }).select('+password');
};

module.exports = mongoose.model('User', userSchema);