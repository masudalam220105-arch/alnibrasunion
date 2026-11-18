import {
  isSupabaseConfigured,
  supabase,
  type SupabaseBucketName,
  SUPABASE_REQUIRED_BUCKETS,
  SUPABASE_PRIVATE_BUCKETS,
} from './supabase';

export const MAX_DIRECT_UPLOAD_BYTES = Math.floor(3.5 * 1024 * 1024);

export type StorageFolder =
  | SupabaseBucketName
  | 'avatars'
  | 'gallery'
  | 'thumbnails'
  | 'resources'
  | 'chat'
  | 'branding'
  | 'homepage'
  | 'receipts';

export type UploadProvider = 'supabase-storage' | 'inline-data-url';

export interface SupabaseUploadResult {
  url: string;
  storagePath: string;
  bucket: SupabaseBucketName;
  provider: UploadProvider;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256?: string;
}

const BLOCKED_ACTIVE_EXTENSIONS = /\.(svg|svgz|html|htm|xhtml|xml|js|mjs|cjs|php|exe|sh|bat)$/i;

const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

export const SUPPORTED_IMAGE_EXTENSIONS = Object.keys(IMAGE_EXTENSION_TO_MIME);

export function inferImageMimeFromFile(file: Pick<File, 'name' | 'type'>): string {
  const rawMime = (file.type || '').toLowerCase().trim();
  if (rawMime.startsWith('image/')) {
    return rawMime;
  }
  const match = (file.name || '').toLowerCase().match(/(\.[a-z0-9]+)$/);
  if (match && IMAGE_EXTENSION_TO_MIME[match[1]]) {
    return IMAGE_EXTENSION_TO_MIME[match[1]];
  }
  return '';
}

export function isSupportedImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  const inferred = inferImageMimeFromFile(file);
  if (!inferred) return false;
  if (inferred === 'image/svg+xml' || BLOCKED_ACTIVE_EXTENSIONS.test(file.name || '')) {
    return false;
  }
  return inferred.startsWith('image/');
}

export interface ImageUploadOptions {
  folder?: StorageFolder;
  destination?: 'public' | 'user';
  maxSizeMb?: number;
  maxDimension?: number;
  preserveTransparency?: boolean;
  onProgress?: (percent: number) => void;
}

/**
 * Maps any logical storage folder used in the portal UI to one of the 8 normalized Supabase Storage buckets:
 * Public Buckets:
 * - public-gallery
 * - videos
 * - official-branding
 * - slideshow
 * Private Buckets (RLS protected):
 * - user-gallery
 * - certificates
 * - study-materials
 * - documents
 */
export function resolveSupabaseBucket(
  folder: StorageFolder,
  destination: 'public' | 'user' = 'public'
): SupabaseBucketName {
  if ((SUPABASE_REQUIRED_BUCKETS as readonly string[]).includes(folder)) {
    return folder as SupabaseBucketName;
  }
  switch (folder) {
    case 'gallery':
      return destination === 'user' ? 'user-gallery' : 'public-gallery';
    case 'avatars':
      return 'user-gallery';
    case 'thumbnails':
      return 'videos';
    case 'resources':
      return 'study-materials';
    case 'branding':
      return 'official-branding';
    case 'homepage':
      return 'slideshow';
    case 'chat':
    case 'receipts':
    default:
      return 'documents';
  }
}

export function isPrivateSupabaseBucket(bucket: SupabaseBucketName): boolean {
  return (SUPABASE_PRIVATE_BUCKETS as readonly string[]).includes(bucket);
}

export function buildSupabaseStoragePath(params: {
  folder: StorageFolder;
  fileName: string;
  ownerUid?: string;
}): string {
  const safeName = (params.fileName || 'upload.bin')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.+/g, '.')
    .slice(0, 80);
  const prefix = params.folder === 'avatars' ? 'avatars' : resolveSupabaseBucket(params.folder, 'user');
  const owner = (params.ownerUid || 'portal').replace(/[^a-zA-Z0-9_-]/g, '_');
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}/${owner}/${suffix}_${safeName}`;
}

function readCsrfCookieInBrowser(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)alnibras_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function readActiveActorUidInBrowser(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem('alnibras_active_session_uid_v1') || '';
  } catch {
    return '';
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to encode file.'));
      }
    };
    reader.onerror = () => reject(new Error('Error reading selected file.'));
    reader.readAsDataURL(file);
  });
}

const DIRECT_VALIDATED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Resizes and compresses oversized smartphone/desktop photos or converts browser-decodable
 * formats (HEIC/AVIF/BMP/GIF or empty-MIME image files) into compact valid JPEG/PNG images
 * so every photo upload passes server structural validation quickly without exceeding DB/base64 size limits.
 */
export async function optimizeImageFileForUpload(
  file: File,
  options?: { maxDimension?: number; preserveTransparency?: boolean; quality?: number }
): Promise<File> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return file;
  }
  const mime = inferImageMimeFromFile(file);
  if (!mime.startsWith('image/') || mime === 'image/svg+xml') {
    return file;
  }
  const maxDim = options?.maxDimension && options.maxDimension > 120 ? options.maxDimension : 1400;
  const quality = options?.quality && options.quality > 0.3 && options.quality <= 1 ? options.quality : 0.86;
  const hasExplicitMime = (file.type || '').toLowerCase().trim() === mime;

  // Small native JPEG/PNG/WebP with matching MIME fits comfortably without re-encoding
  if (
    hasExplicitMime &&
    DIRECT_VALIDATED_IMAGE_MIMES.has(mime) &&
    file.size > 0 &&
    file.size <= 200 * 1024
  ) {
    return file;
  }

  try {
    let sourceWidth = 0;
    let sourceHeight = 0;
    let drawSource: CanvasImageSource | null = null;
    let objectUrlToRevoke: string | null = null;

    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        sourceWidth = bitmap.width;
        sourceHeight = bitmap.height;
        drawSource = bitmap;
      } catch {
        drawSource = null;
      }
    }

    if (!drawSource && typeof Image !== 'undefined' && typeof URL?.createObjectURL === 'function') {
      const objUrl = URL.createObjectURL(file);
      objectUrlToRevoke = objUrl;
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Image decode failed'));
        el.src = objUrl;
      });
      sourceWidth = img.naturalWidth || img.width;
      sourceHeight = img.naturalHeight || img.height;
      drawSource = img;
    }

    if (!drawSource || sourceWidth < 1 || sourceHeight < 1) {
      if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
      return file;
    }

    const scale = Math.min(1, maxDim / Math.max(sourceWidth, sourceHeight));
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
      return file;
    }

    const keepPng =
      mime === 'image/png' &&
      (options?.preserveTransparency ? file.size <= 1200 * 1024 : file.size <= 450 * 1024);
    const targetMime = keepPng ? 'image/png' : 'image/jpeg';
    if (targetMime === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }
    ctx.drawImage(drawSource, 0, 0, targetWidth, targetHeight);

    if (typeof (drawSource as ImageBitmap).close === 'function') {
      (drawSource as ImageBitmap).close();
    }
    if (objectUrlToRevoke) {
      URL.revokeObjectURL(objectUrlToRevoke);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, targetMime, quality)
    );
    if (!blob || blob.size < 16) {
      return file;
    }

    if (
      blob.size < file.size ||
      !hasExplicitMime ||
      !DIRECT_VALIDATED_IMAGE_MIMES.has(mime) ||
      sourceWidth > maxDim ||
      sourceHeight > maxDim
    ) {
      const ext = targetMime === 'image/png' ? '.png' : '.jpg';
      const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
      return new File([blob], `${baseName}${ext}`, {
        type: targetMime,
        lastModified: Date.now(),
      });
    }
    return file;
  } catch {
    return file;
  }
}

/**
 * Validates file presence, blocks SVG/HTML XSS payloads, and enforces maximum size.
 */
export function validateStorageFile(
  file: File,
  maxSizeMb = 25
): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }
  const mime = (file.type || '').toLowerCase();
  const name = file.name || '';
  if (
    mime === 'image/svg+xml' ||
    mime === 'text/html' ||
    mime === 'application/xhtml+xml' ||
    BLOCKED_ACTIVE_EXTENSIONS.test(name)
  ) {
    return {
      valid: false,
      error: 'Active HTML/SVG/script files are blocked by portal security policy.',
    };
  }
  const maxBytes = maxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File size exceeds maximum limit of ${maxSizeMb} MB.`,
    };
  }
  return { valid: true };
}

/**
 * Strictly validates photo/image uploads before optimization and server transmission.
 */
export function validateImageFile(
  file: File,
  maxSizeMb = 15
): { valid: boolean; error?: string } {
  const base = validateStorageFile(file, maxSizeMb);
  if (!base.valid) return base;
  if (!isSupportedImageFile(file)) {
    return {
      valid: false,
      error: 'Please select a valid raster image file (JPG, PNG, WEBP, GIF, BMP, or AVIF).',
    };
  }
  return { valid: true };
}

/**
 * Standardized image upload helper used across AdminPanel, StudentPanel, OfficialBrandingView,
 * Homepage Management, Committee Manager, and DeviceFileUpload.
 */
export async function uploadImageAsset(
  rawFile: File,
  options: ImageUploadOptions = {}
): Promise<SupabaseUploadResult> {
  const maxSizeMb = options.maxSizeMb ?? 15;
  const folder = options.folder ?? 'gallery';
  const destination = options.destination ?? (folder === 'avatars' ? 'user' : 'public');

  const check = validateImageFile(rawFile, maxSizeMb);
  if (!check.valid) {
    throw new Error(check.error || 'Invalid image file.');
  }

  options.onProgress?.(20);
  const optimizedFile = await optimizeImageFileForUpload(rawFile, {
    maxDimension: options.maxDimension ?? (folder === 'avatars' ? 900 : 1400),
    preserveTransparency: options.preserveTransparency ?? (folder === 'official-branding' || folder === 'branding'),
  });

  return uploadFileToSupabaseStorage(
    optimizedFile,
    folder,
    destination,
    options.onProgress,
    { skipImageOptimization: true }
  );
}

/**
 * Uploads any image, video, PDF, certificate, or document through the server-authoritative
 * quarantine & binary validation pipeline (/api/portal/upload) with Supabase Storage & inline support.
 */
export async function uploadFileToSupabaseStorage(
  rawFile: File,
  folder: StorageFolder,
  destination: 'public' | 'user' = 'public',
  onProgress?: (percent: number) => void,
  internalOpts?: { skipImageOptimization?: boolean }
): Promise<SupabaseUploadResult> {
  const initialValidation = validateStorageFile(rawFile, 25);
  if (!initialValidation.valid) {
    throw new Error(initialValidation.error || 'Invalid file.');
  }

  onProgress?.(25);
  const file = internalOpts?.skipImageOptimization
    ? rawFile
    : await optimizeImageFileForUpload(rawFile);
  const bucket = resolveSupabaseBucket(folder, destination);

  let supabaseAccessToken = '';
  if (typeof window !== 'undefined' && isSupabaseConfigured()) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      supabaseAccessToken = session?.access_token || '';
    } catch {
      supabaseAccessToken = '';
    }
  }

  onProgress?.(50);

  const csrfToken = readCsrfCookieInBrowser();
  const actorUid = readActiveActorUidInBrowser();
  const headers: Record<string, string> = {};
  if (csrfToken) headers['x-csrf-token'] = csrfToken;
  if (actorUid) headers['x-actor-uid'] = actorUid;
  if (supabaseAccessToken) headers['Authorization'] = `Bearer ${supabaseAccessToken}`;

  // Path A: Direct Server Binary Validation (<= 3.5 MB)
  if (file.size <= MAX_DIRECT_UPLOAD_BYTES) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    formData.append('destination', destination);

    const res = await fetch('/api/portal/upload', {
      method: 'POST',
      headers,
      body: formData,
    });
    const data = (await res.json()) as {
      ok: boolean;
      error?: string;
      url?: string;
      storagePath?: string;
      bucket?: SupabaseBucketName;
      provider?: UploadProvider;
      fileName?: string;
      contentType?: string;
      sizeBytes?: number;
      sha256?: string;
    };

    if (!res.ok || !data.ok || !data.url) {
      throw new Error(data.error || 'Server binary validation rejected the file.');
    }

    onProgress?.(100);
    return {
      url: data.url,
      storagePath: data.storagePath || `${bucket}/${file.name}`,
      bucket: data.bucket || bucket,
      provider: data.provider || 'inline-data-url',
      fileName: data.fileName || file.name,
      contentType: data.contentType || file.type || 'application/octet-stream',
      sizeBytes: data.sizeBytes ?? file.size,
      sha256: data.sha256,
    };
  }

  // Path B: Quarantine Ticket + Server Byte Finalize (> 3.5 MB up to 25 MB)
  const ticketRes = await fetch('/api/portal/upload-ticket', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName: file.name,
      sizeBytes: file.size,
      folder,
      destination,
      actorUid,
    }),
  });

  const ticketData = (await ticketRes.json()) as {
    ok: boolean;
    error?: string;
    ticketId?: string;
    signedUploadUrl?: string | null;
  };

  if (!ticketRes.ok || !ticketData.ok || !ticketData.ticketId) {
    throw new Error(ticketData.error || 'Failed to obtain quarantine upload ticket.');
  }

  let quarantineBase64: string | undefined;
  if (ticketData.signedUploadUrl && isSupabaseConfigured()) {
    await fetch(ticketData.signedUploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
  } else {
    quarantineBase64 = await readFileAsDataUrl(file);
  }

  const finalizeRes = await fetch('/api/portal/upload-finalize', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ticketId: ticketData.ticketId,
      actorUid,
      quarantineBase64,
    }),
  });

  const finalizeData = (await finalizeRes.json()) as {
    ok: boolean;
    error?: string;
    url?: string;
    storagePath?: string;
    bucket?: SupabaseBucketName;
    provider?: UploadProvider;
    fileName?: string;
    contentType?: string;
    sizeBytes?: number;
    sha256?: string;
  };

  if (!finalizeRes.ok || !finalizeData.ok || !finalizeData.url) {
    throw new Error(finalizeData.error || 'Quarantine file validation failed.');
  }

  onProgress?.(100);
  return {
    url: finalizeData.url,
    storagePath: finalizeData.storagePath || `${bucket}/${file.name}`,
    bucket: finalizeData.bucket || bucket,
    provider: finalizeData.provider || 'inline-data-url',
    fileName: finalizeData.fileName || file.name,
    contentType: finalizeData.contentType || 'application/octet-stream',
    sizeBytes: finalizeData.sizeBytes ?? file.size,
    sha256: finalizeData.sha256,
  };
}

export async function deleteFileFromSupabaseStorage(
  bucket: SupabaseBucketName | string,
  storagePath: string
): Promise<void> {
  if (bucket === 'portal-backups') {
    throw new Error(
      'IMMUTABLE_BACKUP_VIOLATION: Deleting objects from bucket portal-backups is prohibited.'
    );
  }
  if (!storagePath || storagePath.startsWith('data:') || storagePath.startsWith('/')) {
    return;
  }
  if (!isSupabaseConfigured()) {
    return;
  }
  try {
    await supabase.storage.from(bucket).remove([storagePath]);
  } catch {
    // Non-fatal if bucket policy restricts deletion or object is stored externally
  }
}
