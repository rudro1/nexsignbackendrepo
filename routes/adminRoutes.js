'use strict';

const express   = require('express');
const router    = express.Router();
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { v2: cloudinary } = require('cloudinary');

const User      = require('../models/User');
const Document  = require('../models/Document');
const AuditLog  = require('../models/AuditLog');

const { auth }                    = require('../middleware/auth');
const { adminAuth, superAdminOnly } = require('../middleware/adminAuth');

// ═══════════════════════════════════════════════════════════════
// RATE LIMITER
// ═══════════════════════════════════════════════════════════════
const adminLimiter = rateLimit({
  windowMs:        60 * 60 * 1000, // 1 hour
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator: (req) =>
    ipKeyGenerator(
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
    ),
  message: {
    success: false,
    code:    'RATE_LIMITED',
    message: 'Too many admin actions. Please try again later.',
  },
});

// All admin routes → auth + adminAuth + rate limit
router.use(auth, adminAuth, adminLimiter);

// ═══════════════════════════════════════════════════════════════
// 1. DASHBOARD STATS
// GET /api/admin/stats
// ═══════════════════════════════════════════════════════════════
router.get('/stats', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersThisMonth,
      totalDocs,
      inProgressDocs,
      completedDocs,
      draftDocs,
      totalAuditLogs,
      recentActivity,
    ] = await Promise.all([
      User.countDocuments({ is_active: true }),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Document.countDocuments({ isTemplate: false }),
      Document.countDocuments({ isTemplate: false, status: 'in_progress' }),
      Document.countDocuments({ isTemplate: false, status: 'completed' }),
      Document.countDocuments({ isTemplate: false, status: 'draft' }),
      AuditLog.countDocuments(),
      AuditLog.countDocuments({ timestamp: { $gte: thirtyDaysAgo } }),
    ]);

    return res.json({
      success: true,
      stats: {
        users: {
          total:        totalUsers,
          newThisMonth: newUsersThisMonth,
        },
        documents: {
          total:      totalDocs,
          inProgress: inProgressDocs,
          completed:  completedDocs,
          draft:      draftDocs,
        },
        auditLogs: {
          total:          totalAuditLogs,
          recentActivity,
        },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[admin/stats]', err.message);
    return res.status(500).json({
      success: false, message: 'Failed to fetch stats.',
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 2. USER LIST
// GET /api/admin/users
// ═══════════════════════════════════════════════════════════════
router.get('/users', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;
    const search = req.query.search?.trim() || '';
    const role   = req.query.role || '';

    // Build query
    const query = {};
    if (search) {
      query.$or = [
        { full_name: { $regex: search, $options: 'i' } },
        { email:     { $regex: search, $options: 'i' } },
      ];
    }
    if (role) query.role = role;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -email_verification_token -password_reset_token')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    return res.json({
      success: true,
      users:   users || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[admin/users]', err.message);
    return res.status(500).json({
      success: false, message: 'Failed to fetch users.',
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 3. SINGLE USER DETAIL
// GET /api/admin/users/:id
// ═══════════════════════════════════════════════════════════════
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -email_verification_token -password_reset_token')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false, message: 'User not found.',
      });
    }

    // Get user's document stats
    const [totalDocs, completedDocs, pendingDocs] = await Promise.all([
      Document.countDocuments({ owner: user._id, isTemplate: false }),
      Document.countDocuments({ owner: user._id, status: 'completed' }),
      Document.countDocuments({ owner: user._id, status: 'in_progress' }),
    ]);

    return res.json({
      success: true,
      user: {
        ...user,
        documentStats: {
          total:     totalDocs,
          completed: completedDocs,
          pending:   pendingDocs,
        },
      },
    });
  } catch (err) {
    console.error('[admin/users/:id]', err.message);
    return res.status(500).json({
      success: false, message: 'Failed to fetch user.',
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 4. UPDATE USER ROLE
// PUT /api/admin/users/:id/role
// ═══════════════════════════════════════════════════════════════
router.put('/users/:id/role', superAdminOnly, async (req, res) => {
  try {
    const { role } = req.body;
    const validRoles = ['user', 'admin', 'super_admin'];

    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false, message: `Invalid role. Valid: ${validRoles.join(', ')}`,
      });
    }

    if (req.params.id === req.user.id) {
      return res.status(400).json({
        success: false, message: 'Cannot change own role.',
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { role } },
      { new: true },
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false, message: 'User not found.',
      });
    }

    await AuditLog.createLog({
      document_id:  null,
      action:       'admin_viewed',
      performed_by: {
        user_id:     req.user._id,
        name:        req.user.full_name,
        email:       req.user.email,
        designation: req.user.designation,
        role:        req.user.role,
      },
      details: {
        action_type: 'role_updated',
        target_user: user.email,
        new_role:    role,
      },
    });

    return res.json({
      success: true,
      message: `Role updated to ${role}.`,
      user,
    });
  } catch (err) {
    console.error('[admin/users/:id/role]', err.message);
    return res.status(500).json({
      success: false, message: 'Role update failed.',
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 5. TOGGLE USER STATUS (Enable/Disable)
// PUT /api/admin/users/:id/toggle-status
// ═══════════════════════════════════════════════════════════════
router.put('/users/:id/toggle-status', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('role is_active email');

    if (!user) {
      return res.status(404).json({
        success: false, message: 'User not found.',
      });
    }

    if (user.role === 'super_admin') {
      return res.status(403).json({
        success: false, message: 'Cannot disable super admin.',
      });
    }

    if (String(user._id) === req.user.id) {
      return res.status(400).json({
        success: false, message: 'Cannot disable own account.',
      });
    }

    user.is_active = !user.is_active;
    await user.save();

    await AuditLog.createLog({
      document_id:  null,
      action:       'admin_viewed',
      performed_by: {
        user_id: req.user._id,
        name:    req.user.full_name,
        email:   req.user.email,
        role:    req.user.role,
      },
      details: {
        action_type: user.is_active ? 'user_enabled' : 'user_disabled',
        target_user: user.email,
      },
    });

    return res.json({
      success:   true,
      message:   `User ${user.is_active ? 'enabled' : 'disabled'} successfully.`,
      is_active: user.is_active,
    });
  } catch (err) {
    console.error('[admin/users/:id/toggle-status]', err.message);
    return res.status(500).json({
      success: false, message: 'Status update failed.',
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 6. DELETE USER
// DELETE /api/admin/users/:id
// ═══════════════════════════════════════════════════════════════
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false, message: 'Cannot delete own account.',
      });
    }

    const user = await User.findById(userId).select('role email full_name');
    if (!user) {
      return res.status(404).json({
        success: false, message: 'User not found.',
      });
    }

    if (user.role === 'super_admin') {
      return res.status(403).json({
        success: false, message: 'Super admin cannot be deleted.',
      });
    }

    // Get user's documents for Cloudinary cleanup
    const userDocs = await Document.find({ owner: userId })
      .select('fileId signedFileId')
      .lean();

    // Delete Cloudinary files (non-blocking)
    const cloudinaryDeletes = userDocs
      .flatMap(d => [d.fileId, d.signedFileId].filter(Boolean))
      .map(id =>
        cloudinary.uploader
          .destroy(id, { resource_type: 'raw' })
          .catch(() => {}),
      );

    await Promise.all([
      ...cloudinaryDeletes,
      Document.deleteMany({ owner: userId }),
      AuditLog.deleteMany({ 'performed_by.user_id': userId }),
      User.findByIdAndDelete(userId),
    ]);

    await AuditLog.createLog({
      document_id:  null,
      action:       'admin_deleted',
      performed_by: {
        user_id:     req.user._id,
        name:        req.user.full_name,
        email:       req.user.email,
        designation: req.user.designation,
        role:        req.user.role,
      },
      details: {
        deleted_user_id:    userId,
        deleted_user_email: user.email,
        deleted_user_name:  user.full_name,
        documents_deleted:  userDocs.length,
      },
    });

    return res.json({
      success: true,
      message: `User "${user.full_name}" and all associated data deleted.`,
    });
  } catch (err) {
    console.error('[admin/users/:id DELETE]', err.message);
    return res.status(500).json({
      success: false, message: 'Deletion failed.',
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 7. ALL DOCUMENTS
// GET /api/admin/documents
// ═══════════════════════════════════════════════════════════════
router.get('/documents', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;
    const search = req.query.search?.trim() || '';
    const status = req.query.status || '';

    const query = {};
    if (search) query.title = { $regex: search, $options: 'i' };
    if (status) query.status = status;

    const [documents, total] = await Promise.all([
      Document.find(query)
        .populate('owner', 'full_name email company_name designation')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-fields') // fields heavy → dashboard এ দরকার নেই
        .lean(),
      Document.countDocuments(query),
    ]);

    const sanitized = documents.map(doc => ({
      ...doc,
      owner: doc.owner || {
        full_name:    'Deleted User',
        email:        'N/A',
        company_name: 'N/A',
        designation:  'N/A',
      },
      // Audit summary per document
      auditSummary: {
        totalParties:  doc.parties?.length || 0,
        signedParties: doc.parties?.filter(p => p.status === 'signed').length || 0,
        ccCount:       doc.ccList?.length || 0,
        parties: doc.parties?.map(p => ({
          name:        p.name,
          email:       p.email,
          designation: p.designation,
          status:      p.status,
          signedAt:    p.signedAt,
          device:      p.device,
          location:    p.city
            ? `${p.city}, ${p.country} - ${p.postalCode}`
            : null,
        })) || [],
        ccList: doc.ccList?.map(cc => ({
          name:        cc.name,
          email:       cc.email,
          designation: cc.designation,
        })) || [],
      },
    }));

    return res.json({
      success:   true,
      documents: sanitized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[admin/documents]', err.message);
    return res.status(500).json({
      success: false, message: 'Failed to fetch documents.',
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 8. DELETE DOCUMENT (Admin)
// DELETE /api/admin/documents/:id
// ═══════════════════════════════════════════════════════════════
router.delete('/documents/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id)
      .select('title fileId signedFileId owner');

    if (!doc) {
      return res.status(404).json({
        success: false, message: 'Document not found.',
      });
    }

    // Cloudinary cleanup
    const toDelete = [doc.fileId, doc.signedFileId].filter(Boolean);
    await Promise.all(
      toDelete.map(id =>
        cloudinary.uploader
          .destroy(id, { resource_type: 'raw' })
          .catch(() => {}),
      ),
    );

    await Promise.all([
      Document.findByIdAndDelete(doc._id),
      AuditLog.deleteMany({ document_id: doc._id }),
    ]);

    await AuditLog.createLog({
      document_id:    doc._id,
      document_title: doc.title,
      action:         'admin_deleted',
      performed_by: {
        user_id:     req.user._id,
        name:        req.user.full_name,
        email:       req.user.email,
        designation: req.user.designation,
        role:        req.user.role,
      },
      details: { deleted_doc_title: doc.title },
    });

    return res.json({
      success: true,
      message: `Document "${doc.title}" deleted.`,
    });
  } catch (err) {
    console.error('[admin/documents/:id DELETE]', err.message);
    return res.status(500).json({
      success: false, message: 'Document deletion failed.',
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 9. AUDIT LOGS
// GET /api/admin/audit-logs
// ═══════════════════════════════════════════════════════════════
router.get('/audit-logs', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;
    const action = req.query.action || '';
    const days   = Math.min(365, parseInt(req.query.days) || 30);
    const search = req.query.search?.trim() || '';

    const query = {
      timestamp: {
        $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      },
    };
    if (action) query.action = action;
    if (search) {
      query.$or = [
        { 'performed_by.email': { $regex: search, $options: 'i' } },
        { 'performed_by.name':  { $regex: search, $options: 'i' } },
        { document_title:       { $regex: search, $options: 'i' } },
      ];
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate({
          path:   'document_id',
          select: 'title status companyName',
          model:  'Document',
        })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .select('-signature_image -device.raw')
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    const sanitized = logs.map(log => ({
      ...log,
      document_id: log.document_id || { title: 'Deleted Document' },
      // Format location display
      locationDisplay: log.location?.display ||
        [log.location?.city, log.location?.country, log.location?.postal_code]
          .filter(Boolean).join(', ') ||
        'Unknown',
      // Device display
      deviceDisplay: [
        log.device?.device_name,
        log.device?.browser,
        log.device?.os,
      ].filter(Boolean).join(' · ') || 'Unknown',
    }));

    return res.json({
      success: true,
      logs:    sanitized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[admin/audit-logs]', err.message);
    return res.status(500).json({
      success: false, message: 'Failed to fetch audit logs.',
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 10. HEALTH CHECK
// GET /api/admin/health
// ═══════════════════════════════════════════════════════════════
router.get('/health', (req, res) => {
  return res.json({
    success:   true,
    status:    'Admin service OK',
    admin:     req.user.email,
    role:      req.user.role,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;