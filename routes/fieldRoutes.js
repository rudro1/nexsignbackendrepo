'use strict';
// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 1 — Field Coordinates REST API
// Routes:
//   GET  /api/documents/:id/fields          → fetch saved fields
//   PUT  /api/documents/:id/fields          → auto-save (full replace)
//   POST /api/documents/:id/fields          → add single field
//   DELETE /api/documents/:id/fields/:fid   → remove one field
//   POST /api/documents/:id/fields/reorder  → bulk reorder (drag across pages)
// ═══════════════════════════════════════════════════════════════════════════════

const express   = require('express');
const router    = express.Router({ mergeParams: true }); // inherits :id from parent
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
}

const Document  = require('../models/Document');
const { auth }  = require('../middleware/auth');

// ── Rate limiter for auto-save (called every keystroke / drag) ────────────────
const autoSaveLimiter = rateLimit({
  windowMs:        10_000, // 10 seconds
  max:             30,     // max 30 saves per 10s per IP
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
    // Typography
    fontFamily:  f.fontFamily  || 'Helvetica',
    fontSize:    Math.min(72, Math.max(6, Number(f.fontSize) || 14)),
    fontWeight:  ['normal','bold'].includes(f.fontWeight) ? f.fontWeight : 'normal',
    color:       /^#[0-9a-fA-F]{3,8}$/.test(f.color || '') ? f.color : '#000000',
    // Field config
    required:    Boolean(f.required !== false), // default true
    locked:      Boolean(f.locked === true),
    placeholder: String(f.placeholder || '').slice(0, 100),
    label:       String(f.label       || '').slice(0, 100),
    // Party assignment
    partyIndex:  typeof f.partyIndex === 'number' ? Math.max(0, f.partyIndex) : 0,
    assignedTo:  f.assignedTo || null, // 'boss'|'employee' for templates
  };
}

// ── Helper: ownership check ───────────────────────────────────────────────────
async function getOwnedDoc(req, res) {
  const doc = await Document.findById(req.params.id).lean();
  if (!doc) {
    res.status(404).json({ success: false, message: 'Document not found.' });
    return null;
  }
  const ownerId = doc.owner || doc.createdBy;
  if (String(ownerId) !== String(req.user._id)) {
    res.status(403).json({ success: false, message: 'Access denied.' });
    return null;
  }
  return doc;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/documents/:id/fields
// Returns all saved field tags for a document
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/', auth, async (req, res) => {
  try {
    const doc = await getOwnedDoc(req, res);
    if (!doc) return;

    const fields = (doc.fields || []).map(f =>
      typeof f === 'string' ? JSON.parse(f) : f,
    );

    return res.json({
      success:    true,
      documentId: doc._id,
      fields,
      fieldCount: fields.length,
      byPage: fields.reduce((acc, f) => {
        acc[f.page] = (acc[f.page] || 0) + 1;
        return acc;
      }, {}),
    });
  } catch (e) {
    console.error('[GET fields]', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/documents/:id/fields
// Auto-save: full replace of all fields (called on drag/resize/drop)
// ═══════════════════════════════════════════════════════════════════════════════
router.put('/', auth, autoSaveLimiter, async (req, res) => {
  try {
    const doc = await getOwnedDoc(req, res);
    if (!doc) return;

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
        message: 'Maximum 200 fields per document.',
      });
    }

    // Validate all fields
    const allErrors = rawFields.flatMap((f, i) => validateField(f, i));
    if (allErrors.length) {
      return res.status(400).json({
        success: false,
        message: 'Field validation failed.',
        errors:  allErrors.slice(0, 10), // cap errors returned
      });
    }

    const sanitized = rawFields.map(sanitizeField);

    const updated = await Document.findByIdAndUpdate(
      doc._id,
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
    console.error('[PUT fields]', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/documents/:id/fields
// Add a single new field (returns the created field with server-assigned ID)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/', auth, async (req, res) => {
  try {
    const doc = await getOwnedDoc(req, res);
    if (!doc) return;

    const existing = (doc.fields || []);
    if (existing.length >= 200) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 200 fields per document.',
      });
    }

    const errors = validateField(req.body, 0);
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors[0] });
    }

    const newField = sanitizeField(req.body);

    await Document.findByIdAndUpdate(doc._id, {
      $push: { fields: newField },
      $set:  { updatedAt: new Date() },
    });

    return res.status(201).json({ success: true, field: newField });
  } catch (e) {
    console.error('[POST fields]', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/documents/:id/fields/:fid
// Remove one field by its client-assigned ID
// ═══════════════════════════════════════════════════════════════════════════════
router.delete('/:fid', auth, async (req, res) => {
  try {
    const doc = await getOwnedDoc(req, res);
    if (!doc) return;

    const before = (doc.fields || []).length;
    await Document.findByIdAndUpdate(doc._id, {
      $pull: { fields: { id: req.params.fid } },
      $set:  { updatedAt: new Date() },
    });
    const after = (await Document.findById(doc._id).select('fields').lean()).fields.length;

    if (after === before) {
      return res.status(404).json({ success: false, message: 'Field not found.' });
    }

    return res.json({ success: true, message: 'Field removed.', removedId: req.params.fid });
  } catch (e) {
    console.error('[DELETE field]', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/documents/:id/fields/reorder
// Bulk reorder (client sends full ordered array of field IDs)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/reorder', auth, async (req, res) => {
  try {
    const doc = await getOwnedDoc(req, res);
    if (!doc) return;

    const { order } = req.body; // array of field IDs in new order
    if (!Array.isArray(order)) {
      return res.status(400).json({ success: false, message: '`order` must be an array of field IDs.' });
    }

    const fieldMap = new Map(
      (doc.fields || []).map(f => [f.id, f]),
    );

    const reordered = order
      .filter(id => fieldMap.has(id))
      .map(id => fieldMap.get(id));

    // Append any fields not in the order array (safety net)
    const inOrder = new Set(order);
    (doc.fields || []).forEach(f => {
      if (!inOrder.has(f.id)) reordered.push(f);
    });

    await Document.findByIdAndUpdate(doc._id, {
      $set: { fields: reordered, updatedAt: new Date() },
    });

    return res.json({ success: true, message: 'Fields reordered.', fieldCount: reordered.length });
  } catch (e) {
    console.error('[POST fields/reorder]', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
