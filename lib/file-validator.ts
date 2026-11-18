import crypto from 'node:crypto';
import type { SupabaseBucketName } from './supabase';

export type ValidatedMediaCategory = 'image' | 'pdf' | 'ooxml' | 'video';

export interface FileStructuralValidationResult {
  valid: boolean;
  detectedMimeType?: string;
  category?: ValidatedMediaCategory;
  sha256: string;
  byteSize: number;
  width?: number;
  height?: number;
  reason?: string;
}

export const MAX_IMAGE_DIMENSION = 8192;
export const MAX_IMAGE_PIXELS = 33_554_432; // 33.5 MP ceiling against decompression bombs
export const MAX_DIRECT_UPLOAD_BYTES = Math.floor(3.5 * 1024 * 1024); // 3.5 MB
export const MAX_TICKET_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

const BUCKET_ALLOWED_CATEGORIES: Record<SupabaseBucketName, ReadonlySet<ValidatedMediaCategory>> = {
  'public-gallery': new Set(['image']),
  'user-gallery': new Set(['image']),
  'official-branding': new Set(['image']),
  slideshow: new Set(['image']),
  videos: new Set(['video', 'image']), // allows video files and video thumbnail images
  certificates: new Set(['pdf', 'image']),
  'study-materials': new Set(['pdf', 'ooxml', 'image']),
  documents: new Set(['pdf', 'ooxml', 'image']),
};

export function isCategoryAllowedForBucket(
  bucket: SupabaseBucketName,
  category: ValidatedMediaCategory
): boolean {
  const allowed = BUCKET_ALLOWED_CATEGORIES[bucket];
  return Boolean(allowed && allowed.has(category));
}

/**
 * 1. PNG Structural Parser:
 * Verifies 8-byte PNG signature, IHDR chunk dimensions, bit depth, color type, and presence of IEND.
 */
function parsePngStructure(buf: Buffer): {
  valid: boolean;
  width?: number;
  height?: number;
  reason?: string;
} {
  if (buf.byteLength < 33) {
    return { valid: false, reason: 'PNG_TOO_SHORT' };
  }
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(pngSig)) {
    return { valid: false, reason: 'PNG_SIGNATURE_MISMATCH' };
  }
  const ihdrLen = buf.readUInt32BE(8);
  const ihdrType = buf.subarray(12, 16).toString('ascii');
  if (ihdrLen !== 13 || ihdrType !== 'IHDR') {
    return { valid: false, reason: 'PNG_INVALID_IHDR' };
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    return { valid: false, width, height, reason: 'PNG_DIMENSION_LIMIT_EXCEEDED' };
  }

  // Walk chunks to verify structure and confirm IEND exists
  let offset = 8;
  let sawIend = false;
  let chunkCount = 0;
  while (offset + 12 <= buf.byteLength) {
    chunkCount += 1;
    if (chunkCount > 4096) {
      return { valid: false, reason: 'PNG_EXCESSIVE_CHUNKS' };
    }
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const nextOffset = offset + 12 + length;
    if (nextOffset > buf.byteLength) {
      return { valid: false, reason: 'PNG_TRUNCATED_CHUNK' };
    }
    if (type === 'IEND') {
      sawIend = true;
      break;
    }
    offset = nextOffset;
  }

  if (!sawIend) {
    return { valid: false, reason: 'PNG_MISSING_IEND' };
  }
  return { valid: true, width, height };
}

/**
 * 2. JPEG Structural Parser:
 * Verifies SOI (FF D8), walks markers to extract SOF0/SOF1/SOF2 dimensions, and verifies EOI (FF D9).
 */
function parseJpegStructure(buf: Buffer): {
  valid: boolean;
  width?: number;
  height?: number;
  reason?: string;
} {
  if (buf.byteLength < 20 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
    return { valid: false, reason: 'JPEG_INVALID_SOI' };
  }
  let offset = 2;
  let width = 0;
  let height = 0;

  while (offset + 4 <= buf.byteLength) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < buf.byteLength && buf[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= buf.byteLength) break;
    const marker = buf[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) {
      // EOI or SOS (Start of Scan)
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > buf.byteLength) {
      return { valid: false, reason: 'JPEG_TRUNCATED_MARKER' };
    }
    const segLen = buf.readUInt16BE(offset);
    if (segLen < 2 || offset + segLen > buf.byteLength) {
      return { valid: false, reason: 'JPEG_INVALID_SEGMENT_LENGTH' };
    }

    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (segLen < 7) {
        return { valid: false, reason: 'JPEG_TRUNCATED_SOF' };
      }
      height = buf.readUInt16BE(offset + 3);
      width = buf.readUInt16BE(offset + 5);
    }

    offset += segLen;
  }

  if (
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    return { valid: false, width, height, reason: 'JPEG_DIMENSION_LIMIT_EXCEEDED' };
  }
  return { valid: true, width, height };
}

/**
 * 3. WebP RIFF Structural Parser:
 * Verifies RIFF....WEBP header and parses VP8 / VP8L / VP8X dimensions.
 */
function parseWebpStructure(buf: Buffer): {
  valid: boolean;
  width?: number;
  height?: number;
  reason?: string;
} {
  if (
    buf.byteLength < 30 ||
    buf.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    buf.subarray(8, 12).toString('ascii') !== 'WEBP'
  ) {
    return { valid: false, reason: 'WEBP_INVALID_RIFF_HEADER' };
  }

  const chunkType = buf.subarray(12, 16).toString('ascii');
  let width = 0;
  let height = 0;

  if (chunkType === 'VP8 ') {
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) {
      return { valid: false, reason: 'WEBP_INVALID_VP8_SYNC' };
    }
    width = buf.readUInt16LE(26) & 0x3fff;
    height = buf.readUInt16LE(28) & 0x3fff;
  } else if (chunkType === 'VP8L') {
    if (buf[20] !== 0x2f) {
      return { valid: false, reason: 'WEBP_INVALID_VP8L_SIGNATURE' };
    }
    const bits = buf.readUInt32LE(21);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (chunkType === 'VP8X') {
    width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
    height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
  } else {
    return { valid: false, reason: 'WEBP_UNSUPPORTED_CHUNK' };
  }

  if (
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    return { valid: false, width, height, reason: 'WEBP_DIMENSION_LIMIT_EXCEEDED' };
  }

  return { valid: true, width, height };
}

/**
 * 4. PDF Structural & Active-Content Sanitizer:
 * Verifies %PDF-1.x header, %%EOF trailer, and blocks embedded JavaScript/actions
 * (/JavaScript, /JS, /OpenAction, /AA, /Launch, /EmbeddedFiles, /RichMedia, /XFA).
 */
const FORBIDDEN_PDF_TOKENS = [
  '/JavaScript',
  '/JS',
  '/OpenAction',
  '/AA',
  '/Launch',
  '/EmbeddedFiles',
  '/RichMedia',
  '/XFA',
] as const;

function parsePdfStructure(buf: Buffer): { valid: boolean; reason?: string } {
  if (buf.byteLength < 32 || buf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return { valid: false, reason: 'PDF_INVALID_HEADER' };
  }
  const tail = buf.subarray(Math.max(0, buf.byteLength - 1024)).toString('latin1');
  if (!tail.includes('%%EOF')) {
    return { valid: false, reason: 'PDF_MISSING_EOF_TRAILER' };
  }
  const fullLatin1 = buf.toString('latin1');
  for (const token of FORBIDDEN_PDF_TOKENS) {
    const tokenRegex = new RegExp(`${token.replace('/', '\\/')}(?![a-zA-Z])`, 'i');
    if (tokenRegex.test(fullLatin1)) {
      return { valid: false, reason: `PDF_ACTIVE_CONTENT_BLOCKED:${token}` };
    }
  }
  return { valid: true };
}

/**
 * 5. ZIP / OOXML (.docx / .pptx / .xlsx) Central Directory & Security Parser:
 * Walks Central Directory headers to enforce entry count <= 500, total uncompressed size <= 50 MB,
 * compression ratio <= 40:1 (blocking Zip bombs), requires [Content_Types].xml, blocks vbaProject.bin
 * macros, and blocks <!ENTITY XXE declarations.
 */
function parseOoxmlZipStructure(buf: Buffer): {
  valid: boolean;
  detectedMimeType?: string;
  reason?: string;
} {
  if (
    buf.byteLength < 30 ||
    buf[0] !== 0x50 ||
    buf[1] !== 0x4b ||
    buf[2] !== 0x03 ||
    buf[3] !== 0x04
  ) {
    return { valid: false, reason: 'OOXML_INVALID_PK_HEADER' };
  }

  // Locate End of Central Directory (EOCD: 0x06054b50)
  let eocdOffset = -1;
  const minEocdSearch = Math.max(0, buf.byteLength - 65557);
  for (let i = buf.byteLength - 22; i >= minEocdSearch; i--) {
    if (
      buf[i] === 0x50 &&
      buf[i + 1] === 0x4b &&
      buf[i + 2] === 0x05 &&
      buf[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    return { valid: false, reason: 'OOXML_MISSING_EOCD' };
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  if (totalEntries < 1 || totalEntries > 500) {
    return { valid: false, reason: 'OOXML_ENTRY_COUNT_LIMIT_EXCEEDED' };
  }
  if (cdOffset + cdSize > buf.byteLength) {
    return { valid: false, reason: 'OOXML_CORRUPT_CENTRAL_DIRECTORY' };
  }

  let ptr = cdOffset;
  let totalUncompressed = 0;
  let totalCompressed = 0;
  let hasContentTypesXml = false;
  let hasWordDir = false;
  let hasXlDir = false;
  let hasPptDir = false;

  for (let idx = 0; idx < totalEntries; idx++) {
    if (
      ptr + 46 > buf.byteLength ||
      buf[ptr] !== 0x50 ||
      buf[ptr + 1] !== 0x4b ||
      buf[ptr + 2] !== 0x01 ||
      buf[ptr + 3] !== 0x02
    ) {
      return { valid: false, reason: 'OOXML_INVALID_CD_ENTRY' };
    }

    const compSize = buf.readUInt32LE(ptr + 20);
    const uncompSize = buf.readUInt32LE(ptr + 24);
    const fileNameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);

    if (ptr + 46 + fileNameLen + extraLen + commentLen > buf.byteLength) {
      return { valid: false, reason: 'OOXML_TRUNCATED_CD_ENTRY' };
    }

    const entryName = buf.subarray(ptr + 46, ptr + 46 + fileNameLen).toString('utf8');
    const lowerName = entryName.toLowerCase();

    if (entryName.includes('..') || entryName.startsWith('/')) {
      return { valid: false, reason: 'OOXML_PATH_TRAVERSAL_ENTRY' };
    }
    if (
      lowerName.includes('vbaproject.bin') ||
      lowerName.endsWith('.bin') && lowerName.includes('macro')
    ) {
      return { valid: false, reason: 'OOXML_MACRO_PAYLOAD_BLOCKED' };
    }

    if (entryName === '[Content_Types].xml') hasContentTypesXml = true;
    if (entryName.startsWith('word/')) hasWordDir = true;
    if (entryName.startsWith('xl/')) hasXlDir = true;
    if (entryName.startsWith('ppt/')) hasPptDir = true;

    totalCompressed += Math.max(1, compSize);
    totalUncompressed += uncompSize;

    if (totalUncompressed > 50 * 1024 * 1024) {
      return { valid: false, reason: 'OOXML_UNCOMPRESSED_SIZE_EXCEEDED' };
    }
    if (compSize > 0 && uncompSize / compSize > 40) {
      return { valid: false, reason: 'OOXML_ZIP_BOMB_RATIO_EXCEEDED' };
    }

    ptr += 46 + fileNameLen + extraLen + commentLen;
  }

  if (totalUncompressed / Math.max(1, totalCompressed) > 40) {
    return { valid: false, reason: 'OOXML_OVERALL_RATIO_EXCEEDED' };
  }
  if (!hasContentTypesXml) {
    return { valid: false, reason: 'OOXML_MISSING_CONTENT_TYPES_XML' };
  }

  // Inspect raw buffer for uncompressed <!ENTITY XXE patterns
  const rawAscii = buf.toString('latin1');
  if (/<!ENTITY/i.test(rawAscii) || /SYSTEM\s+["'](?:file|http|ftp):/i.test(rawAscii)) {
    return { valid: false, reason: 'OOXML_XXE_ENTITY_BLOCKED' };
  }

  let detectedMimeType =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (hasXlDir) {
    detectedMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else if (hasPptDir) {
    detectedMimeType =
      'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  } else if (!hasWordDir) {
    return { valid: false, reason: 'OOXML_MISSING_DOCUMENT_ROOT' };
  }

  return { valid: true, detectedMimeType };
}

/**
 * 6. MP4 / WebM Video Container Box Walker:
 */
function parseVideoContainerStructure(buf: Buffer): {
  valid: boolean;
  detectedMimeType?: string;
  reason?: string;
} {
  // Check WebM / Matroska EBML header (1A 45 DF A3)
  if (
    buf.byteLength >= 32 &&
    buf[0] === 0x1a &&
    buf[1] === 0x45 &&
    buf[2] === 0xdf &&
    buf[3] === 0xa3
  ) {
    const headLatin1 = buf.subarray(0, Math.min(256, buf.byteLength)).toString('latin1');
    if (!headLatin1.includes('webm') && !headLatin1.includes('matroska')) {
      return { valid: false, reason: 'WEBM_MISSING_DOCTYPE' };
    }
    return { valid: true, detectedMimeType: 'video/webm' };
  }

  // Check ISO BMFF / MP4 ('ftyp' at offset 4..8)
  if (buf.byteLength >= 24 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const ftypSize = buf.readUInt32BE(0);
    if (ftypSize < 16 || ftypSize > buf.byteLength) {
      return { valid: false, reason: 'MP4_INVALID_FTYP_SIZE' };
    }
    let offset = 0;
    let sawMoov = false;
    let boxCount = 0;
    while (offset + 8 <= buf.byteLength) {
      boxCount += 1;
      if (boxCount > 4096) {
        return { valid: false, reason: 'MP4_EXCESSIVE_BOXES' };
      }
      let boxSize = buf.readUInt32BE(offset);
      const boxType = buf.subarray(offset + 4, offset + 8).toString('ascii');
      if (boxType === 'moov') {
        sawMoov = true;
      }
      if (boxSize === 0) {
        // Box extends to EOF
        break;
      }
      if (boxSize === 1) {
        if (offset + 16 > buf.byteLength) {
          return { valid: false, reason: 'MP4_TRUNCATED_LARGE_BOX' };
        }
        const bigSize = Number(buf.readBigUInt64BE(offset + 8));
        if (!Number.isSafeInteger(bigSize) || bigSize < 16) {
          return { valid: false, reason: 'MP4_INVALID_LARGE_BOX_SIZE' };
        }
        boxSize = bigSize;
      } else if (boxSize < 8) {
        return { valid: false, reason: 'MP4_INVALID_BOX_SIZE' };
      }
      if (offset + boxSize > buf.byteLength) {
        return { valid: false, reason: 'MP4_TRUNCATED_BOX' };
      }
      offset += boxSize;
    }

    if (!sawMoov) {
      return { valid: false, reason: 'MP4_MISSING_MOOV_ATOM' };
    }
    return { valid: true, detectedMimeType: 'video/mp4' };
  }

  return { valid: false, reason: 'UNSUPPORTED_VIDEO_CONTAINER' };
}

/**
 * Performs deep server-side binary validation on the actual uploaded bytes
 * (never trusting browser-supplied contentType or magicBytesHex).
 */
export function validateStoredFileBytes(
  buf: Buffer,
  targetBucket?: SupabaseBucketName,
  maxBytes = MAX_TICKET_UPLOAD_BYTES
): FileStructuralValidationResult {
  const byteSize = buf ? buf.byteLength : 0;
  const sha256 = crypto
    .createHash('sha256')
    .update(buf || Buffer.alloc(0))
    .digest('hex');

  if (!buf || byteSize < 16) {
    return { valid: false, sha256, byteSize, reason: 'FILE_EMPTY_OR_TOO_SMALL' };
  }
  if (byteSize > maxBytes) {
    return { valid: false, sha256, byteSize, reason: 'FILE_SIZE_EXCEEDS_LIMIT' };
  }

  // Block SVG / HTML / Script masquerading at the byte level
  const headText = buf.subarray(0, Math.min(512, byteSize)).toString('utf8').trimStart();
  if (
    /^<(?:!doctype\s+html|html|svg|script|\?xml)/i.test(headText) ||
    /<svg[\s>]/i.test(headText) ||
    /<script[\s>]/i.test(headText)
  ) {
    return { valid: false, sha256, byteSize, reason: 'EXECUTABLE_OR_SVG_MARKUP_BLOCKED' };
  }

  let result: FileStructuralValidationResult | null = null;

  // 1. PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const png = parsePngStructure(buf);
    result = {
      valid: png.valid,
      detectedMimeType: 'image/png',
      category: 'image',
      sha256,
      byteSize,
      width: png.width,
      height: png.height,
      reason: png.reason,
    };
  }
  // 2. JPEG
  else if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    const jpg = parseJpegStructure(buf);
    result = {
      valid: jpg.valid,
      detectedMimeType: 'image/jpeg',
      category: 'image',
      sha256,
      byteSize,
      width: jpg.width,
      height: jpg.height,
      reason: jpg.reason,
    };
  }
  // 3. WebP
  else if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    const webp = parseWebpStructure(buf);
    result = {
      valid: webp.valid,
      detectedMimeType: 'image/webp',
      category: 'image',
      sha256,
      byteSize,
      width: webp.width,
      height: webp.height,
      reason: webp.reason,
    };
  }
  // 4. PDF
  else if (buf.subarray(0, 5).toString('ascii') === '%PDF-') {
    const pdf = parsePdfStructure(buf);
    result = {
      valid: pdf.valid,
      detectedMimeType: 'application/pdf',
      category: 'pdf',
      sha256,
      byteSize,
      reason: pdf.reason,
    };
  }
  // 5. OOXML ZIP (.docx / .xlsx / .pptx)
  else if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    const ooxml = parseOoxmlZipStructure(buf);
    result = {
      valid: ooxml.valid,
      detectedMimeType: ooxml.detectedMimeType,
      category: 'ooxml',
      sha256,
      byteSize,
      reason: ooxml.reason,
    };
  }
  // 6. MP4 / WebM Video
  else if (
    (buf.byteLength >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp') ||
    (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3)
  ) {
    const vid = parseVideoContainerStructure(buf);
    result = {
      valid: vid.valid,
      detectedMimeType: vid.detectedMimeType,
      category: 'video',
      sha256,
      byteSize,
      reason: vid.reason,
    };
  } else {
    return {
      valid: false,
      sha256,
      byteSize,
      reason: 'UNRECOGNIZED_OR_FORBIDDEN_FILE_SIGNATURE',
    };
  }

  if (!result.valid) {
    return result;
  }

  if (targetBucket && result.category && !isCategoryAllowedForBucket(targetBucket, result.category)) {
    return {
      ...result,
      valid: false,
      reason: `CATEGORY_NOT_ALLOWED_FOR_BUCKET:${result.category}->${targetBucket}`,
    };
  }

  return result;
}

/**
 * Optional external malware scan webhook integration for documents/archives when MALWARE_SCAN_API_URL is configured.
 */
export async function runMalwareScanIfConfigured(
  buf: Buffer,
  sha256: string,
  mimeType: string
): Promise<{ clean: boolean; reason?: string }> {
  const scanUrl = (process.env.MALWARE_SCAN_API_URL || '').trim();
  if (!scanUrl) {
    return { clean: true };
  }
  try {
    const res = await fetch(scanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Sha256': sha256,
        'X-File-Mime': mimeType,
      },
      body: new Uint8Array(buf),
    });
    if (!res.ok) {
      return { clean: false, reason: `MALWARE_SCANNER_HTTP_${res.status}` };
    }
    const data = (await res.json()) as { clean?: boolean; reason?: string };
    return { clean: Boolean(data.clean), reason: data.reason };
  } catch {
    return { clean: false, reason: 'MALWARE_SCANNER_UNREACHABLE' };
  }
}
