const mongoose = require('mongoose');

// ── Device Info Sub-Schema ────────────────────────────────
const deviceSchema = new mongoose.Schema(
  {
    raw: {
      type: String,
      default: null,
      select: false, // raw user agent বাইরে যাবে না
    },
    device_name: {
      type: String,
      default: null, // "iPhone 6", "Samsung Galaxy S23"
    },
    device_type: {
      type: String,
      enum: ['mobile', 'tablet', 'desktop', 'unknown'],
      default: 'unknown',
    },
    browser: {
      type: String,
      default: null, // "Safari 17", "Chrome 120"
    },
    browser_version: {
      type: String,
      default: null,
    },
    os: {
      type: String,
      default: null, // "iOS 12.5", "Android 13", "Windows 11"
    },
    os_version: {
      type: String,
      default: null,
    },
    vendor: {
      type: String,
      default: null, // "Apple", "Samsung"
    },
  },
  { _id: false }
);

// ── Location Sub-Schema ───────────────────────────────────
const locationSchema = new mongoose.Schema(
  {
    ip_address: {
      type: String,
      default: null,
      maxlength: 45,
    },
    city: {
      type: String,
      default: null, // "Rajshahi"
    },
    region: {
      type: String,
      default: null, // "Rajshahi Division"
    },
    region_code: {
      type: String,
      default: null,
    },
    country: {
      type: String,
      default: null, // "Bangladesh"
    },
    country_code: {
      type: String,
      default: null, // "BD"
    },
    postal_code: {
      type: String,
      default: null, // "6400"
    },
    timezone: {
      type: String,
      default: null, // "Asia/Dhaka"
    },
    utc_offset: {
      type: String,
      default: null, // "+0600"
    },
    latitude: {
      type: String,
      default: null,
    },
    longitude: {
      type: String,
      default: null,
    },
    isp: {
      type: String,
      default: null, // Internet Service Provider
    },
    display: {
      type: String,
      default: null, // "Rajshahi, BD - 6400" (formatted)
    },
  },
  { _id: false }
);

// ── Performed By Sub-Schema ───────────────────────────────
const performedBySchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    designation: {
      type: String,
      trim: true,
      default: null, // "Managing Director", "CEO"
    },
    role: {
      type: String,
      enum: [
        'owner',
        'signer',
        'boss',
        'employee',
        'cc',
        'admin',
        'super_admin',
        'system',
      ],
      default: 'signer',
    },
    party_index: {
      type: Number,
      default: null, // কততম party
    },
    party_color: {
      type: String,
      default: null, // Party color for UI
    },
  },
  { _id: false }
);

// ── CC Info Sub-Schema ────────────────────────────────────
const ccInfoSchema = new mongoose.Schema(
  {
    name: { type: String, default: null },
    email: { type: String, default: null },
    designation: { type: String, default: null },
    notified_at: { type: Date, default: null },
  },
  { _id: false }
);

// ── Main AuditLog Schema ──────────────────────────────────
const auditLogSchema = new mongoose.Schema(
  {
    // ── Document Reference ──────────────────────────────
  document_id: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Document',
  default: null,
  index: true,
},
    document_title: {
      type: String,
      maxlength: 200,
      default: null,
    },
    document_status: {
      type: String,
      default: null,
    },
    company_name: {
      type: String,
      default: null,
    },

    // ── Template Reference (Module 2) ───────────────────
    // FIX: was ref: 'Document' — wrong collection; template_id must ref 'Template'
    template_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Template',
      default: null,
      index: true,
    },
    session_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null, // Template session ID
    },
    is_template_action: {
      type: Boolean,
      default: false,
    },

    // ── Action ──────────────────────────────────────────
    action: {
      type: String,
      enum: [
        // Document actions
        'created',
        'draft_saved',
        'sent',
        'resent',
        // Email tracking
        'email_sent',
        'email_opened',
        'link_clicked',
        // Signing actions
        'viewed',
        'signed',
        'declined',
        // Document lifecycle
        'completed',
        'cancelled',
        'expired',
        'deleted',
        'restored',
        // Admin actions
        'admin_deleted',
        'admin_viewed',
        // File actions
        'downloaded',
        'pdf_generated',
        // Template actions
        'template_created',
        'boss_signed',
        'bulk_sent',
        'employee_signed',
        'template_completed',
        // CC actions
        'cc_notified',
        'cc_final_sent',
         'boss_signed_template',
        'employee_signed_template',
      ],
      required: true,
      index: true,
    },

    // ── Who performed ───────────────────────────────────
    performed_by: {
      type: performedBySchema,
      default: {},
    },

    // ── Device Info ─────────────────────────────────────
    device: {
      type: deviceSchema,
      default: {},
    },

    // ── Location Info ────────────────────────────────────
    location: {
      type: locationSchema,
      default: {},
    },

    // ── Time Info ────────────────────────────────────────
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    local_time: {
      type: String,
      default: null, // "2:30 PM" (signer এর local time)
    },
    local_date: {
      type: String,
      default: null, // "15 Jan 2025"
    },
    local_datetime_display: {
      type: String,
      default: null, // "15 Jan 2025, 2:30 PM (BST+6)"
    },

    // ── CC List Snapshot ─────────────────────────────────
    cc_list: {
      type: [ccInfoSchema],
      default: [],
    },

    // ── Extra Details ────────────────────────────────────
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      // যেকোনো extra info store করার জন্য
      // e.g: { field_count: 5, pages_signed: [1,2] }
    },

    // ── Signature Snapshot ───────────────────────────────
    signature_image: {
      type: String,
      default: null, // Base64 or Cloudinary URL
      select: false,
    },

    // ── Status at time of action ──────────────────────────
    status_before: {
      type: String,
      default: null,
    },
    status_after: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes (Performance) ─────────────────────────────────
auditLogSchema.index({ document_id: 1, timestamp: -1 });
auditLogSchema.index({ document_id: 1, action: 1 });
auditLogSchema.index({ 'performed_by.email': 1 });
auditLogSchema.index({ 'performed_by.role': 1 });
auditLogSchema.index({ template_id: 1, timestamp: -1 });
auditLogSchema.index({ session_id: 1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ is_template_action: 1 });
auditLogSchema.index({ createdAt: -1 });

// ── TTL Index (Auto Cleanup - 2 Years) ────────────────────
auditLogSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 63072000 }
);

// ── Static: Create Log Helper ─────────────────────────────
auditLogSchema.statics.createLog = async function ({
  document_id,
  document_title = null,
  document_status = null,
  company_name = null,
  template_id = null,
  session_id = null,
  is_template_action = false,
  action,
  performed_by = {},
  device = {},
  location = {},
  local_time = null,
  local_date = null,
  local_datetime_display = null,
  cc_list = [],
  details = {},
  status_before = null,
  status_after = null,
}) {
  try {
    const log = await this.create({
      document_id,
      document_title,
      document_status,
      company_name,
      template_id,
      session_id,
      is_template_action,
      action,
      performed_by,
      device,
      location,
      local_time,
      local_date,
      local_datetime_display,
      cc_list,
      details,
      status_before,
      status_after,
      timestamp: new Date(),
    });
    return log;
  } catch (error) {
    // Log creation fail হলে main flow block করব না
    console.error('AuditLog creation failed:', error.message);
    return null;
  }
};

// ── Static: Get Document Timeline ────────────────────────
auditLogSchema.statics.getDocumentTimeline = function (document_id) {
  return this.find({ document_id })
    .sort({ timestamp: 1 })
    .select('-signature_image -device.raw')
    .lean();
};

// ── Static: Get Signing Summary ───────────────────────────
auditLogSchema.statics.getSigningSummary = function (document_id) {
  return this.find({
    document_id,
    action: { $in: ['signed', 'boss_signed', 'employee_signed'] },
  })
    .sort({ timestamp: 1 })
    .select('performed_by device location local_datetime_display action')
    .lean();
};

// ── Virtual: Formatted Display ────────────────────────────
auditLogSchema.virtual('display_text').get(function () {
  const actionMap = {
    created: 'Document Created',
    sent: 'Sent for Signing',
    email_opened: 'Email Opened',
    link_clicked: 'Link Clicked',
    viewed: 'Document Viewed',
    signed: 'Document Signed',
    declined: 'Document Declined',
    completed: 'Document Completed',
    boss_signed: 'Approved by Boss',
    bulk_sent: 'Sent to All Employees',
    employee_signed: 'Signed by Employee',
    cc_notified: 'CC Notified',
    downloaded: 'PDF Downloaded',
  };
  return actionMap[this.action] || this.action;
});

module.exports = mongoose.model('AuditLog', auditLogSchema);