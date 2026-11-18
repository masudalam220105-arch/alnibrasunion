import { isSupabaseConfigured, supabase } from './supabase';
import {
  commitSyncPlanToSupabase,
  computeCollectionSyncPlan,
} from './supabase-db';
import type { PortalDatabaseState } from './types';

/**
 * Computes the diff between previous and next PortalDatabaseState snapshots and commits
 * changes to normalized Supabase PostgreSQL tables when tables & session permissions are active.
 */
export async function syncPortalMutationToSupabase(
  prevState: PortalDatabaseState,
  nextState: PortalDatabaseState
): Promise<{ syncedCount: number; schemaMissing: boolean; warning?: string }> {
  if (!isSupabaseConfigured()) {
    return { syncedCount: 0, schemaMissing: false };
  }
  const plan = computeCollectionSyncPlan(prevState, nextState);
  if (
    plan.upserts.length === 0 &&
    plan.deletes.length === 0 &&
    !plan.updateSettingsSingleton
  ) {
    return { syncedCount: 0, schemaMissing: false };
  }
  return commitSyncPlanToSupabase(plan, nextState);
}

/**
 * Subscribes to Supabase Realtime postgres_changes across appointments, notices, announcements,
 * events, and portal_settings. Fails safely if tables or realtime are not yet enabled.
 */
export function subscribeToSupabaseRealtime(onRefresh: () => void): () => void {
  if (typeof window === 'undefined' || !isSupabaseConfigured()) {
    return () => {};
  }

  const channel = supabase
    .channel('alnibras-portal-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'appointments' },
      () => onRefresh()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notices' },
      () => onRefresh()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'announcements' },
      () => onRefresh()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'events' },
      () => onRefresh()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'committee_members' },
      () => onRefresh()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'direct_messages' },
      () => onRefresh()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chat_messages' },
      () => onRefresh()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'portal_settings' },
      () => onRefresh()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
