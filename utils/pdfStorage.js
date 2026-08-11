'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

let cloudinary;
function getCloudinary() {
  if (cloudinary !== undefined) return cloudinary;
  try {
    const cld = require('cloudinary').v2;
    if (
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    ) {
      cld.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key:    process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure:     true,
      });
      cloudinary = cld;
    } else {
      cloudinary = null;
    }
  } catch {
    cloudinary = null;
  }
  return cloudinary;
}

/** Server-side Cloudinary admin download (works when public PDF delivery is blocked). */
async function fetchFromCloudinary(publicId) {
  const cld = getCloudinary();
  if (!cld || !publicId) return null;

  const id = String(publicId);
  const url = cld.utils.private_download_url(id, 'pdf', {
    resource_type: 'raw',
    type:          'upload',
  });

  const res = await fetch(url, { headers: { Accept: 'application/pdf,*/*' } });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

const PDF_DIR = path.join(__dirname, '..', 'uploads', 'pdfs');

function ensurePdfDir() {
  if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
  }
}

/** Save PDF bytes locally — returns filename stored under uploads/pdfs/ */
function savePdfBuffer(buffer, basename = '') {
  ensurePdfDir();
  const safeBase = String(basename || crypto.randomBytes(16).toString('hex'))
    .replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = `${safeBase || crypto.randomBytes(8).toString('hex')}.pdf`;
  const fullPath = path.join(PDF_DIR, filename);
  fs.writeFileSync(fullPath, buffer);
  return filename;
}

function resolveLocalPath(localPdfPath) {
  if (!localPdfPath) return null;
  const filename = path.basename(String(localPdfPath));
  const fullPath = path.join(PDF_DIR, filename);
  return fs.existsSync(fullPath) ? fullPath : null;
}

function readLocalPdf(localPdfPath) {
  const fullPath = resolveLocalPath(localPdfPath);
  if (!fullPath) return null;
  return fs.readFileSync(fullPath);
}

/**
 * Load PDF bytes for a document/template record.
 * Prefers local copy (Cloudinary raw PDFs return 401 when PDF delivery is restricted).
 */
async function getPdfBytes(record, { preferSigned = false } = {}) {
  if (!record) throw new Error('PDF record is missing.');

  if (preferSigned && record.localSignedPdfPath) {
    const signed = readLocalPdf(record.localSignedPdfPath);
    if (signed) return signed;
  }

  if (record.localPdfPath) {
    const local = readLocalPdf(record.localPdfPath);
    if (local) return local;
  }

  if (record.filePublicId) {
    const fromCloud = await fetchFromCloudinary(record.filePublicId);
    if (fromCloud) return fromCloud;
  }

  const url = preferSigned
    ? (record.signedFileUrl || record.bossSignedFileUrl || record.fileUrl)
    : (record.fileUrl || record.signedFileUrl || record.bossSignedFileUrl);

  if (!url || !String(url).startsWith('http')) {
    throw new Error('PDF file is not available. Please re-upload the document.');
  }

  const res = await fetch(url, { headers: { Accept: 'application/pdf,*/*' } });
  if (res.ok) return Buffer.from(await res.arrayBuffer());

  if (res.status === 401 && record.filePublicId) {
    const signed = await fetchFromCloudinary(record.filePublicId);
    if (signed) return signed;
  }

  if (res.status === 401) {
    throw new Error(
      'PDF delivery is blocked on Cloudinary for this account. ' +
      'Re-upload the document, or enable "Allow delivery of PDF and ZIP files" ' +
      'in Cloudinary → Settings → Security.',
    );
  }

  throw new Error(`PDF fetch failed (HTTP ${res.status}).`);
}

function sendPdf(res, buffer, title = 'document', { publicAccess = false } = {}) {
  const safeName = String(title || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${safeName}.pdf"`);
  // Wildcard ACAO breaks credentialed requests — only use for public signing proxy
  if (publicAccess) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', publicAccess ? 'private, max-age=3600' : 'private, no-store');
  return res.send(buffer);
}

module.exports = {
  savePdfBuffer,
  readLocalPdf,
  resolveLocalPath,
  getPdfBytes,
  sendPdf,
  PDF_DIR,
};
