// src/api/templateApi.js
/**
 * Template API client — Module 2
 * Add this to your existing apiClient.js or import separately.
 *
 * Usage:
 *   import { templateApi } from '@/api/apiClient';
 */

import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: BASE,
  withCredentials: true,
});

// Attach JWT token from localStorage
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('nexsign_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Normalize error messages
api.interceptors.response.use(
  res => res.data,
  err => {
    const code    = err?.response?.data?.code  || null;
    const message = err?.response?.data?.error || err?.message || 'An error occurred.';
    const error   = new Error(message);
    error.code    = code;
    error.status  = err?.response?.status;
    return Promise.reject(error);
  },
);

// ─────────────────────────────────────────────────────────────
export const templateApi = {

  // ── Template CRUD ────────────────────────────────────────
  getTemplates: (params = {}) =>
    api.get('/templates', { params }),

  getTemplate: (id) =>
    api.get(`/templates/${id}`),

  createTemplate: (data) =>
    api.post('/templates', data),

  deleteTemplate: (id) =>
    api.delete(`/templates/${id}`),

  // ── Boss sign ─────────────────────────────────────────────
  bossSign: (id, payload) =>
    api.post(`/templates/${id}/boss-sign`, payload),

  // ── Employee signing (public routes — no auth header needed) ──
  /**
   * Load signing session data (template fields, session info).
   * Called by TemplateSigner on mount.
   */
  getSession: (token) =>
    axios.get(`${BASE}/sign/template/${token}`).then(r => r.data),

  /**
   * Submit signed fields.
   * Backend generates PDF + sends email.
   */
  employeeSign: (token, payload) =>
    axios.post(`${BASE}/sign/template/${token}`, payload).then(r => r.data),

  /**
   * Decline signing.
   */
  employeeDecline: (token, reason) =>
    axios.post(`${BASE}/sign/template/${token}/decline`, { reason }).then(r => r.data),

  /**
   * Returns the URL that the PdfRenderer should load.
   * The backend proxies the boss-signed Cloudinary PDF to avoid CORS.
   */
  getPdfProxyUrl: (token) =>
    `${BASE}/sign/template/${token}/pdf`,

  // ── Resend ────────────────────────────────────────────────
  resendEmail: (templateId, sessionId) =>
    api.post(`/templates/${templateId}/sessions/${sessionId}/resend`),

};

export default templateApi;