'use strict';

const mongoose = require('mongoose');

const RecipientSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, lowercase: true, trim: true },
  designation: { type: String, default: '' },
}, { _id: false });

const CCSchema = new mongoose.Schema({
  name:        { type: String, default: '' },
  email:       { type: String, required: true, lowercase: true, trim: true },
  designation: { type: String, default: '' },
}, { _id: false });

const ApproverSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, lowercase: true, trim: true },
  designation: { type: String, default: '' },
  order:       { type: Number, default: 0 },
  token:       { type: String, required: true, index: true },
  status:      {
    type:    String,
    enum:    ['pending', 'approved', 'declined'],
    default: 'pending',
  },
  approvedAt:  { type: Date, default: null },
  declineReason: { type: String, default: '' },
  note:        { type: String, default: '' },
}, { _id: false });

const BossSignatureSchema = new mongoose.Schema({
  signatureImageUrl: { type: String, default: null },
  signedAt:          { type: Date,   default: null },
  ipAddress:         { type: String, default: '' },
  city:              { type: String, default: '' },
  country:           { type: String, default: '' },
  device:            { type: String, default: '' },
  browser:           { type: String, default: '' },
  os:                { type: String, default: '' },
}, { _id: false });

const FieldSchema = new mongoose.Schema({
  id:         { type: String, required: true },
  type:       { type: String, required: true },
  page:       { type: Number, default: 1 },
  x:          { type: Number, default: 0 },
  y:          { type: Number, default: 0 },
  width:      { type: Number, default: 0 },
  height:     { type: Number, default: 0 },
  assignedTo: { type: String, enum: ['boss', 'employee'], default: 'employee' },
  required:   { type: Boolean, default: true },
  label:      { type: String, default: '' },
}, { _id: false });

const TemplateCampaignSchema = new mongoose.Schema({
  sourceTemplateId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Template',
    required: true,
    index:    true,
  },
  owner: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },
  title: { type: String, required: true, trim: true },

  // Snapshot from master template
  fileUrl:          { type: String, required: true },
  filePublicId:     { type: String, default: '' },
  localPdfPath:     { type: String, default: null },
  localBossSignedPdfPath: { type: String, default: null },
  fields:           { type: [FieldSchema], default: [] },
  totalPages:       { type: Number, default: 1 },
  companyName:      { type: String, default: '' },
  companyLogo:      { type: String, default: '' },
  emailHeaderColor: { type: String, default: '#0f172a' },
  message:          { type: String, default: '' },
  useCustomEmailBody: { type: Boolean, default: false },
  customEmailBody:    { type: String, default: '' },
  customEmailSubject: { type: String, default: '' },
  signingConfig: {
    expiryDays:   { type: Number, default: 30 },
    allowDecline: { type: Boolean, default: true },
  },

  recipients: { type: [RecipientSchema], default: [] },
  ccList:     { type: [CCSchema], default: [] },

  // Boss step
  bossSignMode: {
    type:    String,
    enum:    ['reuse', 'new'],
    default: 'reuse',
  },
  boss: {
    name:        { type: String, default: '' },
    email:       { type: String, default: '' },
    designation: { type: String, default: '' },
  },
  bossToken: { type: String, default: null, sparse: true, index: true },
  bossSignature:     { type: BossSignatureSchema, default: null },
  bossSignedFileUrl: { type: String, default: null },

  // Sequential approvers (CEO → HR → …) before employee blast
  approvers:             { type: [ApproverSchema], default: [] },
  currentApproverIndex:  { type: Number, default: -1 },

  status: {
    type:    String,
    enum:    ['boss_pending', 'approver_pending', 'active', 'completed', 'cancelled'],
    default: 'boss_pending',
    index:   true,
  },

  stats: {
    totalRecipients: { type: Number, default: 0 },
    signed:          { type: Number, default: 0 },
    pending:         { type: Number, default: 0 },
    declined:        { type: Number, default: 0 },
  },

  sentAt:      { type: Date, default: null },
  completedAt: { type: Date, default: null },
  isDeleted:   { type: Boolean, default: false },
}, {
  timestamps: true,
});

TemplateCampaignSchema.index({ owner: 1, sourceTemplateId: 1, createdAt: -1 });

TemplateCampaignSchema.pre('save', function (next) {
  if (this.isModified('recipients')) {
    this.stats.totalRecipients = this.recipients.length;
    this.stats.pending = this.recipients.length;
  }
  next();
});

module.exports = mongoose.model('TemplateCampaign', TemplateCampaignSchema);
