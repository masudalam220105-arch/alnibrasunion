import { SUPABASE_ANON_KEY, SUPABASE_PROJECT_ID, SUPABASE_URL } from './supabase';

export type RlsEnforcementStatus =
  | 'ENFORCED'
  | 'ALIASED_NORMALIZED'
  | 'VULNERABLE_UNRESTRICTED'
  | 'TABLE_NOT_FOUND'
  | 'ERROR';

export interface RlsOperationCheckResult {
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  allowed: boolean;
  httpStatus: number;
  pgCode?: string;
  rowCount?: number;
  detail: string;
}

export interface RlsTableDiagnostic {
  table: string;
  canonicalAlias?: string;
  aliasTargets?: string[];
  status: RlsEnforcementStatus;
  summary: string;
  checks: RlsOperationCheckResult[];
}

export interface SchemaSqlTableAudit {
  table: string;
  rlsEnabled: boolean;
  policyCount: number;
  hasWideOpenWritePolicy: boolean;
  policyNames: string[];
}

export interface SchemaSqlAuditReport {
  checkedTables: SchemaSqlTableAudit[];
  allTablesHaveRlsEnabled: boolean;
  allTablesHavePolicies: boolean;
  wideOpenWriteTables: string[];
}

export interface RlsDiagnosticReport {
  ok: boolean;
  projectId: string;
  supabaseUrl: string;
  checkedAt: string;
  overallStatus: 'PASS' | 'WARN' | 'FAIL';
  requestedTargets: RlsTableDiagnostic[];
  normalizedTables: RlsTableDiagnostic[];
  schemaAudit?: SchemaSqlAuditReport;
}

export const REQUESTED_RLS_TARGET_ALIASES: Record<string, string[]> = {
  profiles: ['users'],
  appointments: ['appointments'],
  portal_data: ['portal_settings', 'portal_server_store'],
};

export const NORMALIZED_SENSITIVE_TABLES = [
  'users',
  'appointments',
  'portal_settings',
  'portal_server_store',
  'user_credentials',
  'fines',
  'student_dues',
  'financial_receipts',
  'direct_messages',
  'feedback_records',
  'chat_messages',
] as const;

export type ProbeFetchFn = (input: string, init?: RequestInit) => Promise<Response>;

interface TableProbeExpectation {
  allowPublicSelect: boolean;
  invalidInsertPayload: Record<string, unknown>;
}

function getTableProbeExpectation(table: string): TableProbeExpectation {
  if (table === 'appointments') {
    return {
      allowPublicSelect: false,
      // Policy `appointments_insert_public` strictly requires status = 'pending'.
      // Sending status = 'confirmed' proves RLS WITH CHECK blocks privileged/unauthorized inserts cleanly without creating rows.
      invalidInsertPayload: {
        id: '__rls_probe_appt__',
        full_name: 'RLS Diagnostic Probe',
        email: 'rls-probe@example.com',
        phone: '9999999999',
        department: 'Diagnostic',
        preferred_date: '2026-12-31',
        preferred_time: '10:00',
        purpose: 'RLS Verification',
        status: 'confirmed',
      },
    };
  }
  if (table === 'portal_settings') {
    return {
      allowPublicSelect: true,
      invalidInsertPayload: { id: '__rls_probe_settings__', settings: {} },
    };
  }
  if (table === 'users' || table === 'profiles') {
    return {
      allowPublicSelect: false,
      invalidInsertPayload: {
        uid: '__rls_probe_user__',
        full_name: 'RLS Probe',
        username: '__rls_probe_user__',
        role: 'admin',
      },
    };
  }
  if (table === 'portal_data' || table === 'portal_server_store') {
    return {
      allowPublicSelect: false,
      invalidInsertPayload: {
        id: '__rls_probe_store__',
        state_json: {},
      },
    };
  }
  return {
    allowPublicSelect: false,
    invalidInsertPayload: { id: '__rls_probe__' },
  };
}

async function parsePostgrestResponse(res: Response): Promise<{
  pgCode?: string;
  message?: string;
  rows?: unknown[];
  contentRangeTotal?: number | null;
}> {
  const contentRange = res.headers.get('content-range') || '';
  let contentRangeTotal: number | null = null;
  const crMatch = contentRange.match(/\/(\d+|\*)$/);
  if (crMatch && crMatch[1] !== '*') {
    contentRangeTotal = Number(crMatch[1]);
  }

  let text = '';
  try {
    text = await res.text();
  } catch {
    return { contentRangeTotal };
  }

  if (!text.trim()) {
    return { contentRangeTotal };
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return { rows: parsed, contentRangeTotal };
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      return {
        pgCode: typeof obj.code === 'string' ? obj.code : undefined,
        message: typeof obj.message === 'string' ? obj.message : text,
        contentRangeTotal,
      };
    }
  } catch {
    return { message: text.slice(0, 220), contentRangeTotal };
  }

  return { contentRangeTotal };
}

function isMissingRelationResponse(httpStatus: number, pgCode?: string, message?: string): boolean {
  return (
    httpStatus === 404 ||
    pgCode === 'PGRST205' ||
    pgCode === '42P01' ||
    Boolean(message && (/could not find the table/i.test(message) || /does not exist/i.test(message)))
  );
}

function isPermissionDeniedResponse(httpStatus: number, pgCode?: string, message?: string): boolean {
  return (
    httpStatus === 401 ||
    httpStatus === 403 ||
    pgCode === '42501' ||
    pgCode === 'PGRST301' ||
    Boolean(
      message &&
        (/row-level security/i.test(message) ||
          /permission denied/i.test(message) ||
          /violates row-level security policy/i.test(message))
    )
  );
}

export function evaluateTableProbeResults(
  table: string,
  checks: RlsOperationCheckResult[],
  options?: { allowPublicSelect?: boolean; tableMissing?: boolean }
): { status: RlsEnforcementStatus; summary: string } {
  if (options?.tableMissing) {
    return {
      status: 'TABLE_NOT_FOUND',
      summary: `Table "${table}" is not present in Supabase schema.`,
    };
  }

  const vulnerabilities: string[] = [];
  for (const chk of checks) {
    if (chk.operation === 'SELECT') {
      if (chk.allowed && !options?.allowPublicSelect && (chk.rowCount ?? 0) > 0) {
        vulnerabilities.push(`Unauthorized anon SELECT returned ${chk.rowCount} row(s)`);
      }
    } else if (chk.operation === 'INSERT') {
      if (chk.allowed) {
        vulnerabilities.push(`Unauthorized anon INSERT succeeded (HTTP ${chk.httpStatus})`);
      }
    } else if (chk.operation === 'UPDATE' || chk.operation === 'DELETE') {
      if (chk.allowed && (chk.rowCount ?? 0) > 0) {
        vulnerabilities.push(`Unauthorized anon ${chk.operation} affected ${chk.rowCount} row(s)`);
      }
    }
  }

  if (vulnerabilities.length > 0) {
    return {
      status: 'VULNERABLE_UNRESTRICTED',
      summary: vulnerabilities.join('; '),
    };
  }

  return {
    status: 'ENFORCED',
    summary: options?.allowPublicSelect
      ? `RLS enforced on "${table}": public read allowed; all unauthorized writes restricted.`
      : `RLS enforced on "${table}": unauthorized SELECT/INSERT/UPDATE/DELETE restricted for anon callers.`,
  };
}

async function probeSingleTableRls(
  table: string,
  supabaseUrl: string,
  anonKey: string,
  fetchFn: ProbeFetchFn
): Promise<RlsTableDiagnostic> {
  const baseUrl = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${encodeURIComponent(table)}`;
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
  };
  const exp = getTableProbeExpectation(table);
  const checks: RlsOperationCheckResult[] = [];

  try {
    // 1. Unauthorized anon SELECT probe
    const selectRes = await fetchFn(`${baseUrl}?select=*&limit=1`, {
      method: 'GET',
      headers,
    });
    const selectBody = await parsePostgrestResponse(selectRes);
    if (isMissingRelationResponse(selectRes.status, selectBody.pgCode, selectBody.message)) {
      return {
        table,
        status: 'TABLE_NOT_FOUND',
        summary: `Table "${table}" does not exist in Supabase PostgREST schema (${selectBody.pgCode || selectRes.status}).`,
        checks: [
          {
            operation: 'SELECT',
            allowed: false,
            httpStatus: selectRes.status,
            pgCode: selectBody.pgCode,
            detail: selectBody.message || 'Table not found in schema.',
          },
        ],
      };
    }

    const selectRows = Array.isArray(selectBody.rows) ? selectBody.rows.length : 0;
    const selectBlocked =
      isPermissionDeniedResponse(selectRes.status, selectBody.pgCode, selectBody.message) ||
      (selectRes.ok && !exp.allowPublicSelect && selectRows === 0);

    checks.push({
      operation: 'SELECT',
      allowed: selectRes.ok && (exp.allowPublicSelect || selectRows > 0),
      httpStatus: selectRes.status,
      pgCode: selectBody.pgCode,
      rowCount: selectRows,
      detail: selectRes.ok
        ? selectRows === 0
          ? 'Returned 0 rows to unauthenticated anon client.'
          : exp.allowPublicSelect
          ? `Public settings SELECT returned ${selectRows} non-secret row(s).`
          : `EXPOSED: Unauthenticated anon SELECT returned ${selectRows} row(s).`
        : selectBlocked
        ? `Blocked (${selectBody.pgCode || selectRes.status}).`
        : selectBody.message || `HTTP ${selectRes.status}`,
    });

    // 2. Unauthorized anon INSERT probe (using invalid/restricted payload so RLS WITH CHECK blocks cleanly)
    const insertRes = await fetchFn(baseUrl, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(exp.invalidInsertPayload),
    });
    const insertBody = await parsePostgrestResponse(insertRes);
    const insertDenied =
      isPermissionDeniedResponse(insertRes.status, insertBody.pgCode, insertBody.message) ||
      !insertRes.ok;

    checks.push({
      operation: 'INSERT',
      allowed: insertRes.ok,
      httpStatus: insertRes.status,
      pgCode: insertBody.pgCode,
      rowCount: Array.isArray(insertBody.rows) ? insertBody.rows.length : 0,
      detail: insertDenied
        ? `Blocked unauthorized INSERT (${insertBody.pgCode || insertRes.status}).`
        : 'VULNERABLE: Unauthenticated anon INSERT succeeded.',
    });

    // 3. Unauthorized anon UPDATE probe (scoped to nonexistent probe key, Prefer return=representation)
    const keyCol = table === 'users' ? 'uid' : 'id';
    const updateRes = await fetchFn(
      `${baseUrl}?${keyCol}=eq.__rls_probe_nonexistent__`,
      {
        method: 'PATCH',
        headers: {
          ...headers,
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ updated_at: new Date().toISOString() }),
      }
    );
    const updateBody = await parsePostgrestResponse(updateRes);
    const updatedRows = Array.isArray(updateBody.rows) ? updateBody.rows.length : 0;
    const updateDenied =
      isPermissionDeniedResponse(updateRes.status, updateBody.pgCode, updateBody.message) ||
      !updateRes.ok ||
      updatedRows === 0;

    checks.push({
      operation: 'UPDATE',
      allowed: updateRes.ok && updatedRows > 0,
      httpStatus: updateRes.status,
      pgCode: updateBody.pgCode,
      rowCount: updatedRows,
      detail: updateDenied
        ? `Restricted (${updateBody.pgCode || updateRes.status}, 0 rows modified).`
        : `VULNERABLE: Modified ${updatedRows} row(s).`,
    });

    // 4. Unauthorized anon DELETE probe
    const deleteRes = await fetchFn(
      `${baseUrl}?${keyCol}=eq.__rls_probe_nonexistent__`,
      {
        method: 'DELETE',
        headers: {
          ...headers,
          Prefer: 'return=representation',
        },
      }
    );
    const deleteBody = await parsePostgrestResponse(deleteRes);
    const deletedRows = Array.isArray(deleteBody.rows) ? deleteBody.rows.length : 0;
    const deleteDenied =
      isPermissionDeniedResponse(deleteRes.status, deleteBody.pgCode, deleteBody.message) ||
      !deleteRes.ok ||
      deletedRows === 0;

    checks.push({
      operation: 'DELETE',
      allowed: deleteRes.ok && deletedRows > 0,
      httpStatus: deleteRes.status,
      pgCode: deleteBody.pgCode,
      rowCount: deletedRows,
      detail: deleteDenied
        ? `Restricted (${deleteBody.pgCode || deleteRes.status}, 0 rows deleted).`
        : `VULNERABLE: Deleted ${deletedRows} row(s).`,
    });

    const evaluated = evaluateTableProbeResults(table, checks, {
      allowPublicSelect: exp.allowPublicSelect,
    });

    return {
      table,
      status: evaluated.status,
      summary: evaluated.summary,
      checks,
    };
  } catch (err) {
    return {
      table,
      status: 'ERROR',
      summary: err instanceof Error ? err.message : 'Probe network error.',
      checks,
    };
  }
}

/**
 * Static audit of lib/supabase-schema.sql confirming ALTER TABLE ... ENABLE ROW LEVEL SECURITY
 * and restrictive CREATE POLICY declarations on core portal tables.
 */
export function auditSchemaSqlRlsPolicies(
  sqlText: string,
  tables: readonly string[] = NORMALIZED_SENSITIVE_TABLES
): SchemaSqlAuditReport {
  const checkedTables: SchemaSqlTableAudit[] = tables.map((table) => {
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rlsRegex = new RegExp(
      `ALTER\\s+TABLE\\s+(?:public\\.)?${escaped}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      'i'
    );
    const rlsEnabled = rlsRegex.test(sqlText);

    const policyBlockRegex = new RegExp(
      `CREATE\\s+POLICY\\s+"([^"]+)"\\s+ON\\s+(?:public\\.)?${escaped}\\b([\\s\\S]*?);`,
      'gi'
    );
    const policyNames: string[] = [];
    let hasWideOpenWritePolicy = false;
    let match: RegExpExecArray | null;
    while ((match = policyBlockRegex.exec(sqlText)) !== null) {
      policyNames.push(match[1]);
      const body = match[2] || '';
      const isWrite = /\bFOR\s+(ALL|INSERT|UPDATE|DELETE)\b/i.test(body);
      const isTrueExpr = /USING\s*\(\s*TRUE\s*\)/i.test(body) || /WITH\s+CHECK\s*\(\s*TRUE\s*\)/i.test(body);
      if (isWrite && isTrueExpr) {
        hasWideOpenWritePolicy = true;
      }
    }

    return {
      table,
      rlsEnabled,
      policyCount: policyNames.length,
      hasWideOpenWritePolicy,
      policyNames,
    };
  });

  return {
    checkedTables,
    allTablesHaveRlsEnabled: checkedTables.every((t) => t.rlsEnabled),
    allTablesHavePolicies: checkedTables.every((t) => t.policyCount > 0),
    wideOpenWriteTables: checkedTables.filter((t) => t.hasWideOpenWritePolicy).map((t) => t.table),
  };
}

/**
 * Verifies RLS policies for 'profiles', 'appointments', 'portal_data' (mapping cleanly to
 * the project's normalized tables 'users', 'appointments', 'portal_settings', 'portal_server_store'
 * when standalone legacy names aren't present) plus sensitive normalized tables.
 * Uses ONLY the unauthenticated/anon key so RLS cannot be bypassed by service_role.
 */
export async function runSupabaseRlsDiagnostics(options?: {
  supabaseUrl?: string;
  anonKey?: string;
  fetchImpl?: ProbeFetchFn;
  schemaSql?: string;
  extraTables?: readonly string[];
}): Promise<RlsDiagnosticReport> {
  const supabaseUrl = (options?.supabaseUrl || SUPABASE_URL).trim();
  const anonKey = (options?.anonKey || SUPABASE_ANON_KEY).trim();
  const fetchFn: ProbeFetchFn = options?.fetchImpl || fetch;
  const checkedAt = new Date().toISOString();

  const tablesToProbe = Array.from(
    new Set([
      ...Object.keys(REQUESTED_RLS_TARGET_ALIASES),
      ...NORMALIZED_SENSITIVE_TABLES,
      ...(options?.extraTables || []),
    ])
  );

  const probeMap = new Map<string, RlsTableDiagnostic>();
  for (const tbl of tablesToProbe) {
    probeMap.set(tbl, await probeSingleTableRls(tbl, supabaseUrl, anonKey, fetchFn));
  }

  const normalizedTables = NORMALIZED_SENSITIVE_TABLES.map((tbl) => probeMap.get(tbl)!);

  const requestedTargets: RlsTableDiagnostic[] = Object.entries(REQUESTED_RLS_TARGET_ALIASES).map(
    ([targetName, aliasTables]) => {
      const direct = probeMap.get(targetName)!;
      if (direct.status !== 'TABLE_NOT_FOUND') {
        return direct;
      }

      const aliasDiagnostics = aliasTables
        .map((a) => probeMap.get(a))
        .filter((d): d is RlsTableDiagnostic => Boolean(d));

      const anyVulnerable = aliasDiagnostics.some((d) => d.status === 'VULNERABLE_UNRESTRICTED');
      const anyError = aliasDiagnostics.some((d) => d.status === 'ERROR');
      const allMissing = aliasDiagnostics.every((d) => d.status === 'TABLE_NOT_FOUND');

      if (anyVulnerable) {
        return {
          ...direct,
          canonicalAlias: aliasTables.join(' + '),
          aliasTargets: aliasTables,
          status: 'VULNERABLE_UNRESTRICTED',
          summary: `Mapped normalized table(s) (${aliasTables.join(', ')}) failed RLS enforcement: ${aliasDiagnostics
            .filter((d) => d.status === 'VULNERABLE_UNRESTRICTED')
            .map((d) => d.summary)
            .join('; ')}`,
          checks: aliasDiagnostics.flatMap((d) => d.checks),
        };
      }

      if (allMissing) {
        return {
          ...direct,
          canonicalAlias: aliasTables.join(' + '),
          aliasTargets: aliasTables,
          status: 'TABLE_NOT_FOUND',
          summary: `Neither "${targetName}" nor normalized table(s) (${aliasTables.join(', ')}) exist yet in Supabase. Run lib/supabase-schema.sql in SQL Editor.`,
        };
      }

      if (anyError) {
        return {
          ...direct,
          canonicalAlias: aliasTables.join(' + '),
          aliasTargets: aliasTables,
          status: 'ERROR',
          summary: `Error probing normalized table(s) (${aliasTables.join(', ')}).`,
          checks: aliasDiagnostics.flatMap((d) => d.checks),
        };
      }

      return {
        ...direct,
        canonicalAlias: aliasTables.join(' + '),
        aliasTargets: aliasTables,
        status: 'ALIASED_NORMALIZED',
        summary: `Verified via normalized table(s) ${aliasTables.join(' & ')}: RLS policies enforced and unauthorized anon writes/reads blocked.`,
        checks: aliasDiagnostics.flatMap((d) => d.checks),
      };
    }
  );

  const schemaAudit = options?.schemaSql
    ? auditSchemaSqlRlsPolicies(options.schemaSql, NORMALIZED_SENSITIVE_TABLES)
    : undefined;

  const hasVulnerability =
    requestedTargets.some((t) => t.status === 'VULNERABLE_UNRESTRICTED') ||
    normalizedTables.some((t) => t.status === 'VULNERABLE_UNRESTRICTED') ||
    Boolean(schemaAudit && schemaAudit.wideOpenWriteTables.length > 0);

  const hasMissingOrError =
    requestedTargets.some((t) => t.status === 'TABLE_NOT_FOUND' || t.status === 'ERROR') ||
    normalizedTables.some((t) => t.status === 'TABLE_NOT_FOUND' || t.status === 'ERROR') ||
    Boolean(schemaAudit && (!schemaAudit.allTablesHaveRlsEnabled || !schemaAudit.allTablesHavePolicies));

  const overallStatus: 'PASS' | 'WARN' | 'FAIL' = hasVulnerability
    ? 'FAIL'
    : hasMissingOrError
    ? 'WARN'
    : 'PASS';

  return {
    ok: !hasVulnerability,
    projectId: SUPABASE_PROJECT_ID,
    supabaseUrl,
    checkedAt,
    overallStatus,
    requestedTargets,
    normalizedTables,
    schemaAudit,
  };
}
