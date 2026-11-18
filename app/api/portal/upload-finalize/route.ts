import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  MAX_TICKET_UPLOAD_BYTES,
  runMalwareScanIfConfigured,
  validateStoredFileBytes,
} from '@/lib/file-validator';
import { getSimulatedStorageMap, loadServerStore, saveServerStore } from '@/lib/server-db';
import { resolveAuthenticatedActor } from '@/lib/session-auth';
import {
  ensureServerHydratedFromSupabase,
  isSupabaseAdminConfigured,
  resolveSupabaseBearerActor,
  uploadValidatedFileToSupabaseServer,
} from '@/lib/supabase-server';
import { type SupabaseBucketName } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * Finalizes a quarantine upload ticket by:
 * 1. Atomically transitioning the ticket status from 'quarantined' -> 'verifying'.
 * 2. Reading the actual stored bytes from quarantine (never trusting client metadata).
 * 3. Running deep structural validation and malware scanning on the stored bytes.
 * 4. Promoting approved bytes to the target bucket and marking status = 'approved',
 *    or marking status = 'rejected' on validation failure.
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

  const ticketId = String(body.ticketId || '');
  if (!ticketId || !store.storageFiles || !store.storageFiles[ticketId]) {
    return NextResponse.json(
      { ok: false, error: 'Quarantine upload ticket not found.' },
      { status: 404 }
    );
  }

  const record = store.storageFiles[ticketId];
  if (record.ownerUid !== auth.actor.uid && auth.actor.role !== 'admin') {
    return NextResponse.json(
      { ok: false, error: 'Forbidden: You do not own this upload ticket.' },
      { status: 403 }
    );
  }

  if (record.status !== 'quarantined') {
    return NextResponse.json(
      {
        ok: false,
        error: `Upload ticket '${ticketId}' cannot be finalized from status '${record.status}'.`,
      },
      { status: 409 }
    );
  }

  // Check 10-minute expiration window
  const ageMs = Date.now() - Date.parse(record.createdAt);
  if (ageMs > 10 * 60 * 1000) {
    record.status = 'rejected';
    record.rejectionReason = 'QUARANTINE_TICKET_EXPIRED';
    record.updatedAt = new Date().toISOString();
    saveServerStore(store);
    return NextResponse.json(
      { ok: false, error: 'Quarantine upload ticket has expired.' },
      { status: 410 }
    );
  }

  // Atomic transition to 'verifying' before reading bytes
  record.status = 'verifying';
  record.updatedAt = new Date().toISOString();
  saveServerStore(store);

  let storedBytes: Buffer | null = null;
  if (typeof body.quarantineBase64 === 'string') {
    const rawBase64 = body.quarantineBase64.includes(',')
      ? body.quarantineBase64.split(',')[1]
      : body.quarantineBase64;
    storedBytes = Buffer.from(rawBase64, 'base64');
  }

  if (!storedBytes || storedBytes.byteLength === 0) {
    record.status = 'rejected';
    record.rejectionReason = 'QUARANTINE_OBJECT_MISSING_OR_EMPTY';
    record.updatedAt = new Date().toISOString();
    saveServerStore(store);
    return NextResponse.json(
      { ok: false, error: 'No bytes found in quarantine storage for this ticket.' },
      { status: 400 }
    );
  }

  const targetBucket = record.bucketId as SupabaseBucketName;
  const validation = validateStoredFileBytes(
    storedBytes,
    targetBucket,
    MAX_TICKET_UPLOAD_BYTES
  );

  if (!validation.valid || !validation.detectedMimeType) {
    record.status = 'rejected';
    record.rejectionReason = validation.reason || 'STRUCTURAL_VALIDATION_FAILED';
    record.updatedAt = new Date().toISOString();
    saveServerStore(store);

    return NextResponse.json(
      {
        ok: false,
        error: `Quarantined file failed server-side binary validation (${record.rejectionReason}).`,
        reason: record.rejectionReason,
      },
      { status: 400 }
    );
  }

  const malwareCheck = await runMalwareScanIfConfigured(
    storedBytes,
    validation.sha256,
    validation.detectedMimeType
  );
  if (!malwareCheck.clean) {
    record.status = 'rejected';
    record.rejectionReason = malwareCheck.reason || 'MALWARE_DETECTED';
    record.updatedAt = new Date().toISOString();
    saveServerStore(store);

    return NextResponse.json(
      {
        ok: false,
        error: `Quarantined file blocked by malware scanner (${record.rejectionReason}).`,
      },
      { status: 400 }
    );
  }

  let resolvedUrl = `data:${validation.detectedMimeType};base64,${storedBytes.toString('base64')}`;
  let provider: 'supabase-storage' | 'inline-data-url' = 'inline-data-url';

  const remoteUpload = await uploadValidatedFileToSupabaseServer({
    bucket: targetBucket,
    storagePath: record.objectPath,
    bytes: storedBytes,
    contentType: validation.detectedMimeType,
  });
  if (remoteUpload?.url) {
    resolvedUrl = remoteUpload.url;
    provider = remoteUpload.provider;
  }

  const simStorage = getSimulatedStorageMap();
  simStorage[`${targetBucket}::${record.objectPath}`] = {
    bytes: Buffer.from(storedBytes),
    sha256: validation.sha256,
    objectId: `obj_${crypto.randomUUID()}`,
  };

  const nowIso = new Date().toISOString();
  record.mimeType = validation.detectedMimeType;
  record.byteSize = validation.byteSize;
  record.sha256 = validation.sha256;
  record.status = 'approved';
  record.verifiedAt = nowIso;
  record.updatedAt = nowIso;
  saveServerStore(store);

  return NextResponse.json({
    ok: true,
    fileId: record.id,
    ticketId: record.ticketId,
    url: resolvedUrl,
    storagePath: record.objectPath,
    bucket: targetBucket,
    provider,
    fileName: record.originalName,
    contentType: validation.detectedMimeType,
    sizeBytes: validation.byteSize,
    sha256: validation.sha256,
  });
}
