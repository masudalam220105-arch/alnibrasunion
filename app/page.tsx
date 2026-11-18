'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  formatSupabaseUiError,
  getCurrentSupabaseSession,
  onSupabaseAuthStateChange,
  provisionStudentSupabaseAccount,
  signInWithSupabaseEmail,
  signInWithSupabaseGoogle,
  signOutSupabaseUser,
  SUPER_ADMIN_EMAIL,
  testSupabaseConnection,
  type SupabaseUser,
} from '@/lib/supabase';
import {
  isSupabaseAdminUser,
  loadPortalStateFromSupabase,
  resolveMatchedPortalUser,
  submitAppointmentToSupabase,
  submitPublicContactToSupabase,
  type AppointmentSubmitInput,
  type AppointmentSubmitResult,
} from '@/lib/supabase-db';
import {
  broadcastPortalUpdate,
  subscribeToSupabaseRealtime,
  syncPortalMutationToSupabase,
} from '@/lib/supabase-sync';
import { applyPortalMutation } from '@/lib/portal-mutations';
import { getInitialPortalState } from '@/lib/seed-data';
import { PublicHomePage } from '@/components/PublicHomePage';
import { LoginModal } from '@/components/LoginModal';
import { AdminPanel } from '@/components/AdminPanel';
import { StudentPanel } from '@/components/StudentPanel';
import type { PortalDatabaseState, UserProfile } from '@/lib/types';
import { CheckCircle2, AlertCircle, X, Cloud, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ALNIBRAS_EASE } from '@/components/MotionPrimitives';

interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error';
}

export default function AlNibrasPortalApp() {
  const [portalState, setPortalState] = useState<PortalDatabaseState>(getInitialPortalState);
  const [publicTotals, setPublicTotals] = useState<{
    totalStudentsCount: number;
    publicTotalIncome: number;
    publicTotalExpenses: number;
  }>({
    totalStudentsCount: 0,
    publicTotalIncome: 0,
    publicTotalExpenses: 0,
  });
  const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);
  const [legacyUser, setLegacyUser] = useState<UserProfile | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [authMode, setAuthMode] = useState<'none' | 'supabase' | 'legacy'>('none');
  const [viewMode, setViewMode] = useState<'public' | 'portal'>('public');
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const authModeRef = useRef(authMode);
  const currentUserUidRef = useRef<string | null>(currentUserUid);
  const supabaseUserRef = useRef<SupabaseUser | null>(null);
  const serverVersionRef = useRef<number>(1);
  const isRefreshingRef = useRef<boolean>(false);

  useEffect(() => {
    authModeRef.current = authMode;
  }, [authMode]);

  useEffect(() => {
    currentUserUidRef.current = currentUserUid;
  }, [currentUserUid]);

  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-1), { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const hydrateFromSupabase = useCallback(
    async (supaUser: SupabaseUser | null, switchToPortalIfMatched = false) => {
      try {
        const result = await loadPortalStateFromSupabase(supaUser);
        setPortalState(result.state);
        setPublicTotals(result.publicTotals);

        if (supaUser) {
          const isAdmin = await isSupabaseAdminUser(supaUser);
          const isVerified = Boolean(supaUser.email_confirmed_at || supaUser.confirmed_at);

          if (!isAdmin && supaUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL && !isVerified) {
            await signOutSupabaseUser();
            if (authModeRef.current !== 'legacy') {
              setCurrentUserUid(null);
              setAuthMode('none');
              setViewMode('public');
            }
            if (switchToPortalIfMatched) {
              showToast(
                'Admin email is not verified yet in Supabase Auth. Please use Google Sign-In or verify your email link.',
                'error'
              );
            }
            return;
          }

          const matched = await resolveMatchedPortalUser(supaUser, result.state.users, isAdmin);
          if (matched) {
            setCurrentUserUid(matched.uid);
            setLegacyUser(null);
            setAuthMode('supabase');
            if (switchToPortalIfMatched) {
              setViewMode('portal');
            }
          } else if (authModeRef.current !== 'legacy') {
            setCurrentUserUid(null);
            setAuthMode('none');
          }
        } else if (authModeRef.current !== 'legacy') {
          setCurrentUserUid(null);
          setAuthMode('none');
        }
      } catch (err) {
        console.error('Supabase hydration failed:', err);
      }
    },
    [showToast]
  );

  const refreshPortalSilently = useCallback(
    async (forceFullFetch = true) => {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      try {
        if (authModeRef.current === 'supabase' && supabaseUserRef.current) {
          await hydrateFromSupabase(supabaseUserRef.current, false);
          return;
        }

        if (!forceFullFetch) {
          const verRes = await fetch('/api/portal?versionOnly=1', { cache: 'no-store' });
          if (verRes.ok) {
            const verData = (await verRes.json()) as { ok?: boolean; version?: number };
            if (verData.ok && typeof verData.version === 'number') {
              if (verData.version === serverVersionRef.current) {
                return;
              }
              serverVersionRef.current = verData.version;
            }
          }
        }

        const actorParam = currentUserUidRef.current
          ? `?actorUid=${encodeURIComponent(currentUserUidRef.current)}`
          : '';
        const res = await fetch(`/api/portal${actorParam}`, { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as {
            ok?: boolean;
            version?: number;
            user?: UserProfile | null;
            state?: PortalDatabaseState;
          };
          if (data.ok && data.state) {
            if (typeof data.version === 'number') {
              serverVersionRef.current = data.version;
            }
            setPortalState(data.state);
            setPublicTotals({
              totalStudentsCount: (data.state.users || []).filter(
                (u) => u.role === 'student' && u.status === 'active'
              ).length,
              publicTotalIncome: (data.state.income || []).reduce(
                (sum, item) => sum + (Number(item.amount) || 0),
                0
              ),
              publicTotalExpenses: (data.state.expenses || []).reduce(
                (sum, item) => sum + (Number(item.amount) || 0),
                0
              ),
            });
            if (data.user && authModeRef.current === 'legacy') {
              setLegacyUser(data.user);
            }
          }
        }
      } catch {
        // Silent background sync — keep current UI state intact
      } finally {
        isRefreshingRef.current = false;
      }
    },
    [hydrateFromSupabase]
  );

  useEffect(() => {
    void testSupabaseConnection();

    void getCurrentSupabaseSession().then((session) => {
      const user = session?.user ?? null;
      supabaseUserRef.current = user;
      setSupabaseUser(user);
      if (user) {
        void hydrateFromSupabase(user, true);
      } else {
        void refreshPortalSilently(true);
      }
    });

    const unsubAuth = onSupabaseAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null;
      supabaseUserRef.current = nextUser;
      setSupabaseUser(nextUser);

      if (nextUser && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        void hydrateFromSupabase(nextUser, event === 'SIGNED_IN');
      } else if (!nextUser && authModeRef.current === 'supabase') {
        setCurrentUserUid(null);
        setAuthMode('none');
        setViewMode('public');
        void hydrateFromSupabase(null, false);
      }
    });

    const unsubRealtime = subscribeToSupabaseRealtime(() => {
      void refreshPortalSilently(true);
    });

    // Server-Sent Events (SSE) for zero-reload automatic updates across all clients
    let eventSource: EventSource | null = null;
    if (typeof window !== 'undefined' && 'EventSource' in window) {
      eventSource = new EventSource('/api/portal/events');
      eventSource.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data) as { type?: string; version?: number };
          if (parsed.type === 'update') {
            if (
              typeof parsed.version === 'number' &&
              parsed.version === serverVersionRef.current
            ) {
              return;
            }
            void refreshPortalSilently(true);
          } else if (parsed.type === 'ready' && typeof parsed.version === 'number') {
            if (serverVersionRef.current !== 1 && parsed.version !== serverVersionRef.current) {
              void refreshPortalSilently(true);
            }
            serverVersionRef.current = parsed.version;
          }
        } catch {
          // Ignore malformed keepalive/event frame
        }
      };
    }

    // Same-browser cross-tab BroadcastChannel listener
    let tabChannel: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      tabChannel = new BroadcastChannel('alnibras_portal_tab_sync');
      tabChannel.onmessage = () => {
        void refreshPortalSilently(true);
      };
    }

    const handleVisibilityOrFocus = () => {
      if (!document.hidden) {
        void refreshPortalSilently(false);
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    const versionPollTimer = window.setInterval(() => {
      if (!document.hidden) {
        void refreshPortalSilently(false);
      }
    }, 12000);

    return () => {
      unsubAuth();
      unsubRealtime();
      eventSource?.close();
      tabChannel?.close();
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.clearInterval(versionPollTimer);
    };
  }, [hydrateFromSupabase, refreshPortalSilently]);

  const currentUser: UserProfile | null =
    authMode === 'legacy' && legacyUser
      ? portalState.users.find((u) => u.uid === legacyUser.uid) || legacyUser
      : currentUserUid
      ? portalState.users.find((u) => u.uid === currentUserUid) || null
      : null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (currentUser?.uid) {
        window.localStorage.setItem('alnibras_active_session_uid_v1', currentUser.uid);
      } else {
        window.localStorage.removeItem('alnibras_active_session_uid_v1');
      }
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }, [currentUser?.uid]);

  const handleLoginSubmit = async (
    username: string,
    password: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'LOGIN',
          username,
          password,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        user?: UserProfile;
        state?: PortalDatabaseState;
      };

      if (!data.ok || !data.user) {
        return { ok: false, error: data.error || 'Invalid username or password.' };
      }

      if (data.user.contactEmail && data.user.role !== 'admin') {
        await signInWithSupabaseEmail(data.user.contactEmail, password).catch(() => undefined);
      }

      if (data.state) {
        setPortalState(data.state);
      }
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('alnibras_active_session_uid_v1', data.user.uid);
        } catch {
          // Ignore storage error
        }
      }
      setLegacyUser(data.user);
      setCurrentUserUid(data.user.uid);
      setAuthMode(supabaseUserRef.current ? 'supabase' : 'legacy');
      setLoginModalOpen(false);
      setViewMode('portal');
      showToast(`Signed in as ${data.user.fullName}`, 'success');
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error during authentication.' };
    }
  };

  const handleGoogleLogin = async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await signInWithSupabaseGoogle();
      if (res.error) {
        return { ok: false, error: res.error };
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: formatSupabaseUiError(err),
      };
    }
  };

  const handleEmailPasswordLogin = async (
    email: string,
    password: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { user, error } = await signInWithSupabaseEmail(email, password);
      if (error || !user) {
        return { ok: false, error: error || 'Supabase Email/Password sign-in failed.' };
      }

      const isAdmin = await isSupabaseAdminUser(user);
      const loaded = await loadPortalStateFromSupabase(user);
      const matched = await resolveMatchedPortalUser(user, loaded.state.users, isAdmin);

      if (!matched) {
        await signOutSupabaseUser();
        return {
          ok: false,
          error:
            'Account authenticated with Supabase, but no active Al-Nibras student or faculty profile is linked to this email.',
        };
      }

      supabaseUserRef.current = user;
      setSupabaseUser(user);
      setPortalState(loaded.state);
      setPublicTotals(loaded.publicTotals);
      setCurrentUserUid(matched.uid);
      setLegacyUser(null);
      setAuthMode('supabase');
      setLoginModalOpen(false);
      setViewMode('portal');
      showToast(`Signed in to Supabase as ${matched.fullName}`, 'success');
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: formatSupabaseUiError(err),
      };
    }
  };

  const handleLogout = async () => {
    await signOutSupabaseUser();
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('alnibras_active_session_uid_v1');
      } catch {
        // Ignore storage error
      }
    }
    supabaseUserRef.current = null;
    setSupabaseUser(null);
    setLegacyUser(null);
    setCurrentUserUid(null);
    setAuthMode('none');
    setCloudSyncStatus('idle');
    setViewMode('public');
    showToast('You have been logged out securely', 'success');
  };

  const handleMutate = async (
    payload: Record<string, unknown>
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser) {
      return { ok: false, error: 'Not authenticated' };
    }

    const previousState = portalState;
    setCloudSyncStatus('syncing');

    try {
      const res = await fetch('/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          actorUid: currentUser.uid,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        version?: number;
        state?: PortalDatabaseState;
        syncedToSupabase?: boolean;
        syncWarning?: string;
      };

      if (!data.ok) {
        setCloudSyncStatus('idle');
        return { ok: false, error: data.error || 'Operation failed' };
      }

      if (typeof data.version === 'number') {
        serverVersionRef.current = data.version;
      }

      if (data.state) {
        setPortalState(data.state);
        setPublicTotals({
          totalStudentsCount: (data.state.users || []).filter(
            (u) => u.role === 'student' && u.status === 'active'
          ).length,
          publicTotalIncome: (data.state.income || []).reduce(
            (sum, item) => sum + (Number(item.amount) || 0),
            0
          ),
          publicTotalExpenses: (data.state.expenses || []).reduce(
            (sum, item) => sum + (Number(item.amount) || 0),
            0
          ),
        });
      }

      if (
        payload.action === 'CREATE_STUDENT' &&
        typeof payload.contactEmail === 'string' &&
        payload.contactEmail.includes('@') &&
        typeof payload.password === 'string' &&
        payload.password.length >= 6
      ) {
        await provisionStudentSupabaseAccount({
          email: payload.contactEmail,
          password: payload.password,
          displayName: String(payload.fullName || ''),
        }).catch(() => undefined);
      }

      if (data.syncWarning) {
        setCloudSyncStatus('error');
        showToast(data.syncWarning, 'error');
      } else if (data.syncedToSupabase) {
        setCloudSyncStatus('synced');
      } else if (supabaseUser && data.state) {
        const clientSync = await syncPortalMutationToSupabase(previousState, data.state).catch(
          () => ({ syncedCount: 0, schemaMissing: false, warning: undefined })
        );
        if (clientSync.warning) {
          setCloudSyncStatus('error');
          showToast(clientSync.warning, 'error');
        } else {
          setCloudSyncStatus(clientSync.syncedCount > 0 ? 'synced' : 'idle');
        }
      } else {
        setCloudSyncStatus('idle');
      }

      const actionStr = String(payload.action || '');
      void broadcastPortalUpdate(actionStr.includes('CHAT') ? 'chat' : 'portal');

      return { ok: true };
    } catch (networkErr) {
      // Offline / API fallback when direct Supabase user session is active
      if (supabaseUser) {
        const mutationResult = applyPortalMutation(previousState, payload, currentUser);
        if (!mutationResult.ok || !mutationResult.state) {
          setCloudSyncStatus('idle');
          return { ok: false, error: mutationResult.error || 'Operation rejected' };
        }
        const nextState = mutationResult.state;
        setPortalState(nextState);
        try {
          const syncResult = await syncPortalMutationToSupabase(previousState, nextState);
          if (syncResult.warning) {
            setCloudSyncStatus('error');
            showToast(syncResult.warning, 'error');
          } else {
            setCloudSyncStatus('synced');
          }
          return { ok: true };
        } catch (err) {
          setPortalState(previousState);
          setCloudSyncStatus('error');
          const msg = formatSupabaseUiError(err);
          showToast(msg, 'error');
          return { ok: false, error: msg };
        }
      }
      setCloudSyncStatus('error');
      return {
        ok: false,
        error: networkErr instanceof Error ? networkErr.message : 'Network error while saving changes.',
      };
    }
  };

  const handleBookAppointment = async (
    payload: AppointmentSubmitInput
  ): Promise<AppointmentSubmitResult> => {
    const result = await submitAppointmentToSupabase({
      ...payload,
      studentUid: currentUser?.uid,
    });
    if (result.ok && result.appointment) {
      setPortalState((prev) => ({
        ...prev,
        appointments: [result.appointment!, ...(prev.appointments || [])],
      }));
      if (result.savedToSupabase) {
        showToast('Appointment booked and saved to Supabase database.', 'success');
      } else {
        showToast(
          'Appointment request saved locally. Run lib/supabase-schema.sql in Supabase SQL Editor to sync remote tables.',
          'success'
        );
      }
    }
    return result;
  };

  const handlePublicContact = async (payload: {
    senderName: string;
    senderEmail: string;
    subject: string;
    body: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await submitPublicContactToSupabase(payload);
      if (!res.ok) {
        return { ok: false, error: res.error || 'Could not submit inquiry to Supabase.' };
      }
      showToast('Message delivered to the Al-Nibras Union Office (Supabase)', 'success');
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not submit inquiry to Supabase.',
      };
    }
  };

  const totalStudentsCount =
    publicTotals.totalStudentsCount ||
    portalState.users.filter((u) => u.role === 'student').length ||
    (portalState.studentPoints ? portalState.studentPoints.length : 0);

  return (
    <div className="min-h-screen relative bg-[#F8FAF7] dark:bg-[#071713] text-[#17221F] dark:text-[#F0F5F2] transition-colors">
      {/* Subtle Supabase Sync Status Pill (when in Portal view) */}
      <AnimatePresence>
        {viewMode === 'portal' && cloudSyncStatus !== 'idle' && (
          <motion.div
            key="cloud-sync-pill"
            initial={{ opacity: 0, y: 12, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.94 }}
            transition={{ duration: 0.22, ease: ALNIBRAS_EASE }}
            aria-live="polite"
            data-testid="cloud-sync-status"
            className={`fixed bottom-5 left-5 z-50 flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold border shadow-md backdrop-blur-md ${
              cloudSyncStatus === 'syncing'
                ? 'bg-white/95 dark:bg-[#0D231D]/95 text-[#064E3B] dark:text-[#D4AF37] border-[#D4AF37]/40'
                : cloudSyncStatus === 'synced'
                ? 'bg-[#064E3B] text-white border-[#D4AF37]/50'
                : 'bg-red-950 text-white border-red-400'
            }`}
          >
            {cloudSyncStatus === 'syncing' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving to Supabase...</span>
              </>
            ) : cloudSyncStatus === 'synced' ? (
              <>
                <Cloud className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Saved to Supabase</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-red-300" />
                <span>Supabase Sync Error</span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification Stack */}
      <div
        aria-live="polite"
        className="fixed bottom-20 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              transition={{ duration: 0.22, ease: ALNIBRAS_EASE }}
              className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl shadow-lg border text-xs font-medium ${
                toast.type === 'success'
                  ? 'bg-[#064E3B] text-white border-[#D4AF37]'
                  : 'bg-red-950 text-white border-red-400'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {toast.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
                )}
                <span>{toast.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                aria-label="Dismiss notification"
                className="text-white/70 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Main View Switcher with Smooth Page Transitions */}
      <AnimatePresence mode="wait" initial={false}>
        {viewMode === 'portal' && currentUser ? (
          <motion.div
            key={currentUser.role === 'admin' ? 'portal-admin' : 'portal-student'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: ALNIBRAS_EASE }}
          >
            {currentUser.role === 'admin' ? (
              <AdminPanel
                currentUser={currentUser}
                state={portalState}
                onMutate={handleMutate}
                onLogout={handleLogout}
                onSwitchToPublic={() => setViewMode('public')}
                onRealtimeSync={() => void refreshPortalSilently(true)}
                showToast={showToast}
              />
            ) : (
              <StudentPanel
                currentUser={currentUser}
                state={portalState}
                onMutate={handleMutate}
                onLogout={handleLogout}
                onSwitchToPublic={() => setViewMode('public')}
                onRealtimeSync={() => void refreshPortalSilently(true)}
                showToast={showToast}
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="public-home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: ALNIBRAS_EASE }}
          >
            <PublicHomePage
              settings={portalState.settings}
              branding={portalState.branding}
              homepageConfig={portalState.homepageConfig}
              slideshow={portalState.slideshow}
              committeeMembers={portalState.committeeMembers}
              programResults={portalState.programResults}
              income={portalState.income}
              expenses={portalState.expenses}
              publicTotalIncome={publicTotals.publicTotalIncome}
              publicTotalExpenses={publicTotals.publicTotalExpenses}
              announcements={portalState.announcements}
              notices={portalState.notices}
              gallery={portalState.gallery}
              totalStudentsCount={totalStudentsCount}
              currentUser={currentUser}
              onOpenLogin={() => setLoginModalOpen(true)}
              onEnterPortal={() => setViewMode('portal')}
              onBookAppointment={handleBookAppointment}
              onSubmitPublicContact={handlePublicContact}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Login Modal */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onLoginSubmit={handleLoginSubmit}
        onGoogleLogin={handleGoogleLogin}
        onEmailPasswordLogin={handleEmailPasswordLogin}
        branding={portalState.branding}
      />
    </div>
  );
}
