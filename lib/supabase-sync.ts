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

let sharedBroadcastChannel: ReturnType<typeof supabase.channel> | null = null;

/**
 * Broadcasts an instant update hint over Supabase Realtime Broadcast and same-browser BroadcastChannel
 * so all active client views update in-place without reloading the page.
 */
export async function broadcastPortalUpdate(topic: 'portal' | 'chat' = 'portal'): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel('alnibras_portal_tab_sync');
      bc.postMessage({ topic, at: Date.now() });
      bc.close();
    }
  } catch {
    // Non-fatal
  }

  if (!isSupabaseConfigured() || !sharedBroadcastChannel) return;
  try {
    await sharedBroadcastChannel.send({
      type: 'broadcast',
      event: 'portal_update',
      payload: { topic, at: Date.now() },
    });
  } catch {
    // Non-fatal
  }
}

/**
 * Subscribes to Supabase Realtime postgres_changes across messages, chat_messages, notices,
 * announcements, events, program_results, certificates, gallery, committee_members,
 * appointments, notifications, and portal_settings, plus broadcast notifications.
 */
export function subscribeToSupabaseRealtime(
  onRefresh: (topic?: 'portal' | 'chat') => void
): () => void {
  if (typeof window === 'undefined' || !isSupabaseConfigured()) {
    return () => {};
  }

  const channel = supabase
    .channel('alnibras-portal-realtime')
    .on('broadcast', { event: 'portal_update' }, ({ payload }) => {
      const topic = payload?.topic === 'chat' ? 'chat' : 'portal';
      onRefresh(topic);
    })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages' },
      () => onRefresh('chat')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chat_messages' },
      () => onRefresh('chat')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'appointments' },
      () => onRefresh('portal')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notices' },
      () => onRefresh('portal')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'announcements' },
      () => onRefresh('portal')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'events' },
      () => onRefresh('portal')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'program_results' },
      () => onRefresh('portal')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'certificates' },
      () => onRefresh('portal')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'gallery_items' },
      () => onRefresh('portal')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'committee_members' },
      () => onRefresh('portal')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'direct_messages' },
      () => onRefresh('portal')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      () => onRefresh('portal')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'users' },
      () => onRefresh('portal')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'portal_settings' },
      () => onRefresh('portal')
    )
    .subscribe();

  sharedBroadcastChannel = channel;

  return () => {
    if (sharedBroadcastChannel === channel) {
      sharedBroadcastChannel = null;
    }
    void supabase.removeChannel(channel);
  };
}
