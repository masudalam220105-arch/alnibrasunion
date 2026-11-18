import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { loadServerStore } from '@/lib/server-db';
import { resolveAuthenticatedActor } from '@/lib/session-auth';
import {
  ensureServerHydratedFromSupabase,
  isSupabaseAdminConfigured,
  resolveSupabaseBearerActor,
} from '@/lib/supabase-server';
import { runSupabaseRlsDiagnostics } from '@/lib/supabase-rls-diagnostic';

export const runtime = 'nodejs';

function readSchemaSqlFile(): string | undefined {
  try {
    const schemaPath = path.join(process.cwd(), 'lib', 'supabase-schema.sql');
    if (fs.existsSync(schemaPath)) {
      return fs.readFileSync(schemaPath, 'utf-8');
    }
  } catch {
    // Non-fatal if SQL file is unavailable in stripped runtime
  }
  return undefined;
}

async function authorizeAdminDiagnostic(req: NextRequest) {
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
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: auth.error || 'Authentication required for RLS diagnostics.' },
        { status: auth.statusCode || 401 }
      ),
    };
  }

  if (auth.actor.role !== 'admin') {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: 'Forbidden: Only SUPER ADMIN can run Supabase RLS diagnostics.' },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const };
}

export async function GET(req: NextRequest) {
  const gate = await authorizeAdminDiagnostic(req);
  if (!gate.ok) return gate.response;

  const report = await runSupabaseRlsDiagnostics({
    schemaSql: readSchemaSqlFile(),
  });
  return NextResponse.json(report);
}

export async function POST(req: NextRequest) {
  const gate = await authorizeAdminDiagnostic(req);
  if (!gate.ok) return gate.response;

  const report = await runSupabaseRlsDiagnostics({
    schemaSql: readSchemaSqlFile(),
  });
  return NextResponse.json(report);
}
