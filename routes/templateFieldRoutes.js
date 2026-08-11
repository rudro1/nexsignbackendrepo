'use strict';
// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 1 — Template Field Coordinates REST API
// Mirrors fieldRoutes.js but targets Template model instead of Document.
// Routes (mounted at /api/templates/:id/fields — inherits :id via mergeParams):
//   GET    /                         → fetch saved fields
//   PUT    /                         → auto-save (full replace), rate-limited
//   POST   /                         → add single field
//   DELETE /:fid                     → remove one field by .id
//   POST   /reorder                  → bulk reorder
// ═══════════════════════════════════════════════════════════════════════════════

const express   = require('express');
const router    = express.Router({ mergeParams: true });
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
}

const Template  = require('../models/Template');
const { auth }  = require('../middleware/auth');

// ── Rate limiter for auto-save (called every keystroke / drag) ────────────────
const autoSaveLimiter = rateLimit({
  windowMs:        10_000,
  max:             30,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator: (req) =>
    `${ipKeyGenerator(clientIp(req))}:${req.user?._id || 'anon'}`,
  message: { success: false, code: 'RATE_LIMITED', message: 'Auto-save throttled.' },
});

// ── Field schema validator ────────────────────────────────────────────────────
const VALID_TYPES = new Set([
  'signature', 'initial', 'date', 'text', 'checkbox', 'number',
]);
const VALID_ASSIGNEE = new Set(['boss', 'employee', null, undefined]);

function validateField(f, idx) {
  const errors = [];
  if (!f.id || typeof f.id !== 'string')
    errors.push(`fields[${idx}].id must be a non-empty string`);
  if (!VALID_TYPES.has(f.type))
    errors.push(`fields[${idx}].type must be one of: ${[...VALID_TYPES].join(', ')}`);
  if (typeof f.page !== 'number' || f.page < 1)
    errors.push(`fields[${idx}].page must be a positive integer`);
  if (typeof f.x !== 'number' || f.x < 0 || f.x > 100)
    errors.push(`fields[${idx}].x must be 0–100 (percentage)`);
  if (typeof f.y !== 'number' || f.y < 0 || f.y > 100)
    errors.push(`fields[${idx}].y must be 0–100 (percentage)`);
  if (typeof f.width !== 'number' || f.width <= 0 || f.width > 100)
    errors.push(`fields[${idx}].width must be > 0 and ≤ 100`);
  if (typeof f.height !== 'number' || f.height <= 0 || f.height > 100)
    errors.push(`fields[${idx}].height must be > 0 and ≤ 100`);
  if (!VALID_ASSIGNEE.has(f.assignedTo) && f.assignedTo !== undefined)
    errors.push(`fields[${idx}].assignedTo must be 'boss' or 'employee'`);
  return errors;
}

function sanitizeField(f) {
  return {
    id:          String(f.id).slice(0, 64),
    type:        f.type,
    page:        Math.max(1, Math.round(Number(f.page))),
    x:           Math.min(100, Math.max(0, Number(f.x))),
    y:           Math.min(100, Math.max(0, Number(f.y))),
    width:       Math.min(100, Math.max(0.5, Number(f.width))),
    height:      Math.min(100, Math.max(0.5, Number(f.height))),
    fontFamily:  f.fontFamily  || 'Helvetica',
    fontSize:    Math.min(72, Math.max(6, Number(f.fontSize) || 14)),
    fontWeight:  ['normal','bold'].includes(f.fontWeight) ? f.fontWeight : 'normal',
    color:       /^#[0-9a-fA-F]{3,8}$/.test(f.color || '') ? f.color : '#000000',
    required:    Boolean(f.required !== false),
    locked:      Boolean(f.locked === true),
    placeholder: String(f.placeholder || '').slice(0, 100),
    label:       String(f.label       || '').slice(0, 100),
    assignedTo:  VALID_ASSIGNEE.has(f.assignedTo) ? (f.assignedTo || 'employee') : 'employee',
    value:       f.value ?? null,
    filledAt:    f.filledAt ?? null,
  };
}

// ── Helper: ownership check ───────────────────────────────────────────────────
async function getOwnedTemplate(req, res) {
  const tpl = await Template.findOne({
    _id:       req.params.id,
    isDeleted: { $ne: true },
  }).lean();
  if (!tpl) {
    res.status(404).json({ success: false, message: 'Template not found.' });
    return null;
  }
  const ownerId = tpl.owner || tpl.createdBy;
  const isOwner = ownerId && String(ownerId) === String(req.user._id);
  const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
  if (!isOwner && !isAdmin) {
    res.status(403).json({ success: false, message: 'Access denied.' });
    return null;
  }
  return tpl;
}

// GET /
router.get('/', auth, async (req, res) => {
  try {
    const tpl = await getOwnedTemplate(req, res);
    if (!tpl) return;
    const fields = (tpl.fields || []).map(f =>
      typeof f === 'string' ? JSON.parse(f) : f,
    );
    return res.json({
      success:     true,
      templateId:  tpl._id,
      fields,
      fieldCount:  fields.length,
      byPage: fields.reduce((acc, f) => {
        acc[f.page] = (acc[f.page] || 0) + 1;
        return acc;
      }, {}),
    });
  } catch (e) {
    console.error('[GET template/fields]', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

// PUT / — auto-save full replace
router.put('/', auth, autoSaveLimiter, async (req, res) => {
  try {
    const tpl = await getOwnedTemplate(req, res);
    if (!tpl) return;

    const rawFields = req.body.fields;
    if (!Array.isArray(rawFields)) {
      return res.status(400).json({
        success: false,
        message: '`fields` must be an array.',
      });
    }
    if (rawFields.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 200 fields per template.',
      });
    }

    const allErrors = rawFields.flatMap((f, i) => validateField(f, i));
    if (allErrors.length) {
      return res.status(400).json({
        success: false,
        message: 'Field validation failed.',
        errors:  allErrors.slice(0, 10),
      });
    }

    const sanitized = rawFields.map(sanitizeField);

    const updated = await Template.findByIdAndUpdate(
      tpl._id,
      { $set: { fields: sanitized, updatedAt: new Date() } },
      { new: true, select: 'fields updatedAt' },
    ).lean();

    return res.json({
      success:    true,
      message:    'Fields auto-saved.',
      fieldCount: updated.fields.length,
      savedAt:    updated.updatedAt,
    });
  } catch (e) {
    console.error('[PUT template/fields]', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

// POST / — single field create
router.post('/', auth, async (req, res) => {
  try {
    const tpl = await getOwnedTemplate(req, res);
    if (!tpl) return;

    const existing = (tpl.fields || []);
    if (existing.length >= 200) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 200 fields per template.',
      });
    }

    const errors = validateField(req.body, 0);
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors[0] });
    }

    const newField = sanitizeField(req.body);

    await Template.findByIdAndUpdate(tpl._id, {
      $push: { fields: newField },
      $set:  { updatedAt: new Date() },
    });

    return res.status(201).json({ success: true, field: newField });
  } catch (e) {
    console.error('[POST template/fields]', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /:fid
router.delete('/:fid', auth, async (req, res) => {
  try {
    const tpl = await getOwnedTemplate(req, res);
    if (!tpl) return;

    const before = (tpl.fields || []).length;
    await Template.findByIdAndUpdate(tpl._id, {
      $pull: { fields: { id: req.params.fid } },
      $set:  { updatedAt: new Date() },
    });
    const after = (await Template.findById(tpl._id).select('fields').lean()).fields.length;

    if (after === before) {
      return res.status(404).json({ success: false, message: 'Field not found.' });
    }

    return res.json({ success: true, message: 'Field removed.', removedId: req.params.fid });
  } catch (e) {
    console.error('[DELETE template/fields]', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

// POST /reorder
router.post('/reorder', auth, async (req, res) => {
  try {
    const tpl = await getOwnedTemplate(req, res);
    if (!tpl) return;

    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ success: false, message: '`order` must be an array of field IDs.' });
    }

    const fieldMap = new Map((tpl.fields || []).map(f => [f.id, f]));
    const reordered = order
      .filter(id => fieldMap.has(id))
      .map(id => fieldMap.get(id));

    const inOrder = new Set(order);
    (tpl.fields || []).forEach(f => {
      if (!inOrder.has(f.id)) reordered.push(f);
    });

    await Template.findByIdAndUpdate(tpl._id, {
      $set: { fields: reordered, updatedAt: new Date() },
    });

    return res.json({ success: true, message: 'Fields reordered.', fieldCount: reordered.length });
  } catch (e) {
    console.error('[POST template/fields/reorder]', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
