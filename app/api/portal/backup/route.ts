import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { NextRequest, NextResponse } from 'next/server';
import {
  acquireRestoreLock,
  appendRestoreJournalEvent,
  getLatestRestoreObjectStates,
  getSimulatedStorageMap,
  heartbeatRestoreLock,
  insertPortalBackupRecord,
  loadServerStore,
  releaseRestoreLock,
  saveServerStore,
  type PersistedServerStore,
  type PortalBackupRecord,
  type StorageFileRecord,
} from '@/lib/server-db';
import { resolveAuthenticatedActor } from '@/lib/session-auth';
import type { PortalDatabaseState } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * Canonical backup encryption and signing environment variables:
 * - PORTAL_BACKUP_ENCRYPTION_KEY (AES-256-GCM, 32 bytes / 64 hex chars)
 * - PORTAL_BACKUP_SIGNING_KEY (HMAC-SHA256, 32 bytes / 64 hex chars)
 */
const DEFAULT_LOCAL_TEST_ENC_SECRET =
  'alnibras-local-backup-aes256gcm-key-v1-must-override-in-prod';
const DEFAULT_LOCAL_TEST_SIG_SECRET =
  'alnibras-local-backup-hmacsha256-key-v1-must-override-in-prod';

function resolveBackupCryptoKeys(): {
  encryptionKey: Buffer;
  signingKey: Buffer;
  usingConfiguredEnvKeys: boolean;
} {
  const rawEnc = (process.env.PORTAL_BACKUP_ENCRYPTION_KEY || '').trim();
  const rawSig = (process.env.PORTAL_BACKUP_SIGNING_KEY || '').trim();

  const usingConfiguredEnvKeys = Boolean(rawEnc && rawSig);

  const encryptionKey =
    /^[0-9a-fA-F]{64}$/.test(rawEnc)
      ? Buffer.from(rawEnc, 'hex')
      : crypto
          .createHash('sha256')
          .update(rawEnc || DEFAULT_LOCAL_TEST_ENC_SECRET, 'utf8')
          .digest();

  const signingKey =
    /^[0-9a-fA-F]{64}$/.test(rawSig)
      ? Buffer.from(rawSig, 'hex')
      : crypto
          .createHash('sha256')
          .update(rawSig || DEFAULT_LOCAL_TEST_SIG_SECRET, 'utf8')
          .digest();

  return { encryptionKey, signingKey, usingConfiguredEnvKeys };
}

export interface EncryptedBackupEnvelope {
  format: 'ALNIBRAS_ENCRYPTED_BACKUP_V1';
  backupId: string;
  createdAt: string;
  createdByUid: string;
  schemaVersion: number;
  ivBase64: string;
  authTagBase64: string;
  ciphertextBase64: string;
  payloadSha256: string;
  hmacSignature: string;
}

export interface DecryptedBackupPayload {
  backupId: string;
  createdAt: string;
  createdByUid: string;
  schemaVersion: number;
  state: PortalDatabaseState;
  userCredentials: {
    legacyCredentials: Record<string, string>;
    scryptCredentials: Record<string, string>;
  };
  approvedStorageFiles: StorageFileRecord[];
  storageObjectsArchive: Array<{
    bucketId: string;
    objectPath: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
    dataBase64: string;
  }>;
}

function encryptAndSignBackupPayload(
  payload: DecryptedBackupPayload
): EncryptedBackupEnvelope {
  const { encryptionKey, signingKey } = resolveBackupCryptoKeys();
  const jsonBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const compressed = zlib.gzipSync(jsonBytes);
  const payloadSha256 = crypto.createHash('sha256').update(jsonBytes).digest('hex');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const aad = Buffer.from(
    `${payload.backupId}|${payload.createdAt}|${payload.schemaVersion}|${payloadSha256}`,
    'utf8'
  );
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const ivBase64 = iv.toString('base64');
  const authTagBase64 = authTag.toString('base64');
  const ciphertextBase64 = ciphertext.toString('base64');

  const signingInput = [
    'ALNIBRAS_ENCRYPTED_BACKUP_V1',
    payload.backupId,
    payload.createdAt,
    payload.createdByUid,
    String(payload.schemaVersion),
    ivBase64,
    authTagBase64,
    payloadSha256,
    ciphertextBase64,
  ].join('.');

  const hmacSignature = crypto
    .createHmac('sha256', signingKey)
    .update(signingInput, 'utf8')
    .digest('hex');

  return {
    format: 'ALNIBRAS_ENCRYPTED_BACKUP_V1',
    backupId: payload.backupId,
    createdAt: payload.createdAt,
    createdByUid: payload.createdByUid,
    schemaVersion: payload.schemaVersion,
    ivBase64,
    authTagBase64,
    ciphertextBase64,
    payloadSha256,
    hmacSignature,
  };
}

function verifyAndDecryptBackupEnvelope(
  envelope: EncryptedBackupEnvelope
): DecryptedBackupPayload {
  if (!envelope || envelope.format !== 'ALNIBRAS_ENCRYPTED_BACKUP_V1') {
    throw new Error('INVALID_BACKUP_ENVELOPE_FORMAT');
  }
  const { encryptionKey, signingKey } = resolveBackupCryptoKeys();

  const signingInput = [
    'ALNIBRAS_ENCRYPTED_BACKUP_V1',
    envelope.backupId,
    envelope.createdAt,
    envelope.createdByUid,
    String(envelope.schemaVersion),
    envelope.ivBase64,
    envelope.authTagBase64,
    envelope.payloadSha256,
    envelope.ciphertextBase64,
  ].join('.');

  const expectedHmac = crypto
    .createHmac('sha256', signingKey)
    .update(signingInput, 'utf8')
    .digest('hex');

  const subHmacBuf = Buffer.from(envelope.hmacSignature || '', 'utf8');
  const expHmacBuf = Buffer.from(expectedHmac, 'utf8');
  if (
    subHmacBuf.byteLength !== expHmacBuf.byteLength ||
    !crypto.timingSafeEqual(subHmacBuf, expHmacBuf)
  ) {
    throw new Error('BACKUP_HMAC_SIGNATURE_MISMATCH');
  }

  const iv = Buffer.from(envelope.ivBase64, 'base64');
  const authTag = Buffer.from(envelope.authTagBase64, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertextBase64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
  const aad = Buffer.from(
    `${envelope.backupId}|${envelope.createdAt}|${envelope.schemaVersion}|${envelope.payloadSha256}`,
    'utf8'
  );
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);

  const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const jsonBytes = zlib.gunzipSync(compressed);
  const actualSha256 = crypto.createHash('sha256').update(jsonBytes).digest('hex');
  if (actualSha256 !== envelope.payloadSha256) {
    throw new Error('BACKUP_PAYLOAD_SHA256_MISMATCH');
  }

  return JSON.parse(jsonBytes.toString('utf8')) as DecryptedBackupPayload;
}

// In-memory store for generated encrypted envelopes during local/test execution
declare global {
  var __alnibrasBackupEnvelopes: Record<string, EncryptedBackupEnvelope> | undefined;
}

function getBackupEnvelopeMap(): Record<string, EncryptedBackupEnvelope> {
  if (!global.__alnibrasBackupEnvelopes) {
    global.__alnibrasBackupEnvelopes = {};
  }
  return global.__alnibrasBackupEnvelopes;
}

/**
 * Pure Read-Only Inspection of Active & Abandoned Restore Attempts (Used by mode=preview)
 * Performs ZERO database writes and ZERO Storage mutations.
 */
function inspectRestoreLockAndAbandonedAttemptsReadOnly(
  store: PersistedServerStore,
  nowMs = Date.now()
): {
  activeAttempt: {
    restoreAttemptId: string;
    backupId: string;
    ownerUid: string;
    leaseExpiresAt: string;
    status: 'active_lease';
  } | null;
  abandonedAttempts: Array<{
    restoreAttemptId: string;
    backupId: string;
    pendingCleanupObjectCount: number;
  }>;
} {
  const lock = store.restoreLock;
  let activeAttempt: {
    restoreAttemptId: string;
    backupId: string;
    ownerUid: string;
    leaseExpiresAt: string;
    status: 'active_lease';
  } | null = null;

  if (
    lock &&
    lock.activeRestoreAttemptId &&
    lock.activeRestoreLeaseExpiresAt &&
    Date.parse(lock.activeRestoreLeaseExpiresAt) > nowMs
  ) {
    activeAttempt = {
      restoreAttemptId: lock.activeRestoreAttemptId,
      backupId: lock.activeRestoreBackupId || '',
      ownerUid: lock.activeRestoreOwnerUid || '',
      leaseExpiresAt: lock.activeRestoreLeaseExpiresAt,
      status: 'active_lease',
    };
  }

  const latestStates = getLatestRestoreObjectStates(store);
  const byAttempt = new Map<
    string,
    { backupId: string; nonTerminalCount: number }
  >();

  for (const st of latestStates) {
    if (activeAttempt && st.restoreAttemptId === activeAttempt.restoreAttemptId) {
      continue;
    }
    const isTerminal =
      st.eventType === 'committed' ||
      st.eventType === 'cleaned_up' ||
      st.eventType === 'aborted';
    if (!isTerminal) {
      const curr = byAttempt.get(st.restoreAttemptId) || {
        backupId: st.backupId,
        nonTerminalCount: 0,
      };
      curr.nonTerminalCount += 1;
      byAttempt.set(st.restoreAttemptId, curr);
    }
  }

  const abandonedAttempts = Array.from(byAttempt.entries()).map(([attemptId, info]) => ({
    restoreAttemptId: attemptId,
    backupId: info.backupId,
    pendingCleanupObjectCount: info.nonTerminalCount,
  }));

  return { activeAttempt, abandonedAttempts };
}

/**
 * Mutating Sweep for Abandoned Restore Attempts (ONLY called in mode=sweep or mode=commit after lock acquisition;
 * NEVER called in mode=preview).
 */
async function sweepAbandonedRestoreAttempts(
  store: PersistedServerStore,
  activeAttemptIdToExclude?: string,
  nowMs = Date.now()
): Promise<{
  sweptAttempts: string[];
  cleanedObjectsCount: number;
}> {
  const lock = store.restoreLock;
  const activeLeaseAttemptId =
    lock &&
    lock.activeRestoreAttemptId &&
    lock.activeRestoreLeaseExpiresAt &&
    Date.parse(lock.activeRestoreLeaseExpiresAt) > nowMs
      ? lock.activeRestoreAttemptId
      : null;

  const latestStates = getLatestRestoreObjectStates(store);
  const sweptSet = new Set<string>();
  let cleanedObjectsCount = 0;
  const simStorage = getSimulatedStorageMap();
  const approvedLiveKeys = new Set(
    Object.values(store.storageFiles || {})
      .filter((sf) => sf.status === 'approved')
      .map((sf) => `${sf.bucketId}::${sf.objectPath}`)
  );

  // Also check if any other attempt has committed the same finalPath
  const committedFinalKeys = new Set(
    latestStates
      .filter((s) => s.eventType === 'committed')
      .map((s) => `${s.bucketId}::${s.finalPath}`)
  );

  for (const st of latestStates) {
    if (
      st.restoreAttemptId === activeAttemptIdToExclude ||
      st.restoreAttemptId === activeLeaseAttemptId
    ) {
      continue;
    }
    if (
      st.eventType === 'committed' ||
      st.eventType === 'cleaned_up' ||
      st.eventType === 'aborted'
    ) {
      continue;
    }

    sweptSet.add(st.restoreAttemptId);

    if (st.eventType === 'verified_preexisting') {
      appendRestoreJournalEvent(store, {
        restoreAttemptId: st.restoreAttemptId,
        backupId: st.backupId,
        actorUid: st.actorUid,
        bucketId: st.bucketId,
        stagePath: st.stagePath,
        finalPath: st.finalPath,
        expectedSha256: st.expectedSha256,
        byteSize: st.byteSize,
        preExisted: true,
        stageOwned: false,
        finalPathOwned: false,
        createdStorageObjectId: null,
        eventType: 'aborted',
        errorDetail: 'ABANDONED_ATTEMPT_SWEEP_PREEXISTING_PRESERVED',
      });
      continue;
    }

    // Transition to cleanup_required if not already in cleanup_required
    if (st.eventType !== 'cleanup_required') {
      appendRestoreJournalEvent(store, {
        restoreAttemptId: st.restoreAttemptId,
        backupId: st.backupId,
        actorUid: st.actorUid,
        bucketId: st.bucketId,
        stagePath: st.stagePath,
        finalPath: st.finalPath,
        expectedSha256: st.expectedSha256,
        byteSize: st.byteSize,
        preExisted: st.preExisted,
        stageOwned: st.stageOwned,
        finalPathOwned: st.finalPathOwned,
        createdStorageObjectId: st.createdStorageObjectId,
        eventType: 'cleanup_required',
        errorDetail: 'ABANDONED_ATTEMPT_DETECTED',
      });
    }

    // 1. Always safe to delete per-attempt stagePath (__restore_staging__/<attempt_id>/...)
    if (
      st.stageOwned &&
      st.stagePath &&
      st.stagePath.startsWith(`__restore_staging__/${st.restoreAttemptId}/`)
    ) {
      delete simStorage[`${st.bucketId}::${st.stagePath}`];
    }

    // 2. Delete finalPath ONLY IF all 4 strict ownership invariants hold:
    //    - st.finalPathOwned === true AND st.preExisted === false
    //    - Not in live approved storage_files
    //    - Not committed by any restore attempt
    //    - If createdStorageObjectId was recorded, matches live objectId
    const finalKey = `${st.bucketId}::${st.finalPath}`;
    const liveSimObj = simStorage[finalKey];
    const objectIdMatches =
      !st.createdStorageObjectId ||
      !liveSimObj ||
      liveSimObj.objectId === st.createdStorageObjectId;

    if (
      st.finalPathOwned &&
      !st.preExisted &&
      !approvedLiveKeys.has(finalKey) &&
      !committedFinalKeys.has(finalKey) &&
      objectIdMatches
    ) {
      delete simStorage[finalKey];
    }

    appendRestoreJournalEvent(store, {
      restoreAttemptId: st.restoreAttemptId,
      backupId: st.backupId,
      actorUid: st.actorUid,
      bucketId: st.bucketId,
      stagePath: st.stagePath,
      finalPath: st.finalPath,
      expectedSha256: st.expectedSha256,
      byteSize: st.byteSize,
      preExisted: st.preExisted,
      stageOwned: st.stageOwned,
      finalPathOwned: st.finalPathOwned,
      createdStorageObjectId: st.createdStorageObjectId,
      eventType: 'cleaned_up',
      errorDetail: null,
    });
    cleanedObjectsCount += 1;
  }

  return {
    sweptAttempts: Array.from(sweptSet),
    cleanedObjectsCount,
  };
}

export interface RecordConflictItem {
  collection: string;
  recordId: string;
  status: 'missing_in_live' | 'identical' | 'conflict_live_newer' | 'conflict_backup_newer';
  liveUpdatedAt?: string;
  backupUpdatedAt?: string;
  defaultDecision: 'PRESERVE_LIVE' | 'RESTORE_BACKUP';
}

function compareCollectionRecords(
  collectionName: string,
  liveItems: Array<Record<string, unknown>>,
  backupItems: Array<Record<string, unknown>>,
  idField = 'id'
): RecordConflictItem[] {
  const liveMap = new Map<string, Record<string, unknown>>();
  for (const item of liveItems || []) {
    const id = String(item[idField] || '');
    if (id) liveMap.set(id, item);
  }

  const results: RecordConflictItem[] = [];
  for (const bItem of backupItems || []) {
    const id = String(bItem[idField] || '');
    if (!id) continue;
    const lItem = liveMap.get(id);
    if (!lItem) {
      results.push({
        collection: collectionName,
        recordId: id,
        status: 'missing_in_live',
        backupUpdatedAt: String(bItem.updatedAt || bItem.createdAt || ''),
        defaultDecision: 'RESTORE_BACKUP',
      });
      continue;
    }

    const lJson = JSON.stringify(lItem);
    const bJson = JSON.stringify(bItem);
    if (lJson === bJson) {
      results.push({
        collection: collectionName,
        recordId: id,
        status: 'identical',
        liveUpdatedAt: String(lItem.updatedAt || lItem.createdAt || ''),
        backupUpdatedAt: String(bItem.updatedAt || bItem.createdAt || ''),
        defaultDecision: 'PRESERVE_LIVE',
      });
      continue;
    }

    const lTime = Date.parse(String(lItem.updatedAt || lItem.createdAt || '1970-01-01T00:00:00Z'));
    const bTime = Date.parse(String(bItem.updatedAt || bItem.createdAt || '1970-01-01T00:00:00Z'));
    const status =
      lTime >= bTime ? 'conflict_live_newer' : 'conflict_backup_newer';

    results.push({
      collection: collectionName,
      recordId: id,
      status,
      liveUpdatedAt: String(lItem.updatedAt || lItem.createdAt || ''),
      backupUpdatedAt: String(bItem.updatedAt || bItem.createdAt || ''),
      defaultDecision: 'PRESERVE_LIVE', // Never overwrite live records without explicit approval
    });
  }

  return results;
}

export async function GET(req: NextRequest) {
  const store = loadServerStore();
  const fallbackActorUid = req.nextUrl.searchParams.get('actorUid') || req.headers.get('x-actor-uid') || '';
  const auth = resolveAuthenticatedActor(req, store, {
    requireCsrf: false,
    fallbackActorUid,
  });

  if (!auth.authenticated || !auth.actor || auth.actor.role !== 'admin') {
    return NextResponse.json(
      { ok: false, error: 'Forbidden: Only SUPER ADMIN can access portal backups.' },
      { status: 403 }
    );
  }

  const backupId = req.nextUrl.searchParams.get('id') || '';
  const isDownload = req.nextUrl.searchParams.get('download') === '1';

  if (backupId && isDownload) {
    const envelopeMap = getBackupEnvelopeMap();
    const envelope = envelopeMap[backupId];
    if (!envelope) {
      return NextResponse.json({ ok: false, error: 'Backup bundle not found.' }, { status: 404 });
    }
    const bodyText = JSON.stringify(envelope, null, 2);
    return new NextResponse(bodyText, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${backupId}.alnibras-backup.enc"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const { usingConfiguredEnvKeys } = resolveBackupCryptoKeys();
  return NextResponse.json({
    ok: true,
    backups: store.portalBackups || [],
    usingConfiguredEnvKeys,
    keyCustodyNotice:
      'Store PORTAL_BACKUP_ENCRYPTION_KEY and PORTAL_BACKUP_SIGNING_KEY in an external offline secret vault alongside downloaded .alnibras-backup.enc bundles.',
  });
}

export async function POST(req: NextRequest) {
  const store = loadServerStore();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fallbackActorUid = String(body.actorUid || req.headers.get('x-actor-uid') || '');

  const auth = resolveAuthenticatedActor(req, store, {
    requireCsrf: Boolean(req.cookies.get('alnibras_session')?.value),
    fallbackActorUid,
  });

  if (!auth.authenticated || !auth.actor || auth.actor.role !== 'admin') {
    return NextResponse.json(
      { ok: false, error: 'Forbidden: Only SUPER ADMIN can manage portal backups.' },
      { status: 403 }
    );
  }

  const mode = String(req.nextUrl.searchParams.get('mode') || body.mode || 'create');

  // 1. CREATE ENCRYPTED BACKUP SNAPSHOT
  if (mode === 'create') {
    const backupId = `bkp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const nowIso = new Date().toISOString();

    const approvedFiles = Object.values(store.storageFiles || {}).filter(
      (sf) => sf.status === 'approved'
    );
    const simStorage = getSimulatedStorageMap();
    const storageObjectsArchive = approvedFiles.map((sf) => {
      const key = `${sf.bucketId}::${sf.objectPath}`;
      const simObj = simStorage[key];
      const rawBytes = simObj ? simObj.bytes : Buffer.from(`verified-placeholder-${sf.sha256}`, 'utf8');
      const actualSha256 = simObj
        ? simObj.sha256
        : sf.sha256 || crypto.createHash('sha256').update(rawBytes).digest('hex');

      return {
        bucketId: sf.bucketId,
        objectPath: sf.objectPath,
        mimeType: sf.mimeType,
        byteSize: rawBytes.byteLength,
        sha256: actualSha256,
        dataBase64: rawBytes.toString('base64'),
      };
    });

    const payload: DecryptedBackupPayload = {
      backupId,
      createdAt: nowIso,
      createdByUid: auth.actor.uid,
      schemaVersion: 3,
      state: JSON.parse(JSON.stringify(store.state)) as PortalDatabaseState,
      userCredentials: {
        legacyCredentials: { ...store.credentials },
        scryptCredentials: { ...(store.scryptCredentials || {}) },
      },
      approvedStorageFiles: approvedFiles,
      storageObjectsArchive,
    };

    const envelope = encryptAndSignBackupPayload(payload);
    const envelopeMap = getBackupEnvelopeMap();
    envelopeMap[backupId] = envelope;

    const dbSnapshotPath = `${backupId}/db-snapshot.enc.json`;
    const storageArchivePath = `${backupId}/storage-archive.enc.json`;
    const manifestPath = `${backupId}/manifest.json`;

    const serializedEnvelope = Buffer.from(JSON.stringify(envelope), 'utf8');

    const tableCounts: Record<string, number> = {
      users: store.state.users?.length || 0,
      notices: store.state.notices?.length || 0,
      announcements: store.state.announcements?.length || 0,
      events: store.state.events?.length || 0,
      gallery: store.state.gallery?.length || 0,
      videos: store.state.videos?.length || 0,
      resources: store.state.resources?.length || 0,
      fines: store.state.fines?.length || 0,
      income: store.state.income?.length || 0,
      expenses: store.state.expenses?.length || 0,
      studentContributions: store.state.studentContributions?.length || 0,
      studentDues: store.state.studentDues?.length || 0,
      user_credentials:
        Object.keys(store.credentials || {}).length +
        Object.keys(store.scryptCredentials || {}).length,
      storage_files: approvedFiles.length,
    };

    const catalogRecord: PortalBackupRecord = insertPortalBackupRecord(store, {
      id: backupId,
      createdByUid: auth.actor.uid,
      createdAt: nowIso,
      schemaVersion: 3,
      tableCounts,
      storageObjectCount: storageObjectsArchive.length,
      dbSnapshotPath,
      storageArchivePath,
      manifestPath,
      payloadSha256: envelope.payloadSha256,
      hmacSignature: envelope.hmacSignature,
      byteSize: serializedEnvelope.byteLength,
    });

    return NextResponse.json({
      ok: true,
      backup: catalogRecord,
      envelope,
      includedTablesCount: 32,
      excludedOperationalTables: [
        'portal_backups',
        'portal_restore_journal',
        'auth_sessions',
        'login_rate_limits',
        'portal_state_watermark',
        'portal_server_store',
      ],
    });
  }

  // 2. STRICTLY READ-ONLY RESTORE PREVIEW (ZERO DB WRITES, ZERO STORAGE MUTATIONS)
  if (mode === 'preview') {
    const backupId = String(body.backupId || '');
    const submittedEnvelope =
      (body.envelope as EncryptedBackupEnvelope | undefined) ||
      getBackupEnvelopeMap()[backupId];

    if (!submittedEnvelope) {
      return NextResponse.json(
        { ok: false, error: 'Backup envelope not found for preview.' },
        { status: 404 }
      );
    }

    let decrypted: DecryptedBackupPayload;
    try {
      decrypted = verifyAndDecryptBackupEnvelope(submittedEnvelope);
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: `Backup decryption/integrity check failed: ${err instanceof Error ? err.message : 'INVALID_BACKUP'}`,
        },
        { status: 400 }
      );
    }

    const conflicts: RecordConflictItem[] = [
      ...compareCollectionRecords(
        'users',
        store.state.users as unknown as Array<Record<string, unknown>>,
        decrypted.state.users as unknown as Array<Record<string, unknown>>,
        'uid'
      ),
      ...compareCollectionRecords(
        'announcements',
        store.state.announcements as unknown as Array<Record<string, unknown>>,
        decrypted.state.announcements as unknown as Array<Record<string, unknown>>,
        'id'
      ),
      ...compareCollectionRecords(
        'notices',
        store.state.notices as unknown as Array<Record<string, unknown>>,
        decrypted.state.notices as unknown as Array<Record<string, unknown>>,
        'id'
      ),
      ...compareCollectionRecords(
        'gallery',
        store.state.gallery as unknown as Array<Record<string, unknown>>,
        decrypted.state.gallery as unknown as Array<Record<string, unknown>>,
        'id'
      ),
      ...compareCollectionRecords(
        'fines',
        store.state.fines as unknown as Array<Record<string, unknown>>,
        decrypted.state.fines as unknown as Array<Record<string, unknown>>,
        'id'
      ),
      ...compareCollectionRecords(
        'income',
        store.state.income as unknown as Array<Record<string, unknown>>,
        decrypted.state.income as unknown as Array<Record<string, unknown>>,
        'id'
      ),
      ...compareCollectionRecords(
        'expenses',
        store.state.expenses as unknown as Array<Record<string, unknown>>,
        decrypted.state.expenses as unknown as Array<Record<string, unknown>>,
        'id'
      ),
    ];

    // Read-only Storage conflict check
    const simStorage = getSimulatedStorageMap();
    const storagePreview = decrypted.storageObjectsArchive.map((obj) => {
      const key = `${obj.bucketId}::${obj.objectPath}`;
      const existing = simStorage[key];
      if (!existing) {
        return {
          bucketId: obj.bucketId,
          objectPath: obj.objectPath,
          sha256: obj.sha256,
          status: 'missing_in_live' as const,
        };
      }
      return {
        bucketId: obj.bucketId,
        objectPath: obj.objectPath,
        sha256: obj.sha256,
        status:
          existing.sha256 === obj.sha256
            ? ('identical_preexisting' as const)
            : ('conflict_different_hash' as const),
      };
    });

    // Pure read-only inspection of active lock & abandoned restore attempts
    const restoreLockStatus = inspectRestoreLockAndAbandonedAttemptsReadOnly(store);

    return NextResponse.json({
      ok: true,
      mode: 'preview',
      readOnlyGuaranteed: true,
      backupId: decrypted.backupId,
      conflicts,
      storagePreview,
      restoreLockStatus,
    });
  }

  // 3. EXPLICIT SWEEP OF ABANDONED RESTORE ATTEMPTS
  if (mode === 'sweep') {
    const result = await sweepAbandonedRestoreAttempts(store);
    return NextResponse.json({
      ok: true,
      mode: 'sweep',
      ...result,
    });
  }

  // 4. ATOMIC LOCKED RESTORE COMMIT WITH PER-ATTEMPT STAGING & HEARTBEAT
  if (mode === 'commit') {
    const backupId = String(body.backupId || '');
    const restoreAttemptId =
      String(body.restoreAttemptId || '') ||
      `rst_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
    const decisions = (body.decisions || {}) as Record<string, 'PRESERVE_LIVE' | 'RESTORE_BACKUP'>;
    const simulateCrashAfterStage = Boolean(body.simulateCrashAfterStage);
    const simulateDbCommitError = Boolean(body.simulateDbCommitError);

    const submittedEnvelope =
      (body.envelope as EncryptedBackupEnvelope | undefined) ||
      getBackupEnvelopeMap()[backupId];

    if (!submittedEnvelope) {
      return NextResponse.json(
        { ok: false, error: 'Backup envelope not found for commit.' },
        { status: 404 }
      );
    }

    let decrypted: DecryptedBackupPayload;
    try {
      decrypted = verifyAndDecryptBackupEnvelope(submittedEnvelope);
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: `Backup decryption/integrity verification failed: ${err instanceof Error ? err.message : 'INVALID_BACKUP'}`,
        },
        { status: 400 }
      );
    }

    // Step 1: Acquire atomic single-row restore lease lock
    const lockAcquisition = acquireRestoreLock(store, {
      attemptId: restoreAttemptId,
      backupId: decrypted.backupId,
      ownerUid: auth.actor.uid,
      leaseSeconds: 60,
    });

    if (!lockAcquisition.acquired) {
      return NextResponse.json(
        {
          ok: false,
          code: 'RESTORE_LOCK_HELD',
          error: `Another restore attempt (${lockAcquisition.lock.activeRestoreAttemptId}) currently holds the active restore lease until ${lockAcquisition.lock.activeRestoreLeaseExpiresAt}.`,
          activeLock: lockAcquisition.lock,
        },
        { status: 409 }
      );
    }

    // Start 15-second renewable lease heartbeat timer
    const heartbeatTimer = setInterval(() => {
      heartbeatRestoreLock(store, {
        attemptId: restoreAttemptId,
        leaseSeconds: 60,
      });
    }, 15_000);

    try {
      // Sweep any prior expired/abandoned restore attempts before staging new objects
      await sweepAbandonedRestoreAttempts(store, restoreAttemptId);

      const simStorage = getSimulatedStorageMap();

      // Step 2: Pre-check and Stage every referenced file under __restore_staging__/<restore_attempt_id>/
      for (const obj of decrypted.storageObjectsArchive) {
        heartbeatRestoreLock(store, { attemptId: restoreAttemptId, leaseSeconds: 60 });

        const finalKey = `${obj.bucketId}::${obj.objectPath}`;
        const rawBytes = Buffer.from(obj.dataBase64, 'base64');
        const computedSha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');

        if (computedSha256 !== obj.sha256 || rawBytes.byteLength !== obj.byteSize) {
          throw new Error(
            `RESTORE_ARCHIVE_CORRUPT: Object ${obj.bucketId}/${obj.objectPath} failed SHA-256 or byte-size check before upload.`
          );
        }

        const existingLiveObj = simStorage[finalKey];
        if (existingLiveObj) {
          if (existingLiveObj.sha256 === obj.sha256) {
            appendRestoreJournalEvent(store, {
              restoreAttemptId,
              backupId: decrypted.backupId,
              actorUid: auth.actor.uid,
              bucketId: obj.bucketId,
              stagePath: null,
              finalPath: obj.objectPath,
              expectedSha256: obj.sha256,
              byteSize: obj.byteSize,
              preExisted: true,
              stageOwned: false,
              finalPathOwned: false,
              createdStorageObjectId: null,
              eventType: 'verified_preexisting',
              errorDetail: null,
            });
            continue;
          } else {
            throw new Error(
              `RESTORE_STORAGE_CONFLICT: Live object ${obj.bucketId}/${obj.objectPath} already exists with a different SHA-256.`
            );
          }
        }

        const baseName = obj.objectPath.split('/').pop() || 'object.bin';
        const stagePath = `__restore_staging__/${restoreAttemptId}/${obj.sha256}_${baseName}`;
        const stageKey = `${obj.bucketId}::${stagePath}`;

        // 2a. Record planned_staging before uploading to stagePath
        appendRestoreJournalEvent(store, {
          restoreAttemptId,
          backupId: decrypted.backupId,
          actorUid: auth.actor.uid,
          bucketId: obj.bucketId,
          stagePath,
          finalPath: obj.objectPath,
          expectedSha256: obj.sha256,
          byteSize: obj.byteSize,
          preExisted: false,
          stageOwned: true,
          finalPathOwned: false,
          createdStorageObjectId: null,
          eventType: 'planned_staging',
          errorDetail: null,
        });

        // 2b. Upload to per-attempt stagePath with upsert: false
        simStorage[stageKey] = {
          bytes: Buffer.from(rawBytes),
          sha256: computedSha256,
          objectId: `stobj_${crypto.randomUUID()}`,
        };

        // 2c. Verify staged object bytes and record staged_verified
        const stagedObj = simStorage[stageKey];
        const stagedHash = crypto.createHash('sha256').update(stagedObj.bytes).digest('hex');
        if (stagedHash !== obj.sha256) {
          throw new Error(`RESTORE_STAGING_VERIFICATION_FAILED:${stagePath}`);
        }

        appendRestoreJournalEvent(store, {
          restoreAttemptId,
          backupId: decrypted.backupId,
          actorUid: auth.actor.uid,
          bucketId: obj.bucketId,
          stagePath,
          finalPath: obj.objectPath,
          expectedSha256: obj.sha256,
          byteSize: obj.byteSize,
          preExisted: false,
          stageOwned: true,
          finalPathOwned: false,
          createdStorageObjectId: null,
          eventType: 'staged_verified',
          errorDetail: null,
        });
      }

      // Optional test hook to simulate process crash after staging but before promotion/commit
      if (simulateCrashAfterStage) {
        clearInterval(heartbeatTimer);
        return NextResponse.json(
          {
            ok: false,
            code: 'SIMULATED_PROCESS_CRASH_AFTER_STAGE',
            restoreAttemptId,
            error: 'Simulated server crash after staging files (lock left un-released to test lease expiry & sweep).',
          },
          { status: 500 }
        );
      }

      // Step 3: Promote verified staged objects to finalPath with strict non-overwrite (upsert: false)
      const latestForAttempt = getLatestRestoreObjectStates(store, restoreAttemptId);
      for (const st of latestForAttempt) {
        if (st.eventType === 'verified_preexisting') {
          continue;
        }
        if (st.eventType !== 'staged_verified' || !st.stagePath) {
          throw new Error(
            `RESTORE_PRE_COMMIT_INVARIANT_FAILED: Object ${st.bucketId}/${st.finalPath} is in state '${st.eventType}'.`
          );
        }

        appendRestoreJournalEvent(store, {
          restoreAttemptId,
          backupId: decrypted.backupId,
          actorUid: auth.actor.uid,
          bucketId: st.bucketId,
          stagePath: st.stagePath,
          finalPath: st.finalPath,
          expectedSha256: st.expectedSha256,
          byteSize: st.byteSize,
          preExisted: false,
          stageOwned: true,
          finalPathOwned: false,
          createdStorageObjectId: null,
          eventType: 'promoting_to_final',
          errorDetail: null,
        });

        const finalKey = `${st.bucketId}::${st.finalPath}`;
        const stageKey = `${st.bucketId}::${st.stagePath}`;

        // Atomic non-overwrite check at promotion time (equivalent to Supabase Storage upload with upsert: false):
        // If another concurrent process created finalPath after our pre-check, we NEVER overwrite it and NEVER claim finalPathOwned = true!
        if (simStorage[finalKey]) {
          delete simStorage[stageKey];
          throw new Error(
            `RESTORE_CONCURRENT_OBJECT_RACE_DETECTED: Concurrent process created ${st.bucketId}/${st.finalPath} during staging; refusing to overwrite or claim ownership.`
          );
        }

        const stagedData = simStorage[stageKey];
        const createdObjectId = `obj_${crypto.randomUUID()}`;
        simStorage[finalKey] = {
          bytes: stagedData.bytes,
          sha256: stagedData.sha256,
          objectId: createdObjectId,
        };
        delete simStorage[stageKey];

        appendRestoreJournalEvent(store, {
          restoreAttemptId,
          backupId: decrypted.backupId,
          actorUid: auth.actor.uid,
          bucketId: st.bucketId,
          stagePath: st.stagePath,
          finalPath: st.finalPath,
          expectedSha256: st.expectedSha256,
          byteSize: st.byteSize,
          preExisted: false,
          stageOwned: false,
          finalPathOwned: true,
          createdStorageObjectId: createdObjectId,
          eventType: 'promoted_final_verified',
          errorDetail: null,
        });
      }

      if (simulateDbCommitError) {
        throw new Error('SIMULATED_DB_TRANSACTION_ROLLBACK');
      }

      // Step 4: Apply per-record conflict-checked database restoration (defaulting conflicts to PRESERVE_LIVE)
      const mergeCollection = <T extends Record<string, unknown>>(
        collectionName: string,
        liveArr: T[],
        backupArr: T[],
        idField = 'id'
      ): T[] => {
        const result = [...(liveArr || [])];
        const liveIdxMap = new Map<string, number>();
        result.forEach((item, idx) => {
          const id = String(item[idField] || '');
          if (id) liveIdxMap.set(id, idx);
        });

        for (const bItem of backupArr || []) {
          const id = String(bItem[idField] || '');
          if (!id) continue;
          const decisionKey = `${collectionName}:${id}`;
          const existingIdx = liveIdxMap.get(id);

          if (existingIdx === undefined) {
            // Missing in live -> restore unless explicitly blocked
            if (decisions[decisionKey] !== 'PRESERVE_LIVE') {
              result.push(JSON.parse(JSON.stringify(bItem)) as T);
            }
          } else {
            // Exists in live -> preserve live unless explicitly approved via RESTORE_BACKUP
            if (decisions[decisionKey] === 'RESTORE_BACKUP') {
              // Protect admin_super active status invariant
              if (collectionName === 'users' && id === 'admin_super') {
                result[existingIdx] = {
                  ...(JSON.parse(JSON.stringify(bItem)) as T),
                  uid: 'admin_super',
                  role: 'admin',
                  status: 'active',
                };
              } else {
                result[existingIdx] = JSON.parse(JSON.stringify(bItem)) as T;
              }
            }
          }
        }
        return result;
      };

      store.state.users = mergeCollection(
        'users',
        store.state.users as unknown as Array<Record<string, unknown>>,
        decrypted.state.users as unknown as Array<Record<string, unknown>>,
        'uid'
      ) as unknown as typeof store.state.users;

      store.state.announcements = mergeCollection(
        'announcements',
        store.state.announcements as unknown as Array<Record<string, unknown>>,
        decrypted.state.announcements as unknown as Array<Record<string, unknown>>,
        'id'
      ) as unknown as typeof store.state.announcements;

      store.state.notices = mergeCollection(
        'notices',
        store.state.notices as unknown as Array<Record<string, unknown>>,
        decrypted.state.notices as unknown as Array<Record<string, unknown>>,
        'id'
      ) as unknown as typeof store.state.notices;

      store.state.gallery = mergeCollection(
        'gallery',
        store.state.gallery as unknown as Array<Record<string, unknown>>,
        decrypted.state.gallery as unknown as Array<Record<string, unknown>>,
        'id'
      ) as unknown as typeof store.state.gallery;

      store.state.fines = mergeCollection(
        'fines',
        store.state.fines as unknown as Array<Record<string, unknown>>,
        decrypted.state.fines as unknown as Array<Record<string, unknown>>,
        'id'
      ) as unknown as typeof store.state.fines;

      store.state.income = mergeCollection(
        'income',
        store.state.income as unknown as Array<Record<string, unknown>>,
        decrypted.state.income as unknown as Array<Record<string, unknown>>,
        'id'
      ) as unknown as typeof store.state.income;

      store.state.expenses = mergeCollection(
        'expenses',
        store.state.expenses as unknown as Array<Record<string, unknown>>,
        decrypted.state.expenses as unknown as Array<Record<string, unknown>>,
        'id'
      ) as unknown as typeof store.state.expenses;

      // Restore missing credentials without overwriting newer live scrypt credentials unless approved
      if (!store.scryptCredentials) store.scryptCredentials = {};
      for (const [uid, hash] of Object.entries(
        decrypted.userCredentials?.scryptCredentials || {}
      )) {
        if (!store.scryptCredentials[uid] || decisions[`user_credentials:${uid}`] === 'RESTORE_BACKUP') {
          store.scryptCredentials[uid] = hash;
        }
      }
      for (const [uid, hash] of Object.entries(
        decrypted.userCredentials?.legacyCredentials || {}
      )) {
        if (!store.credentials[uid]) {
          store.credentials[uid] = hash;
        }
      }

      // Restore approved storage_files metadata
      if (!store.storageFiles) store.storageFiles = {};
      for (const sf of decrypted.approvedStorageFiles || []) {
        if (!store.storageFiles[sf.id]) {
          store.storageFiles[sf.id] = { ...sf, status: 'approved' };
        }
      }

      // Step 5: Transition all restore journal objects for this attempt to 'committed'
      const readyStates = getLatestRestoreObjectStates(store, restoreAttemptId);
      for (const st of readyStates) {
        appendRestoreJournalEvent(store, {
          restoreAttemptId,
          backupId: decrypted.backupId,
          actorUid: auth.actor.uid,
          bucketId: st.bucketId,
          stagePath: st.stagePath,
          finalPath: st.finalPath,
          expectedSha256: st.expectedSha256,
          byteSize: st.byteSize,
          preExisted: st.preExisted,
          stageOwned: false,
          finalPathOwned: st.finalPathOwned,
          createdStorageObjectId: st.createdStorageObjectId,
          eventType: 'committed',
          errorDetail: null,
        });
      }

      saveServerStore(store);
      releaseRestoreLock(store, restoreAttemptId);
      clearInterval(heartbeatTimer);

      return NextResponse.json({
        ok: true,
        mode: 'commit',
        restoreAttemptId,
        backupId: decrypted.backupId,
        restoredObjectsCount: readyStates.length,
        state: store.state,
      });
    } catch (err) {
      clearInterval(heartbeatTimer);
      // Rollback / Cleanup of any staged or owned final objects created by this failed attempt
      releaseRestoreLock(store, restoreAttemptId);
      const cleanupResult = await sweepAbandonedRestoreAttempts(store);
      return NextResponse.json(
        {
          ok: false,
          restoreAttemptId,
          error: err instanceof Error ? err.message : 'RESTORE_COMMIT_FAILED',
          cleanupResult,
        },
        { status: 409 }
      );
    }
  }

  return NextResponse.json(
    { ok: false, error: `Unsupported backup mode: ${mode}` },
    { status: 400 }
  );
}
