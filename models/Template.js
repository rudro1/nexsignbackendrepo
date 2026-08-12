// Phase 1 Fix: removed ~268 lines of old commented-out code that preceded this.
// server/models/Template.js
'use strict';

const mongoose = require('mongoose');

// ─── Field Schema ─────────────────────────────────────────────
const FieldSchema = new mongoose.Schema({
  id:          { type: String, required: true },
  type: {
    type:     String,
    enum:     ['signature', 'initial', 'date', 'text', 'checkbox', 'number'],
    required: true,
  },
  page:        { type: Number, required: true, min: 1 },
  x:           { type: Number, required: true },
  y:           { type: Number, required: true },
  width:       { type: Number, required: true },
  height:      { type: Number, required: true },
  fontFamily:  { type: String, default: 'Helvetica' },
  fontSize:    { type: Number, default: 14 },
  fontWeight:  { type: String, default: 'normal' },
  color:       { type: String, default: '#000000' },
  required:    { type: Boolean, default: true },
  placeholder: { type: String, default: '' },
  label:       { type: String, default: '' },
  locked:      { type: Boolean, default: false },
  // 'boss' or 'employee'
  assignedTo:  { type: String, enum: ['boss', 'employee'], default: 'employee' },
  // filled value (after signing)
  value:       { type: String, default: null },
  filledAt:    { type: Date,   default: null },
}, { _id: false });

// ─── CC Schema ────────────────────────────────────────────────
const CCSchema = new mongoose.Schema({
  name:        { type: String, default: '' },
  email:       { type: String, required: true, lowercase: true, trim: true },
  designation: { type: String, default: '' },
}, { _id: false });

// ─── Recipient Schema ─────────────────────────────────────────
const RecipientSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, lowercase: true, trim: true },
  designation: { type: String, default: '' },
  customData:  { type: Map, of: String, default: {} },
}, { _id: false });

// ─── Boss Signature Schema ────────────────────────────────────
// No dataUrl stored in DB — PNG stored on Cloudinary, URL saved here
const BossSignatureSchema = new mongoose.Schema({
  signatureImageUrl: { type: String, default: null },
  signedAt:          { type: Date,   default: null },
  ipAddress:         { type: String, default: '' },
  city:              { type: String, default: '' },
  region:            { type: String, default: '' },
  country:           { type: String, default: '' },
  postalCode:        { type: String, default: '' },
  timezone:          { type: String, default: '' },
  latitude:          { type: String, default: '' },
  longitude:         { type: String, default: '' },
  device:            { type: String, default: '' },
  browser:           { type: String, default: '' },
  os:                { type: String, default: '' },
}, { _id: false });

// ════════════════════════════════════════════════════
// MAIN TEMPLATE SCHEMA
// ════════════════════════════════════════════════════
const TemplateSchema = new mongoose.Schema({

  // ── Basic info ──────────────────────────────────
  title: {
    type:      String,
    required:  [true, 'Template title is required'],
    trim:      true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
  },

  description: {
    type:      String,
    trim:      true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    default:   '',
  },

  // ── Owner ───────────────────────────────────────
  owner: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },

  // createdBy alias for controller compatibility
  createdBy: {
    type:  mongoose.Schema.Types.ObjectId,
    ref:   'User',
    index: true,
  },

  // External authoriser (boss) — receives token link to sign before employees
  boss: {
    name:        { type: String, default: '' },
    email:       { type: String, default: '', lowercase: true, trim: true },
    designation: { type: String, default: '' },
  },
  bossToken: { type: String, default: null, sparse: true, index: true },

  // ── Company branding ────────────────────────────
  companyName: { type: String, default: '' },
  companyLogo: { type: String, default: '' },
  emailHeaderColor: { type: String, default: '#0f172a' },
  message:     { type: String, default: '' },

  // Optional sequential approvers before employee emails (CEO → HR → …)
  approvers: {
    type: [{
      name:        { type: String, required: true, trim: true },
      email:       { type: String, required: true, lowercase: true, trim: true },
      designation: { type: String, default: '' },
      order:       { type: Number, default: 0 },
      token:       { type: String, required: true },
      status:      {
        type:    String,
        enum:    ['pending', 'approved', 'declined'],
        default: 'pending',
      },
      approvedAt:    { type: Date, default: null },
      declineReason: { type: String, default: '' },
      note:          { type: String, default: '' },
    }],
    default: [],
  },
  currentApproverIndex: { type: Number, default: -1 },

  // ── PDF files ───────────────────────────────────
  fileUrl:      { type: String, required: [true, 'PDF file URL is required'] },
  filePublicId: { type: String, default: '' },
  localPdfPath:       { type: String, default: null },
  localBossSignedPdfPath: { type: String, default: null },
  fileName:     { type: String, default: '' },
  fileSize:     { type: Number, default: 0 },

  // Boss-signed PDF — generated after boss signs; base PDF for all employees
  bossSignedFileUrl:      { type: String, default: null },
  bossSignedFilePublicId: { type: String, default: '' },

  // ── Boss signature metadata ──────────────────────
  bossSignature: {
    type:    BossSignatureSchema,
    default: null,
  },

  // ── PDF fields ───────────────────────────────────
  fields: {
    type:    [FieldSchema],
    default: [],
  },

  // ── Recipients (employees) ───────────────────────
  recipients: {
    type:     [RecipientSchema],
    default:  [],
    validate: {
      validator: arr => arr.length <= 500,
      message:   'Max 500 recipients per template',
    },
  },

  // ── CC list ──────────────────────────────────────
  ccList: {
    type:    [CCSchema],
    default: [],
  },

  // ── Status ───────────────────────────────────────
  status: {
    type:    String,
    enum:    ['draft', 'boss_pending', 'approver_pending', 'active', 'completed', 'archived'],
    default: 'draft',
    index:   true,
    /*
      draft        → created, not configured
      boss_pending → boss needs to sign first
      approver_pending → boss signed; approver chain in progress
      active       → boss signed, employees signing
      completed    → all employees signed
      archived     → manually archived
    */
  },

  // ── Timestamps ───────────────────────────────────
  sentAt:      { type: Date, default: null },
  completedAt: { type: Date, default: null },

  // ── Signing config ───────────────────────────────
  signingConfig: {
    bossSignsFirst: { type: Boolean, default: true  },
    expiryDays:     { type: Number,  default: 30, min: 1, max: 365 },
    allowDecline:   { type: Boolean, default: true  },
    reminderDays:   { type: Number,  default: 3     },
    emailSubject:   { type: String,  default: ''    },
    emailMessage:   { type: String,  default: ''    },
    useCustomEmailBody: { type: Boolean, default: false },
    customEmailBody:    { type: String,  default: '' },
    customEmailSubject: { type: String,  default: '' },
  },

  // ── Stats (denormalized) ─────────────────────────
  stats: {
    totalRecipients: { type: Number, default: 0 },
    signed:          { type: Number, default: 0 },
    pending:         { type: Number, default: 0 },
    declined:        { type: Number, default: 0 },
    viewed:          { type: Number, default: 0 },
  },

  // ── Total PDF pages ──────────────────────────────
  totalPages: { type: Number, default: 1, min: 1 },

  // ── Soft delete ──────────────────────────────────
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date,    default: null               },

}, {
  timestamps: true,
  toJSON:     { virtuals: true },
  toObject:   { virtuals: true },
});

// ════════════════════════════════════════════════════
// INDEXES
// ════════════════════════════════════════════════════
TemplateSchema.index({ owner:     1, status:    1     });
TemplateSchema.index({ owner:     1, createdAt: -1    });
TemplateSchema.index({ createdBy: 1, status:    1     });
TemplateSchema.index({ createdBy: 1, createdAt: -1    });
TemplateSchema.index({ status:    1, isDeleted: 1     });

// ════════════════════════════════════════════════════
// VIRTUALS
// ════════════════════════════════════════════════════

// Progress %
TemplateSchema.virtual('progress').get(function () {
  const total = this.stats?.totalRecipients || 0;
  if (!total) return 0;
  return Math.round(((this.stats.signed || 0) / total) * 100);
});

// Boss signed check
TemplateSchema.virtual('isBossSigned').get(function () {
  return !!(this.bossSignature?.signedAt && this.bossSignedFileUrl);
});

// Recipient count
TemplateSchema.virtual('recipientCount').get(function () {
  return this.recipients?.length || 0;
});

// Boss fields only
TemplateSchema.virtual('bossFields').get(function () {
  return (this.fields || []).filter(f => f.assignedTo === 'boss');
});

// Employee fields only
TemplateSchema.virtual('employeeFields').get(function () {
  return (this.fields || []).filter(f => f.assignedTo === 'employee');
});

// ════════════════════════════════════════════════════
// PRE-SAVE
// ════════════════════════════════════════════════════
TemplateSchema.pre('save', function (next) {
  // Auto-sync totalRecipients stat
  if (this.isModified('recipients')) {
    this.stats.totalRecipients = this.recipients.length;
    this.stats.pending = Math.max(
      0,
      this.stats.totalRecipients
        - (this.stats.signed   || 0)
        - (this.stats.declined || 0),
    );
  }

  // Auto-set completedAt
  if (
    this.isModified('status') &&
    this.status === 'completed' &&
    !this.completedAt
  ) {
    this.completedAt = new Date();
  }

  // Sync createdBy ↔ owner (controller uses createdBy, model uses owner)
  if (this.isNew) {
    if (this.owner && !this.createdBy) this.createdBy = this.owner;
    if (this.createdBy && !this.owner) this.owner = this.createdBy;
  }

  next();
});

// ════════════════════════════════════════════════════
// STATIC METHODS
// ════════════════════════════════════════════════════

TemplateSchema.statics.findByOwner = function (ownerId, status = null) {
  const query = { $or: [{ owner: ownerId }, { createdBy: ownerId }], isDeleted: false };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

// ════════════════════════════════════════════════════
// INSTANCE METHODS
// ════════════════════════════════════════════════════

// Soft delete
TemplateSchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.status    = 'archived';
  return this.save();
};

// Recalculate stats from sessions
TemplateSchema.methods.recalculateStats = async function () {
  try {
    const TemplateSession = mongoose.model('TemplateSession');
    const sessions = await TemplateSession.find({
      templateId: this._id,
      isDeleted:  { $ne: true },
    });

    const signed   = sessions.filter(s => s.status === 'signed').length;
    const declined = sessions.filter(s => s.status === 'declined').length;
    const viewed   = sessions.filter(s => !!s.viewedAt).length;
    const total    = this.stats.totalRecipients || sessions.length;
    const pending  = Math.max(0, total - signed - declined);

    this.stats.signed   = signed;
    this.stats.declined = declined;
    this.stats.viewed   = viewed;
    this.stats.pending  = pending;

    // Auto-complete
    if (total > 0 && signed >= total) {
      this.status      = 'completed';
      this.completedAt = this.completedAt || new Date();
    }

    return this.save();
  } catch (err) {
    console.error('[Template.recalculateStats]', err.message);
    throw err;
  }
};

module.exports = mongoose.model('Template', TemplateSchema);