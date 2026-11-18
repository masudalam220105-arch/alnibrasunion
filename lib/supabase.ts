import { createClient, type AuthChangeEvent, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';

export const SUPABASE_PROJECT_ID = 'ehxpegiusizkbmzdtcir';
const DEFAULT_SUPABASE_URL = 'https://ehxpegiusizkbmzdtcir.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_Fkq9LJe_7-ufJaDU0pKiIQ_a7WrJAWi';

const envUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const envAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const envMatchesRequestedProject = envUrl.includes(SUPABASE_PROJECT_ID) && envAnonKey.length > 20;

export const SUPABASE_URL = envMatchesRequestedProject ? envUrl : DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = envMatchesRequestedProject ? envAnonKey : DEFAULT_SUPABASE_ANON_KEY;
export const SUPER_ADMIN_EMAIL = 'masudalam220105@gmail.com';

export type SupabaseUser = User;
export type SupabaseSession = Session;

const isBrowser = typeof window !== 'undefined';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: isBrowser,
    autoRefreshToken: isBrowser,
    detectSessionInUrl: isBrowser,
  },
});

export function isSupabaseConfigured(): boolean {
  return (
    SUPABASE_URL.startsWith('https://') &&
    SUPABASE_URL.includes('.supabase.co') &&
    SUPABASE_ANON_KEY.length > 20
  );
}

/**
 * Exact 31 normalized portal tables matching every entity in PortalDatabaseState (lib/types.ts).
 */
export const SUPABASE_TABLES = [
  'users',
  'committee_members',
  'slideshow_slides',
  'notices',
  'announcements',
  'events',
  'calendar_events',
  'gallery_items',
  'video_items',
  'study_resources',
  'program_results',
  'student_results',
  'student_points',
  'point_transactions',
  'certificates',
  'fines',
  'income_records',
  'expense_records',
  'student_contributions',
  'student_dues',
  'financial_receipts',
  'financial_audit_logs',
  'direct_messages',
  'chat_messages',
  'feedback_records',
  'notifications',
  'activity_logs',
  'password_reset_logs',
  'custom_types',
  'portal_settings',
  'appointments',
] as const;

export type SupabaseTableName = (typeof SUPABASE_TABLES)[number];

export const SUPABASE_PUBLIC_BUCKETS = [
  'public-gallery',
  'videos',
  'official-branding',
  'slideshow',
] as const;

export const SUPABASE_PRIVATE_BUCKETS = [
  'user-gallery',
  'certificates',
  'study-materials',
  'documents',
] as const;

export const SUPABASE_REQUIRED_BUCKETS = [
  'public-gallery',
  'user-gallery',
  'videos',
  'certificates',
  'study-materials',
  'official-branding',
  'slideshow',
  'documents',
] as const;

export const SUPABASE_SERVER_INFRA_BUCKETS = [
  'quarantine-uploads',
  'portal-backups',
] as const;

export const SUPABASE_ALL_BUCKETS = [
  ...SUPABASE_REQUIRED_BUCKETS,
  ...SUPABASE_SERVER_INFRA_BUCKETS,
] as const;

export type SupabaseBucketName = (typeof SUPABASE_REQUIRED_BUCKETS)[number];
export type SupabaseServerInfraBucketName = (typeof SUPABASE_SERVER_INFRA_BUCKETS)[number];
export type SupabaseAnyBucketName = (typeof SUPABASE_ALL_BUCKETS)[number];

export interface SupabaseDiagnostics {
  configured: boolean;
  projectId: string;
  url: string;
  reachable: boolean;
  schemaReady: boolean;
  storageBuckets: string[];
  checkedAt: string;
  detail?: string;
}

/**
 * Detects Supabase PostgREST PGRST205 / PostgreSQL 42P01 ("table not found") errors
 * so UI components can distinguish uninitialized database tables from network/permission faults.
 */
export function isMissingSupabaseSchemaError(err: unknown): boolean {
  if (!err) return false;
  const obj = typeof err === 'object' ? (err as Record<string, unknown>) : null;
  const code = typeof obj?.code === 'string' ? obj.code : '';
  const message =
    err instanceof Error
      ? err.message
      : typeof obj?.message === 'string'
      ? obj.message
      : String(err);

  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /could not find the table/i.test(message) ||
    /relation ["']?public\.[a-z0-9_]+["']? does not exist/i.test(message)
  );
}

export function formatSupabaseUiError(err: unknown): string {
  const rawMessage =
    err instanceof Error
      ? err.message
      : err && typeof err === 'object' && typeof (err as Record<string, unknown>).message === 'string'
      ? String((err as Record<string, unknown>).message)
      : String(err || 'Unexpected Supabase error.');

  if (isMissingSupabaseSchemaError(err)) {
    return (
      'Supabase database tables have not been created yet in project ehxpegiusizkbmzdtcir (PGRST205). ' +
      'Run lib/supabase-schema.sql in your Supabase Dashboard SQL Editor to enable PostgreSQL table storage.'
    );
  }
  if (/invalid login credentials/i.test(rawMessage)) {
    return 'Incorrect email or password. Please verify your registered Supabase Auth credentials.';
  }
  if (/email not confirmed/i.test(rawMessage)) {
    return 'Email address is not verified yet. Please confirm the verification link sent to your inbox.';
  }
  if (/row-level security/i.test(rawMessage) || /permission denied/i.test(rawMessage)) {
    return 'Supabase Row Level Security (RLS) blocked this action. Sign in with an authorized Admin or Student account.';
  }
  return rawMessage || 'Could not complete Supabase operation.';
}

export async function testSupabaseConnection(): Promise<SupabaseDiagnostics> {
  const checkedAt = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      projectId: SUPABASE_PROJECT_ID,
      url: SUPABASE_URL,
      reachable: false,
      schemaReady: false,
      storageBuckets: [...SUPABASE_REQUIRED_BUCKETS],
      checkedAt,
      detail: 'Missing Supabase URL or publishable key.',
    };
  }

  try {
    const { error } = await supabase.from('appointments').select('id').limit(1);
    if (!error) {
      return {
        configured: true,
        projectId: SUPABASE_PROJECT_ID,
        url: SUPABASE_URL,
        reachable: true,
        schemaReady: true,
        storageBuckets: [...SUPABASE_REQUIRED_BUCKETS],
        checkedAt,
      };
    }

    if (isMissingSupabaseSchemaError(error)) {
      return {
        configured: true,
        projectId: SUPABASE_PROJECT_ID,
        url: SUPABASE_URL,
        reachable: true,
        schemaReady: false,
        storageBuckets: [...SUPABASE_REQUIRED_BUCKETS],
        checkedAt,
        detail: error.message,
      };
    }

    return {
      configured: true,
      projectId: SUPABASE_PROJECT_ID,
      url: SUPABASE_URL,
      reachable: true,
      schemaReady: true,
      storageBuckets: [...SUPABASE_REQUIRED_BUCKETS],
      checkedAt,
      detail: error.message,
    };
  } catch (err) {
    return {
      configured: true,
      projectId: SUPABASE_PROJECT_ID,
      url: SUPABASE_URL,
      reachable: false,
      schemaReady: false,
      storageBuckets: [...SUPABASE_REQUIRED_BUCKETS],
      checkedAt,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getCurrentSupabaseSession(): Promise<Session | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session ?? null;
  } catch {
    return null;
  }
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  const session = await getCurrentSupabaseSession();
  return session?.access_token ?? null;
}

export async function signInWithSupabaseGoogle(): Promise<{ error?: string }> {
  if (typeof window === 'undefined') {
    return { error: 'Google sign-in is only available in the browser.' };
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });
  if (error) {
    return { error: formatSupabaseUiError(error) };
  }
  return {};
}

export async function signInWithSupabaseEmail(
  email: string,
  password: string
): Promise<{ user: User | null; session: Session | null; error?: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) {
    return { user: null, session: null, error: formatSupabaseUiError(error) };
  }
  return {
    user: data.user ?? null,
    session: data.session ?? null,
  };
}

export async function provisionStudentSupabaseAccount(params: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ ok: boolean; uid?: string; error?: string }> {
  const cleanEmail = params.email.trim().toLowerCase();
  if (!cleanEmail || !params.password || params.password.length < 6) {
    return { ok: false, error: 'Valid email and password (min 6 chars) required.' };
  }
  try {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: params.password,
      options: {
        data: {
          full_name: params.displayName || '',
        },
      },
    });
    if (error) {
      return { ok: false, error: formatSupabaseUiError(error) };
    }
    return { ok: true, uid: data.user?.id };
  } catch (err) {
    return { ok: false, error: formatSupabaseUiError(err) };
  }
}

export async function sendSupabasePasswordReset(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
  });
  if (error) {
    return { ok: false, error: formatSupabaseUiError(error) };
  }
  return { ok: true };
}

export async function signOutSupabaseUser(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // Non-fatal
  }
}

export function onSupabaseAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(callback);
  return () => {
    subscription.unsubscribe();
  };
}
