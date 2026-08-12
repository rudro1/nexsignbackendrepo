const mongoose = require('mongoose');

const ccSchema = new mongoose.Schema(
  {
    name:          { type: String, trim: true, required: [true, 'CC name is required'] },
    email:         { type: String, lowercase: true, trim: true, required: [true, 'CC email is required'] },
    designation:   { type: String, trim: true, default: null },
    notifiedAt:    { type: Date, default: null },
    finalPdfSentAt:{ type: Date, default: null },
  },
  { _id: true }
);

const partySchema = new mongoose.Schema(
  {
    name:          { type: String, required: true, trim: true },
    email:         { type: String, lowercase: true, trim: true, required: true },
    designation:   { type: String, trim: true, default: null },
    order:         { type: Number, required: true, default: 0 },
    color:         { type: String, default: '#3B82F6' },
    status: {
      type: String,
      enum: ['pending', 'sent', 'viewed', 'signed', 'declined'],
      default: 'pending',
    },

    // ✅ select: false সরানো হয়েছে — এটাই মূল bug ছিল
    token:          { type: String, index: true, sparse: true },
    signCode:       { type: String, index: true, sparse: true },
    tokenExpiresAt: { type: Date, default: null },

    emailSentAt:    { type: Date, default: null },
    emailOpenedAt:  { type: Date, default: null },
    emailOpenCount: { type: Number, default: 0 },
    linkClickedAt:  { type: Date, default: null },
    linkClickCount: { type: Number, default: 0 },

    signedAt:      { type: Date, default: null },
    declinedAt:    { type: Date, default: null },
    declineReason: { type: String, default: null },

    device:         { type: String, default: null },
    browser:        { type: String, default: null },
    os:             { type: String, default: null },
    ipAddress:      { type: String, default: null },
    city:           { type: String, default: null },
    region:         { type: String, default: null },
    country:        { type: String, default: null },
    postalCode:     { type: String, default: null },
    timezone:       { type: String, default: null },
    localSignedTime:{ type: String, default: null },
    userAgent:      { type: String, default: null, select: false },
    latitude:       { type: String, default: null },
    longitude:      { type: String, default: null },
  },
  { _id: true }
);

const fieldSchema = new mongoose.Schema(
  {
    id:              { type: String, required: true },
    type: {
      type: String,
      enum: ['text', 'signature', 'date', 'checkbox', 'initial', 'number'],
      required: true,
    },
    partyIndex:      { type: Number, required: true },
    partyEmail:      { type: String, default: null },
    page:            { type: Number, required: true, default: 1 },
    x:               { type: Number, required: true },
    y:               { type: Number, required: true },
    width:           { type: Number, required: true },
    height:          { type: Number, required: true },
    fontSize:        { type: Number, default: 14 },
    fontFamily:      { type: String, default: 'Inter' },
    fontWeight:      { type: String, enum: ['normal', 'bold'], default: 'normal' },
    color:           { type: String, default: '#000000' },
    backgroundColor: { type: String, default: 'transparent' },
    label:           { type: String, default: null },
    locked:          { type: Boolean, default: false },
    placeholder:     { type: String, default: null },
    required:        { type: Boolean, default: true },
    value:           { type: String, default: null },
    filledAt:        { type: Date, default: null },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Document title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    message:     { type: String, trim: true, default: '', maxlength: [1000, 'Message cannot exceed 1000 characters'] },
    useCustomEmailBody: { type: Boolean, default: false },
    customEmailBody:    { type: String, trim: true, default: '', maxlength: [10000, 'Custom email body cannot exceed 10000 characters'] },
    customEmailSubject: { type: String, trim: true, default: '', maxlength: [500, 'Custom email subject cannot exceed 500 characters'] },
    companyName: { type: String, trim: true, default: '' },
    companyLogo: { type: String, default: null },
    emailHeaderColor: { type: String, default: '#0f172a' },

    /** URL-safe slug for pretty signing links, e.g. unpaid-leave-application */
    publicSlug: { type: String, default: null, index: true, sparse: true },

    fileUrl:  { type: String, required: [true, 'File URL is required'] },
    fileId:   { type: String, required: [true, 'File ID is required'] },
    localPdfPath:       { type: String, default: null },
    localSignedPdfPath: { type: String, default: null },
    fileName: { type: String, default: null },
    fileSize: { type: Number, default: null },
    totalPages: { type: Number, default: 1 },

    signedFileUrl: { type: String, default: null },
    signedFileId:  { type: String, default: null },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    workflowType: {
      type: String,
      enum: ['sequential', 'parallel', 'template_instance'],
      default: 'sequential',
    },
    status: {
      type: String,
      enum: ['draft', 'in_progress', 'completed', 'cancelled', 'declined'],
      default: 'draft',
      index: true,
    },
    currentPartyIndex: { type: Number, default: 0 },

    parties: { type: [partySchema], default: [] },
    ccList:  { type: [ccSchema],   default: [] },
    fields:  { type: [fieldSchema], default: [] },

    isTemplate:       { type: Boolean, default: false, index: true },
    templateName:     { type: String, trim: true, default: null },
    sourceTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    usageCount:       { type: Number, default: 0 },

    isMasterTemplate: { type: Boolean, default: false },
    masterTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    bossSignedPdfUrl: { type: String, default: null },
    bossSignedAt:     { type: Date, default: null },
    masterStatus: {
      type: String,
      enum: ['draft','boss_pending','boss_signed','distributing','active','completed', null],
      default: null,
    },

    senderMeta: {
      name:        { type: String, default: null },
      email:       { type: String, default: null },
      designation: { type: String, default: null },
      ip:          { type: String, default: null },
      device:      { type: String, default: null },
      browser:     { type: String, default: null },
      city:        { type: String, default: null },
      timezone:    { type: String, default: null },
    },

    sentAt:      { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    expiresAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────
documentSchema.index({ owner: 1, isTemplate: 1, updatedAt: -1 });
documentSchema.index({ owner: 1, status: 1 });
documentSchema.index({ owner: 1, createdAt: -1 });
documentSchema.index({ 'parties.token': 1 });
documentSchema.index({ 'parties.email': 1 });
documentSchema.index({ 'parties.status': 1 });
documentSchema.index({ status: 1, createdAt: -1 });
documentSchema.index({ isTemplate: 1, owner: 1 });
documentSchema.index({ isMasterTemplate: 1 });
documentSchema.index({ masterTemplateId: 1 });
documentSchema.index({ workflowType: 1, status: 1 });

// ── Virtuals ──────────────────────────────────────────────────────
documentSchema.virtual('completionPercentage').get(function () {
  if (!this.parties?.length) return 0;
  const signed = this.parties.filter(p => p.status === 'signed').length;
  return Math.round((signed / this.parties.length) * 100);
});

documentSchema.virtual('isExpired').get(function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

// ── Methods ───────────────────────────────────────────────────────
documentSchema.methods.getNextPendingParty = function () {
  return this.parties.find(p => p.status === 'pending' || p.status === 'sent');
};
documentSchema.methods.isAllSigned = function () {
  return this.parties.every(p => p.status === 'signed');
};
documentSchema.methods.getPartyByToken = function (token) {
  return this.parties.find(p => p.token === token);
};
documentSchema.methods.getDashboardFormat = function () {
  return {
    _id:                  this._id,
    title:                this.title,
    companyName:          this.companyName,
    companyLogo:          this.companyLogo,
    status:               this.status,
    workflowType:         this.workflowType,
    totalParties:         this.parties.length,
    signedParties:        this.parties.filter(p => p.status === 'signed').length,
    completionPercentage: this.completionPercentage,
    currentPartyIndex:    this.currentPartyIndex,
    createdAt:            this.createdAt,
    completedAt:          this.completedAt,
    isTemplate:           this.isTemplate,
    isMasterTemplate:     this.isMasterTemplate,
  };
};

// ── Pre-save ──────────────────────────────────────────────────────
documentSchema.pre('save', function (next) {
  if (this.parties?.length > 0) {
    const allSigned = this.parties.every(p => p.status === 'signed');
    if (allSigned && this.status === 'in_progress') {
      this.status      = 'completed';
      this.completedAt = new Date();
    }
  }
  next();
});

module.exports = mongoose.model('Document', documentSchema);