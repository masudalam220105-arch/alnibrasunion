'use client';

import React, { useState, useEffect } from 'react';
import { Lock, User, X, ShieldCheck, Chrome, Mail, Cloud, CheckCircle2, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ALNIBRAS_EASE } from './MotionPrimitives';
import { OfficialLogo } from './OfficialBrandingView';
import type { BrandingConfig } from '@/lib/types';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSubmit: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  onGoogleLogin?: () => Promise<{ ok: boolean; error?: string }>;
  onEmailPasswordLogin?: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  branding?: BrandingConfig;
}

export function LoginModal(props: LoginModalProps) {
  return (
    <AnimatePresence>
      {props.isOpen && <LoginModalContent key="login-modal-open" {...props} />}
    </AnimatePresence>
  );
}

function LoginModalContent({
  onClose,
  onLoginSubmit,
  onGoogleLogin,
  onEmailPasswordLogin,
  branding,
}: LoginModalProps) {
  const [authTab, setAuthTab] = useState<'cloud' | 'legacy'>('legacy');
  const [email, setEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, onClose]);

  const handleCloudEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onEmailPasswordLogin) return;
    setError(null);
    setStatusMessage(null);

    if (!email.trim() || !email.includes('@') || !cloudPassword) {
      setError('Please enter your registered Supabase account email and password.');
      return;
    }

    setLoading(true);
    setStatusMessage('Verifying Supabase Auth credentials & loading portal profile...');
    try {
      const res = await onEmailPasswordLogin(email.trim(), cloudPassword);
      if (!res.ok) {
        setStatusMessage(null);
        setError(res.error || 'Email/Password sign-in failed. Please verify your credentials.');
      } else {
        setEmail('');
        setCloudPassword('');
        setStatusMessage('Signed in to Supabase successfully.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLegacySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);
    if (!username.trim() || !password) {
      setError('Please enter your username and password.');
      return;
    }
    setLoading(true);
    setStatusMessage('Authenticating portal account...');
    try {
      const res = await onLoginSubmit(username.trim(), password);
      if (!res.ok) {
        setStatusMessage(null);
        setError(res.error || 'Authentication failed. Please check your credentials.');
      } else {
        setUsername('');
        setPassword('');
        setStatusMessage('Portal session verified.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = async () => {
    if (!onGoogleLogin) return;
    setError(null);
    setStatusMessage('Connecting to Google & Supabase Authentication...');
    setLoading(true);
    try {
      const res = await onGoogleLogin();
      if (!res.ok) {
        setStatusMessage(null);
        setError(res.error || 'Google authentication failed.');
      } else {
        setStatusMessage('Redirecting to Supabase OAuth...');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
        <motion.div
          key="login-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-dialog-title"
          onClick={onClose}
        >
          <motion.div
            key="login-modal-card"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.24, ease: ALNIBRAS_EASE }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="bg-gradient-to-r from-[#064E3B] to-[#0B3D32] px-6 py-5 text-white flex items-center justify-between border-b border-[#D4AF37]/30">
              <div className="flex items-center gap-3">
                <OfficialLogo branding={branding} placement="login" size="md" showText={false} />
                <div>
                  <h2 id="login-dialog-title" className="text-lg font-bold tracking-tight text-white">
                    Al-Nibras Portal Login
                  </h2>
                  <p className="text-xs text-white/80">
                    11th Batch of DHBC · Supabase Cloud Auth
                  </p>
                </div>
              </div>
              <motion.button
                type="button"
                onClick={onClose}
                whileHover={{ rotate: 90, scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.16 }}
                aria-label="Close login modal"
                className="p-1.5 text-white/75 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </motion.button>
            </div>

            {/* Auth Mode Tab Switcher with Animated Indicator */}
            <div
              role="tablist"
              aria-label="Portal login methods"
              className="grid grid-cols-2 border-b border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authTab === 'cloud'}
                data-testid="login-tab-cloud"
                onClick={() => {
                  setAuthTab('cloud');
                  setError(null);
                  setStatusMessage(null);
                }}
                className={`relative py-2.5 px-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  authTab === 'cloud'
                    ? 'text-[#064E3B] dark:text-[#D4AF37] bg-white dark:bg-[#0D231D]'
                    : 'text-[#718078] dark:text-[#9AB0A6] hover:text-[#17221F] dark:hover:text-white'
                }`}
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Supabase Cloud</span>
                {authTab === 'cloud' && (
                  <motion.span
                    layoutId="login-auth-tab-indicator"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#064E3B] dark:bg-[#D4AF37]"
                  />
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authTab === 'legacy'}
                data-testid="login-tab-legacy"
                onClick={() => {
                  setAuthTab('legacy');
                  setError(null);
                  setStatusMessage(null);
                }}
                className={`relative py-2.5 px-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  authTab === 'legacy'
                    ? 'text-[#064E3B] dark:text-[#D4AF37] bg-white dark:bg-[#0D231D]'
                    : 'text-[#718078] dark:text-[#9AB0A6] hover:text-[#17221F] dark:hover:text-white'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Username & Password</span>
                {authTab === 'legacy' && (
                  <motion.span
                    layoutId="login-auth-tab-indicator"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#064E3B] dark:bg-[#D4AF37]"
                  />
                )}
              </button>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <motion.div
                  key={error}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="alert"
                  className="animate-subtle-shake p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-200 font-medium"
                >
                  {error}
                </motion.div>
              )}

              {statusMessage && !error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="status"
                  className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 font-medium flex items-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 shrink-0 text-[#064E3B] dark:text-[#D4AF37] animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-[#064E3B] dark:text-[#D4AF37]" />
                  )}
                  <span>{statusMessage}</span>
                </motion.div>
              )}

              <AnimatePresence mode="wait" initial={false}>
                {authTab === 'cloud' ? (
                  <motion.div
                    key="tab-panel-cloud"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.18, ease: ALNIBRAS_EASE }}
                    className="space-y-4"
                  >
                    {onGoogleLogin && (
                      <motion.button
                        type="button"
                        onClick={handleGoogleClick}
                        disabled={loading}
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.98 }}
                        data-testid="google-supabase-login-btn"
                        className="w-full py-2.5 px-4 bg-[#064E3B] hover:bg-[#0B3D32] text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        {loading ? (
                          <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin" />
                        ) : (
                          <Chrome className="w-4 h-4 text-[#D4AF37]" />
                        )}
                        <span>{loading ? 'Connecting...' : 'Continue with Google (Admin / Student)'}</span>
                      </motion.button>
                    )}

                    <div className="relative flex items-center py-1">
                      <div className="flex-grow border-t border-[#E5EAE6] dark:border-[#1B3B31]" />
                      <span className="shrink mx-3 text-[11px] font-semibold uppercase tracking-wider text-[#718078] dark:text-[#9AB0A6]">
                        Or Registered Email
                      </span>
                      <div className="flex-grow border-t border-[#E5EAE6] dark:border-[#1B3B31]" />
                    </div>

                    <form onSubmit={handleCloudEmailSubmit} autoComplete="off" className="space-y-3.5" noValidate>
                      <div>
                        <label
                          htmlFor="portal-supabase-email"
                          className="block text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2] mb-1.5"
                        >
                          Registered Email
                        </label>
                        <div className="relative group">
                          <Mail className="w-4 h-4 text-[#718078] group-focus-within:text-[#064E3B] dark:group-focus-within:text-[#D4AF37] transition-colors absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="portal-supabase-email"
                            name="portal_cloud_identifier"
                            type="email"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            data-lpignore="true"
                            data-1p-ignore="true"
                            data-bwignore="true"
                            data-form-type="other"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="student@alnibras-union.edu"
                            className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-lg text-[#17221F] dark:text-[#F0F5F2] placeholder:text-[#718078] focus:outline-none focus:border-[#064E3B] dark:focus:border-[#D4AF37] focus:ring-2 focus:ring-[#064E3B]/15 dark:focus:ring-[#D4AF37]/20 transition-all"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="portal-supabase-password"
                          className="block text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2] mb-1.5"
                        >
                          Password
                        </label>
                        <div className="relative group">
                          <Lock className="w-4 h-4 text-[#718078] group-focus-within:text-[#064E3B] dark:group-focus-within:text-[#D4AF37] transition-colors absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="portal-supabase-password"
                            name="portal_cloud_secret"
                            type="password"
                            autoComplete="new-password"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            data-bwignore="true"
                            data-form-type="other"
                            value={cloudPassword}
                            onChange={(e) => setCloudPassword(e.target.value)}
                            placeholder="Enter your password"
                            className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-lg text-[#17221F] dark:text-[#F0F5F2] placeholder:text-[#718078] focus:outline-none focus:border-[#064E3B] dark:focus:border-[#D4AF37] focus:ring-2 focus:ring-[#064E3B]/15 dark:focus:ring-[#D4AF37]/20 transition-all"
                            required
                          />
                        </div>
                      </div>

                      <motion.button
                        type="submit"
                        disabled={loading}
                        whileTap={{ scale: 0.98 }}
                        data-testid="supabase-email-login-submit"
                        className="w-full py-2.5 px-4 bg-[#F8FAF7] dark:bg-[#071713] hover:bg-[#EDF2EE] dark:hover:bg-[#112A22] border border-[#E5EAE6] dark:border-[#1B3B31] text-[#17221F] dark:text-[#F0F5F2] text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                      >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        <span>{loading ? 'Signing In...' : 'Sign In with Email & Password'}</span>
                      </motion.button>
                    </form>
                  </motion.div>
                ) : (
                  <motion.form
                    key="tab-panel-legacy"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.18, ease: ALNIBRAS_EASE }}
                    onSubmit={handleLegacySubmit}
                    className="space-y-4"
                    noValidate
                  >
                    <div>
                      <label
                        htmlFor="portal-login-username"
                        className="block text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2] mb-1.5"
                      >
                        Username
                      </label>
                      <div className="relative group">
                        <User className="w-4 h-4 text-[#718078] group-focus-within:text-[#064E3B] dark:group-focus-within:text-[#D4AF37] transition-colors absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="portal-login-username"
                          name="username"
                          type="text"
                          autoComplete="off"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Enter your username"
                          className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-lg text-[#17221F] dark:text-[#F0F5F2] placeholder:text-[#718078] focus:outline-none focus:border-[#064E3B] dark:focus:border-[#D4AF37] focus:ring-2 focus:ring-[#064E3B]/15 dark:focus:ring-[#D4AF37]/20 transition-all"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="portal-login-password"
                        className="block text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2] mb-1.5"
                      >
                        Password
                      </label>
                      <div className="relative group">
                        <Lock className="w-4 h-4 text-[#718078] group-focus-within:text-[#064E3B] dark:group-focus-within:text-[#D4AF37] transition-colors absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="portal-login-password"
                          name="password"
                          type="password"
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-lg text-[#17221F] dark:text-[#F0F5F2] placeholder:text-[#718078] focus:outline-none focus:border-[#064E3B] dark:focus:border-[#D4AF37] focus:ring-2 focus:ring-[#064E3B]/15 dark:focus:ring-[#D4AF37]/20 transition-all"
                          required
                        />
                      </div>
                    </div>

                    <motion.button
                      type="submit"
                      disabled={loading}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      data-testid="legacy-login-submit"
                      className="w-full py-2.5 px-4 bg-[#064E3B] hover:bg-[#0B3D32] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-xs flex items-center justify-center gap-2"
                    >
                      {loading && <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />}
                      <span>{loading ? 'Signing In...' : 'Sign In with Username'}</span>
                    </motion.button>
                  </motion.form>
                )}
              </AnimatePresence>

              <div className="pt-2 border-t border-[#E5EAE6] dark:border-[#1B3B31] flex items-center gap-2 text-[11px] text-[#718078] dark:text-[#9AB0A6]">
                <ShieldCheck className="w-4 h-4 text-[#064E3B] dark:text-[#D4AF37] shrink-0" />
                <span>
                  Student accounts and Supabase PostgreSQL access are managed securely by the Al-Nibras Union Administrator.
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
  );
}

