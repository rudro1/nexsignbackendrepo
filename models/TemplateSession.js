// Phase 1 Fix: removed ~269 lines of old commented-out code that preceded this.
// server/models/TemplateSession.js
'use strict';

const mongoose = require('mongoose');

// ─── Audit Entry Schema ───────────────────────────────────────
const AuditEntrySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: [
      'link_sent', 'link_opened', 'signing_started',
      'signed', 'declined', 'expired', 'reminder_sent',
    ],
    required: true,
  },
  timestamp:  { type: Date,   default: Date.now },
  ipAddress:  { type: String, default: '' },
  userAgent:  { type: String, default: '' },
  location: {
    city:       { type: String, default: '' },
    country:    { type: String, default: '' },
    postalCode: { type: String, default: '' },
    region:     { type: String, default: '' },
    timezone:   { type: String, default: '' },
    latitude:   { type: String, default: '' },
    longitude:  { type: String, default: '' },
  },
  deviceInfo: {
    browser:    { type: String,  default: '' },
    os:         { type: String,  default: '' },
    device:     { type: String,  default: '' },
    deviceType: { type: String,  default: 'desktop' },
    isMobile:   { type: Boolean, default: false },
  },
  localTime: { type: String, default: '' },
  note:      { type: String, default: '' },
}, { _id: false });

// ─── Field Value Schema ───────────────────────────────────────
const FieldValueSchema = new mongoose.Schema({
  fieldId: { type: String, required: true },
  type:    { type: String, required: true },
  value:   { type: String, default: '' },
}, { _id: false });

// ─── Signing Meta Schema ──────────────────────────────────────
const SigningMetaSchema = new mongoose.Schema({
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  localTime: { type: String, default: '' },
  location: {
    city:       { type: String, default: '' },
    country:    { type: String, default: '' },
    postalCode: { type: String, default: '' },
    region:     { type: String, default: '' },
    timezone:   { type: String, default: '' },
    latitude:   { type: String, default: '' },
    longitude:  { type: String, default: '' },
    display:    { type: String, default: '' },
  },
  deviceInfo: {
    browser:    { type: String,  default: '' },
    os:         { type: String,  default: '' },
    device:     { type: String,  default: '' },
    deviceType: { type: String,  default: 'desktop' },
    isMobile:   { type: Boolean, default: false },
  },
}, { _id: false });

// ════════════════════════════════════════════════════
// MAIN SESSION SCHEMA
// One session = one employee's signing journey
// ════════════════════════════════════════════════════
const TemplateSessionSchema = new mongoose.Schema({

  // ── Relations ────────────────────────────────────
  // FIX: both 'template' (old) and 'templateId' (controller) supported
  template: {
    type:  mongoose.Schema.Types.ObjectId,
    ref:   'Template',
    index: true,
  },
  // templateId is what the controller uses — kept as alias
  templateId: {
    type:  mongoose.Schema.Types.ObjectId,
    ref:   'Template',
    index: true,
  },

  /** Reuse wave — links session to a TemplateCampaign batch */
  campaignId: {
    type:  mongoose.Schema.Types.ObjectId,
    ref:   'TemplateCampaign',
    index: true,
  },

  // ── Recipient info (snapshot at send time) ────────
  recipientName:        { type: String, required: true, trim: true },
  recipientEmail:       { type: String, required: true, lowercase: true, trim: true },
  recipientDesignation: { type: String, default: '' },

  // ── Unique signing token ──────────────────────────
  token: {
    type:   String,
    default: null, // null after signing (security)
    index:   true,
    sparse:  true, // sparse — null values skip uniqueness check
  },
  signCode: {
    type:   String,
    default: null,
    index:  true,
    sparse: true,
  },

  // ── Status ────────────────────────────────────────
  status: {
    type:    String,
    enum:    ['pending', 'viewed', 'signing', 'signed', 'declined', 'expired'],
    default: 'pending',
    index:   true,
    /*
      pending  → email sent, not opened
      viewed   → link opened
      signing  → actively filling fields
      signed   → completed
      declined → rejected
      expired  → token expired
    */
  },

  // ── Signature ─────────────────────────────────────
  // Cloudinary URL — NOT base64 dataUrl in DB
  signatureImageUrl:      { type: String, default: null },
  signatureImagePublicId: { type: String, default: '' },

  // All field values filled by employee
  fieldValues: {
    type:    [FieldValueSchema],
    default: [],
  },

  // ── Individual signed PDF ─────────────────────────
  signedFileUrl:      { type: String, default: null },
  signedFilePublicId: { type: String, default: '' },
  localSignedPdfPath: { type: String, default: null },

  // ── Timestamps ────────────────────────────────────
  sentAt:     { type: Date, default: Date.now  },
  viewedAt:   { type: Date, default: null      },
  signedAt:   { type: Date, default: null      },
  declinedAt: { type: Date, default: null      },
  expiresAt:  { type: Date, required: true     },

  // ── Decline reason ────────────────────────────────
  declineReason: { type: String, default: '' },

  // ── Reminder tracking ─────────────────────────────
  reminderCount:  { type: Number, default: 0    },
  lastReminderAt: { type: Date,   default: null  },

  // ── Email delivery tracking ───────────────────────
  emailDelivered:     { type: Boolean, default: false },
  emailError:           { type: String,  default: ''  },
  emailAttempts:        { type: Number,  default: 0  },
  lastEmailAttemptAt:   { type: Date,    default: null },

  // ── Signing metadata ──────────────────────────────
  signingMeta: {
    type:    SigningMetaSchema,
    default: null,
  },

  // ── Full audit trail ──────────────────────────────
  auditLog: {
    type:    [AuditEntrySchema],
    default: [],
  },

  // ── Soft delete ───────────────────────────────────
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date,    default: null  },

}, {
  timestamps: true,
  toJSON:     { virtuals: true },
  toObject:   { virtuals: true },
});

// ════════════════════════════════════════════════════
// INDEXES
// ════════════════════════════════════════════════════
TemplateSessionSchema.index({ template:   1, status:         1 });
TemplateSessionSchema.index({ template:   1, recipientEmail: 1 });
TemplateSessionSchema.index({ template:   1, createdAt:     -1 });
TemplateSessionSchema.index({ templateId: 1, status:         1 });
TemplateSessionSchema.index({ templateId: 1, recipientEmail: 1 });
TemplateSessionSchema.index({ templateId: 1, createdAt:     -1 });

// ════════════════════════════════════════════════════
// PRE-SAVE: sync template ↔ templateId aliases
// ════════════════════════════════════════════════════
TemplateSessionSchema.pre('save', function (next) {
  // Keep template and templateId in sync
  if (this.templateId && !this.template) this.template   = this.templateId;
  if (this.template   && !this.templateId) this.templateId = this.template;

  // Auto-expire check on save
  if (
    !this.isModified('status') &&
    this.status !== 'signed'   &&
    this.status !== 'declined' &&
    this.expiresAt &&
    new Date() > this.expiresAt
  ) {
    this.status = 'expired';
  }

  next();
});

// ════════════════════════════════════════════════════
// VIRTUALS
// ════════════════════════════════════════════════════

TemplateSessionSchema.virtual('isExpired').get(function () {
  if (this.status === 'signed' || this.status === 'declined') return false;
  return !!(this.expiresAt && new Date() > this.expiresAt);
});

TemplateSessionSchema.virtual('daysSinceSent').get(function () {
  if (!this.sentAt) return 0;
  return Math.floor((Date.now() - this.sentAt.getTime()) / 86_400_000);
});

TemplateSessionSchema.virtual('isSigned').get(function () {
  return this.status === 'signed';
});

TemplateSessionSchema.virtual('isPending').get(function () {
  return this.status === 'pending' || this.status === 'viewed';
});

TemplateSessionSchema.virtual('locationDisplay').get(function () {
  const loc = this.signingMeta?.location;
  if (!loc) return 'Unknown';
  return [loc.city, loc.country, loc.postalCode]
    .filter(Boolean).join(', ') || 'Unknown';
});

// ════════════════════════════════════════════════════
// INSTANCE METHODS
// ════════════════════════════════════════════════════

TemplateSessionSchema.methods.addAuditEntry = function (action, meta = {}) {
  this.auditLog.push({
    action,
    timestamp:  new Date(),
    ipAddress:  meta.ipAddress  || '',
    userAgent:  meta.userAgent  || '',
    location:   meta.location   || {},
    deviceInfo: meta.deviceInfo || {},
    localTime:  meta.localTime  || new Date().toUTCString(),
    note:       meta.note       || '',
  });
  return this; // chainable
};

TemplateSessionSchema.methods.markViewed = function (meta = {}) {
  if (!this.viewedAt) {
    this.viewedAt = new Date();
  }
  if (this.status === 'pending') {
    this.status = 'viewed';
  }
  this.addAuditEntry('link_opened', meta);
  return this.save();
};

TemplateSessionSchema.methods.markSigning = function (meta = {}) {
  if (this.status === 'viewed' || this.status === 'pending') {
    this.status = 'signing';
    this.addAuditEntry('signing_started', meta);
  }
  return this.save();
};

TemplateSessionSchema.methods.markSigned = function ({
  signatureImageUrl,
  signatureImagePublicId,
  fieldValues = [],
  meta = {},
}) {
  this.status                 = 'signed';
  this.signedAt               = new Date();
  this.signatureImageUrl      = signatureImageUrl || null;
  this.signatureImagePublicId = signatureImagePublicId || '';
  this.fieldValues            = fieldValues;
  this.token                  = null; // Invalidate token after signing

  this.signingMeta = {
    ipAddress:  meta.ipAddress  || '',
    userAgent:  meta.userAgent  || '',
    localTime:  meta.localTime  || new Date().toUTCString(),
    location:   meta.location   || {},
    deviceInfo: meta.deviceInfo || {},
  };

  this.addAuditEntry('signed', meta);
  return this.save();
};

TemplateSessionSchema.methods.markDeclined = function (reason = '', meta = {}) {
  this.status        = 'declined';
  this.declinedAt    = new Date();
  this.declineReason = reason;
  this.token         = null; // Invalidate token
  this.addAuditEntry('declined', { ...meta, note: reason });
  return this.save();
};

TemplateSessionSchema.methods.markExpired = function () {
  this.status = 'expired';
  this.token  = null;
  this.addAuditEntry('expired', {
    localTime: new Date().toUTCString(),
  });
  return this.save();
};

TemplateSessionSchema.methods.addReminder = function (meta = {}) {
  this.reminderCount  = (this.reminderCount || 0) + 1;
  this.lastReminderAt = new Date();
  this.addAuditEntry('reminder_sent', meta);
  return this.save();
};

TemplateSessionSchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

// ════════════════════════════════════════════════════
// STATICS
// ════════════════════════════════════════════════════

TemplateSessionSchema.statics.getTemplateStats = async function (templateId) {
  const sessions = await this.find({
    $or:       [{ template: templateId }, { templateId }],
    isDeleted: { $ne: true },
  });

  return {
    total:    sessions.length,
    signed:   sessions.filter(s => s.status === 'signed').length,
    pending:  sessions.filter(s =>
      s.status === 'pending' || s.status === 'viewed' || s.status === 'signing'
    ).length,
    declined: sessions.filter(s => s.status === 'declined').length,
    expired:  sessions.filter(s => s.status === 'expired').length,
    viewed:   sessions.filter(s => !!s.viewedAt).length,
  };
};

TemplateSessionSchema.statics.findByToken = function (token) {
  return this.findOne({
    token,
    isDeleted: { $ne: true },
  }).populate('template').populate('templateId');
};

TemplateSessionSchema.statics.findPendingByTemplate = function (templateId) {
  return this.find({
    $or:       [{ template: templateId }, { templateId }],
    status:    { $in: ['pending', 'viewed'] },
    isDeleted: { $ne: true },
  });
};

TemplateSessionSchema.statics.expireOldSessions = async function () {
  const now = new Date();
  const result = await this.updateMany(
    {
      status:    { $in: ['pending', 'viewed', 'signing'] },
      expiresAt: { $lt: now },
      isDeleted: { $ne: true },
    },
    {
      $set: { status: 'expired', token: null },
    },
  );
  return result.modifiedCount;
};

module.exports = mongoose.model('TemplateSession', TemplateSessionSchema);