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

/** Fetch PDF from URL / base64 dataURI / filesystem path → Uint8Array */
async function fetchPdfBytes(source) {
  if (!source) throw new Error('[pdfService] No PDF source provided.');

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

      // ── Signature / Initials → embed as PNG image ─────────────────────────
      case 'signature':
      case 'initial':
      case 'initials': {
        if (!strVal.startsWith('data:image/')) break;
        const b64      = strVal.split(',')[1];
        if (!b64) break;
        const imgBytes = Buffer.from(b64, 'base64');
        let img;
        try {
          img = strVal.includes('image/png')
            ? await pdfDoc.embedPng(imgBytes)
            : await pdfDoc.embedJpg(imgBytes);
        } catch {
          try { img = await pdfDoc.embedPng(imgBytes); } catch { break; }
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
        // Scale font to fit field height; clamp between 7–16pt
        let fs   = Math.min(16, Math.max(7, absH * 0.55));
        let text = safe(strVal);
        // Truncate to fit width
        while (text.length > 1 && font.widthOfTextAtSize(text, fs) > absW - 6) {
          text = text.slice(0, -1);
        }
        page.drawText(text, {
          x: absX + 3,
          y: absY + (absH - fs) / 2 + 1,
          size: fs, font,
          color: rgb(0.08, 0.08, 0.08),
          maxWidth: absW - 6,
        });
        break;
      }

      // ── Date ──────────────────────────────────────────────────────────────
      case 'date': {
        const fs = Math.min(11, Math.max(7, absH * 0.45));
        page.drawText(safe(strVal), {
          x: absX + 3, y: absY + (absH - fs) / 2 + 1,
          size: fs, font: fontReg, color: rgb(0.08, 0.08, 0.08),
        });
        break;
      }

      // ── Checkbox ──────────────────────────────────────────────────────────
      case 'checkbox': {
        const v = strVal.toLowerCase();
        if (v !== 'true' && v !== 'checked') break;
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

  for (const field of fields) {
    // Only process boss-assigned fields
    if (field.assignedTo && field.assignedTo !== 'boss') continue;

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
async function generateEmployeePdf(bossSignedPdfSource, employeeFields = [], sessionDoc) {
  // Step 1: Get boss-signed PDF bytes
  const bossBytes = typeof bossSignedPdfSource === 'string'
    ? await fetchPdfBytes(bossSignedPdfSource)
    : bossSignedPdfSource;

  // Step 2: Embed employee fields
  const b64Source = 'data:application/pdf;base64,' + Buffer.from(bossBytes).toString('base64');
  const withEmpFields = await mergeSignaturesIntoPDF(b64Source, employeeFields);

  // Step 3: Append audit page
  const finalPdf = await appendAuditPage(withEmpFields, sessionDoc);
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

  _buildAuditPage(pdfDoc, fontR, fontB, fontM, doc);

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

// ─── Build the audit page (internal) ─────────────────────────────────────────
function _buildAuditPage(pdfDoc, fontR, fontB, fontM, doc) {
  const PW = 612, PH = 792;   // US Letter
  const M  = 44;              // horizontal margin
  const CW = PW - M * 2;     // content width

  let page = pdfDoc.addPage([PW, PH]);
  let Y    = PH;              // current Y from top (we draw downward)

  // ── Header bar ────────────────────────────────────────────────────────────
  rect(page, 0, PH - 90, PW, 90,  C.dark);   // dark background
  rect(page, 0, PH - 90, PW, 3,   C.brand);  // top accent

  // NexSign logo mark (simple square with "N")
  rect(page, M, PH - 68, 36, 36, C.brand);
  txt(page, 'N', M + 10, PH - 53, { font: fontB, size: 18, color: C.white });

  txt(page, 'NexSign', M + 44, PH - 50, { font: fontB, size: 15, color: C.white });
  txt(page, 'Certificate of Completion  |  Audit Trail', M + 44, PH - 65, { font: fontR, size: 9, color: rgb(0.6, 0.75, 0.85) });

  txt(page, `Generated: ${new Date().toUTCString()}`, M, PH - 82, { font: fontM, size: 7.5, color: rgb(0.45, 0.6, 0.7) });

  // "COMPLETED" badge top-right
  rect(page, PW - M - 80, PH - 66, 80, 22, C.green);
  txt(page, 'COMPLETED', PW - M - 72, PH - 59, { font: fontB, size: 8, color: C.white });

  Y = PH - 106;

  // ── Document details card ─────────────────────────────────────────────────
  const docRows = [
    ['Document Title',  safe(doc.title        || doc.documentTitle || 'Untitled')],
    ['Document ID',     String(doc._id        || doc.id || '—')],
    ['Company',         safe(doc.companyName  || '—')],
    ['Sent By',         safe(doc.bossName || (doc.parties && doc.parties[0]?.name) || '—')],
    ['Total Signers',   String((doc.parties || doc.sessions || []).length)],
    ['Status',          'COMPLETED'],
    ['Completed At',    doc.completedAt
      ? new Date(doc.completedAt).toUTCString()
      : new Date().toUTCString()],
  ];

  const cardH = docRows.length * 17 + 26;
  rect(page, M, Y - cardH, CW, cardH, C.bgA, C.lgrey);
  rect(page, M, Y - cardH, 4,  cardH, C.brand); // accent bar

  txt(page, 'DOCUMENT DETAILS', M + 10, Y - 14, { font: fontB, size: 7.5, color: C.brand });

  let iy = Y - 28;
  for (const [label, val] of docRows) {
    const lw = fontB.widthOfTextAtSize(`${label}: `, 8.5);
    txt(page, `${label}:`, M + 10, iy, { font: fontB, size: 8.5, color: C.grey });
    txt(page, val, M + 10 + lw, iy, { font: fontR, size: 8.5, color: C.dark, maxWidth: CW - lw - 20 });
    iy -= 17;
  }

  Y -= cardH + 18;

  // ── Signers section ───────────────────────────────────────────────────────
  txt(page, 'SIGNERS', M, Y, { font: fontB, size: 9, color: C.grey });
  Y -= 5;
  hr(page, Y, M, M + CW, C.brand, 1.5);
  Y -= 14;

  // Support both Module 1 (parties[]) and Module 2 (sessions[] or parties[])
  const signers = doc.parties || doc.sessions || [];

  for (let i = 0; i < signers.length; i++) {
    const s      = signers[i];
    const signed = s.status === 'signed' || !!s.signedAt;

    // Build detail lines for this signer
    const details = [];
    if (s.role || s.designation)
      details.push(['Role', safe(s.role || s.designation)]);
    if (s.localSignedAt || s.localSignedTime || s.signedAt)
      details.push(['Signed At', safe(s.localSignedAt || s.localSignedTime || new Date(s.signedAt).toUTCString())]);
    if (s.ipAddress || s.ip)
      details.push(['IP Address', safe(s.ipAddress || s.ip)]);
    if (s.device || s.browser)
      details.push(['Device', safe([s.device, s.browser, s.os].filter(Boolean).join(' / '))]);
    if (s.city || s.country)
      details.push(['Location', safe([s.city, s.region, s.country].filter(Boolean).join(', ') + (s.postalCode ? ` — ${s.postalCode}` : ''))]);
    if (s.latitude && s.longitude)
      details.push(['Coordinates', `${s.latitude} N, ${s.longitude} E`]);
    if (s.timezone)
      details.push(['Timezone', safe(s.timezone)]);

    const rowH = 46 + details.length * 13;

    // New page check
    if (Y - rowH < M + 80) {
      _auditFooter(page, fontR, fontM, PW, M, PH);
      page = pdfDoc.addPage([PW, PH]);
      Y    = PH - M;
      txt(page, 'SIGNERS (continued)', M, Y, { font: fontB, size: 10, color: C.brand });
      Y -= 18;
    }

    const rowFill = i % 2 === 0 ? C.bgA : rgb(0.988, 1, 1);
    rect(page, M, Y - rowH, CW, rowH, rowFill, C.lgrey);
    rect(page, M, Y - rowH, 4,  rowH, signed ? C.green : C.amber);

    // Numbered circle
    page.drawCircle({ x: M + 18, y: Y - 18, size: 11, color: signed ? C.green : C.amber });
    txt(page, String(i + 1), M + (i < 9 ? 15 : 11), Y - 22, { font: fontB, size: 8.5, color: C.white });

    // Name, email
    txt(page, safe(s.name || s.recipientName || 'Unknown'), M + 36, Y - 12, { font: fontB, size: 10, color: C.dark });
    txt(page, safe(s.email || s.recipientEmail || ''), M + 36, Y - 26, { font: fontM, size: 8, color: C.grey, maxWidth: CW / 2 });

    // Status badge
    const badgeFill  = signed ? C.green  : C.amber;
    const badgeLabel = signed ? 'SIGNED' : 'PENDING';
    rect(page, PW - M - 70, Y - 24, 68, 16, badgeFill);
    txt(page, badgeLabel, PW - M - 59, Y - 17, { font: fontB, size: 7.5, color: C.white });

    // Detail lines
    if (details.length) {
      hr(page, Y - 38, M + 8, M + CW - 8, C.lgrey, 0.4);
      let dy = Y - 50;
      for (const [dlabel, dval] of details) {
        const lw = fontB.widthOfTextAtSize(`${dlabel}: `, 7.5);
        txt(page, `${dlabel}:`, M + 14, dy, { font: fontB, size: 7.5, color: C.grey });
        txt(page, dval, M + 14 + lw, dy, { font: fontM, size: 7.5, color: C.dark, maxWidth: CW - lw - 22 });
        dy -= 13;
      }
    }

    Y -= rowH + 8;
  }

  // ── CC Recipients ─────────────────────────────────────────────────────────
  const ccList = doc.ccList || doc.cc || [];
  if (ccList.length && Y > M + 60) {
    Y -= 10;
    txt(page, 'CC RECIPIENTS', M, Y, { font: fontB, size: 9, color: C.grey });
    Y -= 5;
    hr(page, Y, M, M + CW, C.lgrey, 0.8);
    Y -= 10;

    for (const cc of ccList) {
      if (Y < M + 40) break;
      rect(page, M, Y - 22, CW, 23, rgb(0.957, 0.976, 1), C.lgrey);
      rect(page, M, Y - 22, 3,  23, C.blue);
      const nameStr = safe([cc.name, cc.designation].filter(Boolean).join(' · '));
      txt(page, nameStr, M + 10, Y - 8, { font: fontB, size: 9, color: C.dark, maxWidth: CW / 2 });
      txt(page, safe(cc.email || ''), M + CW / 2, Y - 8, { font: fontM, size: 8, color: C.grey, maxWidth: CW / 2 - 10 });
      Y -= 27;
    }
  }

  // ── Legal disclaimer ──────────────────────────────────────────────────────
  if (Y > M + 60) {
    Y -= 10;
    const dH = 48;
    rect(page, M, Y - dH, CW, dH, C.blueL, C.lgrey);
    rect(page, M, Y - dH, 4,  dH, C.blue);
    txt(page, 'LEGAL NOTICE', M + 10, Y - 14, { font: fontB, size: 8, color: C.blue });
    txt(page, 'This certificate is an electronically generated record of all signature events associated with this document.',
      M + 10, Y - 26, { font: fontR, size: 7.5, color: C.grey, maxWidth: CW - 20 });
    txt(page, 'All events are cryptographically timestamped. This document is legally binding under ESIGN Act, eIDAS, and applicable e-signature laws.',
      M + 10, Y - 38, { font: fontR, size: 7.5, color: C.grey, maxWidth: CW - 20 });
  }

  // Footer on last page
  _auditFooter(page, fontR, fontM, PW, M, PH);
}

function _auditFooter(page, fontR, fontM, PW, M, PH) {
  rect(page, 0, 0, PW, 32, C.brand);
  txt(page, 'NexSign  |  Enterprise E-Signature Platform  |  nexsign.app', M, 20, { font: fontR, size: 8, color: C.white });
  txt(page, `Confidential & Legally Binding  |  ${new Date().toUTCString()}`, M, 8, { font: fontM, size: 7, color: rgb(0.85, 0.96, 1) });
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  mergeSignaturesIntoPDF,
  embedBossSignature,
  generateEmployeePdf,
  appendAuditPage,
  fetchPdfBytes,
};