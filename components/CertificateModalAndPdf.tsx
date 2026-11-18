'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Award, Calendar, Download, FileBadge, MapPin, Printer, Upload, X } from 'lucide-react';
import type { BrandingConfig, CertificateRecord, CertificateSettings } from '@/lib/types';

export const DEFAULT_OFFICIAL_LOGO_URL = '/assets/aistudio/al-nibras_logo_3b0dfbfe.png';

export type CertificateTitleOption =
  | 'Certificate of Achievement'
  | 'Certificate of Participation';

export interface PositionBadgeStyle {
  badgeTitle: string;
  ribbonLabel: string;
  tierLabel: string;
  primaryColor: string;
  secondaryColor: string;
  bgTint: string;
  borderHex: string;
  textHex: string;
}

export function getPositionCertificateTheme(position: string, grade: string): PositionBadgeStyle {
  if (position === '1st Place') {
    return {
      badgeTitle: '1ST POSITION',
      ribbonLabel: 'FIRST PLACE LAUREATE · GOLD HONORS',
      tierLabel: 'CHAMPION LAUREATE',
      primaryColor: '#C59B27',
      secondaryColor: '#9A7515',
      bgTint: '#FEF9E7',
      borderHex: '#C59B27',
      textHex: '#0B1F3A',
    };
  }
  if (position === '2nd Place') {
    return {
      badgeTitle: '2ND POSITION',
      ribbonLabel: 'SECOND PLACE LAUREATE',
      tierLabel: 'DISTINGUISHED RUNNER-UP',
      primaryColor: '#64748B',
      secondaryColor: '#334155',
      bgTint: '#F1F5F9',
      borderHex: '#C59B27',
      textHex: '#0B1F3A',
    };
  }
  if (position === '3rd Place') {
    return {
      badgeTitle: '3RD POSITION',
      ribbonLabel: 'THIRD PLACE LAUREATE',
      tierLabel: 'HONORABLE PODIUM LAUREATE',
      primaryColor: '#B45309',
      secondaryColor: '#92400E',
      bgTint: '#FFFBEB',
      borderHex: '#C59B27',
      textHex: '#0B1F3A',
    };
  }
  return {
    badgeTitle: grade !== 'None' ? `GRADE ${grade}` : 'PARTICIPANT',
    ribbonLabel: 'OFFICIAL CONFERMENT',
    tierLabel: 'SCHOLAR',
    primaryColor: '#0B1F3A',
    secondaryColor: '#C59B27',
    bgTint: '#F8FAFC',
    borderHex: '#C59B27',
    textHex: '#0B1F3A',
  };
}

function resolveCertificateTitle(
  cert: CertificateRecord,
  settings?: CertificateSettings,
  override?: CertificateTitleOption
): CertificateTitleOption {
  if (override) return override;
  const candidate = (cert.certificateTitle || settings?.title || '').toLowerCase();
  if (candidate.includes('participation')) {
    return 'Certificate of Participation';
  }
  return 'Certificate of Achievement';
}

/**
 * Encapsulates a high-resolution 300 DPI JPEG Data URL into a valid single-page
 * A4 Landscape PDF 1.4 binary Uint8Array (841.89pt x 595.28pt = 297mm x 210mm).
 */
function buildPdfFromJpegDataUrl(
  jpegDataUrl: string,
  pixelWidth: number,
  pixelHeight: number
): Uint8Array {
  const base64 = jpegDataUrl.split(',')[1] || '';
  const binaryStr = atob(base64);
  const jpegBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    jpegBytes[i] = binaryStr.charCodeAt(i);
  }

  const pageW = 841.89;
  const pageH = 595.28;
  const contentStream = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;

  const pushText = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  pushText('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  offsets[1] = currentOffset;
  pushText('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  offsets[2] = currentOffset;
  pushText('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  offsets[3] = currentOffset;
  pushText(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  offsets[4] = currentOffset;
  pushText(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushText('\nendstream\nendobj\n');

  offsets[5] = currentOffset;
  pushText(
    `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`
  );

  const xrefOffset = currentOffset;
  pushText('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) {
    pushText(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawOrnamentalCorner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dirX: 1 | -1,
  dirY: 1 | -1
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dirX, dirY);

  // Outer Navy Accent L-Angle
  ctx.strokeStyle = '#0B1F3A';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 140);
  ctx.lineTo(0, 0);
  ctx.lineTo(140, 0);
  ctx.stroke();

  // Inner Gold Ornamental Curve & Scrollwork
  ctx.strokeStyle = '#C59B27';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(22, 165);
  ctx.lineTo(22, 22);
  ctx.lineTo(165, 22);
  ctx.stroke();

  // Corner Flourish Arcs
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(22, 92);
  ctx.bezierCurveTo(64, 92, 92, 64, 92, 22);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(46, 128);
  ctx.bezierCurveTo(46, 76, 76, 46, 128, 46);
  ctx.stroke();

  // Gold Corner Medallion Dot
  ctx.fillStyle = '#C59B27';
  ctx.beginPath();
  ctx.arc(38, 38, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0B1F3A';
  ctx.beginPath();
  ctx.arc(38, 38, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawGoldenAwardEmblem(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);

  // Dual Ribbon Tails (Navy + Gold)
  ctx.fillStyle = '#0B1F3A';
  ctx.beginPath();
  ctx.moveTo(-48, 52);
  ctx.lineTo(-74, 152);
  ctx.lineTo(-34, 126);
  ctx.lineTo(-8, 156);
  ctx.lineTo(-4, 58);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(48, 52);
  ctx.lineTo(74, 152);
  ctx.lineTo(34, 126);
  ctx.lineTo(8, 156);
  ctx.lineTo(4, 58);
  ctx.closePath();
  ctx.fill();

  // Scalloped Gold Starburst Outer Ring
  const spikes = 24;
  const outerR = 78;
  const innerR = 66;
  const goldGrad = ctx.createRadialGradient(-18, -18, 12, 0, 0, outerR);
  goldGrad.addColorStop(0, '#F5DF8D');
  goldGrad.addColorStop(0.55, '#D4AF37');
  goldGrad.addColorStop(1, '#9A7515');

  ctx.fillStyle = goldGrad;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8F6A10';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Navy Inner Core
  ctx.fillStyle = '#0B1F3A';
  ctx.beginPath();
  ctx.arc(0, 0, 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#E6C665';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Decorative 8-Point Gold Star Inside Medallion (pure ornament, zero text)
  ctx.fillStyle = '#E6C665';
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 28 : 11;
    const angle = (i * Math.PI) / 8 - Math.PI / 2;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  fontTemplate: (size: number) => string,
  baseSize: number,
  minSize: number
) {
  let size = baseSize;
  ctx.font = fontTemplate(size);
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = fontTemplate(size);
  }
  ctx.fillText(text, cx, y);
}

/**
 * Generates an exact 300 DPI A4 Landscape (3508 x 2480 px) print-ready PDF
 * containing ONLY the 9 specified certificate elements in a Navy Blue, Gold, and White composition.
 */
export async function downloadCertificateAsPdf(
  cert: CertificateRecord,
  settings?: CertificateSettings,
  customLogoOrBranding?: BrandingConfig | string,
  options?: {
    certificateTitle?: CertificateTitleOption;
    fallbackVenue?: string;
  }
): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Proceed cleanly with loaded fonts
    }
  }

  // Exact A4 Landscape (297mm x 210mm) at 300 DPI = 3508 x 2480 px
  const width = 3508;
  const height = 2480;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Resolve ONLY the 9 permitted fields
  const organizationName = (
    cert.unionName ||
    settings?.unionName ||
    (typeof customLogoOrBranding === 'object' ? customLogoOrBranding?.unionTitle : '') ||
    'AL-NIBRAS CLASS UNION'
  ).trim();

  const customLogoUrl =
    typeof customLogoOrBranding === 'string'
      ? customLogoOrBranding
      : customLogoOrBranding?.logoUrl;
  const logoSrc = customLogoUrl || DEFAULT_OFFICIAL_LOGO_URL;

  const certificateTitle = resolveCertificateTitle(cert, settings, options?.certificateTitle);
  const participantName = (cert.studentName || '').trim();
  const programName = (cert.programName || '').trim();
  const programDate = (cert.programDate || '').trim();
  const programVenue = (cert.programVenue || options?.fallbackVenue || '').trim() || '—';
  const certificateId = (cert.certificateNumber || '').trim();
  const dateOfIssue = (cert.publicationDate || '').trim();

  // 1. Crisp Pure White Background (#FFFFFF)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Subtle Navy corner trim strips (minimal luxury accent)
  ctx.fillStyle = '#0B1F3A';
  ctx.fillRect(0, 0, width, 28);
  ctx.fillRect(0, height - 28, width, 28);

  // 2. Double-Line Golden Border Frame
  // Outer border
  ctx.strokeStyle = '#C59B27';
  ctx.lineWidth = 10;
  ctx.strokeRect(96, 96, width - 192, height - 192);

  // Subtle Navy hairline inside outer border
  ctx.strokeStyle = '#0B1F3A';
  ctx.lineWidth = 3;
  ctx.strokeRect(122, 122, width - 244, height - 244);

  // Inner golden border
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 5;
  ctx.strokeRect(142, 142, width - 284, height - 284);

  // Four Ornamental Corner Decorations
  drawOrnamentalCorner(ctx, 162, 162, 1, 1);
  drawOrnamentalCorner(ctx, width - 162, 162, -1, 1);
  drawOrnamentalCorner(ctx, 162, height - 162, 1, -1);
  drawOrnamentalCorner(ctx, width - 162, height - 162, -1, -1);

  // 3. Subtle Organization Logo Watermark in Center Background
  const logoImg = await loadImageElement(logoSrc);
  if (logoImg) {
    ctx.save();
    ctx.globalAlpha = 0.055;
    const wmSize = 1080;
    ctx.drawImage(logoImg, width / 2 - wmSize / 2, height / 2 - wmSize / 2 + 40, wmSize, wmSize);
    ctx.restore();
  }

  // 4. Top Section: Organization Logo & Organization Name (#1 & #2)
  const logoBoxY = 230;
  const logoSize = 210;
  if (logoImg) {
    ctx.drawImage(logoImg, width / 2 - logoSize / 2, logoBoxY, logoSize, logoSize);
  } else {
    ctx.fillStyle = '#0B1F3A';
    ctx.beginPath();
    ctx.arc(width / 2, logoBoxY + logoSize / 2, 95, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#C59B27';
    ctx.lineWidth = 6;
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#0B1F3A';
  drawFittedText(
    ctx,
    organizationName.toUpperCase(),
    width / 2,
    515,
    2400,
    (s) => `700 ${s}px "Cinzel", "Playfair Display", Georgia, serif`,
    48,
    30
  );

  // Gold horizontal divider beneath Organization Name
  const drawOrnamentalDivider = (cy: number, halfSpan: number) => {
    ctx.strokeStyle = '#C59B27';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(width / 2 - halfSpan, cy);
    ctx.lineTo(width / 2 - 28, cy);
    ctx.moveTo(width / 2 + 28, cy);
    ctx.lineTo(width / 2 + halfSpan, cy);
    ctx.stroke();

    // Central Gold Diamond
    ctx.fillStyle = '#D4AF37';
    ctx.beginPath();
    ctx.moveTo(width / 2, cy - 12);
    ctx.lineTo(width / 2 + 12, cy);
    ctx.lineTo(width / 2, cy + 12);
    ctx.lineTo(width / 2 - 12, cy);
    ctx.closePath();
    ctx.fill();
  };

  drawOrnamentalDivider(565, 560);

  // 5. Large, Bold, Visually Prominent Certificate Title (#3)
  ctx.fillStyle = '#0B1F3A';
  drawFittedText(
    ctx,
    certificateTitle.toUpperCase(),
    width / 2,
    720,
    2750,
    (s) => `800 ${s}px "Cinzel", "Playfair Display", Georgia, serif`,
    118,
    74
  );

  // Thin gold underline bar below Certificate Title
  ctx.fillStyle = '#C59B27';
  ctx.fillRect(width / 2 - 320, 764, 640, 6);

  // 6. Participant's Name (#4) — Prominent & Luxurious
  ctx.fillStyle = '#0B1F3A';
  drawFittedText(
    ctx,
    participantName,
    width / 2,
    1020,
    2650,
    (s) => `700 ${s}px "Playfair Display", "Cinzel", Georgia, serif`,
    134,
    78
  );

  // Elegant Golden Underline under Participant's Name
  drawOrnamentalDivider(1078, 820);

  // 7. Program Details Card Region (#5 Program Name, #6 Program Date, #7 Program Venue)
  const panelX = 480;
  const panelY = 1175;
  const panelW = width - 960;
  const panelH = 490;

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 3.5;
  ctx.strokeRect(panelX, panelY, panelW, panelH);

  // Top Navy bar accent inside Program panel
  ctx.fillStyle = '#0B1F3A';
  ctx.fillRect(panelX, panelY, panelW, 10);

  // Program Name label & value
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9A7515';
  ctx.font = '600 28px "Poppins", "Montserrat", sans-serif';
  ctx.fillText('PROGRAM NAME', width / 2, panelY + 86);

  ctx.fillStyle = '#0B1F3A';
  drawFittedText(
    ctx,
    programName,
    width / 2,
    panelY + 178,
    panelW - 140,
    (s) => `700 ${s}px "Playfair Display", "Cinzel", Georgia, serif`,
    68,
    40
  );

  // Soft gold divider separating Program Name from Date & Venue row
  ctx.strokeStyle = '#E5D399';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(panelX + 120, panelY + 245);
  ctx.lineTo(panelX + panelW - 120, panelY + 245);
  ctx.stroke();

  // Vertical separator between Program Date and Program Venue
  ctx.beginPath();
  ctx.moveTo(width / 2, panelY + 280);
  ctx.lineTo(width / 2, panelY + 440);
  ctx.stroke();

  const leftColX = panelX + panelW * 0.25;
  const rightColX = panelX + panelW * 0.75;

  ctx.fillStyle = '#9A7515';
  ctx.font = '600 26px "Poppins", "Montserrat", sans-serif';
  ctx.fillText('PROGRAM DATE', leftColX, panelY + 332);
  ctx.fillText('PROGRAM VENUE', rightColX, panelY + 332);

  ctx.fillStyle = '#0B1F3A';
  drawFittedText(
    ctx,
    programDate,
    leftColX,
    panelY + 402,
    panelW * 0.44,
    (s) => `600 ${s}px "Poppins", "Montserrat", sans-serif`,
    44,
    28
  );
  drawFittedText(
    ctx,
    programVenue,
    rightColX,
    panelY + 402,
    panelW * 0.44,
    (s) => `600 ${s}px "Poppins", "Montserrat", sans-serif`,
    44,
    28
  );

  // 8. Golden Award Emblem Centered Above Bottom Metadata
  drawGoldenAwardEmblem(ctx, width / 2, 1955);

  // 9. Bottom Section: Certificate ID/Serial Number (#8 Left) & Date of Issue (#9 Right)
  const bottomY = 2175;
  const leftMetaX = 280;
  const rightMetaX = width - 280;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#9A7515';
  ctx.font = '600 26px "Poppins", "Montserrat", sans-serif';
  ctx.fillText('CERTIFICATE ID', leftMetaX, bottomY);
  ctx.fillStyle = '#0B1F3A';
  ctx.font = '700 38px "Montserrat", "Poppins", sans-serif';
  ctx.fillText(certificateId, leftMetaX, bottomY + 56);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#9A7515';
  ctx.font = '600 26px "Poppins", "Montserrat", sans-serif';
  ctx.fillText('DATE OF ISSUE', rightMetaX, bottomY);
  ctx.fillStyle = '#0B1F3A';
  ctx.font = '700 38px "Montserrat", "Poppins", sans-serif';
  ctx.fillText(dateOfIssue, rightMetaX, bottomY + 56);

  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.96);
  const pdfBytes = buildPdfFromJpegDataUrl(jpegDataUrl, width, height);
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const safeStudent = (participantName || 'Participant').replace(/[^a-zA-Z0-9]+/g, '_');
  const a = document.createElement('a');
  a.href = url;
  a.download = `ALNIBRAS_Certificate_${safeStudent}_${certificateId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export interface CertificatePreviewModalProps {
  certificate: CertificateRecord | null;
  settings?: CertificateSettings;
  branding?: BrandingConfig;
  logoUrl?: string;
  fallbackVenue?: string;
  onClose: () => void;
}

export function CertificatePreviewModal({
  certificate,
  settings,
  branding,
  logoUrl,
  fallbackVenue,
  onClose,
}: CertificatePreviewModalProps) {
  const [downloading, setDownloading] = useState(false);
  const [uploadedLogoUrl, setUploadedLogoUrl] = useState<string>('');
  const [selectedTitle, setSelectedTitle] = useState<CertificateTitleOption>(
    'Certificate of Achievement'
  );
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!certificate) return;
    setSelectedTitle(resolveCertificateTitle(certificate, settings));
    setUploadedLogoUrl('');
  }, [certificate, settings]);

  if (!certificate) return null;

  const effectiveLogo =
    uploadedLogoUrl || logoUrl || branding?.logoUrl || DEFAULT_OFFICIAL_LOGO_URL;
  const organizationName = (
    certificate.unionName ||
    settings?.unionName ||
    branding?.unionTitle ||
    'AL-NIBRAS CLASS UNION'
  ).trim();
  const effectiveVenue = (certificate.programVenue || fallbackVenue || '').trim() || '—';

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadCertificateAsPdf(certificate, settings, effectiveLogo, {
        certificateTitle: selectedTitle,
        fallbackVenue: effectiveVenue === '—' ? '' : effectiveVenue,
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-[#07111F]/85 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Program Certificate Preview"
    >
      <div className="bg-white border border-[#D4AF37]/40 rounded-2xl max-w-6xl w-full overflow-hidden shadow-2xl my-auto">
        {/* Top Modal Control Toolbar (Excluded when Printing) */}
        <div className="certificate-no-print bg-[#0B1F3A] text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#C59B27]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white p-1 border border-[#C59B27] flex items-center justify-center shrink-0">
              <img
                src={effectiveLogo}
                alt={organizationName}
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h3 className="font-cert-heading text-base sm:text-lg font-bold tracking-wide text-white">
                {selectedTitle}
              </h3>
              <p className="font-cert-body text-xs text-slate-300">
                A4 Landscape · 300 DPI Print-Ready · {certificate.certificateNumber}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Certificate Title Toggle */}
            <div className="inline-flex rounded-lg bg-white/10 p-0.5 border border-[#C59B27]/40">
              {(
                ['Certificate of Achievement', 'Certificate of Participation'] as CertificateTitleOption[]
              ).map((option) => {
                const active = selectedTitle === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSelectedTitle(option)}
                    className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                      active
                        ? 'bg-[#C59B27] text-[#0B1F3A]'
                        : 'text-slate-200 hover:text-white'
                    }`}
                  >
                    {option === 'Certificate of Achievement' ? 'Achievement' : 'Participation'}
                  </button>
                );
              })}
            </div>

            {/* Organization Logo Upload Control */}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoFileUpload}
              className="hidden"
              data-testid="certificate-logo-upload-input"
            />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-[#E6C665]" />
              Upload Logo
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print A4
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              data-testid="modal-download-certificate-pdf"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C59B27] hover:bg-[#D4AF37] text-[#0B1F3A] text-xs font-bold uppercase tracking-wider transition-all shadow-md"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Rendering 300 DPI PDF...' : 'Download 300 DPI PDF'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close certificate preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Print-Ready A4 Landscape Sheet (297 : 210 aspect ratio) */}
        <div className="p-4 sm:p-7 bg-[#EEF2F6] overflow-x-auto">
          <div
            data-testid="certificate-preview-surface"
            className="certificate-print-sheet relative mx-auto w-full min-w-[780px] max-w-[1040px] aspect-[297/210] bg-white border-y-[8px] border-[#0B1F3A] shadow-[0_24px_60px_-15px_rgba(11,31,58,0.3)] p-4 sm:p-6 overflow-hidden select-none"
          >
            {/* Subtle Centered Organization Logo Watermark */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.05]">
              <img
                src={effectiveLogo}
                alt=""
                aria-hidden="true"
                className="w-[46%] max-w-[420px] object-contain"
              />
            </div>

            {/* Outer Double-Line Golden Border */}
            <div className="relative z-10 h-full w-full border-[3px] border-[#C59B27] p-1.5">
              <div className="relative h-full w-full border border-[#0B1F3A]/40 p-1">
                <div className="relative h-full w-full border-2 border-[#D4AF37] px-8 sm:px-14 py-6 sm:py-8 flex flex-col justify-between">
                  {/* Four Ornamental Corner Brackets (CSS Geometric Filigree) */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-2.5 left-2.5 w-10 h-10 border-t-[3px] border-l-[3px] border-[#0B1F3A]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-4 left-4 w-7 h-7 border-t-2 border-l-2 border-[#C59B27]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-2.5 right-2.5 w-10 h-10 border-t-[3px] border-r-[3px] border-[#0B1F3A]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-4 right-4 w-7 h-7 border-t-2 border-r-2 border-[#C59B27]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-2.5 left-2.5 w-10 h-10 border-b-[3px] border-l-[3px] border-[#0B1F3A]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-4 left-4 w-7 h-7 border-b-2 border-l-2 border-[#C59B27]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-2.5 right-2.5 w-10 h-10 border-b-[3px] border-r-[3px] border-[#0B1F3A]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-4 right-4 w-7 h-7 border-b-2 border-r-2 border-[#C59B27]"
                  />

                  {/* TOP: Element #2 (Organization Logo) & Element #1 (Organization Name) */}
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-white border border-[#D4AF37]/70 p-1.5 flex items-center justify-center shadow-xs">
                      <img
                        src={effectiveLogo}
                        alt={organizationName}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <p
                      data-testid="cert-organization-name"
                      className="font-cert-heading text-sm sm:text-base font-bold tracking-[0.26em] text-[#0B1F3A] uppercase mt-2"
                    >
                      {organizationName}
                    </p>
                    <div className="flex items-center justify-center gap-2.5 mt-2 w-64">
                      <div className="h-[1.5px] flex-1 bg-gradient-to-r from-transparent to-[#C59B27]" />
                      <div className="w-2 h-2 rotate-45 bg-[#C59B27]" />
                      <div className="h-[1.5px] flex-1 bg-gradient-to-l from-transparent to-[#C59B27]" />
                    </div>
                  </div>

                  {/* UPPER-MIDDLE: Element #3 (Certificate Title) */}
                  <div className="text-center">
                    <h2
                      data-testid="cert-title"
                      className="font-cert-heading text-3xl sm:text-5xl font-extrabold tracking-[0.06em] text-[#0B1F3A] uppercase leading-tight"
                    >
                      {selectedTitle}
                    </h2>
                    <div className="w-40 h-[3px] bg-[#C59B27] mx-auto mt-2 rounded-full" />
                  </div>

                  {/* CENTER: Element #4 (Participant's Name) */}
                  <div className="text-center px-6">
                    <h1
                      data-testid="cert-participant-name"
                      className="font-cert-display text-3xl sm:text-5xl font-bold text-[#0B1F3A] tracking-tight"
                    >
                      {certificate.studentName}
                    </h1>
                    <div className="flex items-center justify-center gap-3 mt-2.5 max-w-md mx-auto">
                      <div className="h-[1.5px] flex-1 bg-gradient-to-r from-transparent via-[#C59B27] to-[#C59B27]" />
                      <div className="w-2.5 h-2.5 rotate-45 bg-[#D4AF37]" />
                      <div className="h-[1.5px] flex-1 bg-gradient-to-l from-transparent via-[#C59B27] to-[#C59B27]" />
                    </div>
                  </div>

                  {/* LOWER-MIDDLE: Elements #5 (Program Name), #6 (Program Date), #7 (Program Venue) */}
                  <div className="max-w-3xl w-full mx-auto bg-[#F8FAFC] border border-[#D4AF37]/80 border-t-[3px] border-t-[#0B1F3A] rounded-lg px-6 py-3.5 text-center shadow-xs">
                    <div className="font-cert-body text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9A7515]">
                      Program Name
                    </div>
                    <div
                      data-testid="cert-program-name"
                      className="font-cert-display text-lg sm:text-2xl font-bold text-[#0B1F3A] mt-0.5"
                    >
                      {certificate.programName}
                    </div>

                    <div className="grid grid-cols-2 divide-x divide-[#D4AF37]/50 mt-3 pt-2.5 border-t border-[#D4AF37]/40">
                      <div className="px-4 flex flex-col items-center justify-center">
                        <span className="font-cert-body inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9A7515]">
                          <Calendar className="w-3 h-3 text-[#C59B27]" />
                          Program Date
                        </span>
                        <span
                          data-testid="cert-program-date"
                          className="font-cert-body text-xs sm:text-sm font-semibold text-[#0B1F3A] mt-0.5"
                        >
                          {certificate.programDate}
                        </span>
                      </div>
                      <div className="px-4 flex flex-col items-center justify-center">
                        <span className="font-cert-body inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9A7515]">
                          <MapPin className="w-3 h-3 text-[#C59B27]" />
                          Program Venue
                        </span>
                        <span
                          data-testid="cert-program-venue"
                          className="font-cert-body text-xs sm:text-sm font-semibold text-[#0B1F3A] mt-0.5"
                        >
                          {effectiveVenue}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* BOTTOM: Element #8 (Certificate ID), Center Golden Award Emblem, Element #9 (Date of Issue) */}
                  <div className="grid grid-cols-3 items-end gap-4 pt-1">
                    <div className="text-left">
                      <div className="font-cert-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9A7515]">
                        Certificate ID
                      </div>
                      <div
                        data-testid="cert-serial-number"
                        className="font-cert-body text-xs sm:text-sm font-bold text-[#0B1F3A] mt-0.5 inline-flex items-center gap-1.5"
                      >
                        <FileBadge className="w-3.5 h-3.5 text-[#C59B27] shrink-0" />
                        <span>{certificate.certificateNumber}</span>
                      </div>
                    </div>

                    {/* Sophisticated Golden Award Emblem */}
                    <div className="flex flex-col items-center justify-center">
                      <div className="relative flex flex-col items-center">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-[#F5DF8D] via-[#D4AF37] to-[#9A7515] p-1 shadow-md flex items-center justify-center">
                          <div className="w-full h-full rounded-full bg-[#0B1F3A] border-2 border-[#E6C665] flex items-center justify-center">
                            <Award className="w-7 h-7 text-[#E6C665]" />
                          </div>
                        </div>
                        <div className="flex gap-1 -mt-1.5">
                          <div className="w-2.5 h-4 bg-[#0B1F3A] border-x border-[#C59B27] -rotate-12" />
                          <div className="w-2.5 h-4 bg-[#0B1F3A] border-x border-[#C59B27] rotate-12" />
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-cert-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9A7515]">
                        Date of Issue
                      </div>
                      <div
                        data-testid="cert-date-of-issue"
                        className="font-cert-body text-xs sm:text-sm font-bold text-[#0B1F3A] mt-0.5"
                      >
                        {certificate.publicationDate}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CertificatePreviewModal;
