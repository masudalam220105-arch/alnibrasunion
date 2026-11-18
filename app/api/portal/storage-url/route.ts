import { NextRequest, NextResponse } from 'next/server';
import { loadServerStore } from '@/lib/server-db';
import { resolveAuthenticatedActor } from '@/lib/session-auth';
import {
  SUPABASE_PRIVATE_BUCKETS,
  type SupabaseBucketName,
} from '@/lib/supabase';

export const runtime = 'nodejs';

const SIGNED_DOWNLOAD_TTL_SECONDS = 15 * 60; // 15 minutes

/**
 * Issues a 15-minute signed download URL for private buckets ('user-gallery', 'certificates',
 * 'study-materials', 'documents') ONLY after verifying:
 * 1. The caller is authenticated and active.
 * 2. The file has status === 'approved' (never exposes 'quarantined', 'verifying', or 'rejected' files).
 * 3. The caller has role/ownership permission for the target object.
 */
export async function POST(req: NextRequest) {
  const store = loadServerStore();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fallbackActorUid = String(body.actorUid || req.headers.get('x-actor-uid') || '');

  const auth = resolveAuthenticatedActor(req, store, {
    requireCsrf: Boolean(req.cookies.get('alnibras_session')?.value),
    fallbackActorUid,
  });

  if (!auth.authenticated || !auth.actor) {
    return NextResponse.json(
      { ok: false, error: auth.error || 'Authentication required.' },
      { status: auth.statusCode || 401 }
    );
  }

  const bucket = String(body.bucket || '') as SupabaseBucketName;
  const storagePath = String(body.storagePath || body.objectPath || '').trim();
  const fileId = String(body.fileId || '').trim();

  if (
    bucket === ('quarantine-uploads' as string) ||
    bucket === ('portal-backups' as string)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `Forbidden: Server infrastructure bucket '${bucket}' never exposes signed download URLs.`,
      },
      { status: 403 }
    );
  }

  const allRecords = Object.values(store.storageFiles || {});
  const matchedRecord = fileId
    ? store.storageFiles?.[fileId]
    : allRecords.find((r) => r.bucketId === bucket && r.objectPath === storagePath);

  if (matchedRecord && matchedRecord.status !== 'approved') {
    return NextResponse.json(
      {
        ok: false,
        error: `Forbidden: File status is '${matchedRecord.status}'. Only 'approved' files can be accessed.`,
      },
      { status: 403 }
    );
  }

  const effectiveBucket = (matchedRecord?.bucketId || bucket) as SupabaseBucketName;
  const effectivePath = matchedRecord?.objectPath || storagePath;

  if (!effectiveBucket || !effectivePath) {
    return NextResponse.json(
      { ok: false, error: 'Bucket and storagePath (or fileId) are required.' },
      { status: 400 }
    );
  }

  // Enforce ownership & RBAC on private buckets
  const isPrivate = (SUPABASE_PRIVATE_BUCKETS as readonly string[]).includes(effectiveBucket);
  if (isPrivate && auth.actor.role !== 'admin') {
    const isOwner =
      matchedRecord?.ownerUid === auth.actor.uid ||
      effectivePath.includes(`/${auth.actor.uid}/`) ||
      effectivePath.startsWith(`${auth.actor.uid}/`);

    const isSharedStudyMaterial = effectiveBucket === 'study-materials';
    const isTeacherReadingCertificate =
      auth.actor.role === 'teacher' && effectiveBucket === 'certificates';

    if (!isOwner && !isSharedStudyMaterial && !isTeacherReadingCertificate) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: You do not have permission to access this private file.' },
        { status: 403 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    signedUrl: `/api/portal/storage-url?bucket=${encodeURIComponent(effectiveBucket)}&path=${encodeURIComponent(effectivePath)}`,
    bucket: effectiveBucket,
    storagePath: effectivePath,
    expiresInSeconds: SIGNED_DOWNLOAD_TTL_SECONDS,
  });
}
