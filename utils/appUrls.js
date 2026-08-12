'use strict';

/**
 * Central frontend URL + email link builders.
 * All signing/approval emails must use `links.*` — never hardcode FRONTEND_URL.
 */

const PRODUCTION_FRONTEND_DEFAULT = 'https://nexsignfrontend.vercel.app';
const LOCAL_FRONTEND_DEFAULT = 'http://127.0.0.1:5174';

function stripTrailingSlash(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function normalizeFrontendBase(raw) {
  let base = stripTrailingSlash(raw);
  if (!base) return '';
  // Common misconfig: FRONTEND_URL=https://api.example.com/api
  base = base.replace(/\/api$/i, '');
  return base;
}

function isProduction() {
  return process.env.NODE_ENV === 'production'
    || !!process.env.VERCEL
    || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

function resolveFrontendUrl() {
  const candidates = [
    process.env.FRONTEND_URL,
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]
    .map(normalizeFrontendBase)
    .filter(Boolean);

  let url = candidates[0] || '';

  if (!url) {
    url = isProduction() ? PRODUCTION_FRONTEND_DEFAULT : LOCAL_FRONTEND_DEFAULT;
  }

  if (isProduction() && /localhost|127\.0\.0\.1/i.test(url)) {
    console.warn(
      `[appUrls] FRONTEND_URL points to localhost in production (${url}); ` +
      `using ${PRODUCTION_FRONTEND_DEFAULT} for email links.`,
    );
    url = PRODUCTION_FRONTEND_DEFAULT;
  }

  return url;
}

let cachedFrontendUrl = null;

function getFrontendUrl() {
  if (!cachedFrontendUrl) {
    cachedFrontendUrl = resolveFrontendUrl();
  }
  return cachedFrontendUrl;
}

/** Drop-in replacement for legacy FRONT() helpers */
function FRONT() {
  return getFrontendUrl();
}

function frontendPath(path) {
  const base = getFrontendUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

function encodeToken(token) {
  return encodeURIComponent(String(token || '').trim());
}

/** Normalize links before putting them in email HTML */
function sanitizeFrontendLink(url) {
  if (!url) return '';

  const raw = String(url).trim();
  if (!raw) return '';

  // Relative app route → absolute frontend URL
  if (raw.startsWith('/')) {
    return frontendPath(raw);
  }

  try {
    const u = new URL(raw);

    // Backend API paths accidentally used in emails → map to frontend routes
    const apiSign = u.pathname.match(/^\/api\/documents\/sign\/([^/]+)$/);
    if (apiSign) {
      return links.sequentialSign(decodeURIComponent(apiSign[1]));
    }

    const apiTplSign = u.pathname.match(/^\/api\/templates\/sign\/validate\/([^/]+)$/);
    if (apiTplSign) {
      return links.templateSign(decodeURIComponent(apiTplSign[1]));
    }

    // FRONTEND_URL set to .../api by mistake
    if (u.pathname.startsWith('/api/')) {
      u.pathname = u.pathname.replace(/^\/api/, '') || '/';
      return u.toString().replace(/([^:]\/)\/+/g, '$1');
    }

    return u.toString();
  } catch {
    return frontendPath(raw.replace(/^\//, ''));
  }
}

const links = {
  sequentialSign: (tokenOrOpts) => {
    if (tokenOrOpts && typeof tokenOrOpts === 'object') {
      const { publicSlug, signCode, token } = tokenOrOpts;
      if (publicSlug && signCode) {
        return frontendPath(`/sign/${encodeURIComponent(publicSlug)}/${encodeURIComponent(signCode)}`);
      }
      if (token) return frontendPath(`/sign/${encodeToken(token)}`);
      return frontendPath('/sign/preview-token');
    }
    return frontendPath(`/sign/${encodeToken(tokenOrOpts)}`);
  },
  templateSign: (tokenOrOpts) => {
    if (tokenOrOpts && typeof tokenOrOpts === 'object') {
      const { publicSlug, signCode, token } = tokenOrOpts;
      if (publicSlug && signCode) {
        return frontendPath(`/template-sign/${encodeURIComponent(publicSlug)}/${encodeURIComponent(signCode)}`);
      }
      if (token) return frontendPath(`/template-sign/${encodeToken(token)}`);
      return frontendPath('/template-sign/preview-token');
    }
    return frontendPath(`/template-sign/${encodeToken(tokenOrOpts)}`);
  },
  bossSign:               (token) => frontendPath(`/template-campaign/boss/${encodeToken(token)}`),
  approverReview:       (token) => frontendPath(`/template-campaign/approve/${encodeToken(token)}`),
  sequentialSignPreview:  () => frontendPath('/sign/preview-token'),
  templateSignPreview:    () => frontendPath('/template-sign/preview-token'),
};

module.exports = {
  getFrontendUrl,
  FRONT,
  frontendPath,
  sanitizeFrontendLink,
  links,
};
