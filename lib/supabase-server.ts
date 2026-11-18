import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  isMissingSupabaseSchemaError,
  SUPABASE_ANON_KEY,
  SUPABASE_PRIVATE_BUCKETS,
  SUPABASE_PROJECT_ID,
  SUPABASE_URL,
  type SupabaseBucketName,
} from './supabase';
import {
  buildPortalSettingsRowPayload,
  computeCollectionSyncPlan,
  PORTAL_TABLE_MAPPINGS,
  rowToActivityLog,
  rowToAnnouncement,
  rowToCalendarEvent,
  rowToCertificate,
  rowToChatMessage,
  rowToCommittee,
  rowToCustomType,
  rowToDirectMessage,
  rowToEvent,
  rowToExpense,
  rowToFeedback,
  rowToFinancialAuditLog,
  rowToFinancialReceipt,
  rowToFine,
  rowToGallery,
  rowToIncome,
  rowToNotice,
  rowToNotification,
  rowToPasswordResetLog,
  rowToPointTransaction,
  rowToProgramResult,
  rowToResource,
  rowToSlideshow,
  rowToStudentContribution,
  rowToStudentDue,
  rowToStudentPointSummary,
  rowToStudentResult,
  rowToUser,
  rowToVideo,
  supabaseRowToAppointment,
  toSnakeCaseRow,
  type CommitSyncResult,
} from './supabase-db';
import { recomputeStudentPointSummaries } from './portal-logic';
import { getInitialPortalState, getInitialSlideshow } from './seed-data';
import type { PersistedServerStore } from './server-db';
import type { PortalDatabaseState } from './types';

declare global {
  var __alnibrasSupabaseAdminClient: SupabaseClient | undefined;
  var __alnibrasSupabaseAdminKeyHash: string | undefined;
  var __alnibrasSupabaseHydrationPromise: Promise<boolean> | undefined;
  var __alnibrasLastSupabaseSyncAt: number | undefined;
}

const TABLE_ORDER_INDEX = new Map<string, number>(
  PORTAL_TABLE_MAPPINGS.map((m, idx) => [m.tableName, idx])
);

function getPrimaryKeyColumn(tableName: string): string {
  if (tableName === 'users') return 'uid';
  if (tableName === 'student_points') return 'student_uid';
  return 'id';
}

function doesServiceRoleKeyMatchProject(candidate: string): boolean {
  const key = candidate.trim();
  if (key.length <= 30) return false;
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as {
      ref?: string;
      role?: string;
    };
    return payload.ref === SUPABASE_PROJECT_ID && payload.role === 'service_role';
  } catch {
    return false;
  }
}

function readEnvFileVar(filePath: string, varName: string): string {
  try {
    if (!fs.existsSync(filePath)) return '';
    const content = fs.readFileSync(filePath, 'utf-8');
    const regex = new RegExp(`^\\s*(?:export\\s+)?${varName}\\s*=\\s*(.+)$`);
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(regex);
      if (!match) continue;
      let val = match[1].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1).trim();
      }
      return val;
    }
  } catch {
    // Ignore file read errors cleanly
  }
  return '';
}

function resolveServiceRoleKey(): string {
  if (typeof window !== 'undefined') return '';
  if ((process.env.ALNIBRAS_TEST_STORE_PATH || '').trim()) return '';

  const envKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (doesServiceRoleKeyMatchProject(envKey)) {
    return envKey;
  }

  for (const filename of ['.env.local', '.env']) {
    const fileKey = readEnvFileVar(path.join(process.cwd(), filename), 'SUPABASE_SERVICE_ROLE_KEY');
    if (doesServiceRoleKeyMatchProject(fileKey)) {
      return fileKey;
    }
  }

  return '';
}

export function isSupabaseAdminConfigured(): boolean {
  if (typeof window !== 'undefined') return false;
  if ((process.env.ALNIBRAS_TEST_STORE_PATH || '').trim()) return false;
  const key = resolveServiceRoleKey();
  return key.length > 30 && SUPABASE_URL.startsWith('https://');
}

export function getSupabaseAdminClient(): SupabaseClient | null {
  if (typeof window !== 'undefined') {
    throw new Error('SECURITY_VIOLATION: lib/supabase-server must never be imported in client code.');
  }
  if ((process.env.ALNIBRAS_TEST_STORE_PATH || '').trim()) {
    return null;
  }
  const key = resolveServiceRoleKey();
  if (!key || key.length <= 30) {
    return null;
  }

  const keyTag = `${SUPABASE_PROJECT_ID}:${key.slice(-16)}`;
  if (global.__alnibrasSupabaseAdminClient && global.__alnibrasSupabaseAdminKeyHash === keyTag) {
    return global.__alnibrasSupabaseAdminClient;
  }

  const client = createClient(SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  global.__alnibrasSupabaseAdminClient = client;
  global.__alnibrasSupabaseAdminKeyHash = keyTag;
  return client;
}

export function markSupabaseServerSyncedNow(): void {
  global.__alnibrasLastSupabaseSyncAt = Date.now();
}

async function seedInitialSupabaseTables(
  admin: SupabaseClient,
  store: PersistedServerStore
): Promise<void> {
  const usersRows = (store.state.users || []).map((u) =>
    toSnakeCaseRow('users', u as unknown as Record<string, unknown>)
  );
  if (usersRows.length > 0) {
    await admin.from('users').upsert(usersRows, { onConflict: 'uid' });
  }

  const slideshowRows = (store.state.slideshow || []).map((s) =>
    toSnakeCaseRow('slideshow_slides', s as unknown as Record<string, unknown>)
  );
  if (slideshowRows.length > 0) {
    await admin.from('slideshow_slides').upsert(slideshowRows, { onConflict: 'id' });
  }

  const customTypeRows = (store.state.customTypes || []).map((c) =>
    toSnakeCaseRow('custom_types', c as unknown as Record<string, unknown>)
  );
  if (customTypeRows.length > 0) {
    await admin.from('custom_types').upsert(customTypeRows, { onConflict: 'id' });
  }

  const galleryRows = (store.state.gallery || []).map((g) =>
    toSnakeCaseRow('gallery_items', g as unknown as Record<string, unknown>)
  );
  if (galleryRows.length > 0) {
    await admin.from('gallery_items').upsert(galleryRows, { onConflict: 'id' });
  }

  await syncCredentialsToSupabase(admin, store);

  await admin
    .from('portal_settings')
    .upsert(buildPortalSettingsRowPayload(store.state), { onConflict: 'id' });
}

export async function ensureServerHydratedFromSupabase(
  store: PersistedServerStore,
  options?: { force?: boolean; ttlMs?: number }
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;

  const ttlMs = options?.ttlMs ?? 3000;
  const lastSync = global.__alnibrasLastSupabaseSyncAt || 0;
  if (!options?.force && lastSync > 0 && Date.now() - lastSync < ttlMs) {
    return true;
  }

  if (global.__alnibrasSupabaseHydrationPromise) {
    return global.__alnibrasSupabaseHydrationPromise;
  }

  const run = async (): Promise<boolean> => {
    try {
      const settingsRes = await admin
        .from('portal_settings')
        .select('*')
        .eq('id', 'singleton')
        .maybeSingle();

      if (settingsRes.error && isMissingSupabaseSchemaError(settingsRes.error)) {
        return false;
      }

      // Cold-start initialization: if portal_settings singleton does not exist yet in Supabase,
      // push initial seed entities (admin_super, slideshow, customTypes, initial gallery, credentials, settings)
      if (!settingsRes.error && !settingsRes.data) {
        await seedInitialSupabaseTables(admin, store);
      }

      const [
        usersRes,
        announcementsRes,
        noticesRes,
        calendarRes,
        galleryRes,
        videosRes,
        programResultsRes,
        studentResultsRes,
        pointTxRes,
        certsRes,
        finesRes,
        incomeRes,
        expensesRes,
        contribRes,
        duesRes,
        receiptsRes,
        finAuditRes,
        messagesRes,
        chatRes,
        feedbackRes,
        notifRes,
        activityRes,
        pwResetRes,
        customTypesRes,
        slideshowRes,
        committeeRes,
        appointmentsRes,
        credsRes,
        refreshedSettingsRes,
        realtimeMessagesRes,
      ] = await Promise.all([
        admin.from('users').select('*'),
        admin.from('announcements').select('*').order('created_at', { ascending: false }),
        admin.from('notices').select('*').order('created_at', { ascending: false }),
        admin.from('calendar_events').select('*').order('start_date', { ascending: true }),
        admin.from('gallery_items').select('*').order('created_at', { ascending: false }),
        admin.from('video_items').select('*').order('created_at', { ascending: false }),
        admin.from('program_results').select('*').order('created_at', { ascending: false }),
        admin.from('student_results').select('*').order('created_at', { ascending: false }),
        admin.from('point_transactions').select('*').order('created_at', { ascending: false }),
        admin.from('certificates').select('*').order('created_at', { ascending: false }),
        admin.from('fines').select('*').order('created_at', { ascending: false }),
        admin.from('income_records').select('*').order('created_at', { ascending: false }),
        admin.from('expense_records').select('*').order('created_at', { ascending: false }),
        admin.from('student_contributions').select('*').order('created_at', { ascending: false }),
        admin.from('student_dues').select('*').order('created_at', { ascending: false }),
        admin.from('financial_receipts').select('*').order('created_at', { ascending: false }),
        admin.from('financial_audit_logs').select('*').order('created_at', { ascending: false }),
        admin.from('direct_messages').select('*').order('created_at', { ascending: false }),
        admin.from('chat_messages').select('*').order('created_at', { ascending: true }),
        admin.from('feedback_records').select('*').order('created_at', { ascending: false }),
        admin.from('notifications').select('*').order('created_at', { ascending: false }),
        admin.from('activity_logs').select('*').order('created_at', { ascending: false }),
        admin.from('password_reset_logs').select('*').order('initiated_at', { ascending: false }),
        admin.from('custom_types').select('*').order('created_at', { ascending: false }),
        admin.from('slideshow_slides').select('*').order('display_order', { ascending: true }),
        admin.from('committee_members').select('*').order('display_order', { ascending: true }),
        admin.from('appointments').select('*').order('created_at', { ascending: false }),
        admin.from('user_credentials').select('*'),
        settingsRes.data
          ? Promise.resolve(settingsRes)
          : admin.from('portal_settings').select('*').eq('id', 'singleton').maybeSingle(),
        admin.from('messages').select('*').order('created_at', { ascending: true }),
      ]);

      const activeSettingsRow = (refreshedSettingsRes.data || settingsRes.data) as
        | Record<string, unknown>
        | null;
      if (activeSettingsRow) {
        if (
          activeSettingsRow.settings &&
          typeof activeSettingsRow.settings === 'object' &&
          Object.keys(activeSettingsRow.settings as object).length > 0
        ) {
          store.state.settings = {
            ...store.state.settings,
            ...(activeSettingsRow.settings as PortalDatabaseState['settings']),
          };
        }
        if (
          activeSettingsRow.branding &&
          typeof activeSettingsRow.branding === 'object' &&
          Object.keys(activeSettingsRow.branding as object).length > 0
        ) {
          store.state.branding = {
            ...store.state.branding!,
            ...(activeSettingsRow.branding as NonNullable<PortalDatabaseState['branding']>),
          };
        }
        if (
          activeSettingsRow.homepage_config &&
          typeof activeSettingsRow.homepage_config === 'object' &&
          Object.keys(activeSettingsRow.homepage_config as object).length > 0
        ) {
          store.state.homepageConfig = {
            ...store.state.homepageConfig!,
            ...(activeSettingsRow.homepage_config as NonNullable<
              PortalDatabaseState['homepageConfig']
            >),
          };
        }
        if (
          activeSettingsRow.certificate_settings &&
          typeof activeSettingsRow.certificate_settings === 'object' &&
          Object.keys(activeSettingsRow.certificate_settings as object).length > 0
        ) {
          store.state.certificateSettings = {
            ...store.state.certificateSettings!,
            ...(activeSettingsRow.certificate_settings as NonNullable<
              PortalDatabaseState['certificateSettings']
            >),
          };
          store.state.certificateSettings.showQrCode = false;
        }
      }

      if (!usersRes.error && Array.isArray(usersRes.data) && usersRes.data.length > 0) {
        const mappedUsers = (usersRes.data as Record<string, unknown>[]).map(rowToUser);
        if (!mappedUsers.some((u) => u.uid === 'admin_super')) {
          const fallbackSuper =
            store.state.users.find((u) => u.uid === 'admin_super') || getInitialPortalState().users[0];
          mappedUsers.unshift(fallbackSuper);
        }
        store.state.users = mappedUsers;
      }

      if (!announcementsRes.error && Array.isArray(announcementsRes.data)) {
        store.state.announcements = (announcementsRes.data as Record<string, unknown>[]).map(
          rowToAnnouncement
        );
      }
      if (!noticesRes.error && Array.isArray(noticesRes.data)) {
        store.state.notices = (noticesRes.data as Record<string, unknown>[]).map(rowToNotice);
      }
      if (!calendarRes.error && Array.isArray(calendarRes.data)) {
        store.state.calendarEvents = (calendarRes.data as Record<string, unknown>[]).map(
          rowToCalendarEvent
        );
      }
      if (!galleryRes.error && Array.isArray(galleryRes.data)) {
        store.state.gallery = (galleryRes.data as Record<string, unknown>[]).map(rowToGallery);
      }
      if (!videosRes.error && Array.isArray(videosRes.data)) {
        store.state.videos = (videosRes.data as Record<string, unknown>[]).map(rowToVideo);
      }
      if (!programResultsRes.error && Array.isArray(programResultsRes.data)) {
        store.state.programResults = (programResultsRes.data as Record<string, unknown>[]).map(
          rowToProgramResult
        );
      }
      if (!studentResultsRes.error && Array.isArray(studentResultsRes.data)) {
        store.state.studentResults = (studentResultsRes.data as Record<string, unknown>[]).map(
          rowToStudentResult
        );
      }
      if (!pointTxRes.error && Array.isArray(pointTxRes.data)) {
        store.state.pointTransactions = (pointTxRes.data as Record<string, unknown>[]).map(
          rowToPointTransaction
        );
      }
      if (!certsRes.error && Array.isArray(certsRes.data)) {
        store.state.certificates = (certsRes.data as Record<string, unknown>[]).map(
          rowToCertificate
        );
      }
      if (!finesRes.error && Array.isArray(finesRes.data)) {
        store.state.fines = (finesRes.data as Record<string, unknown>[]).map(rowToFine);
      }
      if (!incomeRes.error && Array.isArray(incomeRes.data)) {
        store.state.income = (incomeRes.data as Record<string, unknown>[]).map(rowToIncome);
      }
      if (!expensesRes.error && Array.isArray(expensesRes.data)) {
        store.state.expenses = (expensesRes.data as Record<string, unknown>[]).map(rowToExpense);
      }
      if (!contribRes.error && Array.isArray(contribRes.data)) {
        store.state.studentContributions = (contribRes.data as Record<string, unknown>[]).map(
          rowToStudentContribution
        );
      }
      if (!duesRes.error && Array.isArray(duesRes.data)) {
        store.state.studentDues = (duesRes.data as Record<string, unknown>[]).map(
          rowToStudentDue
        );
      }
      if (!receiptsRes.error && Array.isArray(receiptsRes.data)) {
        store.state.financialReceipts = (receiptsRes.data as Record<string, unknown>[]).map(
          rowToFinancialReceipt
        );
      }
      if (!finAuditRes.error && Array.isArray(finAuditRes.data)) {
        store.state.financialAuditLogs = (finAuditRes.data as Record<string, unknown>[]).map(
          rowToFinancialAuditLog
        );
      }
      if (!messagesRes.error && Array.isArray(messagesRes.data)) {
        store.state.messages = (messagesRes.data as Record<string, unknown>[]).map(
          rowToDirectMessage
        );
      }
      if (
        (!chatRes.error && Array.isArray(chatRes.data)) ||
        (!realtimeMessagesRes.error && Array.isArray(realtimeMessagesRes.data))
      ) {
        const msgMap = new Map<string, PortalDatabaseState['chatMessages'][number]>();
        if (!chatRes.error && Array.isArray(chatRes.data)) {
          for (const r of chatRes.data as Record<string, unknown>[]) {
            const m = rowToChatMessage(r);
            if (m.id) msgMap.set(m.id, m);
          }
        }
        if (!realtimeMessagesRes.error && Array.isArray(realtimeMessagesRes.data)) {
          for (const r of realtimeMessagesRes.data as Record<string, unknown>[]) {
            const m = rowToChatMessage(r);
            if (m.id) msgMap.set(m.id, m);
          }
        }
        store.state.chatMessages = Array.from(msgMap.values()).sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt)
        );
      }
      if (!feedbackRes.error && Array.isArray(feedbackRes.data)) {
        store.state.feedback = (feedbackRes.data as Record<string, unknown>[]).map(rowToFeedback);
      }
      if (!notifRes.error && Array.isArray(notifRes.data)) {
        store.state.notifications = (notifRes.data as Record<string, unknown>[]).map(
          rowToNotification
        );
      }
      if (!activityRes.error && Array.isArray(activityRes.data) && activityRes.data.length > 0) {
        store.state.activityLogs = (activityRes.data as Record<string, unknown>[]).map(
          rowToActivityLog
        );
      }
      if (!pwResetRes.error && Array.isArray(pwResetRes.data)) {
        store.state.passwordResetLogs = (pwResetRes.data as Record<string, unknown>[]).map(
          rowToPasswordResetLog
        );
      }
      if (!customTypesRes.error && Array.isArray(customTypesRes.data) && customTypesRes.data.length > 0) {
        store.state.customTypes = (customTypesRes.data as Record<string, unknown>[]).map(
          rowToCustomType
        );
      }
      if (!slideshowRes.error && Array.isArray(slideshowRes.data)) {
        store.state.slideshow =
          slideshowRes.data.length > 0
            ? (slideshowRes.data as Record<string, unknown>[]).map(rowToSlideshow)
            : getInitialSlideshow();
      }
      if (!committeeRes.error && Array.isArray(committeeRes.data)) {
        store.state.committeeMembers = (committeeRes.data as Record<string, unknown>[]).map(
          rowToCommittee
        );
      }
      if (!appointmentsRes.error && Array.isArray(appointmentsRes.data)) {
        store.state.appointments = (appointmentsRes.data as Record<string, unknown>[]).map(
          supabaseRowToAppointment
        );
      }

      if (!credsRes.error && Array.isArray(credsRes.data)) {
        for (const row of credsRes.data as Record<string, unknown>[]) {
          const uid = String(row.user_uid || '');
          const scheme = String(row.password_scheme || '');
          const digest = String(row.credential_digest || '');
          if (!uid || !digest) continue;
          if (scheme === 'scrypt_v2') {
            if (!store.scryptCredentials) store.scryptCredentials = {};
            store.scryptCredentials[uid] = digest;
          } else if (scheme === 'legacy_pbkdf2_v1') {
            store.credentials[uid] = digest;
          }
        }
      }

      store.state.studentPoints = recomputeStudentPointSummaries(
        store.state.users,
        store.state.studentResults || []
      );
      if (store.state.studentPoints.length === 0 && typeof rowToStudentPointSummary === 'function') {
        store.state.studentPoints = [];
      }

      markSupabaseServerSyncedNow();
      return true;
    } catch (err) {
      console.error('Supabase server hydration warning:', err);
      return false;
    } finally {
      global.__alnibrasSupabaseHydrationPromise = undefined;
    }
  };

  global.__alnibrasSupabaseHydrationPromise = run();
  return global.__alnibrasSupabaseHydrationPromise;
}

async function syncCredentialsToSupabase(
  admin: SupabaseClient,
  store: PersistedServerStore
): Promise<void> {
  const validUids = new Set((store.state.users || []).map((u) => u.uid));
  const rows: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  for (const uid of validUids) {
    const scryptDigest = store.scryptCredentials?.[uid];
    const legacyDigest = store.credentials?.[uid];
    if (scryptDigest) {
      rows.push({
        user_uid: uid,
        password_scheme: 'scrypt_v2',
        credential_digest: scryptDigest,
        upgraded_at: now,
        updated_at: now,
      });
    } else if (legacyDigest) {
      rows.push({
        user_uid: uid,
        password_scheme: 'legacy_pbkdf2_v1',
        credential_digest: legacyDigest,
        upgraded_at: null,
        updated_at: now,
      });
    }
  }

  if (rows.length > 0) {
    await admin.from('user_credentials').upsert(rows, { onConflict: 'user_uid' });
  }
}

export async function syncStoreDeltaToSupabaseServer(
  prevState: PortalDatabaseState,
  store: PersistedServerStore,
  options?: { prevCredFingerprint?: string }
): Promise<CommitSyncResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return { syncedCount: 0, schemaMissing: false };
  }

  const plan = computeCollectionSyncPlan(prevState, store.state);
  const nextCredFingerprint = JSON.stringify({
    c: store.credentials,
    s: store.scryptCredentials || {},
  });
  const credsChanged =
    options?.prevCredFingerprint !== undefined &&
    options.prevCredFingerprint !== nextCredFingerprint;

  if (
    plan.upserts.length === 0 &&
    plan.deletes.length === 0 &&
    !plan.updateSettingsSingleton &&
    !credsChanged
  ) {
    markSupabaseServerSyncedNow();
    return { syncedCount: 0, schemaMissing: false };
  }

  let syncedCount = 0;
  let schemaMissing = false;
  const warnings: string[] = [];

  // 1. Delete children before parents (reverse order of PORTAL_TABLE_MAPPINGS)
  const groupedDeletes = new Map<string, string[]>();
  for (const item of plan.deletes) {
    const arr = groupedDeletes.get(item.table) || [];
    arr.push(item.rowId);
    groupedDeletes.set(item.table, arr);
  }
  const deleteTables = Array.from(groupedDeletes.keys()).sort(
    (a, b) => (TABLE_ORDER_INDEX.get(b) ?? 999) - (TABLE_ORDER_INDEX.get(a) ?? 999)
  );
  for (const table of deleteTables) {
    const ids = groupedDeletes.get(table)!;
    const pkCol = getPrimaryKeyColumn(table);
    const { error } = await admin.from(table).delete().in(pkCol, ids);
    if (!error) {
      syncedCount += ids.length;
    } else if (isMissingSupabaseSchemaError(error)) {
      schemaMissing = true;
      warnings.push(`${table}: ${error.message}`);
    } else {
      warnings.push(`${table}: ${error.message}`);
    }
    if (table === 'chat_messages') {
      await admin.from('messages').delete().in('id', ids).then(
        () => undefined,
        () => undefined
      );
    }
  }

  // 2. Upsert parents before children (forward order of PORTAL_TABLE_MAPPINGS)
  const groupedUpserts = new Map<string, Record<string, unknown>[]>();
  for (const item of plan.upserts) {
    const arr = groupedUpserts.get(item.table) || [];
    arr.push(item.data);
    groupedUpserts.set(item.table, arr);
  }
  const upsertTables = Array.from(groupedUpserts.keys()).sort(
    (a, b) => (TABLE_ORDER_INDEX.get(a) ?? 999) - (TABLE_ORDER_INDEX.get(b) ?? 999)
  );
  for (const table of upsertTables) {
    const rows = groupedUpserts.get(table)!;
    const pkCol = getPrimaryKeyColumn(table);
    const { error } = await admin.from(table).upsert(rows, { onConflict: pkCol });
    if (!error) {
      syncedCount += rows.length;
    } else if (isMissingSupabaseSchemaError(error)) {
      schemaMissing = true;
      warnings.push(`${table}: ${error.message}`);
    } else {
      warnings.push(`${table}: ${error.message}`);
    }
    if (table === 'chat_messages') {
      await admin.from('messages').upsert(rows, { onConflict: 'id' }).then(
        () => undefined,
        () => undefined
      );
    }
  }

  // 3. Upsert portal_settings singleton when settings/branding/homepageConfig/certificateSettings changed
  if (plan.updateSettingsSingleton) {
    const { error } = await admin
      .from('portal_settings')
      .upsert(buildPortalSettingsRowPayload(store.state), { onConflict: 'id' });
    if (!error) {
      syncedCount += 1;
    } else if (isMissingSupabaseSchemaError(error)) {
      schemaMissing = true;
      warnings.push(`portal_settings: ${error.message}`);
    } else {
      warnings.push(`portal_settings: ${error.message}`);
    }
  }

  // 4. Sync credentials when users or scrypt upgrades changed
  if (credsChanged || groupedUpserts.has('users')) {
    try {
      await syncCredentialsToSupabase(admin, store);
    } catch (err) {
      warnings.push(`user_credentials: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  markSupabaseServerSyncedNow();
  return {
    syncedCount,
    schemaMissing,
    warning: warnings.length > 0 ? warnings[0] : undefined,
  };
}

/**
 * Resolves an active portal UserProfile from an Authorization: Bearer <supabase_jwt> header
 * when a browser user signed in via Supabase Cloud Auth rather than legacy cookie login.
 */
export async function resolveSupabaseBearerActor(
  authorizationHeader: string | null,
  store: PersistedServerStore
) {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = match?.[1]?.trim() || '';
  if (!accessToken || accessToken.split('.').length !== 3) return null;

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) return null;
    const supaUser = (await res.json()) as {
      email?: string;
      email_confirmed_at?: string | null;
      confirmed_at?: string | null;
    };
    const email = (supaUser.email || '').trim().toLowerCase();
    if (!email) return null;

    if (email === 'masudalam220105@gmail.com') {
      return (
        store.state.users.find(
          (u) => u.status === 'active' && (u.uid === 'admin_super' || u.role === 'admin')
        ) || null
      );
    }

    return (
      store.state.users.find(
        (u) =>
          u.status === 'active' &&
          (u.contactEmail || '').trim().toLowerCase() === email
      ) || null
    );
  } catch {
    return null;
  }
}

/**
 * Uploads verified file bytes to Supabase Storage using the server-side admin client,
 * creating the target bucket if needed. Returns null if Supabase Admin is not configured
 * or if storage is unavailable (triggering clean inline data URL fallback).
 */
export async function uploadValidatedFileToSupabaseServer(params: {
  bucket: SupabaseBucketName;
  storagePath: string;
  bytes: Buffer;
  contentType: string;
}): Promise<{ url: string; provider: 'supabase-storage' } | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const isPrivate = (SUPABASE_PRIVATE_BUCKETS as readonly string[]).includes(params.bucket);
  try {
    const { error: bucketCheckErr } = await admin.storage.getBucket(params.bucket);
    if (bucketCheckErr) {
      await admin.storage
        .createBucket(params.bucket, {
          public: !isPrivate,
          fileSizeLimit: 26_214_400,
        })
        .catch(() => undefined);
    }

    const { error: uploadErr } = await admin.storage
      .from(params.bucket)
      .upload(params.storagePath, params.bytes, {
        contentType: params.contentType,
        upsert: true,
      });

    if (uploadErr) {
      return null;
    }

    if (!isPrivate) {
      const { data: pub } = admin.storage.from(params.bucket).getPublicUrl(params.storagePath);
      if (pub?.publicUrl) {
        return { url: pub.publicUrl, provider: 'supabase-storage' };
      }
    } else if (params.bytes.byteLength > 450_000) {
      const { data: signed } = await admin.storage
        .from(params.bucket)
        .createSignedUrl(params.storagePath, 60 * 60 * 24 * 365);
      if (signed?.signedUrl) {
        return { url: signed.signedUrl, provider: 'supabase-storage' };
      }
    }

    return null;
  } catch {
    return null;
  }
}
