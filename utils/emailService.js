// 'use strict';

// const nodemailer = require('nodemailer');

// // ═══════════════════════════════════════════════════════════════
// // BRAND CONFIG
// // ═══════════════════════════════════════════════════════════════
// const BRAND = Object.freeze({
//   color:      '#28ABDF',
//   colorDark:  '#1e7fb5',
//   colorLight: '#e0f4fc',
//   name:       'NeXsign',
//   tagline:    'Secure. Simple. Professional.',
//   year:       new Date().getFullYear(),
//   website:    process.env.FRONTEND_URL || 'https://nexsignfrontend.vercel.app',
//   support:    'support@nexsign.app',
// });

// const FRONT = () =>
//   (process.env.FRONTEND_URL || 'https://nexsignfrontend.vercel.app').replace(/\/$/, '');

// // ═══════════════════════════════════════════════════════════════
// // TRANSPORTER — singleton, pooled SMTP
// // ═══════════════════════════════════════════════════════════════
// let _transporter = null;

// function getTransporter() {
//   if (_transporter) return _transporter;

//   _transporter = nodemailer.createTransport({
//     service:        'gmail',
//     host:           'smtp.gmail.com',
//     port:           465,
//     secure:         true,
//     auth: {
//       user: process.env.EMAIL_USER,
//       pass: process.env.EMAIL_PASS,
//     },
//     pool:           true,
//     maxConnections: 5,
//     maxMessages:    100,
//     rateDelta:      1_000,
//     rateLimit:      10,
//   });

//   _transporter.verify()
//     .then(() => {
//       if (process.env.NODE_ENV !== 'production')
//         console.log('✅ Email transporter ready');
//     })
//     .catch(err => {
//       console.error('❌ Email transporter error:', err.message);
//       _transporter = null;
//     });

//   return _transporter;
// }

// // ═══════════════════════════════════════════════════════════════
// // INTERNAL HELPERS
// // ═══════════════════════════════════════════════════════════════

// function fromField(companyName) {
//   return `"${companyName || BRAND.name}" <${process.env.EMAIL_USER}>`;
// }

// function logoBlock(logoUrl, companyName) {
//   if (!logoUrl) return '';
//   return `
//     <div style="text-align:center;margin-bottom:16px;">
//       <img src="${logoUrl}" alt="${companyName || 'Logo'}"
//         style="max-height:60px;max-width:180px;
//                object-fit:contain;display:inline-block;"/>
//     </div>`;
// }

// // ── Audit Info Row (Device + Location + Time) ─────────────────
// function auditInfoBlock(auditInfo = {}) {
//   if (!auditInfo || !auditInfo.device) return '';
  
//   const rows = [];
//   if (auditInfo.device)   rows.push(['📱 Device',   auditInfo.device]);
//   if (auditInfo.browser)  rows.push(['🌐 Browser',  auditInfo.browser]);
//   if (auditInfo.os)       rows.push(['💻 OS',        auditInfo.os]);
//   if (auditInfo.location) rows.push(['📍 Location',  auditInfo.location]);
//   if (auditInfo.postal)   rows.push(['📮 Postal',    auditInfo.postal]);
//   if (auditInfo.time)     rows.push(['🕐 Time',      auditInfo.time]);
//   if (auditInfo.ip)       rows.push(['🔗 IP',        auditInfo.ip]);

//   if (!rows.length) return '';

//   const rowsHtml = rows.map(([label, value]) => `
//     <tr>
//       <td style="padding:6px 12px;font-size:12px;color:#64748b;
//                  white-space:nowrap;font-weight:600;">
//         ${label}
//       </td>
//       <td style="padding:6px 12px;font-size:12px;color:#1e293b;">
//         ${value}
//       </td>
//     </tr>`).join('');

//   return `
//     <div style="background:#f8fafc;border:1px solid #e2e8f0;
//                 border-radius:10px;overflow:hidden;margin:12px 0;">
//       <table width="100%" cellpadding="0" cellspacing="0">
//         ${rowsHtml}
//       </table>
//     </div>`;
// }

// // ── Signer Summary Card ───────────────────────────────────────
// function signerCard(party, index) {
//   const isSigned = party.status === 'signed' || !!party.signedAt;
//   const bgColor  = isSigned ? '#f0fdf4' : '#fefce8';
//   const border   = isSigned ? '#86efac' : '#fde68a';
//   const badge    = isSigned
//     ? `<span style="background:#dcfce7;color:#15803d;padding:3px 10px;
//                     border-radius:20px;font-size:11px;font-weight:700;">
//          ✅ Signed
//        </span>`
//     : `<span style="background:#fef9c3;color:#a16207;padding:3px 10px;
//                     border-radius:20px;font-size:11px;font-weight:700;">
//          ⏳ Pending
//        </span>`;

//   return `
//     <div style="background:${bgColor};border:1px solid ${border};
//                 border-radius:10px;padding:14px 16px;margin:8px 0;">
//       <table width="100%" cellpadding="0" cellspacing="0">
//         <tr>
//           <td>
//             <div style="font-size:14px;font-weight:700;color:#1e293b;">
//               ${index + 1}. ${party.name || 'Unknown'}
//             </div>
//             ${party.designation
//               ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">
//                    🏷️ ${party.designation}
//                  </div>`
//               : ''}
//             <div style="font-size:12px;color:#94a3b8;margin-top:2px;">
//               📧 ${party.email || '—'}
//             </div>
//           </td>
//           <td style="text-align:right;vertical-align:top;">
//             ${badge}
//           </td>
//         </tr>
//       </table>
//       ${isSigned && party.auditInfo
//         ? auditInfoBlock(party.auditInfo)
//         : ''}
//     </div>`;
// }

// // ── CC Recipient Card ─────────────────────────────────────────
// function ccCard(cc) {
//   return `
//     <div style="display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;
//                 border-radius:8px;padding:8px 14px;margin:4px 4px 4px 0;">
//       <div style="font-size:13px;font-weight:700;color:#1e293b;">
//         ${cc.name || cc.email}
//       </div>
//       ${cc.designation
//         ? `<div style="font-size:11px;color:#64748b;">🏷️ ${cc.designation}</div>`
//         : ''}
//       <div style="font-size:11px;color:#94a3b8;">📧 ${cc.email}</div>
//     </div>`;
// }

// // ── CTA Button ────────────────────────────────────────────────
// function ctaButton(href, label, color = BRAND.color) {
//   return `
//     <div style="text-align:center;margin:28px 0;">
//       <a href="${href}"
//         style="background:${color};color:#ffffff;
//                padding:14px 36px;text-decoration:none;
//                border-radius:10px;font-weight:700;
//                font-size:15px;display:inline-block;
//                box-shadow:0 4px 14px rgba(40,171,223,0.35);
//                letter-spacing:0.3px;">
//         ${label}
//       </a>
//     </div>`;
// }

// // ── Master HTML Shell ─────────────────────────────────────────
// function buildEmail({ logoUrl, companyName, subject, bodyHtml }) {
//   return `<!DOCTYPE html>
// <html lang="en">
// <head>
//   <meta charset="UTF-8"/>
//   <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
//   <title>${subject}</title>
//   <style>
//     @media only screen and (max-width:600px){
//       .email-body { padding:20px !important; }
//       .btn-cta { padding:12px 24px !important;font-size:14px !important; }
//     }
//   </style>
// </head>
// <body style="margin:0;padding:0;background:#e9f0f7;
//              font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
//   <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
//          style="background:#e9f0f7;padding:32px 16px;">
//     <tr>
//       <td align="center">
//         <table role="presentation" width="100%"
//                style="max-width:600px;background:#ffffff;
//                       border-radius:18px;overflow:hidden;
//                       box-shadow:0 6px 30px rgba(0,0,0,0.09);">

//           <!-- HEADER -->
//           <tr>
//             <td style="background:linear-gradient(135deg,
//                        ${BRAND.color} 0%,${BRAND.colorDark} 100%);
//                        padding:28px 36px;text-align:center;">
//               ${logoBlock(logoUrl, companyName)}
//               <h1 style="color:#fff;margin:0;font-size:22px;
//                          font-weight:700;letter-spacing:0.4px;">
//                 ${companyName || BRAND.name}
//               </h1>
//               <p style="color:rgba(255,255,255,0.78);
//                         margin:5px 0 0;font-size:12px;">
//                 ${BRAND.tagline}
//               </p>
//             </td>
//           </tr>

//           <!-- BODY -->
//           <tr>
//             <td class="email-body"
//                 style="padding:36px;font-size:15px;
//                        color:#374151;line-height:1.7;">
//               ${bodyHtml}
//             </td>
//           </tr>

//           <!-- FOOTER -->
//           <tr>
//             <td style="background:#f1f5f9;padding:20px 36px;
//                        text-align:center;border-top:1px solid #e2e8f0;">
//               <p style="margin:0 0 6px;font-size:12px;color:#475569;">
//                 ${companyName
//                   ? `<strong>${companyName}</strong> uses`
//                   : 'Powered by'}
//                 <strong style="color:${BRAND.color};">
//                   ${BRAND.name}
//                 </strong>
//                 for secure digital contracts.
//               </p>
//               <p style="margin:0;font-size:11px;color:#94a3b8;">
//                 ${BRAND.tagline} &nbsp;·&nbsp; © ${BRAND.year}
//                 &nbsp;·&nbsp;
//                 <a href="mailto:${BRAND.support}"
//                    style="color:${BRAND.color};text-decoration:none;">
//                   ${BRAND.support}
//                 </a>
//               </p>
//             </td>
//           </tr>

//         </table>
//       </td>
//     </tr>
//   </table>
// </body>
// </html>`;
// }

// // ═══════════════════════════════════════════════════════════════
// // INTERNAL SEND WITH RETRY
// // ═══════════════════════════════════════════════════════════════
// async function sendMail(mailOptions, retries = 2) {
//   if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
//     console.error('❌ EMAIL_USER or EMAIL_PASS not set!');
//     throw new Error('Email service misconfigured');
//   }

//   const transport = getTransporter();
//   let lastErr;

//   for (let attempt = 0; attempt <= retries; attempt++) {
//     try {
//       const info = await transport.sendMail(mailOptions);
//       console.log(`📧 Sent → ${mailOptions.to} [${info.messageId}]`);
//       return info;
//     } catch (err) {
//       lastErr = err;
//       console.error(
//         `📧 Attempt ${attempt + 1} failed for ${mailOptions.to}:`,
//         err.message
//       );
//       if (attempt < retries) {
//         await new Promise(r => setTimeout(r, 1_500 * (attempt + 1)));
//       }
//     }
//   }
//   throw lastErr;
// }

// // ═══════════════════════════════════════════════════════════════
// // 1. SIGNING INVITATION EMAIL
// // ═══════════════════════════════════════════════════════════════
// /**
//  * @param {string}  recipientEmail
//  * @param {string}  recipientName
//  * @param {string}  [recipientDesignation]
//  * @param {string}  senderName
//  * @param {string}  [senderDesignation]
//  * @param {string}  documentTitle
//  * @param {string}  signingLink
//  * @param {string}  [companyLogoUrl]
//  * @param {string}  [companyName]
//  * @param {number}  [partyNumber]
//  * @param {number}  [totalParties]
//  * @param {string}  [message]
//  * @param {Array}   [ccList]  [{name, email, designation}]
//  */
// async function sendSigningEmail({
//   recipientEmail,
//   recipientName,
//   recipientDesignation = '',
//   senderName,
//   senderDesignation    = '',
//   documentTitle,
//   signingLink,
//   companyLogoUrl,
//   companyName,
//   partyNumber    = 1,
//   totalParties   = 1,
//   message        = '',
//   ccList         = [],
// }) {
//   const subject = `✍️ Signature Required: "${documentTitle}"`;

//   const progressHtml = totalParties > 1
//     ? `<div style="background:#f1f5f9;border-radius:8px;
//                    padding:10px 14px;margin:16px 0;
//                    font-size:13px;color:#475569;">
//          📋 You are signer
//          <strong style="color:${BRAND.color};">
//            ${partyNumber} of ${totalParties}
//          </strong>
//        </div>`
//     : '';

//   const ccHtml = ccList.length
//     ? `<div style="margin:20px 0;">
//          <div style="font-size:12px;font-weight:700;color:#64748b;
//                      text-transform:uppercase;letter-spacing:0.6px;
//                      margin-bottom:8px;">
//            CC Recipients
//          </div>
//          ${ccList.map(cc => ccCard(cc)).join('')}
//        </div>`
//     : '';

//   const msgHtml = message
//     ? `<div style="font-style:italic;color:#475569;
//                    border-left:4px solid #cbd5e1;
//                    padding:12px 16px;margin:20px 0;
//                    background:#f8fafc;border-radius:0 8px 8px 0;
//                    font-size:14px;">
//          "${message}"
//        </div>`
//     : '';

//   const bodyHtml = `
//     <h2 style="color:#1a202c;margin:0 0 16px;font-size:20px;">
//       Hello ${recipientName}
//       ${recipientDesignation
//         ? `<span style="font-size:13px;color:#64748b;
//                         font-weight:400;display:block;margin-top:4px;">
//              🏷️ ${recipientDesignation}
//            </span>`
//         : ''},
//     </h2>

//     <p style="color:#4a5568;margin:0 0 16px;">
//       <strong>${senderName}</strong>
//       ${senderDesignation
//         ? `<span style="font-size:13px;color:#64748b;">
//              (${senderDesignation})
//            </span>`
//         : ''}
//       ${companyName
//         ? `from <strong>${companyName}</strong>`
//         : ''}
//       has requested your digital signature on:
//     </p>

//     <div style="background:#f1f5f9;border-left:4px solid ${BRAND.color};
//                 border-radius:10px;padding:16px 20px;margin:0 0 16px;">
//       <div style="font-size:12px;color:#64748b;font-weight:700;
//                   text-transform:uppercase;letter-spacing:0.5px;
//                   margin-bottom:4px;">
//         Document
//       </div>
//       <div style="font-size:18px;font-weight:700;color:#1a202c;">
//         📄 ${documentTitle}
//       </div>
//     </div>

//     ${progressHtml}
//     ${msgHtml}

//     ${ctaButton(signingLink, '🖊️ Review & Sign Document')}

//     <p style="font-size:13px;color:#94a3b8;margin:16px 0 0;
//               text-align:center;">
//       🔒 Secure link · No account required · 
//       Expires in <strong>72 hours</strong>
//     </p>

//     ${ccHtml}`;

//   return sendMail({
//     from:    fromField(companyName),
//     to:      recipientEmail,
//     subject,
//     html:    buildEmail({
//       logoUrl:     companyLogoUrl,
//       companyName,
//       subject,
//       bodyHtml,
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 2. COMPLETION EMAIL (with PDF attachment)
// // ═══════════════════════════════════════════════════════════════
// /**
//  * @param {string}        recipientEmail
//  * @param {string}        recipientName
//  * @param {string}        [recipientDesignation]
//  * @param {string}        documentTitle
//  * @param {Buffer|null}   pdfBuffer
//  * @param {string}        [signedPdfUrl]
//  * @param {string}        [companyLogoUrl]
//  * @param {string}        [companyName]
//  * @param {Array}         [parties]
//  *   [{name, email, designation, status, signedAt, auditInfo}]
//  *   auditInfo: {device, browser, os, location, postal, time, ip}
//  * @param {Array}         [ccList] [{name, email, designation}]
//  * @param {boolean}       [isCC]
//  */
// async function sendCompletionEmail({
//   recipientEmail,
//   recipientName,
//   recipientDesignation = '',
//   documentTitle,
//   pdfBuffer,
//   signedPdfUrl         = '',
//   companyLogoUrl,
//   companyName,
//   parties              = [],
//   ccList               = [],
//   isCC                 = false,
// }) {
//   const subject = `✅ Completed: "${documentTitle}"`;

//   const signersHtml = parties.length
//     ? `<div style="margin:20px 0;">
//          <div style="font-size:12px;font-weight:700;color:#64748b;
//                      text-transform:uppercase;letter-spacing:0.6px;
//                      margin-bottom:10px;">
//            Signing Summary
//          </div>
//          ${parties.map((p, i) => signerCard(p, i)).join('')}
//        </div>`
//     : '';

//   const ccHtml = ccList.length
//     ? `<div style="margin:20px 0;">
//          <div style="font-size:12px;font-weight:700;color:#64748b;
//                      text-transform:uppercase;letter-spacing:0.6px;
//                      margin-bottom:8px;">
//            CC Recipients
//          </div>
//          ${ccList.map(cc => ccCard(cc)).join('')}
//        </div>`
//     : '';

//   const roleNote = isCC
//     ? `<div style="background:#f0f9ff;border:1px solid #bae6fd;
//                    border-radius:8px;padding:10px 14px;
//                    font-size:13px;color:#0369a1;margin:16px 0;">
//          ℹ️ You were CC'd on this document.
//        </div>`
//     : '';

//   const bodyHtml = `
//     <div style="text-align:center;margin-bottom:24px;">
//       <div style="width:60px;height:60px;background:#dcfce7;
//                   border-radius:50%;display:inline-flex;
//                   align-items:center;justify-content:center;
//                   font-size:28px;margin-bottom:12px;">
//         ✅
//       </div>
//       <h2 style="color:#15803d;margin:0;font-size:22px;">
//         Document Completed!
//       </h2>
//     </div>

//     <p style="color:#4a5568;margin:0 0 16px;">
//       Hello <strong>${recipientName}</strong>
//       ${recipientDesignation
//         ? `<span style="font-size:13px;color:#64748b;">
//              (${recipientDesignation})
//            </span>`
//         : ''},
//     </p>

//     ${roleNote}

//     <p style="color:#4a5568;margin:0 0 16px;">
//       All parties have successfully signed:
//     </p>

//     <div style="background:#f1f5f9;border-left:4px solid #22c55e;
//                 border-radius:10px;padding:16px 20px;margin:0 0 16px;">
//       <div style="font-size:18px;font-weight:700;color:#1a202c;">
//         📄 ${documentTitle}
//       </div>
//     </div>

//     ${signersHtml}
//     ${ccHtml}

//     ${signedPdfUrl
//       ? ctaButton(signedPdfUrl, '📥 View & Download Signed PDF', '#22c55e')
//       : ''}

//     <p style="font-size:13px;color:#94a3b8;margin:16px 0 0;
//               text-align:center;">
//       The signed PDF is also attached to this email.
//     </p>`;

//   const attachments = [];
//   if (pdfBuffer && pdfBuffer.length > 0) {
//     attachments.push({
//       filename:    `${documentTitle.replace(/[^a-z0-9_\-\s]/gi, '_')}_signed.pdf`,
//       content:     pdfBuffer,
//       contentType: 'application/pdf',
//     });
//   }

//   return sendMail({
//     from: fromField(companyName),
//     to:   recipientEmail,
//     subject,
//     html: buildEmail({
//       logoUrl:     companyLogoUrl,
//       companyName,
//       subject,
//       bodyHtml,
//     }),
//     attachments,
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 3. CC NOTIFICATION (document dispatch time)
// // ═══════════════════════════════════════════════════════════════
// /**
//  * @param {string}  recipientEmail
//  * @param {string}  recipientName
//  * @param {string}  [recipientDesignation]
//  * @param {string}  documentTitle
//  * @param {string}  senderName
//  * @param {string}  [senderDesignation]
//  * @param {string}  [companyLogoUrl]
//  * @param {string}  [companyName]
//  * @param {Array}   [parties] [{name, email, designation}]
//  */
// async function sendCCEmail({
//   recipientEmail,
//   recipientName,
//   recipientDesignation = '',
//   documentTitle,
//   senderName,
//   senderDesignation    = '',
//   companyLogoUrl,
//   companyName,
//   parties              = [],
// }) {
//   const subject = `📋 CC: "${documentTitle}" — Signing in Progress`;

//   const partiesHtml = parties.length
//     ? `<div style="margin:20px 0;">
//          <div style="font-size:12px;font-weight:700;color:#64748b;
//                      text-transform:uppercase;letter-spacing:0.6px;
//                      margin-bottom:10px;">
//            Signers
//          </div>
//          ${parties.map((p, i) => signerCard(p, i)).join('')}
//        </div>`
//     : '';

//   const bodyHtml = `
//     <h2 style="color:#1a202c;margin:0 0 16px;font-size:20px;">
//       Hello ${recipientName}
//       ${recipientDesignation
//         ? `<span style="font-size:13px;color:#64748b;
//                         font-weight:400;display:block;margin-top:4px;">
//              🏷️ ${recipientDesignation}
//            </span>`
//         : ''},
//     </h2>

//     <div style="background:#f0f9ff;border:1px solid #bae6fd;
//                 border-radius:8px;padding:10px 14px;
//                 font-size:13px;color:#0369a1;margin:0 0 16px;">
//       ℹ️ You have been added as a
//       <strong>CC recipient</strong> on this document.
//     </div>

//     <p style="color:#4a5568;margin:0 0 16px;">
//       <strong>${senderName}</strong>
//       ${senderDesignation
//         ? `<span style="font-size:13px;color:#64748b;">
//              (${senderDesignation})
//            </span>`
//         : ''}
//       ${companyName
//         ? `from <strong>${companyName}</strong>`
//         : ''}
//       has initiated a signing process for:
//     </p>

//     <div style="background:#f1f5f9;border-left:4px solid ${BRAND.color};
//                 border-radius:10px;padding:16px 20px;margin:0 0 16px;">
//       <div style="font-size:18px;font-weight:700;color:#1a202c;">
//         📄 ${documentTitle}
//       </div>
//     </div>

//     ${partiesHtml}

//     <div style="background:#fef9c3;border:1px solid #fde68a;
//                 border-radius:8px;padding:12px 16px;
//                 font-size:13px;color:#713f12;margin:16px 0;">
//       📬 You will receive the
//       <strong>final signed PDF</strong>
//       once all parties have completed signing.
//     </div>`;

//   return sendMail({
//     from:    fromField(companyName),
//     to:      recipientEmail,
//     subject,
//     html:    buildEmail({
//       logoUrl:     companyLogoUrl,
//       companyName,
//       subject,
//       bodyHtml,
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 4. DOCUMENT DECLINED
// // ═══════════════════════════════════════════════════════════════
// async function sendDeclinedEmail({
//   ownerEmail,
//   ownerName,
//   documentTitle,
//   declinerName,
//   declinerEmail,
//   declinerDesignation  = '',
//   reason               = '',
//   companyLogoUrl,
//   companyName,
// }) {
//   const subject = `⚠️ Declined: "${documentTitle}"`;

//   const bodyHtml = `
//     <div style="text-align:center;margin-bottom:24px;">
//       <div style="width:60px;height:60px;background:#fee2e2;
//                   border-radius:50%;display:inline-flex;
//                   align-items:center;justify-content:center;
//                   font-size:28px;margin-bottom:12px;">
//         ⚠️
//       </div>
//       <h2 style="color:#dc2626;margin:0;font-size:22px;">
//         Signing Declined
//       </h2>
//     </div>

//     <p style="color:#4a5568;margin:0 0 16px;">
//       Hello <strong>${ownerName}</strong>,
//     </p>

//     <p style="color:#4a5568;margin:0 0 16px;">
//       A signer has declined to sign your document.
//       The signing process has been automatically cancelled.
//     </p>

//     <div style="background:#fef2f2;border:1px solid #fecaca;
//                 border-radius:10px;padding:16px 20px;margin:16px 0;">

//       <div style="margin-bottom:10px;">
//         <div style="font-size:11px;color:#991b1b;font-weight:700;
//                     text-transform:uppercase;letter-spacing:0.5px;">
//           Document
//         </div>
//         <div style="font-size:16px;font-weight:700;color:#1a202c;
//                     margin-top:2px;">
//           📄 ${documentTitle}
//         </div>
//       </div>

//       <div style="margin-bottom:10px;">
//         <div style="font-size:11px;color:#991b1b;font-weight:700;
//                     text-transform:uppercase;letter-spacing:0.5px;">
//           Declined By
//         </div>
//         <div style="font-size:14px;color:#1a202c;margin-top:2px;">
//           ${declinerName}
//           ${declinerDesignation
//             ? `<span style="color:#64748b;font-size:12px;">
//                  (${declinerDesignation})
//                </span>`
//             : ''}
//         </div>
//         <div style="font-size:12px;color:#94a3b8;">
//           📧 ${declinerEmail}
//         </div>
//       </div>

//       ${reason
//         ? `<div>
//              <div style="font-size:11px;color:#991b1b;font-weight:700;
//                          text-transform:uppercase;letter-spacing:0.5px;">
//                Reason
//              </div>
//              <div style="font-size:13px;color:#475569;
//                          font-style:italic;margin-top:2px;">
//                "${reason}"
//              </div>
//            </div>`
//         : ''}
//     </div>`;

//   return sendMail({
//     from:    fromField(companyName),
//     to:      ownerEmail,
//     subject,
//     html:    buildEmail({
//       logoUrl:     companyLogoUrl,
//       companyName,
//       subject,
//       bodyHtml,
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 5. BOSS APPROVAL EMAIL (Master Template - Module 2)
// // ═══════════════════════════════════════════════════════════════
// /**
//  * @param {string}  bossEmail
//  * @param {string}  bossName
//  * @param {string}  [bossDesignation]
//  * @param {string}  documentTitle
//  * @param {string}  signingLink
//  * @param {number}  employeeCount
//  * @param {string}  senderName
//  * @param {string}  [companyLogoUrl]
//  * @param {string}  [companyName]
//  * @param {string}  [message]
//  */
// async function sendBossApprovalEmail({
//   bossEmail,
//   bossName,
//   bossDesignation  = '',
//   documentTitle,
//   signingLink,
//   employeeCount    = 0,
//   senderName,
//   companyLogoUrl,
//   companyName,
//   message          = '',
// }) {
//   const subject = `🔐 Master Approval Required: "${documentTitle}"`;

//   const bodyHtml = `
//     <h2 style="color:#1a202c;margin:0 0 16px;font-size:20px;">
//       Hello ${bossName}
//       ${bossDesignation
//         ? `<span style="font-size:13px;color:#64748b;
//                         font-weight:400;display:block;margin-top:4px;">
//              🏷️ ${bossDesignation}
//            </span>`
//         : ''},
//     </h2>

//     <div style="background:#fef9c3;border:1px solid #fde68a;
//                 border-radius:8px;padding:12px 16px;
//                 font-size:13px;color:#713f12;margin:0 0 16px;">
//       👑 You are the <strong>Primary Approver</strong>
//       for this document.
//     </div>

//     <p style="color:#4a5568;margin:0 0 16px;">
//       <strong>${senderName}</strong>
//       ${companyName ? `from <strong>${companyName}</strong>` : ''}
//       requires your approval on the Master Template:
//     </p>

//     <div style="background:#f1f5f9;border-left:4px solid ${BRAND.color};
//                 border-radius:10px;padding:16px 20px;margin:0 0 16px;">
//       <div style="font-size:18px;font-weight:700;color:#1a202c;">
//         📄 ${documentTitle}
//       </div>
//       <div style="font-size:13px;color:#64748b;margin-top:6px;">
//         👥 Will be distributed to
//         <strong style="color:${BRAND.color};">
//           ${employeeCount} employees
//         </strong>
//         after your approval
//       </div>
//     </div>

//     <div style="background:#f0f9ff;border:1px solid #bae6fd;
//                 border-radius:8px;padding:12px 16px;
//                 font-size:13px;color:#0369a1;margin:0 0 16px;">
//       ℹ️ Your signature will be embedded as a permanent layer
//       on each employee's individual copy.
//     </div>

//     ${message
//       ? `<div style="font-style:italic;color:#475569;
//                      border-left:4px solid #cbd5e1;
//                      padding:12px 16px;margin:20px 0;
//                      background:#f8fafc;border-radius:0 8px 8px 0;
//                      font-size:14px;">
//            "${message}"
//          </div>`
//       : ''}

//     ${ctaButton(signingLink, '👑 Review & Approve as Master Signer', '#7c3aed')}

//     <p style="font-size:13px;color:#94a3b8;margin:16px 0 0;
//               text-align:center;">
//       🔒 Secure link · Expires in 72 hours
//     </p>`;

//   return sendMail({
//     from:    fromField(companyName),
//     to:      bossEmail,
//     subject,
//     html:    buildEmail({
//       logoUrl:     companyLogoUrl,
//       companyName,
//       subject,
//       bodyHtml,
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 6. EMPLOYEE SIGNING EMAIL (Master Template - Module 2)
// // ═══════════════════════════════════════════════════════════════
// /**
//  * @param {string}  employeeEmail
//  * @param {string}  employeeName
//  * @param {string}  documentTitle
//  * @param {string}  signingLink
//  * @param {string}  bossName
//  * @param {string}  [bossDesignation]
//  * @param {string}  [companyLogoUrl]
//  * @param {string}  [companyName]
//  */
// async function sendEmployeeSigningEmail({
//   employeeEmail,
//   employeeName,
//   documentTitle,
//   signingLink,
//   bossName,
//   bossDesignation  = '',
//   companyLogoUrl,
//   companyName,
// }) {
//   const subject = `✍️ Please Sign: "${documentTitle}"`;

//   const bodyHtml = `
//     <h2 style="color:#1a202c;margin:0 0 16px;font-size:20px;">
//       Hello ${employeeName},
//     </h2>

//     <p style="color:#4a5568;margin:0 0 16px;">
//       You have a document ready for your signature from
//       ${companyName ? `<strong>${companyName}</strong>` : 'your organisation'}:
//     </p>

//     <div style="background:#f1f5f9;border-left:4px solid ${BRAND.color};
//                 border-radius:10px;padding:16px 20px;margin:0 0 16px;">
//       <div style="font-size:18px;font-weight:700;color:#1a202c;">
//         📄 ${documentTitle}
//       </div>
//     </div>

//     <div style="background:#f0fdf4;border:1px solid #86efac;
//                 border-radius:8px;padding:12px 16px;
//                 font-size:13px;color:#15803d;margin:0 0 20px;">
//       ✅ Already approved by:
//       <strong>${bossName}</strong>
//       ${bossDesignation
//         ? `<span style="color:#64748b;">(${bossDesignation})</span>`
//         : ''}
//     </div>

//     ${ctaButton(signingLink, '🖊️ Sign My Document')}

//     <p style="font-size:13px;color:#94a3b8;margin:16px 0 0;
//               text-align:center;">
//       🔒 This link is unique to you · No account required ·
//       Expires in 72 hours
//     </p>`;

//   return sendMail({
//     from:    fromField(companyName),
//     to:      employeeEmail,
//     subject,
//     html:    buildEmail({
//       logoUrl:     companyLogoUrl,
//       companyName,
//       subject,
//       bodyHtml,
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 7. FEEDBACK THANK-YOU
// // ═══════════════════════════════════════════════════════════════
// async function sendFeedbackEmail(userEmail, userName, stars) {
//   const starCount = Math.min(Math.max(Number(stars) || 0, 0), 5);
//   const starBar   = '⭐'.repeat(starCount);
//   const subject   = `Thank you for your feedback! ${starBar}`;

//   const bodyHtml = `
//     <h2 style="color:#1a202c;margin:0 0 14px;font-size:20px;">
//       Hello ${userName || 'Valued User'} 😊
//     </h2>

//     <p style="color:#4a5568;margin:0 0 16px;">
//       Thank you for taking the time to rate us!
//     </p>

//     <div style="background:#fefce8;border:1px solid #fde68a;
//                 border-radius:12px;padding:20px;
//                 text-align:center;margin:0 0 20px;">
//       <div style="font-size:28px;letter-spacing:4px;">
//         ${starBar}
//       </div>
//       <p style="margin:8px 0 0;font-size:18px;
//                 font-weight:700;color:#92400e;">
//         ${starCount}-Star Rating
//       </p>
//     </div>

//     <div style="background:#f8fafc;border-left:4px solid ${BRAND.color};
//                 border-radius:10px;padding:16px 20px;margin:0 0 20px;">
//       <p style="margin:0;font-style:italic;
//                 color:#475569;font-size:14px;line-height:1.7;">
//         "Your feedback drives us to build a better future
//         for digital agreements. Every star motivates our team."
//       </p>
//     </div>

//     <p style="color:#4a5568;font-size:14px;margin:0;">
//       Keep signing with confidence! 🚀<br/><br/>
//       <strong>Warm regards,</strong><br/>
//       <span style="color:${BRAND.color};font-weight:700;">
//         The ${BRAND.name} Team
//       </span>
//     </p>`;

//   return sendMail({
//     from:    fromField(BRAND.name),
//     to:      userEmail,
//     subject,
//     html:    buildEmail({
//       companyName: BRAND.name,
//       subject,
//       bodyHtml,
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 8. VIEW ONLY EMAIL
// // ═══════════════════════════════════════════════════════════════
// async function sendViewEmail({
//   recipientEmail,
//   recipientName,
//   documentTitle,
//   senderName,
//   viewLink,
//   companyLogoUrl,
//   companyName,
// }) {
//   const subject = `📄 Document Shared: "${documentTitle}"`;

//   const bodyHtml = `
//     <h2 style="color:#1a202c;margin:0 0 16px;font-size:20px;">
//       Hello ${recipientName},
//     </h2>

//     <p style="color:#4a5568;margin:0 0 16px;">
//       <strong>${senderName}</strong>
//       ${companyName ? `from <strong>${companyName}</strong>` : ''}
//       has shared a document with you for your records:
//     </p>

//     <div style="background:#f1f5f9;border-left:4px solid ${BRAND.color};
//                 border-radius:10px;padding:16px 20px;margin:0 0 20px;">
//       <div style="font-size:18px;font-weight:700;color:#1a202c;">
//         📄 ${documentTitle}
//       </div>
//     </div>

//     ${ctaButton(viewLink, '👁️ View Document')}

//     <p style="font-size:13px;color:#94a3b8;margin:16px 0 0;
//               text-align:center;">
//       No signature required · View only
//     </p>`;

//   return sendMail({
//     from:    fromField(companyName),
//     to:      recipientEmail,
//     subject,
//     html:    buildEmail({
//       logoUrl:     companyLogoUrl,
//       companyName,
//       subject,
//       bodyHtml,
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // EXPORTS
// // ═══════════════════════════════════════════════════════════════
// module.exports = {
//   sendSigningEmail,
//   sendCompletionEmail,
//   sendCCEmail,
//   sendDeclinedEmail,
//   sendBossApprovalEmail,
//   sendEmployeeSigningEmail,
//   sendFeedbackEmail,
//   sendViewEmail,
// };

// 'use strict';

// const nodemailer = require('nodemailer');

// // ═══════════════════════════════════════════════════════════════
// // BRAND
// // ═══════════════════════════════════════════════════════════════
// const BRAND = Object.freeze({
//   color:      '#28ABDF',
//   colorDark:  '#1a7aaa',
//   colorDeep:  '#0d3d5c',
//   name:       'NexSign',
//   tagline:    'Secure · Simple · Professional',
//   year:       new Date().getFullYear(),
//   website:    process.env.FRONTEND_URL ||
//               'https://nexsignfrontend.vercel.app',
//   support:    'support@nexsign.app',
// });

// // ═══════════════════════════════════════════════════════════════
// // TRANSPORTER
// // ═══════════════════════════════════════════════════════════════
// let _transporter = null;

// function getTransporter() {
//   if (_transporter) return _transporter;
//   _transporter = nodemailer.createTransport({
//     service:        'gmail',
//     host:           'smtp.gmail.com',
//     port:           465,
//     secure:         true,
//     auth: {
//       user: process.env.EMAIL_USER,
//       pass: process.env.EMAIL_PASS,
//     },
//     pool:           true,
//     maxConnections: 5,
//     maxMessages:    100,
//     rateDelta:      1_000,
//     rateLimit:      10,
//   });
//   _transporter.verify()
//     .then(() => console.log('✅ [Email] Transporter ready'))
//     .catch(err => {
//       console.error('❌ [Email] Transporter error:', err.message);
//       _transporter = null;
//     });
//   return _transporter;
// }

// // ═══════════════════════════════════════════════════════════════
// // HELPERS
// // ═══════════════════════════════════════════════════════════════

// function fromField(companyName) {
//   const label = companyName
//     ? `${companyName} via NexSign`
//     : 'NexSign';
//   return `"${label}" <${process.env.EMAIL_USER}>`;
// }

// // Document subtitle auto-detect
// function docSubtitle(title = '') {
//   const t = title.toLowerCase();
//   if (t.includes('employ'))                        return 'Employment Agreement';
//   if (t.includes('nda') || t.includes('non-disc')) return 'Non-Disclosure Agreement';
//   if (t.includes('offer'))                         return 'Offer Letter';
//   if (t.includes('invoice'))                       return 'Invoice';
//   if (t.includes('service'))                       return 'Service Agreement';
//   if (t.includes('partner'))                       return 'Partnership Agreement';
//   if (t.includes('consent'))                       return 'Consent Form';
//   if (t.includes('policy'))                        return 'Policy Document';
//   if (t.includes('contract'))                      return 'Legal Contract';
//   if (t.includes('agreement'))                     return 'Legal Agreement';
//   if (t.includes('lease') || t.includes('rent'))   return 'Lease Agreement';
//   if (t.includes('purchase') || t.includes('sale'))return 'Purchase Agreement';
//   return 'Document for Signature';
// }

// // ── Company header block ──────────────────────────────────────
// // Company logo + name HIGHLIGHTED — this is the main brand block
// function companyHeader(logoUrl, companyName) {
//   const name    = companyName || BRAND.name;
//   const initial = name[0].toUpperCase();

//   const logoHtml = logoUrl
//     ? `<img src="${logoUrl}" alt="${name}"
//             style="max-height:68px;max-width:210px;
//                    object-fit:contain;display:block;
//                    margin:0 auto 10px;"/>`
//     : `<div style="width:64px;height:64px;
//                    background:rgba(255,255,255,0.18);
//                    border:2px solid rgba(255,255,255,0.4);
//                    border-radius:16px;line-height:64px;
//                    font-size:28px;font-weight:900;
//                    color:#fff;margin:0 auto 10px;
//                    text-align:center;">
//          ${initial}
//        </div>`;

//   return `
//     <td style="background:linear-gradient(
//                  150deg,
//                  ${BRAND.colorDeep} 0%,
//                  ${BRAND.color} 55%,
//                  ${BRAND.colorDark} 100%);
//                padding:34px 40px 28px;
//                text-align:center;">

//       ${logoHtml}

//       <!-- Company name — LARGE + PROMINENT -->
//       <h1 style="margin:0 0 5px;font-size:26px;
//                  font-weight:800;color:#ffffff;
//                  letter-spacing:0.4px;
//                  text-shadow:0 2px 6px rgba(0,0,0,0.18);">
//         ${name}
//       </h1>

//       <!-- NexSign credit — always visible -->
//       <p style="margin:0;font-size:11px;
//                 color:rgba(255,255,255,0.6);
//                 letter-spacing:0.4px;">
//         Powered by
//         <strong style="color:rgba(255,255,255,0.88);
//                         font-weight:700;">
//           NexSign
//         </strong>
//         &nbsp;·&nbsp; Secure Digital Signing
//       </p>

//     </td>`;
// }

// // ── Document card ─────────────────────────────────────────────
// function docCard(title, subtitle, accent = BRAND.color) {
//   return `
//     <div style="background:#f8fafc;
//                 border:1px solid #e2e8f0;
//                 border-left:5px solid ${accent};
//                 border-radius:12px;
//                 padding:18px 22px;margin:18px 0;">
//       <div style="font-size:10px;font-weight:700;
//                   color:${accent};text-transform:uppercase;
//                   letter-spacing:0.8px;margin-bottom:7px;">
//         Document
//       </div>
//       <div style="font-size:19px;font-weight:800;
//                   color:#0f172a;line-height:1.3;
//                   margin-bottom:4px;">
//         ${title}
//       </div>
//       <div style="font-size:12px;color:#64748b;
//                   font-weight:500;">
//         ${subtitle}
//       </div>
//     </div>`;
// }

// // ── CTA button ────────────────────────────────────────────────
// function ctaBtn(href, label, bg = BRAND.color) {
//   return `
//     <div style="text-align:center;margin:28px 0 18px;">
//       <a href="${href}"
//          style="display:inline-block;
//                 background:${bg};color:#ffffff;
//                 padding:15px 42px;text-decoration:none;
//                 border-radius:10px;font-weight:700;
//                 font-size:15px;letter-spacing:0.4px;
//                 box-shadow:0 4px 20px rgba(40,171,223,0.38);">
//         ${label}
//       </a>
//     </div>
//     <p style="text-align:center;font-size:11px;
//               color:#94a3b8;margin:0 0 8px;">
//       Or copy link:
//       <br/>
//       <a href="${href}"
//          style="color:${BRAND.color};font-size:10px;
//                 word-break:break-all;">
//         ${href}
//       </a>
//     </p>`;
// }

// // ── Security note ─────────────────────────────────────────────
// function securityNote() {
//   return `
//     <div style="background:#fffbeb;border:1px solid #fde68a;
//                 border-radius:8px;padding:11px 16px;
//                 font-size:12px;color:#92400e;margin:18px 0 0;">
//       <strong>🔒 Secure &amp; Legally Binding</strong>
//       &nbsp;—&nbsp;
//       Protected by NexSign's tamper-evident audit trail.
//       If you did not expect this, please ignore it.
//     </div>`;
// }

// // ── Audit info table ──────────────────────────────────────────
// function auditBlock(info = {}) {
//   const rows = [];
//   if (info.time)     rows.push(['Signed At',  info.time]);
//   if (info.device)   rows.push(['Device',
//     [info.device, info.browser, info.os].filter(Boolean).join(' / ')]);
//   if (info.location) rows.push(['Location',
//     info.postal ? `${info.location} · ${info.postal}` : info.location]);
//   if (info.ip)       rows.push(['IP Address', info.ip]);
//   if (!rows.length)  return '';

//   return `
//     <table width="100%" cellpadding="0" cellspacing="0"
//            style="margin-top:10px;border-top:1px solid
//                   rgba(0,0,0,0.06);padding-top:9px;">
//       ${rows.map(([l, v]) => `
//         <tr>
//           <td style="font-size:11px;color:#64748b;
//                      font-weight:700;padding:3px 12px 3px 0;
//                      white-space:nowrap;vertical-align:top;">
//             ${l}
//           </td>
//           <td style="font-size:11px;color:#1e293b;
//                      padding:3px 0;line-height:1.5;">
//             ${v}
//           </td>
//         </tr>`).join('')}
//     </table>`;
// }

// // ── Signer card ───────────────────────────────────────────────
// function signerCard(p, i) {
//   const ok  = p.status === 'signed' || !!p.signedAt;
//   const bg  = ok ? '#f0fdf4' : '#fefce8';
//   const bdr = ok ? '#86efac' : '#fde68a';
//   return `
//     <div style="background:${bg};border:1px solid ${bdr};
//                 border-radius:10px;padding:14px 16px;
//                 margin:8px 0;">
//       <table width="100%" cellpadding="0" cellspacing="0">
//         <tr>
//           <td style="vertical-align:top;">
//             <div style="font-size:14px;font-weight:700;
//                         color:#0f172a;margin-bottom:2px;">
//               ${i + 1}.&nbsp;${p.name || 'Unknown'}
//             </div>
//             ${p.designation
//               ? `<div style="font-size:11px;color:#64748b;">
//                    ${p.designation}
//                  </div>` : ''}
//             <div style="font-size:11px;color:#94a3b8;
//                         margin-top:2px;">
//               ${p.email || ''}
//             </div>
//           </td>
//           <td style="text-align:right;vertical-align:top;
//                      white-space:nowrap;">
//             <span style="background:${ok ? '#dcfce7' : '#fef9c3'};
//                          color:${ok ? '#15803d' : '#a16207'};
//                          padding:4px 12px;border-radius:20px;
//                          font-size:11px;font-weight:700;">
//               ${ok ? '✅ Signed' : '⏳ Pending'}
//             </span>
//             ${p.signedAt ? `
//               <div style="font-size:10px;color:#94a3b8;
//                            margin-top:4px;text-align:right;">
//                 ${new Date(p.signedAt).toLocaleDateString('en-GB',{
//                   day:'2-digit',month:'short',year:'numeric',
//                 })}
//               </div>` : ''}
//           </td>
//         </tr>
//       </table>
//       ${ok && p.auditInfo ? auditBlock(p.auditInfo) : ''}
//     </div>`;
// }

// // ── CC chip ───────────────────────────────────────────────────
// function ccChip(cc) {
//   return `
//     <div style="display:inline-block;
//                 background:#f1f5f9;border:1px solid #e2e8f0;
//                 border-radius:8px;padding:8px 14px;
//                 margin:4px 4px 4px 0;vertical-align:top;">
//       <div style="font-size:12px;font-weight:700;
//                   color:#1e293b;">
//         ${cc.name || cc.email}
//       </div>
//       ${cc.designation
//         ? `<div style="font-size:10px;color:#64748b;">
//              ${cc.designation}
//            </div>` : ''}
//       ${cc.name
//         ? `<div style="font-size:10px;color:#94a3b8;
//                        margin-top:1px;">
//              ${cc.email}
//            </div>` : ''}
//     </div>`;
// }

// // ═══════════════════════════════════════════════════════════════
// // MASTER EMAIL SHELL
// // ═══════════════════════════════════════════════════════════════
// function buildEmail({
//   logoUrl,
//   companyName,
//   subject,
//   bodyHtml,
//   accentColor = BRAND.color,
// }) {
//   const displayName = companyName || BRAND.name;

//   return `<!DOCTYPE html>
// <html lang="en">
// <head>
//   <meta charset="UTF-8"/>
//   <meta name="viewport"
//         content="width=device-width,initial-scale=1.0"/>
//   <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
//   <title>${subject}</title>
//   <style>
//     @media only screen and (max-width:620px){
//       .wrap  { padding:12px 6px !important; }
//       .card  { border-radius:12px !important; }
//       .body  { padding:24px 18px !important; }
//     }
//   </style>
// </head>
// <body style="margin:0;padding:0;background:#dce6f0;
//              font-family:-apple-system,BlinkMacSystemFont,
//              'Segoe UI',Roboto,'Helvetica Neue',
//              Arial,sans-serif;">

//   <table role="presentation" width="100%"
//          cellpadding="0" cellspacing="0"
//          class="wrap"
//          style="background:#dce6f0;padding:36px 16px;">
//     <tr>
//       <td align="center">

//         <table role="presentation" width="600"
//                cellpadding="0" cellspacing="0"
//                class="card"
//                style="max-width:600px;width:100%;
//                       background:#ffffff;
//                       border-radius:18px;overflow:hidden;
//                       box-shadow:0 8px 40px
//                         rgba(0,0,0,0.11);">

//           <!-- ░░ HEADER — Company highlighted ░░ -->
//           <tr>
//             ${companyHeader(logoUrl, companyName)}
//           </tr>

//           <!-- ░░ BODY ░░ -->
//           <tr>
//             <td class="body"
//                 style="padding:36px 40px;font-size:15px;
//                        color:#374151;line-height:1.75;">
//               ${bodyHtml}
//             </td>
//           </tr>

//           <!-- ░░ DIVIDER ░░ -->
//           <tr>
//             <td style="padding:0 40px;">
//               <div style="height:1px;
//                           background:#f1f5f9;">
//               </div>
//             </td>
//           </tr>

//           <!-- ░░ FOOTER ░░ -->
//           <tr>
//             <td style="padding:22px 40px 28px;">

//               <table role="presentation" width="100%"
//                      cellpadding="0" cellspacing="0">
//                 <tr>

//                   <!-- LEFT: NexSign brand -->
//                   <td style="vertical-align:middle;">
//                     <table role="presentation"
//                            cellpadding="0" cellspacing="0">
//                       <tr>
//                         <td style="vertical-align:middle;
//                                    padding-right:10px;">
//                           <div style="width:34px;height:34px;
//                                       background:linear-gradient(
//                                         135deg,
//                                         ${BRAND.color},
//                                         ${BRAND.colorDark});
//                                       border-radius:9px;
//                                       text-align:center;
//                                       line-height:34px;
//                                       font-size:16px;
//                                       font-weight:900;
//                                       color:#fff;
//                                       display:inline-block;">
//                             N
//                           </div>
//                         </td>
//                         <td style="vertical-align:middle;">
//                           <div style="font-size:13px;
//                                       font-weight:800;
//                                       color:#0f172a;">
//                             NexSign
//                           </div>
//                           <div style="font-size:10px;
//                                       color:#94a3b8;">
//                             nexsign.app
//                           </div>
//                         </td>
//                       </tr>
//                     </table>
//                   </td>

//                   <!-- RIGHT: Company name HIGHLIGHTED -->
//                   <td style="text-align:right;
//                              vertical-align:middle;">
//                     <div style="font-size:10px;
//                                 color:#94a3b8;
//                                 margin-bottom:3px;">
//                       Sent via NexSign by
//                     </div>
//                     <!-- ★ Company name — prominent blue ★ -->
//                     <div style="font-size:15px;
//                                 font-weight:800;
//                                 color:${BRAND.color};
//                                 letter-spacing:0.2px;">
//                       ${displayName}
//                     </div>
//                   </td>

//                 </tr>
//               </table>

//               <!-- Fine print -->
//               <div style="margin-top:16px;padding-top:14px;
//                           border-top:1px solid #f1f5f9;
//                           text-align:center;font-size:10px;
//                           color:#cbd5e1;line-height:1.8;">
//                 &copy;&nbsp;${BRAND.year}&nbsp;
//                 <strong style="color:#94a3b8;">
//                   ${displayName}
//                 </strong>
//                 &nbsp;&middot;&nbsp;All rights reserved
//                 <br/>
//                 Powered by&nbsp;
//                 <a href="${BRAND.website}"
//                    style="color:${BRAND.color};
//                           text-decoration:none;
//                           font-weight:700;">
//                   NexSign
//                 </a>
//                 &nbsp;&middot;&nbsp;
//                 Enterprise Electronic Signature Platform
//                 <br/>
//                 <span style="color:#e2e8f0;">
//                   You received this because
//                   ${companyName || 'a user'}
//                   used NexSign to process this document.
//                 </span>
//               </div>

//             </td>
//           </tr>

//         </table>
//         <!-- /card -->

//       </td>
//     </tr>
//   </table>
// </body>
// </html>`;
// }

// // ═══════════════════════════════════════════════════════════════
// // SEND WITH RETRY
// // ═══════════════════════════════════════════════════════════════
// async function sendMail(opts, retries = 2) {
//   if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
//     console.error('❌ [Email] Credentials missing!');
//     throw new Error('Email service not configured.');
//   }
//   const t = getTransporter();
//   let lastErr;
//   for (let i = 0; i <= retries; i++) {
//     try {
//       const info = await t.sendMail(opts);
//       console.log(`📧 [Email] → ${opts.to} [${info.messageId}]`);
//       return info;
//     } catch (err) {
//       lastErr = err;
//       console.error(
//         `📧 [Email] Attempt ${i + 1} failed → ${opts.to}:`,
//         err.message,
//       );
//       if (i < retries)
//         await new Promise(r => setTimeout(r, 1_500 * (i + 1)));
//     }
//   }
//   throw lastErr;
// }

// // ═══════════════════════════════════════════════════════════════
// // 1. SIGNING INVITATION  (Module 1)
// // ═══════════════════════════════════════════════════════════════
// async function sendSigningEmail({
//   recipientEmail,
//   recipientName,
//   recipientDesignation = '',
//   senderName,
//   senderDesignation    = '',
//   documentTitle,
//   signingLink,
//   companyLogoUrl       = '',
//   companyName          = '',
//   partyNumber          = 1,
//   totalParties         = 1,
//   message              = '',
//   ccList               = [],
// }) {
//   const subject = companyName
//     ? `${companyName} requests your signature on "${documentTitle}"`
//     : `Signature Required: "${documentTitle}"`;

//   const progressHtml = totalParties > 1 ? `
//     <div style="background:#f0f9ff;border:1px solid #bae6fd;
//                 border-radius:8px;padding:10px 16px;
//                 font-size:13px;color:#0369a1;margin:14px 0;">
//       You are signer
//       <strong style="color:${BRAND.color};">
//         ${partyNumber} of ${totalParties}
//       </strong>
//     </div>` : '';

//   const msgHtml = message ? `
//     <div style="border-left:4px solid #cbd5e1;
//                 padding:12px 18px;margin:18px 0;
//                 background:#f8fafc;
//                 border-radius:0 8px 8px 0;
//                 font-style:italic;color:#475569;
//                 font-size:14px;">
//       "${message}"
//     </div>` : '';

//   const ccHtml = ccList.length ? `
//     <div style="margin:20px 0;">
//       <div style="font-size:10px;font-weight:700;
//                   color:#64748b;text-transform:uppercase;
//                   letter-spacing:0.7px;margin-bottom:8px;">
//         CC Recipients
//       </div>
//       ${ccList.map(cc => ccChip(cc)).join('')}
//     </div>` : '';

//   const bodyHtml = `
//     <p style="font-size:17px;font-weight:700;
//               color:#0f172a;margin:0 0 4px;">
//       Hello, ${recipientName}
//       ${recipientDesignation
//         ? `<span style="font-size:12px;color:#64748b;
//                         font-weight:400;">
//              &nbsp;&middot;&nbsp;${recipientDesignation}
//            </span>` : ''}
//     </p>
//     <p style="color:#64748b;font-size:13px;margin:4px 0 20px;">
//       ${senderName}
//       ${senderDesignation
//         ? `<span style="color:#94a3b8;">
//              (${senderDesignation})
//            </span>` : ''}
//       ${companyName
//         ? `from
//            <strong style="color:#0f172a;">
//              ${companyName}
//            </strong>` : ''}
//       has sent you a document for your electronic signature.
//     </p>

//     ${docCard(documentTitle, docSubtitle(documentTitle))}
//     ${progressHtml}
//     ${msgHtml}
//     ${ctaBtn(signingLink, 'Review &amp; Sign Document &rarr;')}
//     ${securityNote()}
//     ${ccHtml}`;

//   return sendMail({
//     from:    fromField(companyName),
//     to:      recipientEmail,
//     subject,
//     html:    buildEmail({
//       logoUrl: companyLogoUrl, companyName,
//       subject, bodyHtml,
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 2. COMPLETION EMAIL — PDF attached  (Module 1 + 2)
// // ═══════════════════════════════════════════════════════════════
// async function sendCompletionEmail({
//   recipientEmail,
//   recipientName,
//   recipientDesignation = '',
//   documentTitle,
//   pdfBuffer,
//   signedPdfUrl         = '',
//   companyLogoUrl       = '',
//   companyName          = '',
//   parties              = [],
//   ccList               = [],
//   isCC                 = false,
// }) {
//   const subject =
//     `"${documentTitle}" — Fully Signed. Your copy is attached`;

//   const roleNote = isCC ? `
//     <div style="background:#f0f9ff;border:1px solid #bae6fd;
//                 border-radius:8px;padding:10px 16px;
//                 font-size:13px;color:#0369a1;margin:14px 0;">
//       You are receiving this as a
//       <strong>courtesy copy</strong>.
//       No action required.
//     </div>` : '';

//   const signersHtml = parties.length ? `
//     <div style="margin:20px 0;">
//       <div style="font-size:10px;font-weight:700;
//                   color:#64748b;text-transform:uppercase;
//                   letter-spacing:0.7px;margin-bottom:10px;">
//         Signing Summary
//       </div>
//       ${parties.map((p, i) => signerCard(p, i)).join('')}
//     </div>` : '';

//   const ccHtml = ccList.length ? `
//     <div style="margin:20px 0;">
//       <div style="font-size:10px;font-weight:700;
//                   color:#64748b;text-transform:uppercase;
//                   letter-spacing:0.7px;margin-bottom:8px;">
//         CC Recipients
//       </div>
//       ${ccList.map(cc => ccChip(cc)).join('')}
//     </div>` : '';

//   const pdfNote = pdfBuffer ? `
//     <div style="background:#f0fdf4;border:1px solid #bbf7d0;
//                 border-radius:8px;padding:12px 16px;
//                 font-size:13px;color:#15803d;margin:16px 0;">
//       <strong>✅ Signed PDF attached</strong><br/>
//       <span style="font-size:12px;color:#16a34a;">
//         "${documentTitle}.pdf" is attached to this email.
//         Please save it for your records.
//       </span>
//     </div>` : '';

//   const bodyHtml = `
//     <div style="text-align:center;margin-bottom:26px;">
//       <div style="width:64px;height:64px;background:#dcfce7;
//                   border-radius:50%;display:inline-block;
//                   line-height:64px;font-size:32px;
//                   margin-bottom:12px;">
//         ✅
//       </div>
//       <h2 style="color:#15803d;margin:0 0 4px;
//                  font-size:22px;">
//         Document Completed!
//       </h2>
//       <p style="color:#64748b;font-size:13px;margin:0;">
//         All parties have successfully signed.
//       </p>
//     </div>

//     <p style="color:#374151;margin:0 0 14px;">
//       Hello <strong>${recipientName}</strong>
//       ${recipientDesignation
//         ? `<span style="font-size:12px;color:#64748b;">
//              &nbsp;&middot;&nbsp;${recipientDesignation}
//            </span>` : ''},
//     </p>

//     ${roleNote}
//     ${docCard(documentTitle, docSubtitle(documentTitle), '#22c55e')}
//     ${pdfNote}

//     ${signedPdfUrl
//       ? ctaBtn(
//           signedPdfUrl,
//           '&#8659; View &amp; Download Signed PDF',
//           '#16a34a',
//         )
//       : ''}

//     ${signersHtml}
//     ${ccHtml}

//     <div style="background:#f8fafc;border:1px solid #e2e8f0;
//                 border-radius:8px;padding:12px 16px;
//                 font-size:12px;color:#64748b;margin:16px 0;">
//       This document is legally binding and tamper-evident,
//       verified by NexSign's audit trail.
//     </div>`;

//   const attachments = [];
//   if (pdfBuffer && pdfBuffer.length > 0) {
//     const safe = documentTitle
//       .replace(/[^a-z0-9_\-\s]/gi, '_')
//       .replace(/\s+/g, '_').trim();
//     attachments.push({
//       filename:    `${safe}_signed.pdf`,
//       content:     pdfBuffer,
//       contentType: 'application/pdf',
//     });
//   }

//   return sendMail({
//     from:        fromField(companyName),
//     to:          recipientEmail,
//     subject,
//     html:        buildEmail({
//       logoUrl: companyLogoUrl, companyName,
//       subject, bodyHtml, accentColor: '#16a34a',
//     }),
//     attachments,
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 3. CC NOTIFICATION  (Module 1)
// // ═══════════════════════════════════════════════════════════════
// async function sendCCEmail({
//   recipientEmail,
//   recipientName,
//   recipientDesignation = '',
//   documentTitle,
//   senderName,
//   senderDesignation    = '',
//   companyLogoUrl       = '',
//   companyName          = '',
//   parties              = [],
// }) {
//   const subject = companyName
//     ? `[CC] ${companyName}: "${documentTitle}" — Signing in Progress`
//     : `[CC] "${documentTitle}" — Signing in Progress`;

//   const partiesHtml = parties.length ? `
//     <div style="margin:20px 0;">
//       <div style="font-size:10px;font-weight:700;
//                   color:#64748b;text-transform:uppercase;
//                   letter-spacing:0.7px;margin-bottom:10px;">
//         Signers
//       </div>
//       ${parties.map((p, i) => signerCard(p, i)).join('')}
//     </div>` : '';

//   const bodyHtml = `
//     <p style="font-size:17px;font-weight:700;
//               color:#0f172a;margin:0 0 4px;">
//       Hello, ${recipientName}
//       ${recipientDesignation
//         ? `<span style="font-size:12px;color:#64748b;
//                         font-weight:400;">
//              &nbsp;&middot;&nbsp;${recipientDesignation}
//            </span>` : ''}
//     </p>

//     <div style="background:#f0f9ff;border:1px solid #bae6fd;
//                 border-radius:8px;padding:10px 16px;
//                 font-size:13px;color:#0369a1;margin:14px 0;">
//       You have been added as a
//       <strong>CC recipient</strong> on this document.
//       No action required.
//     </div>

//     <p style="color:#374151;margin:0 0 16px;">
//       <strong>${senderName}</strong>
//       ${senderDesignation
//         ? `<span style="color:#94a3b8;font-size:13px;">
//              (${senderDesignation})
//            </span>` : ''}
//       ${companyName
//         ? `from
//            <strong style="color:#0f172a;">
//              ${companyName}
//            </strong>` : ''}
//       has initiated signing for:
//     </p>

//     ${docCard(documentTitle, docSubtitle(documentTitle))}
//     ${partiesHtml}

//     <div style="background:#fef9c3;border:1px solid #fde68a;
//                 border-radius:8px;padding:12px 16px;
//                 font-size:13px;color:#713f12;margin:16px 0;">
//       📬 You will receive the
//       <strong>final signed PDF</strong>
//       once all parties complete signing.
//     </div>`;

//   return sendMail({
//     from: fromField(companyName),
//     to:   recipientEmail,
//     subject,
//     html: buildEmail({
//       logoUrl: companyLogoUrl, companyName,
//       subject, bodyHtml,
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 4. DOCUMENT DECLINED  (Module 1 + 2)
// // ═══════════════════════════════════════════════════════════════
// async function sendDeclinedEmail({
//   ownerEmail,
//   ownerName,
//   documentTitle,
//   declinerName,
//   declinerEmail        = '',
//   declinerDesignation  = '',
//   // Module 2 alt param names
//   signerName,
//   signerEmail,
//   title,
//   reason               = '',
//   companyLogoUrl       = '',
//   companyName          = '',
// }) {
//   const docTitle = documentTitle || title || 'Document';
//   const dName    = declinerName  || signerName  || 'A signer';
//   const dEmail   = declinerEmail || signerEmail || '';
//   const subject  = `Signing Declined: "${docTitle}"`;

//   const bodyHtml = `
//     <div style="text-align:center;margin-bottom:26px;">
//       <div style="width:64px;height:64px;background:#fee2e2;
//                   border-radius:50%;display:inline-block;
//                   line-height:64px;font-size:32px;
//                   margin-bottom:12px;">
//         ⚠️
//       </div>
//       <h2 style="color:#dc2626;margin:0 0 4px;
//                  font-size:22px;">
//         Signing Declined
//       </h2>
//     </div>

//     <p style="color:#374151;margin:0 0 16px;">
//       Hello <strong>${ownerName}</strong>,
//     </p>
//     <p style="color:#374151;margin:0 0 16px;">
//       A signer has declined to sign your document.
//     </p>

//     <div style="background:#fef2f2;border:1px solid #fecaca;
//                 border-radius:12px;padding:20px 22px;
//                 margin:16px 0;">

//       ${docCard(docTitle, docSubtitle(docTitle), '#ef4444')}

//       <div style="margin-top:14px;">
//         <div style="font-size:10px;color:#991b1b;
//                     font-weight:700;text-transform:uppercase;
//                     letter-spacing:0.7px;margin-bottom:6px;">
//           Declined By
//         </div>
//         <div style="font-size:14px;font-weight:700;
//                     color:#0f172a;">
//           ${dName}
//           ${declinerDesignation
//             ? `<span style="color:#64748b;font-size:12px;
//                             font-weight:400;">
//                  &nbsp;&middot;&nbsp;${declinerDesignation}
//                </span>` : ''}
//         </div>
//         ${dEmail
//           ? `<div style="font-size:12px;color:#94a3b8;
//                          margin-top:2px;">
//                ${dEmail}
//              </div>` : ''}
//       </div>

//       ${reason ? `
//         <div style="margin-top:14px;padding-top:14px;
//                     border-top:1px solid #fecaca;">
//           <div style="font-size:10px;color:#991b1b;
//                       font-weight:700;text-transform:uppercase;
//                       letter-spacing:0.7px;margin-bottom:4px;">
//             Reason
//           </div>
//           <div style="font-size:13px;color:#374151;
//                       font-style:italic;">
//             "${reason}"
//           </div>
//         </div>` : ''}

//     </div>`;

//   return sendMail({
//     from: fromField(companyName),
//     to:   ownerEmail,
//     subject,
//     html: buildEmail({
//       logoUrl: companyLogoUrl, companyName,
//       subject, bodyHtml, accentColor: '#ef4444',
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 5. BOSS APPROVAL  (Module 2)
// // ═══════════════════════════════════════════════════════════════
// async function sendBossApprovalEmail({
//   bossEmail,
//   bossName,
//   bossDesignation = '',
//   documentTitle,
//   signingLink,
//   employeeCount   = 0,
//   senderName,
//   companyLogoUrl  = '',
//   companyName     = '',
//   message         = '',
// }) {
//   const subject = companyName
//     ? `${companyName}: Your approval needed on "${documentTitle}"`
//     : `Master Approval Required: "${documentTitle}"`;

//   const msgHtml = message ? `
//     <div style="border-left:4px solid #cbd5e1;
//                 padding:12px 18px;margin:18px 0;
//                 background:#f8fafc;
//                 border-radius:0 8px 8px 0;
//                 font-style:italic;color:#475569;
//                 font-size:14px;">
//       "${message}"
//     </div>` : '';

//   const bodyHtml = `
//     <p style="font-size:17px;font-weight:700;
//               color:#0f172a;margin:0 0 4px;">
//       Hello, ${bossName}
//       ${bossDesignation
//         ? `<span style="font-size:12px;color:#64748b;
//                         font-weight:400;">
//              &nbsp;&middot;&nbsp;${bossDesignation}
//            </span>` : ''}
//     </p>

//     <div style="background:#faf5ff;border:1px solid #e9d5ff;
//                 border-radius:8px;padding:10px 16px;
//                 font-size:13px;color:#7c3aed;margin:14px 0;">
//       👑 You are the
//       <strong>Primary Approver</strong>
//       for this document.
//     </div>

//     <p style="color:#374151;margin:0 0 16px;">
//       <strong>${senderName}</strong>
//       ${companyName
//         ? `from
//            <strong style="color:#0f172a;">
//              ${companyName}
//            </strong>` : ''}
//       requires your approval on:
//     </p>

//     ${docCard(documentTitle, docSubtitle(documentTitle), '#7c3aed')}

//     <div style="background:#f0f9ff;border:1px solid #bae6fd;
//                 border-radius:8px;padding:10px 16px;
//                 font-size:13px;color:#0369a1;margin:14px 0;">
//       After your approval this will automatically be sent to
//       <strong style="color:${BRAND.color};">
//         ${employeeCount}
//         recipient${employeeCount !== 1 ? 's' : ''}
//       </strong>.
//       Your signature will be embedded on each copy.
//     </div>

//     ${msgHtml}
//     ${ctaBtn(signingLink,
//       'Review &amp; Sign as Approver &rarr;', '#7c3aed')}
//     ${securityNote()}`;

//   return sendMail({
//     from: fromField(companyName),
//     to:   bossEmail,
//     subject,
//     html: buildEmail({
//       logoUrl: companyLogoUrl, companyName,
//       subject, bodyHtml, accentColor: '#7c3aed',
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 6. EMPLOYEE SIGNING EMAIL  (Module 2)
// // ═══════════════════════════════════════════════════════════════
// async function sendEmployeeSigningEmail({
//   employeeEmail,
//   employeeName,
//   documentTitle,
//   signingLink,
//   bossName,
//   bossDesignation = '',
//   companyLogoUrl  = '',
//   companyName     = '',
// }) {
//   const subject = companyName
//     ? `${companyName} requests your signature on "${documentTitle}"`
//     : `Please sign: "${documentTitle}"`;

//   const bodyHtml = `
//     <p style="font-size:17px;font-weight:700;
//               color:#0f172a;margin:0 0 16px;">
//       Hello, ${employeeName}
//     </p>

//     <p style="color:#374151;margin:0 0 16px;">
//       ${companyName
//         ? `<strong>${companyName}</strong> has`
//         : 'You have'}
//       a document ready for your electronic signature:
//     </p>

//     ${docCard(documentTitle, docSubtitle(documentTitle))}

//     <div style="background:#f0fdf4;border:1px solid #86efac;
//                 border-radius:8px;padding:10px 16px;
//                 font-size:13px;color:#15803d;margin:14px 0;">
//       ✅ Already approved by:&nbsp;
//       <strong>${bossName}</strong>
//       ${bossDesignation
//         ? `<span style="color:#64748b;">
//              &nbsp;&middot;&nbsp;${bossDesignation}
//            </span>` : ''}
//     </div>

//     ${ctaBtn(signingLink, 'Sign My Document &rarr;')}
//     ${securityNote()}`;

//   return sendMail({
//     from: fromField(companyName),
//     to:   employeeEmail,
//     subject,
//     html: buildEmail({
//       logoUrl: companyLogoUrl, companyName,
//       subject, bodyHtml,
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 7. BOSS SIGNED CONFIRMATION  (Module 2)
// // ═══════════════════════════════════════════════════════════════
// async function sendBossSignedConfirmEmail({
//   bossEmail,
//   bossName,
//   documentTitle,
//   recipientCount  = 0,
//   companyLogoUrl  = '',
//   companyName     = '',
// }) {
//   const subject =
//     `You've signed "${documentTitle}" — ` +
//     `Sending to ${recipientCount} ` +
//     `recipient${recipientCount !== 1 ? 's' : ''}`;

//   const bodyHtml = `
//     <div style="text-align:center;margin-bottom:26px;">
//       <div style="width:64px;height:64px;background:#dcfce7;
//                   border-radius:50%;display:inline-block;
//                   line-height:64px;font-size:32px;
//                   margin-bottom:12px;">
//         🎉
//       </div>
//       <h2 style="color:#15803d;margin:0 0 4px;
//                  font-size:22px;">
//         Signature Recorded!
//       </h2>
//     </div>

//     <p style="color:#374151;margin:0 0 16px;">
//       Hello <strong>${bossName}</strong>,
//     </p>
//     <p style="color:#374151;margin:0 0 16px;">
//       Your signature on the following document has been
//       successfully recorded:
//     </p>

//     ${docCard(documentTitle, docSubtitle(documentTitle), '#22c55e')}

//     <div style="background:#f0f9ff;border:1px solid #bae6fd;
//                 border-radius:8px;padding:10px 16px;
//                 font-size:13px;color:#0369a1;margin:14px 0;">
//       Signing requests are now being sent to
//       <strong style="color:${BRAND.color};">
//         ${recipientCount}
//         recipient${recipientCount !== 1 ? 's' : ''}
//       </strong>.
//       You will be notified when all parties have signed.
//     </div>

//     <div style="background:#f8fafc;border:1px solid #e2e8f0;
//                 border-radius:8px;padding:12px 16px;
//                 font-size:12px;color:#64748b;margin:16px 0;">
//       Your signature is embedded as a permanent layer
//       on each recipient's individual copy.
//     </div>`;

//   return sendMail({
//     from: fromField(companyName),
//     to:   bossEmail,
//     subject,
//     html: buildEmail({
//       logoUrl: companyLogoUrl, companyName,
//       subject, bodyHtml, accentColor: '#16a34a',
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 8. RESEND / REMINDER  (Module 2)
// // ═══════════════════════════════════════════════════════════════
// async function sendResendEmail({
//   employeeEmail,
//   employeeName,
//   documentTitle,
//   signingLink,
//   bossName,
//   bossDesignation = '',
//   companyLogoUrl  = '',
//   companyName     = '',
//   reminderNumber  = 1,
// }) {
//   const subject = companyName
//     ? `Reminder from ${companyName}: ` +
//       `"${documentTitle}" awaits your signature`
//     : `Reminder: "${documentTitle}" needs your signature`;

//   const bodyHtml = `
//     <div style="background:#fffbeb;border:1px solid #fde68a;
//                 border-radius:8px;padding:10px 16px;
//                 font-size:13px;color:#92400e;margin:0 0 16px;">
//       ⏰ This is a
//       <strong>reminder — action required</strong>.
//     </div>

//     <p style="font-size:17px;font-weight:700;
//               color:#0f172a;margin:0 0 16px;">
//       Hello, ${employeeName}
//     </p>

//     <p style="color:#374151;margin:0 0 16px;">
//       ${companyName
//         ? `<strong>${companyName}</strong>`
//         : 'Your organisation'}
//       is still waiting for your signature on:
//     </p>

//     ${docCard(documentTitle, docSubtitle(documentTitle), '#f59e0b')}

//     <div style="background:#f0fdf4;border:1px solid #86efac;
//                 border-radius:8px;padding:10px 16px;
//                 font-size:13px;color:#15803d;margin:14px 0;">
//       ✅ Approved by:&nbsp;
//       <strong>${bossName}</strong>
//       ${bossDesignation
//         ? `<span style="color:#64748b;">
//              &nbsp;&middot;&nbsp;${bossDesignation}
//            </span>` : ''}
//     </div>

//     <p style="color:#64748b;font-size:13px;margin:0 0 4px;">
//       Your signing link has been refreshed:
//     </p>

//     ${ctaBtn(signingLink, 'Sign Now &rarr;', '#d97706')}
//     ${securityNote()}`;

//   return sendMail({
//     from: fromField(companyName),
//     to:   employeeEmail,
//     subject,
//     html: buildEmail({
//       logoUrl: companyLogoUrl, companyName,
//       subject, bodyHtml, accentColor: '#d97706',
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 9. FEEDBACK
// // ═══════════════════════════════════════════════════════════════
// async function sendFeedbackEmail(userEmail, userName, stars) {
//   const n       = Math.min(Math.max(Number(stars) || 0, 0), 5);
//   const bar     = '⭐'.repeat(n);
//   const subject = `Thank you for rating NexSign ${bar}`;

//   const bodyHtml = `
//     <h2 style="color:#0f172a;margin:0 0 16px;font-size:20px;">
//       Hello ${userName || 'Valued User'}!
//     </h2>
//     <p style="color:#374151;margin:0 0 16px;">
//       Thank you for taking the time to rate us.
//       Your feedback makes NexSign better every day.
//     </p>
//     <div style="background:#fefce8;border:1px solid #fde68a;
//                 border-radius:12px;padding:22px;
//                 text-align:center;margin:16px 0;">
//       <div style="font-size:30px;letter-spacing:4px;
//                   margin-bottom:8px;">
//         ${bar}
//       </div>
//       <div style="font-size:20px;font-weight:800;
//                   color:#92400e;">
//         ${n}-Star Rating
//       </div>
//     </div>
//     <p style="color:#374151;font-size:14px;margin:16px 0 0;">
//       We appreciate your trust in NexSign. 🚀<br/><br/>
//       <strong>The NexSign Team</strong>
//     </p>`;

//   return sendMail({
//     from: fromField(BRAND.name),
//     to:   userEmail,
//     subject,
//     html: buildEmail({
//       companyName: BRAND.name, subject, bodyHtml,
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // 10. VIEW ONLY
// // ═══════════════════════════════════════════════════════════════
// async function sendViewEmail({
//   recipientEmail,
//   recipientName,
//   documentTitle,
//   senderName,
//   viewLink,
//   companyLogoUrl = '',
//   companyName    = '',
// }) {
//   const subject = companyName
//     ? `${companyName} shared "${documentTitle}" with you`
//     : `Document Shared: "${documentTitle}"`;

//   const bodyHtml = `
//     <p style="font-size:17px;font-weight:700;
//               color:#0f172a;margin:0 0 16px;">
//       Hello, ${recipientName}
//     </p>
//     <p style="color:#374151;margin:0 0 16px;">
//       <strong>${senderName}</strong>
//       ${companyName
//         ? `from <strong>${companyName}</strong>` : ''}
//       has shared a document with you:
//     </p>
//     ${docCard(documentTitle, docSubtitle(documentTitle))}
//     ${ctaBtn(viewLink, 'View Document &rarr;')}
//     <div style="background:#f0f9ff;border:1px solid #bae6fd;
//                 border-radius:8px;padding:10px 16px;
//                 font-size:13px;color:#0369a1;margin:16px 0;">
//       View only. No signature required.
//     </div>`;

//   return sendMail({
//     from: fromField(companyName),
//     to:   recipientEmail,
//     subject,
//     html: buildEmail({
//       logoUrl: companyLogoUrl, companyName,
//       subject, bodyHtml,
//     }),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // EXPORTS
// // ═══════════════════════════════════════════════════════════════
// module.exports = {
//   // Module 1
//   sendSigningEmail,
//   sendCompletionEmail,
//   sendCCEmail,
//   sendDeclinedEmail,

//   // Module 2
//   sendBossApprovalEmail,
//   sendEmployeeSigningEmail,
//   sendBossSignedConfirmEmail,
//   sendResendEmail,

//   // Utility
//   sendFeedbackEmail,
//   sendViewEmail,
// };

'use strict';
/**
 * emailService.js — NexSign Professional Email System
 *
 * Handles all transactional emails with Fortune-500-quality HTML.
 * Renders perfectly in Gmail, Outlook, Apple Mail, and mobile clients.
 *
 * EXPORTS:
 *   sendEmail(type, data, attachments?)   → Promise<void>
 *   EMAIL_CONFIG                          → configuration map
 *   getDocumentSubtitle(title)            → string
 */

const nodemailer = require('nodemailer');

// ─── Transport (configure via env) ───────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_SECURE !== 'false', // Default to true for port 465
  auth: {
    user: process.env.SMTP_USER || process.env.EMAIL_USER,
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
  },
  pool: true, // Use pooling for better performance on Vercel
  maxConnections: 3,
  maxMessages: 10,
});

// ─── Document subtitle auto-detection ────────────────────────────────────────
function getDocumentSubtitle(title) {
  if (!title) return 'Document for Signature';
  const t = title.toLowerCase();
  if (t.includes('employ'))                     return 'Employment Agreement';
  if (t.includes('nda') || t.includes('non-discl')) return 'Non-Disclosure Agreement';
  if (t.includes('contract'))                   return 'Contract Document';
  if (t.includes('offer'))                      return 'Offer Letter';
  if (t.includes('invoice'))                    return 'Invoice';
  if (t.includes('agreement'))                  return 'Legal Agreement';
  if (t.includes('policy'))                     return 'Policy Document';
  if (t.includes('consent'))                    return 'Consent Form';
  if (t.includes('termination'))                return 'Termination Notice';
  if (t.includes('onboard'))                    return 'Onboarding Document';
  return 'Document for Signature';
}

// ─── Email type configs ───────────────────────────────────────────────────────
const EMAIL_CONFIG = {

  signing_request: {
    subject:     d => `${d.companyName} requests your signature on "${d.docTitle}"`,
    heroIcon:    'sign',
    iconBg:      '#EFF6FF',
    heroTitle:   d => `You have a document to sign`,
    heroMessage: d => `Hello ${d.signerName},<br><br>${d.companyName} has sent you <strong>"${d.docTitle}"</strong> for your electronic signature.<br>Please review and sign at your earliest convenience.`,
    buttonText:  'Review & Sign Document &rarr;',
    showButton:  true,
    hasPdf:      false,
  },

  completion: {
    subject:     d => `"${d.docTitle}" has been fully signed — Your copy is attached`,
    heroIcon:    'check',
    iconBg:      '#F0FDF4',
    heroTitle:   () => `Document successfully signed!`,
    heroMessage: d => `Hello ${d.signerName},<br><br>All parties have signed <strong>"${d.docTitle}"</strong>. Your completed copy is attached to this email.<br>This document is legally binding.`,
    showButton:  false,
    hasPdf:      true,
  },

  cc_notification: {
    subject:     d => `[Copy] "${d.docTitle}" — Fully executed document`,
    heroIcon:    'copy',
    iconBg:      '#FAF5FF',
    heroTitle:   () => `Document completed — For your records`,
    heroMessage: d => `Hello ${d.ccName || d.signerName},<br><br>You are receiving this as a courtesy copy. <strong>"${d.docTitle}"</strong> has been fully signed by all parties.<br>A completed copy is attached for your records.`,
    showButton:  false,
    hasPdf:      true,
  },

  boss_signed_confirm: {
    subject:     d => `You've signed "${d.docTitle}" — Sending to recipients`,
    heroIcon:    'celebrate',
    iconBg:      '#F0FDF4',
    heroTitle:   () => `Your signature has been recorded`,
    heroMessage: d => `Hello ${d.bossName || d.signerName},<br><br>Your signature on <strong>"${d.docTitle}"</strong> has been saved. We are now sending signing requests to <strong>${d.recipientCount || 0} recipient(s)</strong>.<br>You will be notified when all parties have signed.`,
    showButton:  false,
    hasPdf:      false,
  },

  resend_request: {
    subject:     d => `Reminder: "${d.docTitle}" still needs your signature`,
    heroIcon:    'clock',
    iconBg:      '#FFFBEB',
    heroTitle:   () => `This document needs your attention`,
    heroMessage: d => `Hello ${d.signerName},<br><br>This is a friendly reminder that <strong>"${d.docTitle}"</strong> from ${d.companyName} is still waiting for your signature.<br>Your signing link has been refreshed below.`,
    buttonText:  'Sign Now &rarr;',
    showButton:  true,
    hasPdf:      false,
  },

  declined_notification: {
    subject:     d => `"${d.docTitle}" was declined by ${d.signerName}`,
    heroIcon:    'clock',
    iconBg:      '#FEF2F2',
    heroTitle:   () => `A signer declined your document`,
    heroMessage: d => `Hello ${d.signerName || 'there'},<br><br><strong>${d.declinerName || 'A signer'}</strong> declined to sign <strong>"${d.docTitle}"</strong>.${d.reason ? `<br><br>Reason: ${d.reason}` : ''}`,
    showButton:  false,
    hasPdf:      false,
  },

};

// ─── Icon SVG map ─────────────────────────────────────────────────────────────
function getHeroIconHtml(iconType) {
  const icons = {
    sign:      `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" stroke-width="2.2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
    check:     `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    copy:      `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
    celebrate: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
    clock:     `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  };
  return icons[iconType] || icons.sign;
}

// ─── Build full HTML email ────────────────────────────────────────────────────
function buildEmailHtml(opts) {
  const {
    subject, heroIcon, iconBg, heroTitle, heroMessage,
    buttonText, showButton, hasPdf, actionUrl,
    documentTitle, documentSubtitle, senderName, signerName,
    companyName, companyLogo, companyInitial, expiryDate,
  } = opts;

  const logoHtml = companyLogo
    ? `<img src="${companyLogo}" alt="${companyName}" height="40" style="max-height:40px;max-width:160px;object-fit:contain;display:block;" />`
    : `<div style="width:44px;height:44px;border-radius:10px;background:#28ABDF;display:inline-flex;align-items:center;justify-content:center;">
        <span style="color:#fff;font-size:22px;font-weight:800;font-family:Georgia,serif;">${companyInitial || 'N'}</span>
       </div>`;

  const buttonHtml = showButton && actionUrl ? `
    <tr>
      <td style="padding:28px 40px;">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center">
              <a href="${actionUrl}"
                 style="display:inline-block;background:linear-gradient(135deg,#28ABDF 0%,#1d8fbf 100%);
                        color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;
                        padding:15px 44px;border-radius:10px;letter-spacing:0.3px;
                        box-shadow:0 4px 14px rgba(40,171,223,0.35);">
                ${buttonText}
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:14px;font-size:12px;color:#94a3b8;">
              Or copy this link:<br/>
              <span style="color:#28ABDF;font-size:11px;word-break:break-all;">${actionUrl}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : '';

  const pdfBadgeHtml = hasPdf ? `
    <tr>
      <td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;">
          <tr>
            <td>
              <p style="margin:0;font-size:13px;color:#166534;font-weight:700;">Signed PDF attached</p>
              <p style="margin:4px 0 0;font-size:12px;color:#15803d;">
                "${documentTitle}.pdf" is attached to this email. Please save it for your records.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <title>${subject}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">

      <!-- ═══ Card ═══ -->
      <table width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;
                    box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">

        <!-- HEADER: Company branding -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:24px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">${logoHtml}</td>
                <td style="vertical-align:middle;text-align:right;">
                  <span style="color:#94a3b8;font-size:12px;font-weight:600;">${companyName}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- HERO SECTION -->
        <tr>
          <td style="padding:40px 40px 0;">
            <div style="width:56px;height:56px;border-radius:14px;background:${iconBg};
                        margin-bottom:20px;display:inline-flex;align-items:center;justify-content:center;">
              ${getHeroIconHtml(heroIcon)}
            </div>
            <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">
              ${heroTitle}
            </h1>
            <p style="margin:0 0 28px;font-size:15px;color:#64748b;line-height:1.75;">
              ${heroMessage}
            </p>
          </td>
        </tr>

        <!-- DOCUMENT CARD -->
        <tr>
          <td style="padding:0 40px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="padding:20px 24px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="vertical-align:middle;padding-right:14px;">
                        <div style="width:40px;height:40px;background:#eff6ff;border-radius:10px;
                                    text-align:center;line-height:40px;font-size:18px;">
                          &#x1F4C4;
                        </div>
                      </td>
                      <td style="vertical-align:middle;">
                        <p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">${documentTitle}</p>
                        <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">
                          ${documentSubtitle} &middot; Sent by ${senderName}
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #e2e8f0;padding:14px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Sent By</td>
                      <td style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Expires</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#334155;font-weight:600;padding-top:3px;">
                        ${senderName} &middot; ${companyName}
                      </td>
                      <td style="font-size:13px;color:#334155;font-weight:600;padding-top:3px;text-align:right;">
                        ${expiryDate}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA BUTTON -->
        ${buttonHtml}

        <!-- PDF BADGE -->
        ${pdfBadgeHtml}

        <!-- SECURITY NOTE -->
        <tr>
          <td style="padding:0 40px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;">
              <tr>
                <td>
                  <p style="margin:0;font-size:12px;color:#92400e;font-weight:700;">&#x1F512; Secure &amp; Legally Binding</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#b45309;line-height:1.6;">
                    This document is protected by NexSign's audit trail. Your signature is legally binding and timestamped.
                    If you did not expect this email, please ignore it.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- DIVIDER -->
        <tr>
          <td style="padding:0 40px;"><div style="height:1px;background:#f1f5f9;"></div></td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:24px 40px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="vertical-align:middle;padding-right:8px;">
                        <div style="width:28px;height:28px;background:linear-gradient(135deg,#28ABDF,#1d6fa8);
                                    border-radius:7px;text-align:center;line-height:28px;
                                    font-size:13px;font-weight:900;color:#fff;">N</div>
                      </td>
                      <td style="vertical-align:middle;">
                        <p style="margin:0;font-size:13px;font-weight:700;color:#0f172a;">NexSign</p>
                        <p style="margin:0;font-size:10px;color:#94a3b8;">nexsign.app &middot; Trusted eSigning</p>
                      </td>
                    </tr>
                  </table>
                </td>
                <td style="text-align:right;vertical-align:middle;">
                  <p style="margin:0;font-size:11px;color:#94a3b8;">Sent via NexSign by</p>
                  <p style="margin:3px 0 0;font-size:12px;font-weight:700;color:#28ABDF;">${companyName}</p>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding-top:16px;font-size:10px;color:#cbd5e1;text-align:center;line-height:1.7;">
                  &copy; ${new Date().getFullYear()} ${companyName} &middot; All rights reserved<br/>
                  Powered by <a href="https://nexsign.app" style="color:#28ABDF;text-decoration:none;font-weight:600;">NexSign</a>
                  &middot; Electronic Signature Platform<br/>
                  <span style="color:#e2e8f0;">
                    You received this because ${senderName} used NexSign to request your signature.
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
      <!-- End Card -->

    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Main send function ───────────────────────────────────────────────────────
/**
 * @param {string}  type        - one of the EMAIL_CONFIG keys
 * @param {object}  data        - template variables
 * @param {Array}   attachments - nodemailer attachment objects [{filename, content, contentType}]
 */
async function sendEmail(type, data, attachments = []) {
  const config = EMAIL_CONFIG[type];
  if (!config) throw new Error(`[emailService] Unknown email type: ${type}`);

  const docSubtitle = data.docSubtitle || getDocumentSubtitle(data.docTitle || '');
  const expiryDate  = data.expiryDate  || (() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  })();

  const html = buildEmailHtml({
    subject:          config.subject(data),
    heroIcon:         config.heroIcon,
    iconBg:           config.iconBg,
    heroTitle:        config.heroTitle(data),
    heroMessage:      config.heroMessage(data),
    buttonText:       config.buttonText  || '',
    showButton:       config.showButton,
    hasPdf:           config.hasPdf,
    actionUrl:        data.actionUrl     || '',
    documentTitle:    data.docTitle      || 'Document',
    documentSubtitle: docSubtitle,
    senderName:       data.senderName    || data.bossName || 'NexSign',
    signerName:       data.signerName    || data.ccName   || 'Recipient',
    companyName:      data.companyName   || 'NexSign',
    companyLogo:      data.companyLogo   || '',
    companyInitial:   (data.companyName  || 'N')[0].toUpperCase(),
    expiryDate,
  });

  const subject = config.subject(data);

  try {
    await transporter.sendMail({
      from:        `"${data.companyName || 'NexSign'} via NexSign" <${process.env.SMTP_USER || process.env.SMTP_FROM || 'noreply@nexsign.app'}>`,
      replyTo:     data.senderEmail || undefined,
      to:          data.to,
      subject,
      html,
      attachments,
    });
    console.log(`[emailService] Sent '${type}' to ${data.to} | Subject: ${subject}`);
  } catch (err) {
    console.error(`[emailService] ERROR sending '${type}' to ${data.to}:`, err.message);
    // Don't rethrow to avoid crashing Vercel functions if one email fails
  }
}

// ════════════════════════════════════════════════════════════════
// WRAPPER FUNCTIONS (Used by Routes)
// ════════════════════════════════════════════════════════════════

async function sendSigningEmail(data) {
  return sendEmail('signing_request', {
    to:          data.recipientEmail,
    signerName:  data.recipientName,
    senderName:  data.senderName,
    senderEmail: data.senderEmail,
    docTitle:    data.documentTitle,
    actionUrl:   data.signingLink || data.actionUrl,
    companyLogo: data.companyLogoUrl,
    companyName: data.companyName || 'NexSign',
  });
}

async function sendBossApprovalEmail(data) {
  return sendEmail('signing_request', {
    to:          data.bossEmail,
    signerName:  data.bossName,
    senderName:  data.senderName || data.bossName,
    docTitle:    data.documentTitle,
    actionUrl:   data.signingLink,
    companyLogo: data.companyLogoUrl,
    companyName: data.companyName || 'NexSign',
  });
}

async function sendEmployeeSigningEmail(data) {
  return sendEmail('signing_request', {
    to:          data.employeeEmail,
    signerName:  data.employeeName,
    senderName:  data.bossName,
    docTitle:    data.documentTitle,
    actionUrl:   data.signingLink,
    companyLogo: data.companyLogoUrl,
    companyName: data.companyName || 'NexSign',
  });
}

async function sendDeclinedEmail(data) {
  return sendEmail('declined_notification', {
    to:           data.ownerEmail,
    signerName:   data.ownerName,
    declinerName: data.signerName,
    docTitle:     data.title || data.documentTitle,
    reason:       data.reason || '',
    companyName:  'NexSign',
  });
}

async function sendCompletionEmail(data) {
  const attachments = [];
  if (data.pdfBuffer) {
    attachments.push({
      filename: `${data.documentTitle || 'document'}_signed.pdf`,
      content:  data.pdfBuffer,
    });
  }

  return sendEmail(data.isCC ? 'cc_notification' : 'completion', {
    to:          data.recipientEmail,
    signerName:  data.recipientName,
    docTitle:    data.documentTitle,
    signedPdfUrl: data.signedPdfUrl,
    companyLogo: data.companyLogoUrl,
    companyName: data.companyName || 'NexSign',
  }, attachments);
}

async function sendCCEmail(data) {
  return sendEmail('cc_notification', {
    to:          data.recipientEmail,
    signerName:  data.recipientName || data.ccName,
    ccName:      data.recipientName,
    senderName:  data.senderName,
    docTitle:    data.documentTitle,
    companyLogo: data.companyLogoUrl,
    companyName: data.companyName || 'NexSign',
  });
}

module.exports = {
  sendEmail,
  sendSigningEmail,
  sendBossApprovalEmail,
  sendEmployeeSigningEmail,
  sendDeclinedEmail,
  sendCompletionEmail,
  sendCCEmail,
  EMAIL_CONFIG,
  getDocumentSubtitle,
  buildEmailHtml,
};