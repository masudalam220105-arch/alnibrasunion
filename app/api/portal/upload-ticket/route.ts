import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { MAX_TICKET_UPLOAD_BYTES } from '@/lib/file-validator';
import { loadServerStore, saveServerStore, type StorageFileRecord } from '@/lib/server-db';
import { resolveAuthenticatedActor } from '@/lib/session-auth';
import {
  ensureServerHydratedFromSupabase,
  isSupabaseAdminConfigured,
  resolveSupabaseBearerActor,
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

/**
 * Issues a private quarantine upload ticket in bucket 'quarantine-uploads'.
 * Never trusts client-provided contentType or magicBytesHex as proof of validity,
 * and never exposes any public or download URL until server-side byte inspection
 * succeeds in /api/portal/upload-finalize.
 */
export async function POST(req: NextRequest) {
  const store = loadServerStore();
  if (isSupabaseAdminConfigured()) {
    await ensureServerHydratedFromSupabase(store);
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fallbackActorUid = String(body.actorUid || req.headers.get('x-actor-uid') || '');

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
      { ok: false, error: auth.error || 'Authentication required.' },
      { status: auth.statusCode || 401 }
    );
  }

  const fileName = sanitizeStorageFileName(String(body.fileName || 'upload.bin'));
  const byteSize = Number(body.sizeBytes || body.byteSize || 0);
  const folder = String(body.folder || 'documents') as StorageFolder;
  const destination = body.destination === 'user' ? 'user' : 'public';
  const targetBucket = resolveSupabaseBucket(folder, destination);

  if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > MAX_TICKET_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `Invalid file size (${byteSize} bytes). Maximum allowed is ${MAX_TICKET_UPLOAD_BYTES} bytes (25 MB).`,
      },
      { status: 400 }
    );
  }

  if (!canActorUploadToBucket(auth.actor.role, targetBucket, folder)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Forbidden: Role '${auth.actor.role}' cannot upload to bucket '${targetBucket}'.`,
      },
      { status: 403 }
    );
  }

  const ticketId = `qt_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
  const quarantinePath = `${auth.actor.uid}/${ticketId}_${fileName}`;
  const targetObjectPath = `${folder}/${auth.actor.uid}/${Date.now()}_${fileName}`;
  const nowIso = new Date().toISOString();

  const quarantineRecord: StorageFileRecord = {
    id: ticketId,
    ticketId,
    bucketId: targetBucket,
    objectPath: targetObjectPath,
    quarantinePath,
    ownerUid: auth.actor.uid,
    originalName: fileName,
    mimeType: 'application/octet-stream', // Unverified until upload-finalize inspects actual bytes
    byteSize,
    sha256: '',
    status: 'quarantined',
    rejectionReason: null,
    createdAt: nowIso,
    verifiedAt: null,
    updatedAt: nowIso,
  };

  if (!store.storageFiles) {
    store.storageFiles = {};
  }
  store.storageFiles[ticketId] = quarantineRecord;
  saveServerStore(store);

  return NextResponse.json({
    ok: true,
    ticketId,
    quarantineBucket: 'quarantine-uploads',
    quarantinePath,
    targetBucket,
    targetObjectPath,
    signedUploadUrl: null,
    signedUploadToken: null,
    expiresInSeconds: 600,
  });
}
