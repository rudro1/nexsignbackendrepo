// // 'use strict';

// // const {
// //   PDFDocument,
// //   rgb,
// //   StandardFonts,
// //   degrees,
// //   BlendMode,
// // } = require('pdf-lib');
// // const fetch = require('node-fetch');

// // // ═══════════════════════════════════════════════════════════════
// // // BRAND
// // // ═══════════════════════════════════════════════════════════════
// // const B = {
// //   brand:  rgb(0.157, 0.671, 0.875),
// //   dark2:  rgb(0.118, 0.494, 0.682),
// //   dark:   rgb(0.07,  0.09,  0.14),
// //   grey:   rgb(0.45,  0.48,  0.54),
// //   lgrey:  rgb(0.93,  0.95,  0.97),
// //   white:  rgb(1,     1,     1),
// //   green:  rgb(0.06,  0.55,  0.25),
// //   amber:  rgb(0.62,  0.40,  0.05),
// //   red:    rgb(0.72,  0.13,  0.13),
// //   blue:   rgb(0.18,  0.40,  0.75),
// //   purple: rgb(0.44,  0.20,  0.78),
// //   bg:     rgb(0.97,  0.98,  1.00),
// // };

// // // ═══════════════════════════════════════════════════════════════
// // // HELPER — fetch PDF bytes
// // // FIX 1: AbortController দিয়ে 55s timeout — network timeout fix
// // // ═══════════════════════════════════════════════════════════════
// // async function fetchPdfBytes(source) {
// //   if (!source) throw new Error('[pdfService] No PDF source provided.');

// //   if (source.startsWith('http://') || source.startsWith('https://')) {
// //     const controller = new AbortController();
// //     const timeoutId  = setTimeout(() => controller.abort(), 55_000);

// //     try {
// //       const res = await fetch(source, {
// //         signal:  controller.signal,
// //         headers: { 'Accept': 'application/pdf, */*' },
// //       });
// //       clearTimeout(timeoutId);

// //       if (!res.ok)
// //         throw new Error(`[pdfService] Fetch failed: ${res.status} ${res.statusText}`);

// //       const buf = await res.buffer();
// //       return new Uint8Array(buf);
// //     } catch (e) {
// //       clearTimeout(timeoutId);
// //       if (e.name === 'AbortError') {
// //         throw new Error(`[pdfService] network timeout at: ${source}`);
// //       }
// //       throw e;
// //     }
// //   }

// //   // Handle base64 data URI
// //   if (source.startsWith('data:')) {
// //     const b64 = source.split(',')[1];
// //     if (!b64) throw new Error('[pdfService] Invalid data URI.');
// //     return new Uint8Array(Buffer.from(b64, 'base64'));
// //   }

// //   const fs = require('fs');
// //   if (!fs.existsSync(source))
// //     throw new Error(`[pdfService] File not found: ${source}`);
// //   return new Uint8Array(fs.readFileSync(source));
// // }

// // // ═══════════════════════════════════════════════════════════════
// // // HELPER — hex to rgb
// // // ═══════════════════════════════════════════════════════════════
// // function hexToRgb(hex = '#000000') {
// //   const h = hex.replace('#', '');
// //   return rgb(
// //     parseInt(h.slice(0, 2), 16) / 255,
// //     parseInt(h.slice(2, 4), 16) / 255,
// //     parseInt(h.slice(4, 6), 16) / 255,
// //   );
// // }

// // // ═══════════════════════════════════════════════════════════════
// // // HELPER — draw card
// // // ═══════════════════════════════════════════════════════════════
// // function drawCard(page, x, y, w, h, fillColor, borderColor = null) {
// //   page.drawRectangle({
// //     x, y, width: w, height: h,
// //     color: fillColor,
// //     ...(borderColor ? { borderColor, borderWidth: 0.6 } : {}),
// //   });
// // }

// // // ═══════════════════════════════════════════════════════════════
// // // HELPER — strip emoji + non-WinAnsi characters
// // // FIX 2: WinAnsi cannot encode emoji — crash fix
// // // ═══════════════════════════════════════════════════════════════
// // function stripEmoji(str) {
// //   return String(str)
// //     // Emoticons, Misc Symbols, Dingbats, Transport, etc.
// //     .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
// //     // Misc symbols block (arrows, stars, etc.)
// //     .replace(/[\u{2600}-\u{27BF}]/gu, '')
// //     // Variation selectors
// //     .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
// //     // Replacement character
// //     .replace(/\uFFFD/g, '')
// //     // Zero-width joiners and similar
// //     .replace(/[\u{200B}-\u{200D}]/gu, '')
// //     .replace(/\u{FEFF}/gu, '')
// //     .trim();
// // }

// // function safeText(page, text, x, y, opts = {}) {
// //   try {
// //     if (text === null || text === undefined) return;
// //     const str = stripEmoji(String(text));
// //     if (!str.trim()) return;
// //     page.drawText(str, { x, y, ...opts });
// //   } catch (_) {}
// // }

// // // ═══════════════════════════════════════════════════════════════
// // // HELPER — horizontal rule
// // // ═══════════════════════════════════════════════════════════════
// // function hRule(page, y, x1, x2, color = B.lgrey, thickness = 0.5) {
// //   page.drawLine({
// //     start: { x: x1, y },
// //     end:   { x: x2, y },
// //     thickness,
// //     color,
// //   });
// // }

// // // ═══════════════════════════════════════════════════════════════
// // // EXPORT 1 — mergeSignaturesIntoPDF
// // // ═══════════════════════════════════════════════════════════════
// // async function mergeSignaturesIntoPDF(pdfSource, fields = []) {
// //   const originalBytes = await fetchPdfBytes(pdfSource);

// //   const pdfDoc = await PDFDocument.load(originalBytes, {
// //     ignoreEncryption: true,
// //     updateMetadata:   false,
// //   });

// //   const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
// //   const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
// //   const pages    = pdfDoc.getPages();

// //   for (const rawField of fields) {
// //     const field =
// //       typeof rawField === 'string' ? JSON.parse(rawField) : rawField;

// //     if (!field.value && field.value !== false) continue;
// //     if (typeof field.value === 'string' && !field.value.trim()) continue;
// //     if (field.value === '[SIGNED]') continue;

// //     const pageIndex = Math.max(0, (field.page || 1) - 1);
// //     if (pageIndex >= pages.length) continue;

// //     const page                      = pages[pageIndex];
// //     const { width: pw, height: ph } = page.getSize();

// //     // const absX = (field.x      / 100) * pw;
// //     // const absW = (field.width  / 100) * pw;
// //     // const absH = (field.height / 100) * ph;
// //     // const absY = ph - ((field.y / 100) * ph) - absH;
// //     // ✅ FIXED: PDF points directly use করো
// // const absX = field.x;
// // const absW = field.width;
// // const absH = field.height;
// // const absY = ph - field.y - field.height; // top-left → bottom-left flip

// //     try {
// //       switch (field.type) {

// //         case 'signature':
// //         case 'initial':
// //         case 'initials': {
// //           const raw = String(field.value || '');
// //           if (!raw.startsWith('data:image/')) break;

// //           const b64Parts = raw.split(',');
// //           if (b64Parts.length < 2) break;

// //           const imgBytes = Buffer.from(b64Parts[1], 'base64');
// //           let img;

// //           try {
// //             img = raw.includes('image/png')
// //               ? await pdfDoc.embedPng(imgBytes)
// //               : await pdfDoc.embedJpg(imgBytes);
// //           } catch {
// //             try { img = await pdfDoc.embedPng(imgBytes); }
// //             catch { break; }
// //           }

// //           const dims = img.scaleToFit(absW - 4, absH - 4);
// //           page.drawImage(img, {
// //             x:         absX + (absW - dims.width)  / 2,
// //             y:         absY + (absH - dims.height) / 2,
// //             width:     dims.width,
// //             height:    dims.height,
// //             blendMode: BlendMode.Multiply,
// //           });
// //           break;
// //         }

// //         case 'text':
// //         case 'number': {
// //           const isBold   = field.fontWeight === 'bold';
// //           const font     = isBold ? fontBold : fontReg;
// //           const fontSize = Math.min(
// //             field.fontSize || 12,
// //             Math.max(8, absH * 0.6),
// //           );
// //           let text = stripEmoji(String(field.value));
// //           while (
// //             text.length > 1 &&
// //             font.widthOfTextAtSize(text, fontSize) > absW - 8
// //           ) text = text.slice(0, -1);

// //           page.drawText(text, {
// //             x:        absX + 4,
// //             y:        absY + (absH - fontSize) / 2 + 2,
// //             size:     fontSize,
// //             font,
// //             color:    rgb(0.1, 0.1, 0.1),
// //             maxWidth: absW - 8,
// //           });
// //           break;
// //         }

// //         case 'date': {
// //           const fontSize = Math.min(12, Math.max(8, absH * 0.45));
// //           page.drawText(stripEmoji(String(field.value)), {
// //             x:     absX + 4,
// //             y:     absY + (absH - fontSize) / 2 + 2,
// //             size:  fontSize,
// //             font:  fontReg,
// //             color: rgb(0.1, 0.1, 0.1),
// //           });
// //           break;
// //         }

// //         case 'checkbox': {
// //           const val = String(field.value).toLowerCase();
// //           if (val !== 'true' && val !== 'checked') break;
// //           const cx = absX + absW / 2;
// //           const cy = absY + absH / 2;
// //           const s  = Math.min(absW, absH) * 0.35;
// //           page.drawLine({
// //             start:     { x: cx - s,       y: cy },
// //             end:       { x: cx - s * 0.2, y: cy - s * 0.65 },
// //             thickness: 2,
// //             color:     rgb(0.05, 0.55, 0.2),
// //           });
// //           page.drawLine({
// //             start:     { x: cx - s * 0.2, y: cy - s * 0.65 },
// //             end:       { x: cx + s,        y: cy + s * 0.55 },
// //             thickness: 2,
// //             color:     rgb(0.05, 0.55, 0.2),
// //           });
// //           break;
// //         }

// //         default: break;
// //       }
// //     } catch (e) {
// //       console.error(`[pdfService] Field "${field.id}" error:`, e.message);
// //     }
// //   }

// //   // EXECUTED watermark
// //   for (const page of pages) {
// //     const { width: pw, height: ph } = page.getSize();
// //     page.drawText('EXECUTED', {
// //       x:       pw * 0.08,
// //       y:       ph * 0.46,
// //       size:    72,
// //       font:    fontBold,
// //       color:   rgb(0.85, 0.93, 0.97),
// //       opacity: 0.12,
// //       rotate:  degrees(34),
// //     });
// //   }

// //   return pdfDoc.save({ useObjectStreams: false });
// // }

// // // ═══════════════════════════════════════════════════════════════
// // // EXPORT 2 — embedBossSignature
// // // ═══════════════════════════════════════════════════════════════
// // // ═══════════════════════════════════════════════════════════════
// // // EXPORT 2 — embedBossSignature
// // // ✅ FIXED: controller থেকে object আসে, সেটা handle করছে
// // // ✅ FIXED: field coordinates PDF points এ আছে, percentage নয়
// // // ═══════════════════════════════════════════════════════════════
// // async function embedBossSignature({
// //   fileUrl,
// //   signatureDataUrl,
// //   fields        = [],
// //   fieldValues   = [],
// // }) {
// //   // ── PDF load ────────────────────────────────────────────
// //   const bytes  = await fetchPdfBytes(fileUrl);
// //   const pdfDoc = await PDFDocument.load(bytes, {
// //     ignoreEncryption: true,
// //     updateMetadata:   false,
// //   });

// //   const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
// //   const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
// //   const pages    = pdfDoc.getPages();

// //   // ── fieldValues map তৈরি করো ────────────────────────────
// //   // fieldValues = [{ fieldId, type, value }]
// //   const valueMap = {};
// //   for (const fv of fieldValues) {
// //     if (fv.fieldId) valueMap[fv.fieldId] = fv.value;
// //   }

// //   // ── Boss fields process করো ──────────────────────────────
// //   for (const field of fields) {
// //     // assignedTo boss field only
// //     if (field.assignedTo && field.assignedTo !== 'boss') continue;

// //     const pageIndex = Math.max(0, (field.page || 1) - 1);
// //     if (pageIndex >= pages.length) continue;

// //     const page                      = pages[pageIndex];
// //     const { width: pw, height: ph } = page.getSize();

// //     // ✅ FIXED: PDF points → absolute coordinates
// //     // field.x, field.y = points from top-left
// //     // PDF coordinate system: bottom-left origin
// //     // তাই Y flip করতে হবে
// //     const absX = field.x;
// //     const absW = field.width;
// //     const absH = field.height;
// //     const absY = ph - field.y - field.height; // ✅ top-left → bottom-left flip

// //     // field এর value নির্ধারণ করো
// //     let value = valueMap[field.id] || field.value || null;

// //     // signature field এ signatureDataUrl use করো
// //     if (field.type === 'signature' || field.type === 'initial') {
// //       value = signatureDataUrl || value;
// //     }

// //     if (!value) continue;

// //     try {
// //       switch (field.type) {

// //         case 'signature':
// //         case 'initial': {
// //           const raw = String(value);
// //           if (!raw.startsWith('data:image/')) break;

// //           const b64Parts = raw.split(',');
// //           if (b64Parts.length < 2) break;

// //           const imgBytes = Buffer.from(b64Parts[1], 'base64');
// //           let img;
// //           try {
// //             img = raw.includes('image/png')
// //               ? await pdfDoc.embedPng(imgBytes)
// //               : await pdfDoc.embedJpg(imgBytes);
// //           } catch {
// //             try { img = await pdfDoc.embedPng(imgBytes); }
// //             catch { break; }
// //           }

// //           const dims = img.scaleToFit(absW - 4, absH - 4);
// //           page.drawImage(img, {
// //             x:         absX + (absW - dims.width)  / 2,
// //             y:         absY + (absH - dims.height) / 2,
// //             width:     dims.width,
// //             height:    dims.height,
// //             blendMode: BlendMode.Multiply,
// //           });
// //           break;
// //         }

// //         case 'text':
// //         case 'number': {
// //           const isBold   = field.fontWeight === 'bold';
// //           const font     = isBold ? fontBold : fontReg;
// //           const fontSize = Math.min(
// //             field.fontSize || 12,
// //             Math.max(8, absH * 0.6),
// //           );
// //           let text = stripEmoji(String(value));
// //           while (
// //             text.length > 1 &&
// //             font.widthOfTextAtSize(text, fontSize) > absW - 8
// //           ) text = text.slice(0, -1);

// //           page.drawText(text, {
// //             x:        absX + 4,
// //             y:        absY + (absH - fontSize) / 2 + 2,
// //             size:     fontSize,
// //             font,
// //             color:    rgb(0.1, 0.1, 0.1),
// //             maxWidth: absW - 8,
// //           });
// //           break;
// //         }

// //         case 'date': {
// //           const fontSize = Math.min(12, Math.max(8, absH * 0.45));
// //           page.drawText(stripEmoji(String(value)), {
// //             x:     absX + 4,
// //             y:     absY + (absH - fontSize) / 2 + 2,
// //             size:  fontSize,
// //             font:  fontReg,
// //             color: rgb(0.1, 0.1, 0.1),
// //           });
// //           break;
// //         }

// //         case 'checkbox': {
// //           const val = String(value).toLowerCase();
// //           if (val !== 'true' && val !== 'checked') break;
// //           const cx = absX + absW / 2;
// //           const cy = absY + absH / 2;
// //           const s  = Math.min(absW, absH) * 0.35;
// //           page.drawLine({
// //             start:     { x: cx - s,       y: cy },
// //             end:       { x: cx - s * 0.2, y: cy - s * 0.65 },
// //             thickness: 2,
// //             color:     rgb(0.05, 0.55, 0.2),
// //           });
// //           page.drawLine({
// //             start:     { x: cx - s * 0.2, y: cy - s * 0.65 },
// //             end:       { x: cx + s,       y: cy + s * 0.55 },
// //             thickness: 2,
// //             color:     rgb(0.05, 0.55, 0.2),
// //           });
// //           break;
// //         }

// //         default: break;
// //       }
// //     } catch (e) {
// //       console.error(`[embedBossSignature] Field "${field.id}" error:`, e.message);
// //     }
// //   }

// //   return pdfDoc.save({ useObjectStreams: false });
// // }

// // // ═══════════════════════════════════════════════════════════════
// // // EXPORT 3 — appendAuditPage
// // // ═══════════════════════════════════════════════════════════════
// // async function appendAuditPage(pdfBytes, doc) {
// //   const pdfDoc = await PDFDocument.load(pdfBytes, {
// //     ignoreEncryption: true,
// //     updateMetadata:   false,
// //   });

// //   const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
// //   const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
// //   const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

// //   _buildAuditPage(pdfDoc, fontReg, fontBold, fontMono, doc);

// //   const finalBytes = await pdfDoc.save({ useObjectStreams: false });
// //   return Buffer.from(finalBytes);
// // }

// // // ═══════════════════════════════════════════════════════════════
// // // INTERNAL — build audit page
// // // FIX 2: সব emoji সরানো হয়েছে — WinAnsi safe plain text only
// // // ═══════════════════════════════════════════════════════════════
// // function _buildAuditPage(pdfDoc, fontReg, fontBold, fontMono, doc) {
// //   const PW = 612;
// //   const PH = 792;
// //   const M  = 44;
// //   const CW = PW - M * 2;

// //   let page = pdfDoc.addPage([PW, PH]);
// //   let Y    = PH;

// //   // ── Header ──────────────────────────────────────────────────
// //   page.drawRectangle({
// //     x: 0, y: PH - 90, width: PW, height: 90,
// //     color: B.brand,
// //   });
// //   page.drawRectangle({
// //     x: 0, y: PH - 90, width: PW, height: 4,
// //     color: B.dark2,
// //   });

// //   // FIX: emoji নেই — plain text only
// //   safeText(page, 'CERTIFICATE OF COMPLETION', M, PH - 26, {
// //     font: fontBold, size: 14, color: B.white,
// //   });
// //   safeText(page, 'Electronic Signature Audit Trail  -  NexSign', M, PH - 44, {
// //     font: fontReg, size: 9.5, color: rgb(0.82, 0.95, 1),
// //   });
// //   safeText(page, `Generated: ${new Date().toUTCString()}`, M, PH - 60, {
// //     font: fontMono, size: 7.5, color: rgb(0.75, 0.92, 1),
// //   });

// //   // FIX: checkmark emoji সরানো — geometric circle + "OK" text
// //   page.drawCircle({
// //     x: PW - 58, y: PH - 45, size: 26,
// //     color: rgb(1, 1, 1, 0.15),
// //   });
// //   safeText(page, 'OK', PW - 70, PH - 40, {
// //     font: fontBold, size: 10, color: B.white,
// //   });

// //   Y = PH - 108;

// //   // ── Document Info Card ───────────────────────────────────────
// //   const infoRows = [
// //     ['Document',      doc.title       || 'Untitled Document'],
// //     ['Document ID',   String(doc._id  || '')],
// //     ['Company',       doc.companyName || '-'],
// //     ['Status',        (doc.status || 'completed').toUpperCase()],
// //     ['Completed',     doc.completedAt
// //       ? new Date(doc.completedAt).toUTCString()
// //       : new Date().toUTCString()],
// //     ['Total Parties', String((doc.parties || []).length)],
// //   ];

// //   const infoH = infoRows.length * 17 + 20;
// //   drawCard(page, M, Y - infoH, CW, infoH, B.bg, B.lgrey);
// //   page.drawRectangle({ x: M, y: Y - infoH, width: 4, height: infoH, color: B.brand });

// //   // FIX: label plain text — no emoji
// //   safeText(page, 'DOCUMENT DETAILS', M + 12, Y - 13, {
// //     font: fontBold, size: 7.5, color: B.brand,
// //   });

// //   let iy = Y - 28;
// //   for (const [label, value] of infoRows) {
// //     const lw = fontBold.widthOfTextAtSize(`${label}:  `, 8.5);
// //     safeText(page, `${label}:`, M + 12, iy, {
// //       font: fontBold, size: 8.5, color: B.grey,
// //     });
// //     safeText(page, value, M + 12 + lw, iy, {
// //       font: fontReg, size: 8.5, color: B.dark,
// //       maxWidth: CW - lw - 20,
// //     });
// //     iy -= 17;
// //   }

// //   // FIX: "COMPLETED" badge — no emoji
// //   page.drawRectangle({
// //     x: PW - M - 88, y: Y - 26, width: 86, height: 18,
// //     color: B.green,
// //   });
// //   safeText(page, 'COMPLETED', PW - M - 82, Y - 18, {
// //     font: fontBold, size: 8, color: B.white,
// //   });

// //   Y -= infoH + 18;

// //   // ── Signing Parties ──────────────────────────────────────────
// //   // FIX: section header — plain text, no emoji
// //   safeText(page, 'SIGNING PARTIES', M, Y, {
// //     font: fontBold, size: 9, color: B.grey,
// //   });
// //   Y -= 8;
// //   hRule(page, Y, M, M + CW, B.brand, 1.5);
// //   Y -= 16;

// //   const parties = doc.parties || [];

// //   for (let i = 0; i < parties.length; i++) {
// //     const p      = parties[i];
// //     const signed = p.status === 'signed' || !!p.signedAt;

// //     const hasDevice   = !!(p.device || p.browser || p.os);
// //     const hasLocation = !!(p.city || p.region || p.postalCode);
// //     const hasIp       = !!p.ipAddress;
// //     const hasTime     = !!(p.localSignedTime || p.signedAt);

// //     let extraLines = 0;
// //     if (signed) {
// //       if (hasDevice)   extraLines++;
// //       if (hasLocation) extraLines++;
// //       if (hasIp)       extraLines++;
// //       if (hasTime)     extraLines++;
// //     }
// //     const rowH = signed ? 52 + extraLines * 14 : 42;

// //     // New page check
// //     if (Y - rowH < M + 100) {
// //       _auditFooter(page, fontReg, fontMono, PW, M);
// //       page = pdfDoc.addPage([PW, PH]);
// //       Y    = PH - M;
// //       // FIX: plain text — no emoji
// //       safeText(page, 'SIGNING PARTIES (continued)', M, Y, {
// //         font: fontBold, size: 10, color: B.brand,
// //       });
// //       Y -= 20;
// //     }

// //     drawCard(
// //       page, M, Y - rowH, CW, rowH,
// //       i % 2 === 0 ? B.bg : rgb(0.99, 1, 1),
// //       B.lgrey,
// //     );

// //     page.drawRectangle({
// //       x: M, y: Y - rowH, width: 4, height: rowH,
// //       color: signed ? B.green : B.amber,
// //     });

// //     // Party number circle
// //     page.drawCircle({
// //       x: M + 18, y: Y - 16, size: 10,
// //       color: signed ? B.green : B.amber,
// //     });
// //     safeText(page, String(i + 1), M + (i < 9 ? 15 : 12), Y - 20, {
// //       font: fontBold, size: 8, color: B.white,
// //     });

// //     // FIX: Name — plain text
// //     safeText(page, p.name || 'Unknown', M + 34, Y - 12, {
// //       font: fontBold, size: 10, color: B.dark,
// //     });

// //     // FIX: Designation — plain text, no emoji prefix
// //     if (p.designation) {
// //       safeText(page, p.designation, M + 34, Y - 24, {
// //         font: fontReg, size: 8, color: B.grey,
// //       });
// //     }

// //     // FIX: Email — plain text, no emoji prefix
// //     safeText(page, p.email || '', M + 34, Y - (p.designation ? 36 : 24), {
// //       font: fontReg, size: 8, color: B.grey,
// //     });

// //     // FIX: Status badge — plain text "SIGNED" / "PENDING", no emoji
// //     page.drawRectangle({
// //       x: PW - M - 78, y: Y - 20, width: 76, height: 14,
// //       color: signed ? B.green : B.amber,
// //     });
// //     safeText(
// //       page,
// //       signed ? 'SIGNED' : 'PENDING',
// //       PW - M - 68, Y - 14,
// //       { font: fontBold, size: 7.5, color: B.white },
// //     );

// //     if (signed) {
// //       hRule(page, Y - 38, M + 10, M + CW - 10, B.lgrey, 0.4);

// //       let detY = Y - 50;

// //       // FIX: "Signed At" label — plain text, no emoji
// //       if (hasTime) {
// //         const timeStr = p.localSignedTime
// //           ? `${p.localSignedTime}  (${p.signedAt ? new Date(p.signedAt).toUTCString() : ''})`
// //           : new Date(p.signedAt).toUTCString();
// //         _detailRow(page, fontBold, fontMono, M, detY, CW, 'Signed At', timeStr);
// //         detY -= 14;
// //       }

// //       // FIX: "Device" label — plain text, no emoji
// //       if (hasDevice) {
// //         const devStr = [p.device, p.browser, p.os].filter(Boolean).join('  /  ');
// //         _detailRow(page, fontBold, fontMono, M, detY, CW, 'Device', devStr);
// //         detY -= 14;
// //       }

// //       // FIX: "Location" label — plain text, no emoji
// //       if (hasLocation) {
// //         const locParts = [p.city, p.region, p.country || p.countryCode]
// //           .filter(Boolean).join(', ');
// //         const locStr = p.postalCode ? `${locParts}  -  ${p.postalCode}` : locParts;
// //         _detailRow(page, fontBold, fontMono, M, detY, CW, 'Location', locStr);
// //         detY -= 14;
// //       }

// //       // FIX: "IP Address" label — plain text, no emoji
// //       if (hasIp) {
// //         _detailRow(page, fontBold, fontMono, M, detY, CW, 'IP Address', p.ipAddress);
// //         detY -= 14;
// //       }
// //     }

// //     Y -= rowH + 8;
// //   }

// //   // ── CC Recipients ────────────────────────────────────────────
// //   const ccList = doc.ccList || [];
// //   if (ccList.length > 0 && Y > M + 80) {
// //     Y -= 8;
// //     // FIX: plain text — no emoji
// //     safeText(page, 'CC RECIPIENTS', M, Y, {
// //       font: fontBold, size: 9, color: B.grey,
// //     });
// //     Y -= 8;
// //     hRule(page, Y, M, M + CW, B.lgrey, 1);
// //     Y -= 14;

// //     for (const cc of ccList) {
// //       if (Y < M + 60) break;

// //       drawCard(page, M, Y - 20, CW, 22, rgb(0.96, 0.98, 1), B.lgrey);
// //       page.drawRectangle({
// //         x: M, y: Y - 20, width: 3, height: 22, color: B.blue,
// //       });

// //       // FIX: CC name + designation — plain text, no emoji
// //       const nameStr = cc.name || cc.email || '-';
// //       const desgStr = cc.designation ? ` - ${cc.designation}` : '';
// //       safeText(page, `${nameStr}${desgStr}`, M + 10, Y - 7, {
// //         font: fontBold, size: 9, color: B.dark,
// //         maxWidth: CW / 2,
// //       });
// //       safeText(page, cc.email || '', M + CW / 2, Y - 7, {
// //         font: fontMono, size: 8, color: B.grey,
// //         maxWidth: CW / 2 - 10,
// //       });
// //       if (cc.notifiedAt) {
// //         safeText(
// //           page,
// //           `Notified: ${new Date(cc.notifiedAt).toUTCString()}`,
// //           M + 10, Y - 16,
// //           { font: fontReg, size: 7, color: B.grey },
// //         );
// //       }
// //       Y -= 26;
// //     }
// //   }

// //   // ── Legal Disclaimer ─────────────────────────────────────────
// //   if (Y > M + 70) {
// //     Y -= 10;
// //     const discH = 48;
// //     drawCard(page, M, Y - discH, CW, discH, rgb(0.94, 0.97, 1), B.lgrey);
// //     page.drawRectangle({
// //       x: M, y: Y - discH, width: 4, height: discH, color: B.brand,
// //     });
// //     // FIX: plain text — no emoji
// //     safeText(page, 'LEGAL VALIDITY', M + 12, Y - 13, {
// //       font: fontBold, size: 8, color: B.brand,
// //     });
// //     safeText(
// //       page,
// //       'This certificate is an electronically generated legal record of all signature events.',
// //       M + 12, Y - 26,
// //       { font: fontReg, size: 7.5, color: B.grey, maxWidth: CW - 24 },
// //     );
// //     safeText(
// //       page,
// //       'All events are timestamped and tamper-evident. Legally binding under ESIGN, eIDAS, and applicable laws.',
// //       M + 12, Y - 38,
// //       { font: fontReg, size: 7.5, color: B.grey, maxWidth: CW - 24 },
// //     );
// //   }

// //   _auditFooter(page, fontReg, fontMono, PW, M);
// // }

// // // ── Detail Row Helper ─────────────────────────────────────────
// // function _detailRow(page, fontBold, fontMono, M, y, CW, label, value) {
// //   // FIX: stripEmoji ensures no WinAnsi crash from dynamic data
// //   const clean = stripEmoji(String(value || 'N/A'));
// //   const lw    = fontBold.widthOfTextAtSize(`${label}:  `, 7.5);
// //   safeText(page, `${label}:`, M + 14, y, {
// //     font: fontBold, size: 7.5, color: B.grey,
// //   });
// //   safeText(page, clean, M + 14 + lw, y, {
// //     font: fontMono, size: 7.5, color: B.dark,
// //     maxWidth: CW - lw - 24,
// //   });
// // }

// // // ── Audit Page Footer ─────────────────────────────────────────
// // function _auditFooter(page, fontReg, fontMono, PW, M) {
// //   page.drawRectangle({ x: 0, y: 0, width: PW, height: 36, color: B.brand });
// //   // FIX: plain text — no emoji
// //   safeText(
// //     page,
// //     'NexSign  -  Enterprise E-Signature Platform  -  nexsign.app',
// //     M, 22,
// //     { font: fontReg, size: 8, color: B.white },
// //   );
// //   safeText(
// //     page,
// //     `Confidential & Legally Binding  -  ${new Date().toUTCString()}`,
// //     M, 10,
// //     { font: fontMono, size: 7, color: rgb(0.82, 0.95, 1) },
// //   );
// // }

// // // ═══════════════════════════════════════════════════════════════
// // // EXPORT 4 — generateEmployeePdf
// // // ═══════════════════════════════════════════════════════════════
// // async function generateEmployeePdf(approvedPdfSource, employeeFields = [], sessionDoc) {
// //   const bytes = typeof approvedPdfSource === 'string'
// //     ? await fetchPdfBytes(approvedPdfSource)
// //     : approvedPdfSource;

// //   const withFields = await mergeSignaturesIntoPDF(
// //     'data:application/pdf;base64,' + Buffer.from(bytes).toString('base64'),
// //     employeeFields,
// //   );

// //   const withAudit = await appendAuditPage(withFields, sessionDoc);
// //   return withAudit;
// // }

// // // ═══════════════════════════════════════════════════════════════
// // // EXPORTS
// // // ═══════════════════════════════════════════════════════════════
// // module.exports = {
// //   mergeSignaturesIntoPDF,
// //   embedBossSignature,
// //   appendAuditPage,
// //   generateEmployeePdf,
// //   fetchPdfBytes,
// // };

// 'use strict';

// // ═══════════════════════════════════════════════════════════════
// // pdfService.js — NexSign PDF Engine
// // FIX: Field coordinates are stored as PERCENTAGES (0-100) in DB
// //      We must convert: absX = (field.x / 100) * pageWidth
// //      PDF coordinate origin is BOTTOM-LEFT, screen is TOP-LEFT
// //      So: pdfY = pageHeight - ((field.y / 100) * pageHeight) - absH
// // ═══════════════════════════════════════════════════════════════

// const {
//   PDFDocument,
//   rgb,
//   StandardFonts,
//   degrees,
//   BlendMode,
// } = require('pdf-lib');
// const fetch = require('node-fetch');

// // ─── Brand ────────────────────────────────────────────────────
// const B = {
//   brand:  rgb(0.157, 0.671, 0.875),
//   dark2:  rgb(0.118, 0.494, 0.682),
//   dark:   rgb(0.07,  0.09,  0.14),
//   grey:   rgb(0.45,  0.48,  0.54),
//   lgrey:  rgb(0.93,  0.95,  0.97),
//   white:  rgb(1,     1,     1),
//   green:  rgb(0.06,  0.55,  0.25),
//   amber:  rgb(0.62,  0.40,  0.05),
//   red:    rgb(0.72,  0.13,  0.13),
//   blue:   rgb(0.18,  0.40,  0.75),
//   purple: rgb(0.44,  0.20,  0.78),
//   bg:     rgb(0.97,  0.98,  1.00),
// };

// // ─── Fetch PDF bytes with timeout ────────────────────────────
// async function fetchPdfBytes(source) {
//   if (!source) throw new Error('[pdfService] No PDF source provided.');

//   if (source.startsWith('http://') || source.startsWith('https://')) {
//     const controller = new AbortController();
//     const timeoutId  = setTimeout(() => controller.abort(), 55_000);
//     try {
//       const res = await fetch(source, {
//         signal:  controller.signal,
//         headers: { 'Accept': 'application/pdf, */*' },
//       });
//       clearTimeout(timeoutId);
//       if (!res.ok) throw new Error(`[pdfService] Fetch failed: ${res.status}`);
//       const buf = await res.buffer();
//       return new Uint8Array(buf);
//     } catch (e) {
//       clearTimeout(timeoutId);
//       if (e.name === 'AbortError') throw new Error(`[pdfService] timeout: ${source}`);
//       throw e;
//     }
//   }

//   if (source.startsWith('data:')) {
//     const b64 = source.split(',')[1];
//     if (!b64) throw new Error('[pdfService] Invalid data URI.');
//     return new Uint8Array(Buffer.from(b64, 'base64'));
//   }

//   const fs = require('fs');
//   if (!fs.existsSync(source)) throw new Error(`[pdfService] File not found: ${source}`);
//   return new Uint8Array(fs.readFileSync(source));
// }

// // ─── Strip emoji / non-WinAnsi ───────────────────────────────
// function stripEmoji(str) {
//   return String(str)
//     .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
//     .replace(/[\u{2600}-\u{27BF}]/gu, '')
//     .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
//     .replace(/\uFFFD/g, '')
//     .replace(/[\u{200B}-\u{200D}]/gu, '')
//     .replace(/\u{FEFF}/gu, '')
//     .trim();
// }

// function safeText(page, text, x, y, opts = {}) {
//   try {
//     if (text === null || text === undefined) return;
//     const str = stripEmoji(String(text));
//     if (!str.trim()) return;
//     page.drawText(str, { x, y, ...opts });
//   } catch (_) {}
// }

// // ─── Horizontal rule ─────────────────────────────────────────
// function hRule(page, y, x1, x2, color = B.lgrey, thickness = 0.5) {
//   page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
// }

// function drawCard(page, x, y, w, h, fillColor, borderColor = null) {
//   page.drawRectangle({
//     x, y, width: w, height: h,
//     color: fillColor,
//     ...(borderColor ? { borderColor, borderWidth: 0.6 } : {}),
//   });
// }

// // ═══════════════════════════════════════════════════════════════
// // COORDINATE CONVERSION
// // Fields are stored as PERCENTAGES in the database
// // Editor stores: field.x, field.y, field.width, field.height as 0-100 %
// // PDF needs: absolute points from BOTTOM-LEFT origin
// // ═══════════════════════════════════════════════════════════════
// function fieldToAbsolute(field, pageWidth, pageHeight) {
//   // Convert percentage to absolute PDF points
//   const absX = (field.x      / 100) * pageWidth;
//   const absW = (field.width  / 100) * pageWidth;
//   const absH = (field.height / 100) * pageHeight;
  
//   // PDF origin is bottom-left, screen origin is top-left
//   // field.y is % from top → convert to PDF y from bottom
//   const absY = pageHeight - ((field.y / 100) * pageHeight) - absH;

//   return { absX, absY, absW, absH };
// }

// // ═══════════════════════════════════════════════════════════════
// // RENDER ONE FIELD onto a PDF page
// // Used by both mergeSignaturesIntoPDF and embedBossSignature
// // ═══════════════════════════════════════════════════════════════
// async function renderField(page, field, value, pdfDoc, fontReg, fontBold) {
//   const { width: pw, height: ph } = page.getSize();
//   const { absX, absY, absW, absH } = fieldToAbsolute(field, pw, ph);

//   if (!value && value !== false) return;
//   if (typeof value === 'string' && !value.trim()) return;
//   if (value === '[SIGNED]') return;

//   try {
//     switch (field.type) {
//       case 'signature':
//       case 'initial':
//       case 'initials': {
//         const raw = String(value);
//         if (!raw.startsWith('data:image/')) break;

//         const b64Parts = raw.split(',');
//         if (b64Parts.length < 2) break;

//         const imgBytes = Buffer.from(b64Parts[1], 'base64');
//         let img;
//         try {
//           img = raw.includes('image/png')
//             ? await pdfDoc.embedPng(imgBytes)
//             : await pdfDoc.embedJpg(imgBytes);
//         } catch {
//           try { img = await pdfDoc.embedPng(imgBytes); } catch { break; }
//         }

//         // Scale to fit with padding, keep aspect ratio
//         const dims = img.scaleToFit(absW - 4, absH - 4);
//         page.drawImage(img, {
//           x:         absX + (absW - dims.width)  / 2,
//           y:         absY + (absH - dims.height) / 2,
//           width:     dims.width,
//           height:    dims.height,
//           blendMode: BlendMode.Multiply,
//         });
//         break;
//       }

//       case 'text':
//       case 'number': {
//         const isBold   = field.fontWeight === 'bold';
//         const font     = isBold ? fontBold : fontReg;
//         const fontSize = Math.min(
//           field.fontSize || 12,
//           Math.max(8, absH * 0.6),
//         );
//         let text = stripEmoji(String(value));
//         // Truncate if too wide
//         while (
//           text.length > 1 &&
//           font.widthOfTextAtSize(text, fontSize) > absW - 8
//         ) text = text.slice(0, -1);

//         page.drawText(text, {
//           x:        absX + 4,
//           y:        absY + (absH - fontSize) / 2 + 2,
//           size:     fontSize,
//           font,
//           color:    rgb(0.1, 0.1, 0.1),
//           maxWidth: absW - 8,
//         });
//         break;
//       }

//       case 'date': {
//         const fontSize = Math.min(12, Math.max(8, absH * 0.45));
//         page.drawText(stripEmoji(String(value)), {
//           x:     absX + 4,
//           y:     absY + (absH - fontSize) / 2 + 2,
//           size:  fontSize,
//           font:  fontReg,
//           color: rgb(0.1, 0.1, 0.1),
//         });
//         break;
//       }

//       case 'checkbox': {
//         const val = String(value).toLowerCase();
//         if (val !== 'true' && val !== 'checked') break;
//         const cx = absX + absW / 2;
//         const cy = absY + absH / 2;
//         const s  = Math.min(absW, absH) * 0.35;
//         page.drawLine({ start: { x: cx - s, y: cy }, end: { x: cx - s * 0.2, y: cy - s * 0.65 }, thickness: 2, color: rgb(0.05, 0.55, 0.2) });
//         page.drawLine({ start: { x: cx - s * 0.2, y: cy - s * 0.65 }, end: { x: cx + s, y: cy + s * 0.55 }, thickness: 2, color: rgb(0.05, 0.55, 0.2) });
//         break;
//       }

//       default: break;
//     }
//   } catch (e) {
//     console.error(`[pdfService] Field "${field.id}" render error:`, e.message);
//   }
// }

// // ═══════════════════════════════════════════════════════════════
// // EXPORT 1 — mergeSignaturesIntoPDF
// // Used by Module 1 (sequential signing) final PDF generation
// // Fields: percentage-based coordinates
// // ═══════════════════════════════════════════════════════════════
// async function mergeSignaturesIntoPDF(pdfSource, fields = []) {
//   const originalBytes = await fetchPdfBytes(pdfSource);

//   const pdfDoc = await PDFDocument.load(originalBytes, {
//     ignoreEncryption: true,
//     updateMetadata:   false,
//   });

//   const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
//   const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
//   const pages    = pdfDoc.getPages();

//   for (const rawField of fields) {
//     const field = typeof rawField === 'string' ? JSON.parse(rawField) : rawField;
//     if (!field.value && field.value !== false) continue;
//     if (typeof field.value === 'string' && !field.value.trim()) continue;
//     if (field.value === '[SIGNED]') continue;

//     const pageIndex = Math.max(0, (field.page || 1) - 1);
//     if (pageIndex >= pages.length) continue;

//     await renderField(pages[pageIndex], field, field.value, pdfDoc, fontReg, fontBold);
//   }

//   // EXECUTED watermark
//   for (const page of pages) {
//     const { width: pw, height: ph } = page.getSize();
//     page.drawText('EXECUTED', {
//       x:       pw * 0.08,
//       y:       ph * 0.46,
//       size:    72,
//       font:    fontBold,
//       color:   rgb(0.85, 0.93, 0.97),
//       opacity: 0.12,
//       rotate:  degrees(34),
//     });
//   }

//   return pdfDoc.save({ useObjectStreams: false });
// }

// // ═══════════════════════════════════════════════════════════════
// // EXPORT 2 — embedBossSignature
// // Module 2: Boss signs the template PDF
// // Embeds boss signature + any boss-assigned field values
// // ═══════════════════════════════════════════════════════════════
// async function embedBossSignature({
//   fileUrl,
//   signatureDataUrl,
//   fields        = [],
//   fieldValues   = [],
// }) {
//   const bytes  = await fetchPdfBytes(fileUrl);
//   const pdfDoc = await PDFDocument.load(bytes, {
//     ignoreEncryption: true,
//     updateMetadata:   false,
//   });

//   const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
//   const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
//   const pages    = pdfDoc.getPages();

//   // Build value map from fieldValues array
//   const valueMap = {};
//   for (const fv of fieldValues) {
//     if (fv.fieldId) valueMap[fv.fieldId] = fv.value;
//   }

//   // Process boss-assigned fields
//   for (const field of fields) {
//     // Only process boss fields
//     if (field.assignedTo && field.assignedTo !== 'boss') continue;

//     const pageIndex = Math.max(0, (field.page || 1) - 1);
//     if (pageIndex >= pages.length) continue;

//     // For signature/initial fields → use the boss signature
//     let value = valueMap[field.id] || field.value || null;
//     if (field.type === 'signature' || field.type === 'initial') {
//       value = signatureDataUrl || value;
//     }

//     if (!value) continue;

//     await renderField(pages[pageIndex], field, value, pdfDoc, fontReg, fontBold);
//   }

//   return pdfDoc.save({ useObjectStreams: false });
// }

// // ═══════════════════════════════════════════════════════════════
// // EXPORT 3 — appendAuditPage
// // ═══════════════════════════════════════════════════════════════
// async function appendAuditPage(pdfBytes, doc) {
//   const pdfDoc = await PDFDocument.load(pdfBytes, {
//     ignoreEncryption: true,
//     updateMetadata:   false,
//   });

//   const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
//   const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
//   const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

//   _buildAuditPage(pdfDoc, fontReg, fontBold, fontMono, doc);

//   const finalBytes = await pdfDoc.save({ useObjectStreams: false });
//   return Buffer.from(finalBytes);
// }

// // ─── Internal: build audit page ──────────────────────────────
// function _buildAuditPage(pdfDoc, fontReg, fontBold, fontMono, doc) {
//   const PW = 612;
//   const PH = 792;
//   const M  = 44;
//   const CW = PW - M * 2;

//   let page = pdfDoc.addPage([PW, PH]);
//   let Y    = PH;

//   // Header
//   page.drawRectangle({ x: 0, y: PH - 90, width: PW, height: 90, color: B.brand });
//   page.drawRectangle({ x: 0, y: PH - 90, width: PW, height: 4,  color: B.dark2 });

//   safeText(page, 'CERTIFICATE OF COMPLETION', M, PH - 26, { font: fontBold, size: 14, color: B.white });
//   safeText(page, 'Electronic Signature Audit Trail - NexSign', M, PH - 44, { font: fontReg, size: 9.5, color: rgb(0.82, 0.95, 1) });
//   safeText(page, `Generated: ${new Date().toUTCString()}`, M, PH - 60, { font: fontMono, size: 7.5, color: rgb(0.75, 0.92, 1) });
//   page.drawCircle({ x: PW - 58, y: PH - 45, size: 26, color: rgb(1, 1, 1, 0.15) });
//   safeText(page, 'OK', PW - 70, PH - 40, { font: fontBold, size: 10, color: B.white });

//   Y = PH - 108;

//   // Document Info Card
//   const infoRows = [
//     ['Document',      doc.title       || 'Untitled Document'],
//     ['Document ID',   String(doc._id  || '')],
//     ['Company',       doc.companyName || '-'],
//     ['Status',        (doc.status || 'completed').toUpperCase()],
//     ['Completed',     doc.completedAt ? new Date(doc.completedAt).toUTCString() : new Date().toUTCString()],
//     ['Total Parties', String((doc.parties || []).length)],
//   ];

//   const infoH = infoRows.length * 17 + 20;
//   drawCard(page, M, Y - infoH, CW, infoH, B.bg, B.lgrey);
//   page.drawRectangle({ x: M, y: Y - infoH, width: 4, height: infoH, color: B.brand });
//   safeText(page, 'DOCUMENT DETAILS', M + 12, Y - 13, { font: fontBold, size: 7.5, color: B.brand });

//   let iy = Y - 28;
//   for (const [label, value] of infoRows) {
//     const lw = fontBold.widthOfTextAtSize(`${label}:  `, 8.5);
//     safeText(page, `${label}:`, M + 12, iy, { font: fontBold, size: 8.5, color: B.grey });
//     safeText(page, value, M + 12 + lw, iy, { font: fontReg, size: 8.5, color: B.dark, maxWidth: CW - lw - 20 });
//     iy -= 17;
//   }

//   page.drawRectangle({ x: PW - M - 88, y: Y - 26, width: 86, height: 18, color: B.green });
//   safeText(page, 'COMPLETED', PW - M - 82, Y - 18, { font: fontBold, size: 8, color: B.white });
//   Y -= infoH + 18;

//   // Signing Parties
//   safeText(page, 'SIGNING PARTIES', M, Y, { font: fontBold, size: 9, color: B.grey });
//   Y -= 8;
//   hRule(page, Y, M, M + CW, B.brand, 1.5);
//   Y -= 16;

//   const parties = doc.parties || [];

//   for (let i = 0; i < parties.length; i++) {
//     const p      = parties[i];
//     const signed = p.status === 'signed' || !!p.signedAt;

//     const hasDevice   = !!(p.device || p.browser || p.os);
//     const hasLocation = !!(p.city || p.region || p.postalCode);
//     const hasIp       = !!p.ipAddress;
//     const hasTime     = !!(p.localSignedTime || p.signedAt);

//     let extraLines = 0;
//     if (signed) {
//       if (hasDevice)   extraLines++;
//       if (hasLocation) extraLines++;
//       if (hasIp)       extraLines++;
//       if (hasTime)     extraLines++;
//     }
//     const rowH = signed ? 52 + extraLines * 14 : 42;

//     if (Y - rowH < M + 100) {
//       _auditFooter(page, fontReg, fontMono, PW, M);
//       page = pdfDoc.addPage([PW, PH]);
//       Y    = PH - M;
//       safeText(page, 'SIGNING PARTIES (continued)', M, Y, { font: fontBold, size: 10, color: B.brand });
//       Y -= 20;
//     }

//     drawCard(page, M, Y - rowH, CW, rowH, i % 2 === 0 ? B.bg : rgb(0.99, 1, 1), B.lgrey);
//     page.drawRectangle({ x: M, y: Y - rowH, width: 4, height: rowH, color: signed ? B.green : B.amber });

//     page.drawCircle({ x: M + 18, y: Y - 16, size: 10, color: signed ? B.green : B.amber });
//     safeText(page, String(i + 1), M + (i < 9 ? 15 : 12), Y - 20, { font: fontBold, size: 8, color: B.white });

//     safeText(page, p.name || 'Unknown', M + 34, Y - 12, { font: fontBold, size: 10, color: B.dark });
//     if (p.designation) safeText(page, p.designation, M + 34, Y - 24, { font: fontReg, size: 8, color: B.grey });
//     safeText(page, p.email || '', M + 34, Y - (p.designation ? 36 : 24), { font: fontReg, size: 8, color: B.grey });

//     page.drawRectangle({ x: PW - M - 78, y: Y - 20, width: 76, height: 14, color: signed ? B.green : B.amber });
//     safeText(page, signed ? 'SIGNED' : 'PENDING', PW - M - 68, Y - 14, { font: fontBold, size: 7.5, color: B.white });

//     if (signed) {
//       hRule(page, Y - 38, M + 10, M + CW - 10, B.lgrey, 0.4);
//       let detY = Y - 50;
//       if (hasTime) {
//         const timeStr = p.localSignedTime ? `${p.localSignedTime}` : new Date(p.signedAt).toUTCString();
//         _detailRow(page, fontBold, fontMono, M, detY, CW, 'Signed At', timeStr);
//         detY -= 14;
//       }
//       if (hasDevice) {
//         _detailRow(page, fontBold, fontMono, M, detY, CW, 'Device', [p.device, p.browser, p.os].filter(Boolean).join(' / '));
//         detY -= 14;
//       }
//       if (hasLocation) {
//         const locParts = [p.city, p.region, p.country || p.countryCode].filter(Boolean).join(', ');
//         _detailRow(page, fontBold, fontMono, M, detY, CW, 'Location', p.postalCode ? `${locParts} - ${p.postalCode}` : locParts);
//         detY -= 14;
//       }
//       if (hasIp) {
//         _detailRow(page, fontBold, fontMono, M, detY, CW, 'IP Address', p.ipAddress);
//         detY -= 14;
//       }
//     }

//     Y -= rowH + 8;
//   }

//   // CC Recipients
//   const ccList = doc.ccList || [];
//   if (ccList.length > 0 && Y > M + 80) {
//     Y -= 8;
//     safeText(page, 'CC RECIPIENTS', M, Y, { font: fontBold, size: 9, color: B.grey });
//     Y -= 8;
//     hRule(page, Y, M, M + CW, B.lgrey, 1);
//     Y -= 14;

//     for (const cc of ccList) {
//       if (Y < M + 60) break;
//       drawCard(page, M, Y - 20, CW, 22, rgb(0.96, 0.98, 1), B.lgrey);
//       page.drawRectangle({ x: M, y: Y - 20, width: 3, height: 22, color: B.blue });
//       const nameStr = cc.name || cc.email || '-';
//       const desgStr = cc.designation ? ` - ${cc.designation}` : '';
//       safeText(page, `${nameStr}${desgStr}`, M + 10, Y - 7, { font: fontBold, size: 9, color: B.dark, maxWidth: CW / 2 });
//       safeText(page, cc.email || '', M + CW / 2, Y - 7, { font: fontMono, size: 8, color: B.grey, maxWidth: CW / 2 - 10 });
//       Y -= 26;
//     }
//   }

//   // Legal disclaimer
//   if (Y > M + 70) {
//     Y -= 10;
//     const discH = 48;
//     drawCard(page, M, Y - discH, CW, discH, rgb(0.94, 0.97, 1), B.lgrey);
//     page.drawRectangle({ x: M, y: Y - discH, width: 4, height: discH, color: B.brand });
//     safeText(page, 'LEGAL VALIDITY', M + 12, Y - 13, { font: fontBold, size: 8, color: B.brand });
//     safeText(page, 'This certificate is an electronically generated legal record of all signature events.', M + 12, Y - 26, { font: fontReg, size: 7.5, color: B.grey, maxWidth: CW - 24 });
//     safeText(page, 'All events are timestamped and tamper-evident. Legally binding under ESIGN, eIDAS, and applicable laws.', M + 12, Y - 38, { font: fontReg, size: 7.5, color: B.grey, maxWidth: CW - 24 });
//   }

//   _auditFooter(page, fontReg, fontMono, PW, M);
// }

// function _detailRow(page, fontBold, fontMono, M, y, CW, label, value) {
//   const clean = stripEmoji(String(value || 'N/A'));
//   const lw    = fontBold.widthOfTextAtSize(`${label}:  `, 7.5);
//   safeText(page, `${label}:`, M + 14, y, { font: fontBold, size: 7.5, color: B.grey });
//   safeText(page, clean, M + 14 + lw, y, { font: fontMono, size: 7.5, color: B.dark, maxWidth: CW - lw - 24 });
// }

// function _auditFooter(page, fontReg, fontMono, PW, M) {
//   page.drawRectangle({ x: 0, y: 0, width: PW, height: 36, color: B.brand });
//   safeText(page, 'NexSign - Enterprise E-Signature Platform - nexsign.app', M, 22, { font: fontReg, size: 8, color: B.white });
//   safeText(page, `Confidential & Legally Binding - ${new Date().toUTCString()}`, M, 10, { font: fontMono, size: 7, color: rgb(0.82, 0.95, 1) });
// }

// // ═══════════════════════════════════════════════════════════════
// // EXPORT 4 — generateEmployeePdf
// // Module 2: Generates per-employee PDF after they sign
// // Base is the boss-signed PDF
// // ═══════════════════════════════════════════════════════════════
// async function generateEmployeePdf(approvedPdfSource, employeeFields = [], sessionDoc) {
//   // approvedPdfSource = boss-signed PDF URL or bytes
//   const bytes = typeof approvedPdfSource === 'string'
//     ? await fetchPdfBytes(approvedPdfSource)
//     : approvedPdfSource;

//   // Merge employee signatures onto boss-signed PDF
//   const withFields = await mergeSignaturesIntoPDF(
//     'data:application/pdf;base64,' + Buffer.from(bytes).toString('base64'),
//     employeeFields,
//   );

//   // Append audit trail
//   const withAudit = await appendAuditPage(withFields, sessionDoc);
//   return withAudit;
// }

// // ═══════════════════════════════════════════════════════════════
// module.exports = {
//   mergeSignaturesIntoPDF,
//   embedBossSignature,
//   appendAuditPage,
//   generateEmployeePdf,
//   fetchPdfBytes,
// };

'use strict';
/**
 * pdfService.js — NexSign PDF Engine (Module 1 + Module 2)
 *
 * ══════════════════════════════════════════════════════════
 * COORDINATE SYSTEM (critical):
 *   Editor stores fields as PERCENTAGES (0–100) of page size
 *   pdf-lib uses POINTS from BOTTOM-LEFT origin
 *
 *   absX = (field.x      / 100) * pageWidth
 *   absW = (field.width  / 100) * pageWidth
 *   absH = (field.height / 100) * pageHeight
 *   absY = pageHeight - ((field.y / 100) * pageHeight) - absH
 * ══════════════════════════════════════════════════════════
 *
 * EXPORTS:
 *   mergeSignaturesIntoPDF(pdfSource, fields[])   → Uint8Array
 *   embedBossSignature({ fileUrl, signatureDataUrl, fields, fieldValues }) → Buffer
 *   generateEmployeePdf(bossSignedPdfSource, employeeFields[], sessionDoc) → Buffer
 *   appendAuditPage(pdfBytes, doc)                → Buffer
 */

const { PDFDocument, rgb, StandardFonts, degrees, BlendMode } = require('pdf-lib');
const fetch = require('node-fetch');
const crypto = require('crypto');

// ─── Brand palette ────────────────────────────────────────────────────────────
const C = {
  brand:  rgb(0.157, 0.671, 0.875),   // #28ABDF
  brand2: rgb(0.114, 0.561, 0.749),   // #1D8FBF
  dark:   rgb(0.059, 0.082, 0.133),   // #0F1522
  dark2:  rgb(0.118, 0.157, 0.235),   // #1E2840
  grey:   rgb(0.392, 0.455, 0.545),   // #647B8B
  lgrey:  rgb(0.882, 0.918, 0.941),   // #E1EAF0
  bgA:    rgb(0.961, 0.973, 0.988),   // #F5F8FC
  white:  rgb(1,     1,     1),
  green:  rgb(0.055, 0.537, 0.282),   // #0E8948
  greenL: rgb(0.898, 0.976, 0.929),   // #E5F9ED
  amber:  rgb(0.702, 0.447, 0.024),   // #B3720A
  amberL: rgb(0.996, 0.953, 0.871),   // #FEF3DE
  red:    rgb(0.722, 0.122, 0.122),   // #B81F1F
  blue:   rgb(0.173, 0.380, 0.749),   // #2C61BF
  blueL:  rgb(0.878, 0.922, 1.000),   // #E0EBFF
  teal:   rgb(0.000, 0.502, 0.502),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse #RGB / #RRGGBB to pdf-lib rgb() */
function hexToRgb(hex, fallback = rgb(0.08, 0.08, 0.08)) {
  if (!hex || typeof hex !== 'string') return fallback;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length < 6) return fallback;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return fallback;
  return rgb(r / 255, g / 255, b / 255);
}

/** Fit text into field width by shrinking font size, then truncating as last resort */
function fitTextToWidth(text, font, startSize, maxWidth) {
  let fs = startSize;
  let out = text;
  while (fs > 6 && font.widthOfTextAtSize(out, fs) > maxWidth) {
    fs -= 0.5;
  }
  while (out.length > 1 && font.widthOfTextAtSize(out, fs) > maxWidth) {
    out = out.slice(0, -1);
  }
  return { text: out, size: fs };
}

/** Fetch PDF from URL / base64 dataURI / filesystem path / document record → Uint8Array */
async function fetchPdfBytes(source) {
  if (!source) throw new Error('[pdfService] No PDF source provided.');

  // Document/template record — prefer local cached copy
  if (typeof source === 'object' && source !== null) {
    try {
      const { getPdfBytes } = require('./pdfStorage');
      const preferSigned = source.preferSigned
        ?? source.preferBossSigned
        ?? !!source.bossSignedFileUrl;
      const buf = await getPdfBytes(source, { preferSigned });
      return new Uint8Array(buf);
    } catch (e) {
      if (!source.fileUrl) throw e;
      source = source.fileUrl;
    }
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 55_000);
    try {
      const res = await fetch(source, { signal: ctrl.signal, headers: { Accept: 'application/pdf,*/*' } });
      clearTimeout(tid);
      if (!res.ok) throw new Error(`[pdfService] HTTP ${res.status} fetching ${source}`);
      return new Uint8Array(await res.buffer());
    } catch (e) {
      clearTimeout(tid);
      if (e.name === 'AbortError') throw new Error(`[pdfService] Timeout fetching: ${source}`);
      throw e;
    }
  }

  if (source.startsWith('data:')) {
    const b64 = source.split(',')[1];
    if (!b64) throw new Error('[pdfService] Invalid data URI.');
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }

  const fs = require('fs');
  if (!fs.existsSync(source)) throw new Error(`[pdfService] File not found: ${source}`);
  return new Uint8Array(fs.readFileSync(source));
}

/** Strip emoji + non-WinAnsi chars to prevent pdf-lib encoding crashes */
function safe(str) {
  return String(str ?? '')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
    .replace(/[\u{200B}-\u{200D}]/gu, '')
    .replace(/\uFFFD/g, '')
    .replace(/[^\x00-\xFF]/g, '')   // drop any remaining non-latin
    .trim();
}

/** Draw text safely (skip on encode error) */
function txt(page, text, x, y, opts = {}) {
  try {
    const s = safe(text);
    if (s) page.drawText(s, { x, y, ...opts });
  } catch (_) { /* intentionally silent */ }
}

/** Draw horizontal rule */
function hr(page, y, x1, x2, color = C.lgrey, thickness = 0.5) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
}

/** Draw filled rectangle, optional border */
function rect(page, x, y, w, h, fill, borderColor = null, borderWidth = 0.6) {
  page.drawRectangle({
    x, y, width: w, height: h, color: fill,
    ...(borderColor ? { borderColor, borderWidth } : {}),
  });
}

/**
 * Draw NexSign pencil logo (text-only version for PDF)
 * Multi-font wordmark: "NexSign"
 * Colors: #1a1a2e (black) or white for dark backgrounds
 */
function drawNexSignLogo(page, x, y, fontB, isDark = false) {
  const logoColor = isDark 
    ? rgb(1, 1, 1)                          // white for dark backgrounds
    : rgb(0.102, 0.102, 0.180);             // #1a1a2e (nexBlack)
  const accentColor = rgb(0.310, 0.639, 0.820); // #4FA3D1 (--sky)
  
  // Draw "Nex" in black/white
  txt(page, 'Nex', x, y, { font: fontB, size: 18, color: logoColor });
  const nexWidth = fontB.widthOfTextAtSize('Nex', 18);
  
  // Draw "Sign" in sky blue accent
  txt(page, 'Sign', x + nexWidth, y, { font: fontB, size: 18, color: accentColor });
}

// ─── Coordinate conversion ────────────────────────────────────────────────────
/**
 * Convert a field stored in % coords to absolute PDF points.
 * field.x / field.y / field.width / field.height are all 0-100 (percent).
 * PDF origin is BOTTOM-LEFT, screen origin is TOP-LEFT — so Y must be flipped.
 */
function toAbsPt(field, pw, ph) {
  const absX = (field.x      / 100) * pw;
  const absW = (field.width  / 100) * pw;
  const absH = (field.height / 100) * ph;
  // field.y is % from TOP → convert to % from BOTTOM, then subtract height
  const absY = ph - ((field.y / 100) * ph) - absH;
  return { absX, absY, absW, absH };
}

// ─── Load signature/image bytes from data URI or URL ─────────────────────────
async function loadImageBytes(strVal) {
  if (!strVal || typeof strVal !== 'string') return null;
  const trimmed = strVal.trim();
  if (trimmed.startsWith('data:image/')) {
    const b64 = trimmed.split(',')[1];
    return b64 ? Buffer.from(b64, 'base64') : null;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const res = await fetch(trimmed, { headers: { Accept: 'image/*,*/*' } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  return null;
}

// ─── Render a single field onto a PDF page ────────────────────────────────────
async function renderField(page, field, value, pdfDoc, fontReg, fontBold) {
  if (value === null || value === undefined) return;
  const strVal = String(value).trim();
  if (!strVal) return;

  const { width: pw, height: ph } = page.getSize();
  const { absX, absY, absW, absH } = toAbsPt(field, pw, ph);

  // Guard: skip invisible fields
  if (absW < 2 || absH < 2) return;

  try {
    switch (field.type) {

      // ── Signature / Initials → embed as PNG/JPG image ─────────────────────
      case 'signature':
      case 'initial':
      case 'initials': {
        const imgBytes = await loadImageBytes(strVal);
        if (!imgBytes) break;
        let img;
        try {
          img = await pdfDoc.embedPng(imgBytes);
        } catch {
          try { img = await pdfDoc.embedJpg(imgBytes); } catch { break; }
        }
        const dims = img.scaleToFit(absW - 4, absH - 4);
        page.drawImage(img, {
          x:      absX + (absW - dims.width)  / 2,
          y:      absY + (absH - dims.height) / 2,
          width:  dims.width,
          height: dims.height,
          blendMode: BlendMode.Multiply,
        });
        break;
      }

      // ── Text / Number ──────────────────────────────────────────────────────
      case 'text':
      case 'number': {
        const font = field.fontWeight === 'bold' ? fontBold : fontReg;
        const textColor = hexToRgb(field.color);
        const startSize = Math.min(
          Number(field.fontSize) || 12,
          Math.max(7, absH * 0.55),
        );
        const { text, size: fs } = fitTextToWidth(safe(strVal), font, startSize, absW - 6);
        page.drawText(text, {
          x: absX + 3,
          y: absY + (absH - fs) / 2 + 1,
          size: fs,
          font,
          color: textColor,
          maxWidth: absW - 6,
        });
        break;
      }

      // ── Date ──────────────────────────────────────────────────────────────
      case 'date': {
        const startSize = Math.min(Number(field.fontSize) || 11, Math.max(7, absH * 0.45));
        const font = field.fontWeight === 'bold' ? fontBold : fontReg;
        const { text, size: fs } = fitTextToWidth(safe(strVal), font, startSize, absW - 6);
        page.drawText(text, {
          x: absX + 3,
          y: absY + (absH - fs) / 2 + 1,
          size: fs,
          font,
          color: hexToRgb(field.color),
        });
        break;
      }

      // ── Checkbox ──────────────────────────────────────────────────────────
      case 'checkbox': {
        const v = strVal.toLowerCase();
        const checked = v === 'true' || v === 'checked' || v === 'yes' || v === '1' || v === 'on';
        if (!checked) break;
        const cx = absX + absW / 2, cy = absY + absH / 2;
        const s  = Math.min(absW, absH) * 0.35;
        const g  = rgb(0.05, 0.55, 0.2);
        // Draw checkmark
        page.drawLine({ start: { x: cx - s, y: cy }, end: { x: cx - s * 0.2, y: cy - s * 0.65 }, thickness: 1.8, color: g });
        page.drawLine({ start: { x: cx - s * 0.2, y: cy - s * 0.65 }, end: { x: cx + s, y: cy + s * 0.55 }, thickness: 1.8, color: g });
        break;
      }

      default: break;
    }
  } catch (e) {
    console.error(`[pdfService] renderField error (type=${field.type} id=${field.id}):`, e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT 1 — mergeSignaturesIntoPDF
// Used by Module 1 (sequential) AND as a utility for Module 2.
// Embeds all filled field values into the PDF bytes.
// ══════════════════════════════════════════════════════════════════════════════
async function mergeSignaturesIntoPDF(pdfSource, fields = []) {
  const bytes  = await fetchPdfBytes(pdfSource);
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const fontR  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages  = pdfDoc.getPages();

  for (const raw of fields) {
    const f = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (f.value === null || f.value === undefined) continue;
    if (typeof f.value === 'string' && !f.value.trim()) continue;
    const pi = Math.max(0, (f.page || 1) - 1);
    if (pi >= pages.length) continue;
    await renderField(pages[pi], f, f.value, pdfDoc, fontR, fontB);
  }

  return pdfDoc.save({ useObjectStreams: false });
}

// ─── Approver review PDF — boss content + employee field guides ────────────────
const FIELD_GUIDE_LABELS = {
  signature: 'Signature',
  initial:   'Initials',
  initials:  'Initials',
  text:      'Text',
  number:    'Number',
  date:      'Date',
  checkbox:  'Checkbox',
};

function plainField(raw) {
  return raw?.toObject ? raw.toObject() : { ...raw };
}

/** Split template fields into values to embed vs employee placeholders for approver review */
function buildApproverReviewFieldList(doc) {
  const bossSig = doc.bossSignature?.signatureImageUrl || null;
  const filled  = [];
  const guides  = [];

  for (const raw of doc.fields || []) {
    const f = plainField(raw);
    const isBoss     = !f.assignedTo || f.assignedTo === 'boss';
    const isEmployee = f.assignedTo === 'employee';

    if (isBoss) {
      let value = f.value || null;
      if ((f.type === 'signature' || f.type === 'initial' || f.type === 'initials') && bossSig) {
        value = bossSig;
      }
      if (value !== null && value !== undefined && String(value).trim()) {
        filled.push({ ...f, value: String(value) });
      }
    } else if (isEmployee) {
      if (f.value !== null && f.value !== undefined && String(f.value).trim()) {
        filled.push({ ...f, value: String(f.value) });
      } else {
        guides.push(f);
      }
    }
  }

  return { filled, guides };
}

function renderFieldGuide(page, field, fontReg) {
  const { width: pw, height: ph } = page.getSize();
  const { absX, absY, absW, absH } = toAbsPt(field, pw, ph);
  if (absW < 2 || absH < 2) return;

  const typeLabel = FIELD_GUIDE_LABELS[field.type] || field.type || 'Field';
  const label     = field.label?.trim()
    ? `${field.label.trim()} (${typeLabel})`
    : typeLabel;
  const guideText = `Employee: ${label}`;

  page.drawRectangle({
    x:           absX,
    y:           absY,
    width:       absW,
    height:      absH,
    borderColor: rgb(0.16, 0.52, 0.78),
    borderWidth: 1.2,
    color:       rgb(0.94, 0.97, 1),
    opacity:     0.55,
  });

  const fs = Math.min(9, Math.max(6, absH * 0.38));
  let text = safe(guideText);
  while (text.length > 1 && fontReg.widthOfTextAtSize(text, fs) > absW - 4) {
    text = text.slice(0, -1);
  }
  page.drawText(text, {
    x:     absX + 2,
    y:     absY + Math.max(2, (absH - fs) / 2),
    size:  fs,
    font:  fontReg,
    color: rgb(0.08, 0.35, 0.58),
    maxWidth: absW - 4,
  });
}

async function embedEmployeeFieldGuides(pdfBytes, guideFields = []) {
  if (!guideFields.length) {
    return Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
  }

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const fontR  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages  = pdfDoc.getPages();

  for (const field of guideFields) {
    const pi = Math.max(0, (field.page || 1) - 1);
    if (pi >= pages.length) continue;
    try {
      renderFieldGuide(pages[pi], field, fontR);
    } catch (e) {
      console.error(`[pdfService] field guide error (id=${field.id}):`, e.message);
    }
  }

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

/**
 * Build approver review PDF: authoriser signature/text + employee field markers.
 * @param {Buffer|Uint8Array} baseBytes — original template PDF bytes
 * @param {object} doc — Template or TemplateCampaign record
 */
async function buildApproverReviewPdf(baseBytes, doc) {
  const { filled, guides } = buildApproverReviewFieldList(doc);
  let merged               = baseBytes;

  if (filled.length) {
    const b64 = 'data:application/pdf;base64,'
      + Buffer.from(baseBytes).toString('base64');
    merged = await mergeSignaturesIntoPDF(b64, filled);
  }

  if (guides.length) {
    merged = await embedEmployeeFieldGuides(merged, guides);
  }

  return Buffer.isBuffer(merged) ? merged : Buffer.from(merged);
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT 2 — embedBossSignature (Module 2)
// Takes the original PDF, embeds boss signature + boss-assigned field values.
// Returns raw bytes (caller uploads to Cloudinary / storage).
// ══════════════════════════════════════════════════════════════════════════════
async function embedBossSignature({ fileUrl, signatureDataUrl, fields = [], fieldValues = [] }) {
  const bytes  = await fetchPdfBytes(fileUrl);
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const fontR  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages  = pdfDoc.getPages();

  // Build value map: fieldId → value
  const vm = {};
  for (const fv of fieldValues) {
    if (fv.fieldId) vm[fv.fieldId] = fv.value;
  }

  let bossFields = fields.filter(f => !f.assignedTo || f.assignedTo === 'boss');
  if (
    signatureDataUrl &&
    !bossFields.some(f => f.type === 'signature' || f.type === 'initial')
  ) {
    const fallback = fields.find(f => f.type === 'signature' || f.type === 'initial');
    if (fallback) bossFields = [fallback];
  }

  for (const field of bossFields) {

    const pi = Math.max(0, (field.page || 1) - 1);
    if (pi >= pages.length) continue;

    // Signature/initial fields get the boss's signature dataUrl
    let value = vm[field.id] ?? field.value ?? null;
    if ((field.type === 'signature' || field.type === 'initial') && signatureDataUrl) {
      value = signatureDataUrl;
    }

    if (!value) continue;
    await renderField(pages[pi], field, value, pdfDoc, fontR, fontB);
  }

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT 3 — generateEmployeePdf (Module 2)
// 1. Takes boss-signed PDF bytes
// 2. Embeds employee-filled fields
// 3. Appends professional audit trail page
// Returns final PDF as Buffer (ready to attach to email / save to DB).
// ══════════════════════════════════════════════════════════════════════════════
async function generateEmployeePdf(bossSignedPdfSource, allFields = [], sessionDoc) {
  // Step 1: Get boss-signed PDF bytes (or original template PDF)
  let bossBytes;
  if (bossSignedPdfSource instanceof Uint8Array || Buffer.isBuffer(bossSignedPdfSource)) {
    bossBytes = bossSignedPdfSource;
  } else {
    bossBytes = await fetchPdfBytes(bossSignedPdfSource);
  }

  // Step 2: Embed boss + employee field values (signatures, text, dates, etc.)
  const b64Source = 'data:application/pdf;base64,' + Buffer.from(bossBytes).toString('base64');
  const withFields = await mergeSignaturesIntoPDF(b64Source, allFields);

  // Step 3: Append audit certificate page
  const finalPdf = await appendAuditPage(withFields, sessionDoc);
  return finalPdf;
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT 4 — appendAuditPage
// Appends a branded, professional audit certificate page to any PDF.
// Works for both Module 1 (doc.parties[]) and Module 2 (doc.sessions[]).
// ══════════════════════════════════════════════════════════════════════════════
async function appendAuditPage(pdfBytes, doc) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const fontR  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontM  = await pdfDoc.embedFont(StandardFonts.Courier);

  // Embed company logo if available
  let logoImage = null;
  const logoUrl = doc.companyLogo || (doc.owner && doc.owner.companyLogo);
  if (logoUrl && typeof logoUrl === 'string' && (logoUrl.startsWith('http://') || logoUrl.startsWith('https://'))) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(logoUrl, { signal: ctrl.signal });
      clearTimeout(tid);
      if (res.ok) {
        const buf = await res.buffer();
        const contentType = res.headers.get('content-type') || '';
        if (logoUrl.match(/\.png$/i) || contentType.includes('png')) {
          logoImage = await pdfDoc.embedPng(buf).catch(() => null);
        } else {
          logoImage = await pdfDoc.embedJpg(buf).catch(() => null);
        }
      }
    } catch (e) {
      console.warn('[appendAuditPage] Logo embed failed:', e.message);
    }
  }

  _buildAuditPage(pdfDoc, fontR, fontB, fontM, doc, logoImage);

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

// ─── Build the audit page (internal) ─────────────────────────────────────────
function _buildAuditPage(pdfDoc, fontR, fontB, fontM, doc, logoImage) {
  const PW = 612, PH = 792;   // US Letter
  const M  = 48;              // horizontal margin (matches SignIt)
  const CW = PW - M * 2;     // content width

  // SignIt color palette (exact matches from HTML design)
  const signItColors = {
    nexBlack:   rgb(0.102, 0.102, 0.180),   // #1a1a2e
    nexPurple:  rgb(0.424, 0.361, 0.906),   // #6c5ce7
    docInfoBg:  rgb(0.933, 0.949, 0.969),   // #eef2f7
    sealGreen:  rgb(0.184, 0.682, 0.427),   // #2fae6d
    borderGray: rgb(0.886, 0.902, 0.918),   // #e2e6ea
    labelGray:  rgb(0.4, 0.4, 0.4),         // #666
    textDark:   rgb(0.133, 0.133, 0.133),   // #222
    textLight:  rgb(0.267, 0.267, 0.267),   // #444
    rowGray:    rgb(0.933, 0.933, 0.933),   // #eee
  };

  let page = pdfDoc.addPage([PW, PH]);
  let Y    = PH;              // current Y from top (we draw downward)

  // ══════════════════════════════════════════════════════════════════════════
  // HEADER SECTION (SignIt style)
  // ══════════════════════════════════════════════════════════════════════════
  Y = PH - 60;
  
  // Left: NexSign logo (multi-color text logo)
  drawNexSignLogo(page, M, Y, fontB);
  
  // Right: "Audit Trail" title
  const titleText = 'Audit Trail';
  const titleWidth = fontB.widthOfTextAtSize(titleText, 17);
  txt(page, titleText, PW - M - titleWidth, Y, { font: fontB, size: 17, color: signItColors.nexBlack });

  Y -= 40;

  // ══════════════════════════════════════════════════════════════════════════
  // DOCUMENT INFO BOX (SignIt style)
  // ══════════════════════════════════════════════════════════════════════════
  const infoBoxH = 90;
  const infoBoxY = Y - infoBoxH;
  
  // Draw rounded rectangle background (approximation with regular rect)
  rect(page, M, infoBoxY, CW, infoBoxH, signItColors.docInfoBg);

  // Info rows on the LEFT
  const docInfoRows = [
    ['Document name:',   safe(doc.title || doc.documentTitle || 'Untitled')],
    ['Document ID:',     String(doc._id || doc.id || '—').slice(0, 24)],
    ['Sender:',          safe(doc.bossName || (doc.parties && doc.parties[0]?.name) || doc.companyName || '—')],
    ['Date of creation:', doc.createdAt 
      ? new Date(doc.createdAt).toLocaleString('en-US', { 
          month: '2-digit', day: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: false 
        })
      : new Date().toLocaleString('en-US', { 
          month: '2-digit', day: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: false 
        })],
  ];

  let infoY = Y - 20;
  for (const [label, value] of docInfoRows) {
    txt(page, label, M + 28, infoY, { font: fontR, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
    txt(page, value, M + 28 + fontR.widthOfTextAtSize(label, 9.5) + 3, infoY, { 
      font: fontB, 
      size: 9.5, 
      color: signItColors.nexBlack,
      maxWidth: CW - 180
    });
    infoY -= 16;
  }

  // Seal badge on the RIGHT (eye-catching star-burst style like SignIt)
  const sealSize = 110;
  const sealX = PW - M - sealSize / 2 - 10;
  const sealY = infoBoxY + infoBoxH / 2;
  const sealR = 55;
  
  // Draw eye-catching star-burst seal (12-point star for visual impact)
  const points = 24; // 12 outer + 12 inner points
  for (let i = 0; i < points; i++) {
    const angle = (i * Math.PI) / (points / 2);
    const radius = i % 2 === 0 ? sealR : sealR * 0.8;
    const px = sealX + Math.cos(angle) * radius;
    const py = sealY + Math.sin(angle) * radius;
    
    // Draw circles at each star point to create burst effect
    page.drawCircle({
      x: px,
      y: py,
      size: 18,
      color: signItColors.sealGreen,
    });
  }
  
  // Fill center with large circle
  page.drawCircle({
    x: sealX,
    y: sealY,
    size: sealR * 0.85,
    color: signItColors.sealGreen,
  });
  
  // Checkmark (larger, more prominent)
  txt(page, '✓', sealX - 10, sealY + 6, { font: fontB, size: 26, color: C.white });
  
  // "Completed" text (bold, more visible)
  txt(page, 'Completed', sealX - 32, sealY - 14, { font: fontB, size: 9, color: C.white });

  Y = infoBoxY - 30;

  // ══════════════════════════════════════════════════════════════════════════
  // SIGNERS SECTION (bordered section with floating label - SignIt style)
  // ══════════════════════════════════════════════════════════════════════════
  const sectionY = Y;
  
  // Calculate section height based on signers
  const signers = doc.parties || doc.sessions || [];
  const headerRowH = 24;
  const dataRowH = 22;
  const sectionPadding = 18;
  const signersTableH = headerRowH + (signers.length * dataRowH) + sectionPadding * 2;
  
  const sectionBoxY = Y - signersTableH;
  
  // Draw section border
  page.drawRectangle({
    x: M,
    y: sectionBoxY,
    width: CW,
    height: signersTableH,
    borderColor: signItColors.borderGray,
    borderWidth: 1,
  });
  
  // Floating label "Signers" (positioned at top of border with white background)
  const labelText = 'Signers';
  const labelWidth = fontR.widthOfTextAtSize(labelText, 8.5);
  const labelX = M + 15;
  const labelY = Y + 11;
  
  // White background for label
  rect(page, labelX - 4, labelY - 4, labelWidth + 8, 15, C.white);
  txt(page, labelText, labelX, labelY, { font: fontR, size: 8.5, color: signItColors.labelGray });
  
  // Table header row
  Y -= 18;
  const headerY = Y - headerRowH;
  rect(page, M + 1, headerY, CW - 2, headerRowH, signItColors.docInfoBg);
  
  // Column headers with responsive percentage-based spacing
  const col1X = M + 12;
  const col2X = M + Math.floor(CW * 0.30);
  const col3X = M + Math.floor(CW * 0.48);
  const col4X = M + Math.floor(CW * 0.62);
  const col5X = M + Math.floor(CW * 0.80);
  
  const nameColX = col1X;
  const roleColX = col2X;
  const statusColX = col3X;
  const contactColX = col4X;
  const verifyColX = col5X;
  
  txt(page, 'Name', nameColX, headerY + 10, { font: fontB, size: 8.5, color: signItColors.nexBlack });
  txt(page, 'Role', roleColX, headerY + 10, { font: fontB, size: 8.5, color: signItColors.nexBlack });
  txt(page, 'Status', statusColX, headerY + 10, { font: fontB, size: 8.5, color: signItColors.nexBlack });
  txt(page, 'Contact Method', contactColX, headerY + 10, { font: fontB, size: 8.5, color: signItColors.nexBlack });
  txt(page, 'Verification Method', verifyColX, headerY + 10, { font: fontB, size: 8.5, color: signItColors.nexBlack });
  
  Y = headerY;

  // Table data rows
  for (let i = 0; i < signers.length; i++) {
    const s = signers[i];
    const signed = s.status === 'signed' || !!s.signedAt;
    const rowY = Y - dataRowH * (i + 1);
    
    // Row border (except last row)
    if (i < signers.length - 1) {
      hr(page, rowY, M + 1, PW - M - 1, signItColors.rowGray, 1);
    }
    
    // Name with responsive maxWidth for wrapping
    const name = safe(s.name || s.recipientName || 'Unknown');
    txt(page, name, nameColX, rowY + 8, { 
      font: fontR, size: 9, color: signItColors.textDark, 
      maxWidth: Math.floor(CW * 0.28)
    });
    
    // Role with responsive maxWidth for wrapping
    const role = safe(s.designation || s.role || 'Signer');
    txt(page, role, roleColX, rowY + 8, { 
      font: fontR, size: 9, color: signItColors.textDark, 
      maxWidth: Math.floor(CW * 0.16)
    });
    
    // Status
    const status = signed ? 'Completed' : 'Pending';
    const statusColor = signed ? signItColors.sealGreen : signItColors.nexPurple;
    txt(page, status, statusColX, rowY + 8, { font: fontR, size: 9, color: statusColor });
    
    // Contact Method with responsive maxWidth for wrapping
    const contact = safe(s.email || s.recipientEmail || '—');
    txt(page, contact, contactColX, rowY + 8, { 
      font: fontR, size: 9, color: signItColors.textDark, 
      maxWidth: Math.floor(CW * 0.16)
    });
    
    // Verification Method with responsive maxWidth
    const verification = signed ? 'Email + OTP' : '—';
    txt(page, verification, verifyColX, rowY + 8, { 
      font: fontR, size: 9, color: signItColors.textDark, 
      maxWidth: Math.floor(CW * 0.18)
    });
  }
  
  Y = sectionBoxY - 30;

  // ══════════════════════════════════════════════════════════════════════════
  // JOURNAL SECTION (bordered section with floating label - SignIt style)
  // ══════════════════════════════════════════════════════════════════════════
  
  // Build journal entries
  const journalEntries = [];
  
  // Document created
  if (doc.createdAt) {
    journalEntries.push({
      date: new Date(doc.createdAt).toLocaleString('en-US', { 
        month: '2-digit', day: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false 
      }),
      action: 'Created',
      details: `Document created by ${safe(doc.bossName || doc.companyName || 'Sender')}`,
    });
  }
  
  // Signers sent
  if (doc.createdAt) {
    journalEntries.push({
      date: new Date(doc.createdAt).toLocaleString('en-US', { 
        month: '2-digit', day: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false 
      }),
      action: 'Sent',
      details: `Sent to ${signers.length} recipient(s) for signature`,
    });
  }
  
  // Signature events
  for (const s of signers) {
    if (s.signedAt) {
      journalEntries.push({
        date: new Date(s.signedAt).toLocaleString('en-US', { 
          month: '2-digit', day: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: false 
        }),
        action: 'Signed',
        details: `Signed by ${safe(s.name || s.recipientName || 'Unknown')} from IP ${safe(s.ipAddress || s.ip || 'N/A')}`,
      });
    }
  }
  
  // Completed
  if (doc.completedAt) {
    journalEntries.push({
      date: new Date(doc.completedAt).toLocaleString('en-US', { 
        month: '2-digit', day: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false 
      }),
      action: 'Completed',
      details: 'All signatures collected, document finalized',
    });
  }
  
  const journalHeaderH = 24;
  const journalRowH = 22;
  const journalPadding = 18;
  const journalTableH = journalHeaderH + (journalEntries.length * journalRowH) + journalPadding * 2;
  
  // Check if we need a new page
  if (Y - journalTableH < M + 100) {
    _auditFooter(page, fontR, fontM, PW, M, PH);
    page = pdfDoc.addPage([PW, PH]);
    Y = PH - M;
  }
  
  const journalBoxY = Y - journalTableH;
  
  // Draw section border
  page.drawRectangle({
    x: M,
    y: journalBoxY,
    width: CW,
    height: journalTableH,
    borderColor: signItColors.borderGray,
    borderWidth: 1,
  });
  
  // Floating label "Journal"
  const journalLabelText = 'Journal';
  const journalLabelWidth = fontR.widthOfTextAtSize(journalLabelText, 8.5);
  const journalLabelX = M + 15;
  const journalLabelY = Y + 11;
  
  rect(page, journalLabelX - 4, journalLabelY - 4, journalLabelWidth + 8, 15, C.white);
  txt(page, journalLabelText, journalLabelX, journalLabelY, { font: fontR, size: 8.5, color: signItColors.labelGray });
  
  // Table header row
  Y -= 18;
  const journalHeaderY = Y - journalHeaderH;
  rect(page, M + 1, journalHeaderY, CW - 2, journalHeaderH, signItColors.docInfoBg);
  
  // Column headers with responsive percentage-based widths (Date 22%, Action 18%, Details rest)
  const dateColX = M + 12;
  const actionColX = M + Math.floor(CW * 0.22);
  const detailsColX = M + Math.floor(CW * 0.40);
  
  txt(page, 'Date', dateColX, journalHeaderY + 10, { font: fontB, size: 8.5, color: signItColors.nexBlack });
  txt(page, 'Action', actionColX, journalHeaderY + 10, { font: fontB, size: 8.5, color: signItColors.nexBlack });
  txt(page, 'Details', detailsColX, journalHeaderY + 10, { font: fontB, size: 8.5, color: signItColors.nexBlack });
  
  Y = journalHeaderY;

  // Journal data rows
  for (let i = 0; i < journalEntries.length; i++) {
    const entry = journalEntries[i];
    const rowY = Y - journalRowH * (i + 1);
    
    // Row border (except last row)
    if (i < journalEntries.length - 1) {
      hr(page, rowY, M + 1, PW - M - 1, signItColors.rowGray, 1);
    }
    
    // Date with responsive maxWidth
    txt(page, entry.date, dateColX, rowY + 8, { 
      font: fontR, size: 9, color: signItColors.textDark, 
      maxWidth: Math.floor(CW * 0.20) 
    });
    
    // Action with responsive maxWidth
    txt(page, entry.action, actionColX, rowY + 8, { 
      font: fontR, size: 9, color: signItColors.textDark, 
      maxWidth: Math.floor(CW * 0.16) 
    });
    
    // Details with responsive maxWidth (rest of space)
    txt(page, entry.details, detailsColX, rowY + 8, { 
      font: fontR, size: 9, color: signItColors.textDark, 
      maxWidth: Math.floor(CW * 0.58) 
    });
  }
  
  Y = journalBoxY - 30;

  // ══════════════════════════════════════════════════════════════════════════
  // LEGAL NOTICE SECTION (bordered section - SignIt style)
  // ══════════════════════════════════════════════════════════════════════════
  const legalNoticeH = 90;
  
  // Check if we need a new page
  if (Y - legalNoticeH < M + 50) {
    _auditFooter(page, fontR, fontM, PW, M, PH);
    page = pdfDoc.addPage([PW, PH]);
    Y = PH - M;
  }
  
  const legalBoxY = Y - legalNoticeH;
  
  // Draw section border
  page.drawRectangle({
    x: M,
    y: legalBoxY,
    width: CW,
    height: legalNoticeH,
    borderColor: signItColors.borderGray,
    borderWidth: 1,
  });
  
  // Floating label "Legal Notice"
  const legalLabelText = 'Legal Notice';
  const legalLabelWidth = fontR.widthOfTextAtSize(legalLabelText, 8.5);
  const legalLabelX = M + 15;
  const legalLabelY = Y + 11;
  
  rect(page, legalLabelX - 4, legalLabelY - 4, legalLabelWidth + 8, 15, C.white);
  txt(page, legalLabelText, legalLabelX, legalLabelY, { font: fontR, size: 8.5, color: signItColors.labelGray });
  
  // Legal text content
  const legalLines = [
    'This document has been electronically signed using NexSign\'s digital signature platform and',
    'constitutes a legally binding agreement under applicable electronic signature laws, including but not',
    'limited to the U.S. Electronic Signatures in Global and National Commerce Act (ESIGN), the Uniform',
    'Electronic Transactions Act (UETA), and the European Union\'s eIDAS regulation.',
    '',
    'The audit trail contained in this certificate provides a comprehensive record of all signature events,',
    'including timestamps, IP addresses, and verification methods used. This certificate serves as legal',
    'proof of the signing process and the authenticity of all signatures affixed to this document.',
  ];
  
  let legalY = Y - 20;
  for (const line of legalLines) {
    if (line === '') {
      legalY -= 8;
    } else {
      txt(page, line, M + 20, legalY, { font: fontR, size: 8.5, color: signItColors.textLight, maxWidth: CW - 40 });
      legalY -= 12;
    }
  }

  // Footer on last page
  _auditFooter(page, fontR, fontM, PW, M, PH);
}

function _auditFooter(page, fontR, fontM, PW, M, PH) {
  // Professional footer like SignIt/DocuSign
  // Light gray background instead of colored
  rect(page, 0, 0, PW, 40, rgb(0.97, 0.97, 0.97));
  
  // Top border line
  hr(page, 40, 0, PW, rgb(0.85, 0.85, 0.85), 0.5);
  
  // "Powered by NexSign" with subtle branding
  txt(page, 'Powered by', M, 24, { 
    font: fontR, 
    size: 7.5, 
    color: rgb(0.5, 0.5, 0.5) 
  });
  txt(page, 'NexSign', M + 52, 24, { 
    font: fontR, 
    size: 8.5, 
    color: C.brand 
  });
  
  // Legal text (right side)
  const legalText = 'Confidential & Legally Binding Document';
  const legalWidth = fontR.widthOfTextAtSize(legalText, 7);
  txt(page, legalText, PW - M - legalWidth, 24, { 
    font: fontR, 
    size: 7, 
    color: rgb(0.5, 0.5, 0.5) 
  });
  
  // Timestamp (center bottom)
  const timestamp = new Date().toUTCString();
  const tsWidth = fontM.widthOfTextAtSize(timestamp, 6.5);
  txt(page, timestamp, (PW - tsWidth) / 2, 10, { 
    font: fontM, 
    size: 6.5, 
    color: rgb(0.6, 0.6, 0.6) 
  });
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  mergeSignaturesIntoPDF,
  embedBossSignature,
  generateEmployeePdf,
  appendAuditPage,
  fetchPdfBytes,
  buildApproverReviewPdf,
  buildApproverReviewFieldList,
  plainField,
};