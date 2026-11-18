'use client';

import React, { useState } from 'react';
import { Award, CheckCircle2, Download, Medal, Printer, ShieldCheck, Trophy, X } from 'lucide-react';
import type { BrandingConfig, CertificateRecord, CertificateSettings } from '@/lib/types';

export const DEFAULT_OFFICIAL_LOGO_URL = '/assets/aistudio/al-nibras_logo_3b0dfbfe.png';

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
      textHex: '#785A0A',
    };
  }
  if (position === '2nd Place') {
    return {
      badgeTitle: '2ND POSITION',
      ribbonLabel: 'SECOND PLACE LAUREATE · SILVER HONORS',
      tierLabel: 'DISTINGUISHED RUNNER-UP',
      primaryColor: '#64748B',
      secondaryColor: '#334155',
      bgTint: '#F1F5F9',
      borderHex: '#94A3B8',
      textHex: '#1E293B',
    };
  }
  if (position === '3rd Place') {
    return {
      badgeTitle: '3RD POSITION',
      ribbonLabel: 'THIRD PLACE LAUREATE · BRONZE HONORS',
      tierLabel: 'HONORABLE PODIUM LAUREATE',
      primaryColor: '#B45309',
      secondaryColor: '#92400E',
      bgTint: '#FFFBEB',
      borderHex: '#D97706',
      textHex: '#78350F',
    };
  }
  return {
    badgeTitle: grade !== 'None' ? `GRADE ${grade} MERIT` : 'OFFICIAL MERIT',
    ribbonLabel: 'SCHOLASTIC EXCELLENCE & MERIT CONFERMENT',
    tierLabel: 'DISTINGUISHED SCHOLAR',
    primaryColor: '#0C1A2E',
    secondaryColor: '#C59B27',
    bgTint: '#F8FAFC',
    borderHex: '#C59B27',
    textHex: '#0C1A2E',
  };
}

/**
 * Encapsulates a JPEG Data URL into a valid single-page A4 Landscape PDF 1.4 binary Uint8Array
 * Page size: 841.89pt x 595.28pt (297mm x 210mm A4 Landscape)
 */
function buildPdfFromJpegDataUrl(jpegDataUrl: string, pixelWidth: number, pixelHeight: number): Uint8Array {
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

/**
 * Renders the redesigned AL-NIBRAS Certificate of Achievement onto an A4 Landscape HTML5 Canvas
 * with Navy Blue decorative corner waves, Golden curved ribbons, Official AL-NIBRAS Logo,
 * dynamic Position badge (1ST POSITION / 2ND POSITION / 3RD POSITION), and ZERO QR code.
 */
export async function downloadCertificateAsPdf(
  cert: CertificateRecord,
  settings?: CertificateSettings,
  customLogoOrBranding?: BrandingConfig | string
): Promise<void> {
  const width = 1754; // A4 Landscape at 150 DPI
  const height = 1240;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const unionName = settings?.unionName || cert.unionName || 'AL-NIBRAS CLASS UNION';
  const title = settings?.title || 'CERTIFICATE OF ACHIEVEMENT';
  const subtitle = settings?.subtitle || 'OFFICIAL HONORS & SCHOLASTIC MERIT CONFERMENT';
  const authName = settings?.authorizedByName || cert.authorizedByName || 'SUPER ADMIN';
  const authRole =
    settings?.authorizedByDesignation ||
    cert.authorizedByDesignation ||
    'Director General · AL-NIBRAS Class Union';
  const customLogoUrl =
    typeof customLogoOrBranding === 'string'
      ? customLogoOrBranding
      : customLogoOrBranding?.logoUrl;
  const logoSrc = customLogoUrl || DEFAULT_OFFICIAL_LOGO_URL;

  const posTheme = getPositionCertificateTheme(cert.position, cert.grade);

  // 1. White / Ivory Parchment Background
  ctx.fillStyle = '#FDFBF7';
  ctx.fillRect(0, 0, width, height);

  // 2. Navy Blue Decorative Corner Waves (Top-Left & Bottom-Right)
  ctx.save();
  ctx.fillStyle = '#0C1A2E';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(480, 0);
  ctx.bezierCurveTo(340, 90, 170, 220, 0, 420);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(width, height);
  ctx.lineTo(width - 480, height);
  ctx.bezierCurveTo(width - 340, height - 90, width - 170, height - 220, width, height - 420);
  ctx.closePath();
  ctx.fill();

  // Golden Curved Decorative Ribbons along the Navy Waves
  ctx.strokeStyle = '#C59B27';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(510, 0);
  ctx.bezierCurveTo(360, 110, 185, 245, 0, 455);
  ctx.stroke();

  ctx.strokeStyle = '#E6C665';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(535, 0);
  ctx.bezierCurveTo(380, 125, 200, 265, 0, 480);
  ctx.stroke();

  ctx.strokeStyle = '#C59B27';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(width - 510, height);
  ctx.bezierCurveTo(width - 360, height - 110, width - 185, height - 245, width, height - 455);
  ctx.stroke();

  ctx.strokeStyle = '#E6C665';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(width - 535, height);
  ctx.bezierCurveTo(width - 380, height - 125, width - 200, height - 265, width, height - 480);
  ctx.stroke();
  ctx.restore();

  // 3. Outer & Inner Gold Filigree Frame
  ctx.strokeStyle = '#0C1A2E';
  ctx.lineWidth = 8;
  ctx.strokeRect(54, 54, width - 108, height - 108);

  ctx.strokeStyle = '#C59B27';
  ctx.lineWidth = 3;
  ctx.strokeRect(70, 70, width - 140, height - 140);

  // 4. Official AL-NIBRAS Logo at Top Center
  const logoImg = await loadImageElement(logoSrc);
  if (logoImg) {
    const logoSize = 135;
    ctx.drawImage(logoImg, width / 2 - logoSize / 2, 86, logoSize, logoSize);
  } else {
    ctx.fillStyle = '#0C1A2E';
    ctx.beginPath();
    ctx.arc(width / 2, 150, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#C59B27';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#E6C665';
    ctx.font = 'bold 34px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('AN', width / 2, 162);
  }

  // 5. Top-Right Position Seal Badge (Dynamic 1ST / 2ND / 3RD POSITION)
  const sealX = width - 230;
  const sealY = 210;
  ctx.save();
  // Ribbon tails
  ctx.fillStyle = posTheme.secondaryColor;
  ctx.beginPath();
  ctx.moveTo(sealX - 38, sealY + 55);
  ctx.lineTo(sealX - 58, sealY + 145);
  ctx.lineTo(sealX - 22, sealY + 125);
  ctx.lineTo(sealX - 4, sealY + 150);
  ctx.lineTo(sealX - 6, sealY + 60);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(sealX + 38, sealY + 55);
  ctx.lineTo(sealX + 58, sealY + 145);
  ctx.lineTo(sealX + 22, sealY + 125);
  ctx.lineTo(sealX + 4, sealY + 150);
  ctx.lineTo(sealX + 6, sealY + 60);
  ctx.closePath();
  ctx.fill();

  // Outer medal circle
  ctx.fillStyle = posTheme.primaryColor;
  ctx.beginPath();
  ctx.arc(sealX, sealY, 76, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0C1A2E';
  ctx.beginPath();
  ctx.arc(sealX, sealY, 64, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#E6C665';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#E6C665';
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(posTheme.badgeTitle, sealX, sealY - 4);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(cert.grade !== 'None' ? `GRADE ${cert.grade}` : 'HONORS', sealX, sealY + 18);
  ctx.restore();

  // 6. Union Name & Subtitle
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0C1A2E';
  ctx.font = 'bold 24px Georgia, serif';
  ctx.fillText(unionName.toUpperCase(), width / 2, 250);

  ctx.fillStyle = '#9A7515';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(subtitle.toUpperCase(), width / 2, 278);

  // 7. Certificate Main Heading
  ctx.fillStyle = '#0C1A2E';
  ctx.font = 'bold 54px Georgia, serif';
  ctx.fillText(title.toUpperCase(), width / 2, 345);

  // Position Dynamic Golden Ribbon Banner
  const ribbonW = 540;
  const ribbonH = 44;
  const ribbonX = width / 2 - ribbonW / 2;
  const ribbonY = 368;
  ctx.fillStyle = posTheme.primaryColor;
  ctx.fillRect(ribbonX, ribbonY, ribbonW, ribbonH);
  ctx.strokeStyle = '#0C1A2E';
  ctx.lineWidth = 2;
  ctx.strokeRect(ribbonX, ribbonY, ribbonW, ribbonH);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`${posTheme.badgeTitle}  ·  ${posTheme.ribbonLabel}`, width / 2, ribbonY + 29);

  // 8. Presentation Line
  ctx.fillStyle = '#475569';
  ctx.font = 'italic 24px Georgia, serif';
  ctx.fillText('This official certificate of honor is proudly presented to', width / 2, 460);

  // 9. Student Full Name (Elegant Display Typography)
  ctx.fillStyle = '#0C1A2E';
  ctx.font = 'bold italic 58px Georgia, serif';
  ctx.fillText(cert.studentName, width / 2, 535);

  // Gold underline beneath student name
  ctx.strokeStyle = '#C59B27';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 260, 554);
  ctx.lineTo(width / 2 + 260, 554);
  ctx.stroke();

  // Student ID & Batch/Class line
  ctx.fillStyle = '#9A7515';
  ctx.font = 'bold 19px monospace';
  ctx.fillText(
    `STUDENT ID: ${cert.studentId}   ·   CLASS / BATCH: 11TH BATCH OF DHBC`,
    width / 2,
    590
  );

  // 10. Clean Achievement Description
  const posText =
    cert.position !== 'None' ? `achieving ${posTheme.badgeTitle} (${cert.position})` : 'distinguished academic participation';
  const gradeText =
    cert.grade !== 'None' ? `with Grade ${cert.grade} Honors` : 'with official merit recognition';

  ctx.fillStyle = '#334155';
  ctx.font = '25px Georgia, serif';
  ctx.fillText(
    `in recognition of ${posText} ${gradeText} and earning ${cert.totalPoints} Official Result Points`,
    width / 2,
    648
  );
  ctx.fillText('at the official AL-NIBRAS Class Union program:', width / 2, 686);

  // 11. Program Name
  ctx.fillStyle = '#0C1A2E';
  ctx.font = 'bold 36px Georgia, serif';
  ctx.fillText(`"${cert.programName}"`, width / 2, 745);

  // 12. Four Dynamic Achievement Pillars (Position / Grade / Points / Program Date)
  const boxY = 795;
  const drawStatBox = (x: number, label: string, val: string, highlight = false) => {
    ctx.fillStyle = highlight ? posTheme.bgTint : '#F7F4EC';
    ctx.strokeStyle = highlight ? posTheme.primaryColor : '#C59B27';
    ctx.lineWidth = highlight ? 3 : 2;
    ctx.fillRect(x - 165, boxY, 330, 82);
    ctx.strokeRect(x - 165, boxY, 330, 82);
    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(label.toUpperCase(), x, boxY + 27);
    ctx.fillStyle = '#0C1A2E';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText(val, x, boxY + 60);
  };

  drawStatBox(width / 2 - 365, 'Position Conferred', posTheme.badgeTitle, true);
  drawStatBox(width / 2, 'Official Grade', cert.grade === 'None' ? 'Merit' : `Grade ${cert.grade}`);
  drawStatBox(
    width / 2 + 365,
    'Result Points Awarded',
    `${cert.totalPoints} Points (${cert.positionPoints}+${cert.gradePoints})`
  );

  // 13. Bottom Section: Certificate Metadata (Left), Official Seal (Center), Authorized Signature (Right) — NO QR CODE
  const footerY = 1015;

  // Left: Program Date & Certificate Reference
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0C1A2E';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`CERTIFICATE REF: ${cert.certificateNumber}`, 145, footerY);
  ctx.fillStyle = '#475569';
  ctx.font = '17px sans-serif';
  ctx.fillText(`Program Date: ${cert.programDate}`, 145, footerY + 30);
  ctx.fillText(`Date of Issue: ${cert.publicationDate}`, 145, footerY + 58);
  ctx.fillStyle = '#9A7515';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('OFFICIAL AL-NIBRAS DIRECTORATE CONFERMENT', 145, footerY + 88);

  // Center: Golden Institutional Crest Medallion (Replaces any QR code)
  ctx.save();
  ctx.fillStyle = '#FDFBF7';
  ctx.strokeStyle = '#C59B27';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(width / 2, footerY + 35, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#0C1A2E';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(width / 2, footerY + 35, 44, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#0C1A2E';
  ctx.font = 'bold 13px Georgia, serif';
  ctx.fillText('AL-NIBRAS', width / 2, footerY + 28);
  ctx.fillStyle = '#9A7515';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('OFFICIAL SEAL', width / 2, footerY + 46);
  ctx.restore();

  // Right: Authorized Signature
  const sigX = width - 315;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0C1A2E';
  ctx.font = 'italic 32px Georgia, serif';
  ctx.fillText(authName, sigX, footerY + 22);

  ctx.strokeStyle = '#0C1A2E';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sigX - 165, footerY + 36);
  ctx.lineTo(sigX + 165, footerY + 36);
  ctx.stroke();

  ctx.fillStyle = '#0C1A2E';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(authName.toUpperCase(), sigX, footerY + 64);
  ctx.fillStyle = '#64748B';
  ctx.font = '15px sans-serif';
  ctx.fillText(authRole, sigX, footerY + 88);

  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const pdfBytes = buildPdfFromJpegDataUrl(jpegDataUrl, width, height);
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const safeStudent = cert.studentName.replace(/[^a-zA-Z0-9]+/g, '_');
  const a = document.createElement('a');
  a.href = url;
  a.download = `ALNIBRAS_Certificate_${safeStudent}_${cert.certificateNumber}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export interface CertificatePreviewModalProps {
  certificate: CertificateRecord | null;
  settings?: CertificateSettings;
  branding?: BrandingConfig;
  logoUrl?: string;
  onClose: () => void;
}

export function CertificatePreviewModal({
  certificate,
  settings,
  branding,
  logoUrl,
  onClose,
}: CertificatePreviewModalProps) {
  const [downloading, setDownloading] = useState(false);

  if (!certificate) return null;

  const effectiveLogo = logoUrl || branding?.logoUrl || DEFAULT_OFFICIAL_LOGO_URL;
  const posTheme = getPositionCertificateTheme(certificate.position, certificate.grade);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadCertificateAsPdf(certificate, settings, effectiveLogo);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-[#07111F]/80 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-[#E2DDD2] rounded-2xl max-w-5xl w-full overflow-hidden shadow-2xl my-auto">
        {/* Top Action Bar */}
        <div className="bg-[#0C1A2E] text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#C59B27]/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white p-1 border border-[#C59B27] flex items-center justify-center">
              <img
                src={effectiveLogo}
                alt="AL-NIBRAS Official Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold tracking-wide text-white">
                Official Certificate of Achievement ({posTheme.badgeTitle})
              </h3>
              <p className="text-xs text-slate-300 font-mono">
                Certificate Ref: {certificate.certificateNumber} · Recipient: {certificate.studentName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              data-testid="modal-download-certificate-pdf"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C59B27] hover:bg-[#b0891f] text-[#07111F] text-xs font-bold uppercase tracking-wider transition-all shadow-md"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Generating A4 PDF...' : 'Download Certificate (PDF)'}
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

        {/* Redesigned Luxury Certificate Canvas (Navy Blue Corner Waves + Golden Curved Ribbons + Official Logo + No QR Code) */}
        <div className="p-4 sm:p-8 bg-[#F0ECE1] overflow-x-auto">
          <div
            data-testid="certificate-preview-surface"
            className="min-w-[820px] bg-[#FDFBF7] border-[8px] border-[#0C1A2E] p-3 shadow-2xl mx-auto relative overflow-hidden"
          >
            {/* Decorative Top-Left Navy Wave & Golden Curved Ribbon SVG */}
            <svg
              className="absolute top-0 left-0 w-48 h-44 pointer-events-none z-0"
              viewBox="0 0 320 280"
              fill="none"
            >
              <path d="M0 0H290C205 60 105 145 0 265V0Z" fill="#0C1A2E" />
              <path
                d="M308 0C220 70 115 160 0 280"
                stroke="#C59B27"
                strokeWidth="10"
              />
              <path
                d="M320 0C232 80 125 172 0 292"
                stroke="#E6C665"
                strokeWidth="3.5"
              />
            </svg>

            {/* Decorative Bottom-Right Navy Wave & Golden Curved Ribbon SVG */}
            <svg
              className="absolute bottom-0 right-0 w-48 h-44 pointer-events-none z-0"
              viewBox="0 0 320 280"
              fill="none"
            >
              <path d="M320 280H30C115 220 215 135 320 15V280Z" fill="#0C1A2E" />
              <path
                d="M12 280C100 210 205 120 320 0"
                stroke="#C59B27"
                strokeWidth="10"
              />
              <path
                d="M0 280C88 200 195 108 320 -12"
                stroke="#E6C665"
                strokeWidth="3.5"
              />
            </svg>

            <div className="border-2 border-[#C59B27] p-1.5 relative z-10">
              <div className="border border-[#C59B27]/70 px-10 py-8 text-center relative">
                {/* Dynamic Top-Right Position Medal Ribbon */}
                <div
                  data-testid="certificate-position-badge"
                  className="absolute top-6 right-8 flex flex-col items-center"
                >
                  <div
                    className="w-24 h-24 rounded-full border-4 border-[#E6C665] shadow-xl flex flex-col items-center justify-center text-center px-2"
                    style={{ backgroundColor: '#0C1A2E' }}
                  >
                    {certificate.position === '1st Place' ? (
                      <Trophy className="w-6 h-6 text-[#E6C665] mb-0.5" />
                    ) : (
                      <Medal className="w-6 h-6 text-[#E6C665] mb-0.5" />
                    )}
                    <span className="text-[11px] font-extrabold tracking-wider text-[#E6C665] leading-tight">
                      {posTheme.badgeTitle}
                    </span>
                    <span className="text-[9px] font-bold text-white uppercase tracking-widest mt-0.5">
                      {certificate.grade !== 'None' ? `GRADE ${certificate.grade}` : 'HONORS'}
                    </span>
                  </div>
                  <div className="flex gap-1 -mt-2">
                    <div className="w-3 h-7 bg-[#C59B27] rounded-b-sm transform -rotate-12" />
                    <div className="w-3 h-7 bg-[#9A7515] rounded-b-sm transform rotate-12" />
                  </div>
                </div>

                {/* Official AL-NIBRAS Union Logo */}
                <div className="mx-auto w-24 h-24 rounded-2xl bg-white border-2 border-[#C59B27] p-2 flex items-center justify-center shadow-md mb-3">
                  <img
                    src={effectiveLogo}
                    alt="Official AL-NIBRAS Logo"
                    className="w-full h-full object-contain"
                  />
                </div>

                <p className="font-serif text-sm font-bold tracking-[0.25em] text-[#0C1A2E] uppercase">
                  {settings?.unionName || certificate.unionName || 'AL-NIBRAS CLASS UNION'}
                </p>
                <p className="text-[11px] font-bold tracking-[0.2em] text-[#9A7515] uppercase mt-1">
                  {settings?.subtitle || 'OFFICIAL HONORS & SCHOLASTIC MERIT CONFERMENT'}
                </p>

                <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#0C1A2E] tracking-wide mt-3">
                  {settings?.title || 'CERTIFICATE OF ACHIEVEMENT'}
                </h2>

                {/* Dynamic Position Ribbon Banner */}
                <div className="mt-3 inline-flex items-center gap-2 px-6 py-1.5 rounded-md bg-[#0C1A2E] border-2 border-[#C59B27] text-[#E6C665] text-xs font-extrabold uppercase tracking-[0.18em] shadow-sm">
                  <Award className="w-4 h-4 text-[#C59B27]" />
                  <span>
                    {posTheme.badgeTitle} · {posTheme.ribbonLabel}
                  </span>
                </div>

                <p className="font-serif italic text-sm text-[#475569] mt-5">
                  This official certificate of honor is proudly presented to
                </p>

                <h1 className="font-serif italic text-3xl sm:text-5xl font-bold text-[#0C1A2E] mt-2">
                  {certificate.studentName}
                </h1>
                <div className="w-64 h-0.5 bg-[#C59B27] mx-auto my-2.5" />
                <p className="font-mono text-xs font-bold text-[#9A7515]">
                  STUDENT ID: {certificate.studentId} · CLASS / BATCH: 11TH BATCH OF DHBC
                </p>

                <p className="font-serif text-sm sm:text-base text-[#334155] max-w-2xl mx-auto mt-4 leading-relaxed">
                  in recognition of{' '}
                  <span className="font-bold text-[#0C1A2E]">
                    {certificate.position !== 'None'
                      ? `achieving ${posTheme.badgeTitle} (${certificate.position})`
                      : 'distinguished participation'}
                  </span>{' '}
                  with{' '}
                  <span className="font-bold text-[#0C1A2E]">
                    {certificate.grade !== 'None'
                      ? `Grade ${certificate.grade} Honors`
                      : 'Official Merit Recognition'}
                  </span>{' '}
                  and earning{' '}
                  <span className="font-bold text-[#9A7515]">
                    {certificate.totalPoints} Official Result Points
                  </span>{' '}
                  in the institutional union program:
                </p>

                <h3 className="font-serif text-2xl font-bold text-[#0C1A2E] mt-2.5">
                  &ldquo;{certificate.programName}&rdquo;
                </h3>

                {/* 3 Dynamic Achievement Pillars */}
                <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto mt-5">
                  <div className="bg-[#FEF9E7] border-2 border-[#C59B27] rounded-lg py-2.5 px-3 shadow-xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#785A0A]">
                      Position Conferred
                    </div>
                    <div className="font-serif text-base font-extrabold text-[#0C1A2E] mt-0.5">
                      {posTheme.badgeTitle}
                    </div>
                  </div>
                  <div className="bg-[#F7F4EC] border border-[#C59B27] rounded-lg py-2.5 px-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                      Official Grade
                    </div>
                    <div className="font-serif text-base font-bold text-[#0C1A2E] mt-0.5">
                      {certificate.grade === 'None' ? 'Merit' : `Grade ${certificate.grade}`}
                    </div>
                  </div>
                  <div className="bg-[#F7F4EC] border border-[#C59B27] rounded-lg py-2.5 px-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                      Result Points
                    </div>
                    <div className="font-serif text-base font-bold text-[#9A7515] mt-0.5">
                      {certificate.totalPoints} Points ({certificate.positionPoints}+
                      {certificate.gradePoints})
                    </div>
                  </div>
                </div>

                {/* Footer Row — NO QR CODE */}
                <div className="grid grid-cols-3 items-end gap-4 mt-8 pt-5 border-t border-[#E2DDD2] text-left">
                  <div className="space-y-1 text-xs text-[#475569]">
                    <div className="font-mono font-bold text-[#0C1A2E]">
                      REF: {certificate.certificateNumber}
                    </div>
                    <div>Program Date: {certificate.programDate}</div>
                    <div>Date of Issue: {certificate.publicationDate}</div>
                    <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Official AL-NIBRAS Record
                    </div>
                  </div>

                  {/* Center Institutional Seal (Replaces QR Code) */}
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-[#FDFBF7] border-2 border-[#C59B27] flex flex-col items-center justify-center shadow-sm">
                      <ShieldCheck className="w-6 h-6 text-[#0C1A2E]" />
                      <span className="text-[8px] font-extrabold uppercase tracking-widest text-[#9A7515] mt-0.5">
                        OFFICIAL SEAL
                      </span>
                    </div>
                    <span className="text-[10px] font-serif italic text-[#64748B] mt-1">
                      11th Batch of DHBC
                    </span>
                  </div>

                  {/* Right: Authorized Signature */}
                  <div className="text-center pr-12">
                    <div className="font-serif italic text-2xl text-[#0C1A2E] mb-1">
                      {settings?.authorizedByName || certificate.authorizedByName || 'SUPER ADMIN'}
                    </div>
                    <div className="border-t-2 border-[#0C1A2E] pt-1.5">
                      <div className="text-xs font-bold text-[#0C1A2E] uppercase tracking-wider">
                        {settings?.authorizedByName || certificate.authorizedByName || 'SUPER ADMIN'}
                      </div>
                      <div className="text-[11px] text-[#64748B]">
                        {settings?.authorizedByDesignation ||
                          certificate.authorizedByDesignation ||
                          'Director General · AL-NIBRAS Class Union'}
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

