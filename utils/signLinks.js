'use strict';

const crypto = require('crypto');

function slugifyTitle(title) {
  const base = String(title || 'document')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return base || 'document';
}

function generateSignCode() {
  return crypto.randomBytes(6).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
}

/** Unique public slug for pretty signing URLs */
async function ensurePublicSlug(Model, doc, title) {
  if (doc.publicSlug) return doc.publicSlug;

  const base = slugifyTitle(title || doc.title);
  let slug = base;
  let n = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await Model.exists({
      publicSlug: slug,
      _id:        { $ne: doc._id },
    });
    if (!exists) break;
    n += 1;
    slug = `${base}-${n}`;
  }

  doc.publicSlug = slug;
  return slug;
}

function ensurePartySignCode(party) {
  if (party.signCode) return party.signCode;
  party.signCode = generateSignCode();
  return party.signCode;
}

module.exports = {
  slugifyTitle,
  generateSignCode,
  ensurePublicSlug,
  ensurePartySignCode,
};
