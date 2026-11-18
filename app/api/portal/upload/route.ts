import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  MAX_DIRECT_UPLOAD_BYTES,
  runMalwareScanIfConfigured,
  validateStoredFileBytes,
} from '@/lib/file-validator';
import {
  getSimulatedStorageMap,
  loadServerStore,
  saveServerStore,
  type StorageFileRecord,
} from '@/lib/server-db';
import { resolveAuthenticatedActor } from '@/lib/session-auth';
import {
  ensureServerHydratedFromSupabase,
  isSupabaseAdminConfigured,
  resolveSupabaseBearerActor,
  uploadValidatedFileToSupabaseServer,
} from '@/lib/supabase-server';
import { type SupabaseBucketName } from '@/lib/supabase';
import { resolveSupabaseBucket, type StorageFolder } from '@/lib/supabase-storage';

export const runtime = 'nodejs';

function sanitizeStorageFileName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 80) || 'upload.bin'
  );
}

function canActorUploadToBucket(
  role: string,
  bucket: SupabaseBucketName,
  folder: string
): boolean {
  if (role === 'admin') return true;
  if (role === 'teacher') {
    return (
      bucket === 'study-materials' ||
      bucket === 'user-gallery' ||
      bucket === 'documents' ||
      bucket === 'certificates'
    );
  }
  if (role === 'student') {
    if (bucket === 'user-gallery') {
      return folder === 'avatars' || folder === 'gallery' || folder === 'user-gallery';
    }
    if (bucket === 'documents') {
      return folder === 'chat' || folder === 'receipts' || folder === 'documents';
    }
    return false;
  }
  return false;
}

export async function POST(req: NextRequest) {
  const store = loadServerStore();
  if (isSupabaseAdminConfigured()) {
    await ensureServerHydratedFromSupabase(store);
  }
  const fallbackActorUid = req.headers.get('x-actor-uid') || '';
  let auth = resolveAuthenticatedActor(req, store, {
    requireCsrf: Boolean(req.cookies.get('alnibras_session')?.value),
    fallbackActorUid,
  });

  if (!auth.authenticated || !auth.actor) {
    const bearerActor = await resolveSupabaseBearerActor(req.headers.get('authorization'), store);
    if (bearerActor) {
      auth = { authenticated: true, actor: bearerActor, session: null, csrfValid: true };
    }
  }

  if (!auth.authenticated || !auth.actor) {
    return NextResponse.json(
      { ok: false, error: auth.error || 'Authentication required for file upload.' },
      { status: auth.statusCode || 401 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid multipart/form-data upload payload.' },
      { status: 400 }
    );
  }

  const fileEntry = formData.get('file');
  const folder = String(formData.get('folder') || 'documents') as StorageFolder;
  const destination = formData.get('destination') === 'user' ? 'user' : 'public';

  if (!fileEntry || typeof (fileEntry as Blob).arrayBuffer !== 'function') {
    return NextResponse.json({ ok: false, error: 'No binary file provided.' }, { status: 400 });
  }

  const fileBlob = fileEntry as File;
  const bucket = resolveSupabaseBucket(folder, destination);

  if (!canActorUploadToBucket(auth.actor.role, bucket, folder)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Forbidden: Role '${auth.actor.role}' is not permitted to upload to bucket '${bucket}'.`,
      },
      { status: 403 }
    );
  }

  const rawBuffer = Buffer.from(await fileBlob.arrayBuffer());
  if (rawBuffer.byteLength > MAX_DIRECT_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `Direct upload exceeds 3.5 MB limit (${rawBuffer.byteLength} bytes). Use quarantine ticket upload.`,
      },
      { status: 413 }
    );
  }

  // Deep server-side binary structure validation (ignores client-provided contentType / magicBytesHex)
  const validation = validateStoredFileBytes(rawBuffer, bucket, MAX_DIRECT_UPLOAD_BYTES);
  if (!validation.valid || !validation.detectedMimeType) {
    return NextResponse.json(
      {
        ok: false,
        error: `File validation rejected upload: ${validation.reason || 'INVALID_BINARY_STRUCTURE'}`,
        reason: validation.reason,
      },
      { status: 400 }
    );
  }

  const malwareCheck = await runMalwareScanIfConfigured(
    rawBuffer,
    validation.sha256,
    validation.detectedMimeType
  );
  if (!malwareCheck.clean) {
    return NextResponse.json(
      {
        ok: false,
        error: `Upload blocked by security scanner (${malwareCheck.reason || 'MALWARE_DETECTED'}).`,
      },
      { status: 400 }
    );
  }

  const safeName = sanitizeStorageFileName(fileBlob.name || 'upload.bin');
  const fileId = `sf_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const storagePath = `${folder}/${auth.actor.uid}/${Date.now()}_${safeName}`;
  const nowIso = new Date().toISOString();

  let resolvedUrl = `data:${validation.detectedMimeType};base64,${rawBuffer.toString('base64')}`;
  let provider: 'supabase-storage' | 'inline-data-url' = 'inline-data-url';

  const remoteUpload = await uploadValidatedFileToSupabaseServer({
    bucket,
    storagePath,
    bytes: rawBuffer,
    contentType: validation.detectedMimeType,
  });
  if (remoteUpload?.url) {
    resolvedUrl = remoteUpload.url;
    provider = remoteUpload.provider;
  }

  const simStorage = getSimulatedStorageMap();
  simStorage[`${bucket}::${storagePath}`] = {
    bytes: Buffer.from(rawBuffer),
    sha256: validation.sha256,
    objectId: `obj_${crypto.randomUUID()}`,
  };

  const record: StorageFileRecord = {
    id: fileId,
    ticketId: null,
    bucketId: bucket,
    objectPath: storagePath,
    quarantinePath: null,
    ownerUid: auth.actor.uid,
    originalName: safeName,
    mimeType: validation.detectedMimeType,
    byteSize: validation.byteSize,
    sha256: validation.sha256,
    status: 'approved',
    rejectionReason: null,
    createdAt: nowIso,
    verifiedAt: nowIso,
    updatedAt: nowIso,
  };

  if (!store.storageFiles) {
    store.storageFiles = {};
  }
  store.storageFiles[fileId] = record;
  saveServerStore(store);

  return NextResponse.json({
    ok: true,
    fileId,
    url: resolvedUrl,
    storagePath,
    bucket,
    provider,
    fileName: safeName,
    contentType: validation.detectedMimeType,
    sizeBytes: validation.byteSize,
    sha256: validation.sha256,
  });
}
