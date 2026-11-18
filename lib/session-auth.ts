import crypto from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import {
  loadServerStore,
  saveServerStore,
  type PersistedServerStore,
  type ServerAuthSessionRecord,
} from './server-db';
import type { UserProfile } from './types';

export const SESSION_COOKIE_NAME = 'alnibras_session';
export const CSRF_COOKIE_NAME = 'alnibras_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

const FALLBACK_RUNTIME_SECRET = crypto
  .createHash('sha256')
  .update(`alnibras-ephemeral-session-key-${process.pid}`)
  .digest('hex');

function getSessionSecrets(): { current: Buffer; previous: Buffer | null } {
  const currRaw = (process.env.PORTAL_SESSION_SECRET_CURRENT || '').trim() || FALLBACK_RUNTIME_SECRET;
  const prevRaw = (process.env.PORTAL_SESSION_SECRET_PREVIOUS || '').trim();

  const current = crypto.createHash('sha256').update(currRaw, 'utf8').digest();
  const previous = prevRaw
    ? crypto.createHash('sha256').update(prevRaw, 'utf8').digest()
    : null;
  return { current, previous };
}

function hmacSign(payload: string, secret: Buffer): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
}

function constantTimeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.byteLength !== bufB.byteLength || bufA.byteLength === 0) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Extracts and normalizes the client IP address using trusted reverse-proxy hop counting
 * and IPv6 /64 prefix normalization so attackers cannot bypass rate limits by rotating
 * X-Forwarded-For headers or IPv6 interface identifiers.
 */
export function extractTrustedClientIp(req: NextRequest): string {
  const vercelIp = (req.headers.get('x-vercel-forwarded-for') || '').trim();
  const realIp = (req.headers.get('x-real-ip') || '').trim();
  const xff = (req.headers.get('x-forwarded-for') || '').trim();

  const trustedHops = Math.max(
    1,
    Math.min(10, Number.parseInt(process.env.TRUSTED_PROXY_COUNT || '1', 10) || 1)
  );

  let rawIp = '127.0.0.1';
  if (vercelIp) {
    const parts = vercelIp.split(',').map((s) => s.trim()).filter(Boolean);
    rawIp = parts[parts.length - 1] || '127.0.0.1';
  } else if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    const idx = Math.max(0, parts.length - trustedHops);
    rawIp = parts[idx] || '127.0.0.1';
  } else if (realIp) {
    rawIp = realIp;
  }

  return normalizeIpSubnet(rawIp);
}

export function normalizeIpSubnet(rawIp: string): string {
  const cleaned = rawIp.trim().toLowerCase().replace(/^::ffff:/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(cleaned)) {
    return cleaned;
  }
  if (cleaned.includes(':')) {
    const groups = cleaned.split(':').slice(0, 4);
    while (groups.length < 4) groups.push('0');
    return `${groups.join(':')}::/64`;
  }
  return '127.0.0.1';
}

export interface SignedSessionTokenPayload {
  sid: string;
  uid: string;
  iat: number;
  exp: number;
  kid: 'curr' | 'prev';
}

export function signSessionCookieValue(payload: SignedSessionTokenPayload): string {
  const { current } = getSessionSecrets();
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = hmacSign(encodedPayload, current);
  return `${payload.kid}.${encodedPayload}.${sig}`;
}

export function verifySessionCookieValue(
  cookieValue: string
): { valid: boolean; payload?: SignedSessionTokenPayload; usedPreviousKey?: boolean } {
  if (!cookieValue || typeof cookieValue !== 'string') {
    return { valid: false };
  }
  const parts = cookieValue.split('.');
  if (parts.length !== 3) {
    return { valid: false };
  }
  const [kid, encodedPayload, submittedSig] = parts;
  if (kid !== 'curr' && kid !== 'prev') {
    return { valid: false };
  }

  const { current, previous } = getSessionSecrets();
  const expectedCurrentSig = hmacSign(encodedPayload, current);
  let verifiedWithCurrent = constantTimeCompareStrings(submittedSig, expectedCurrentSig);
  let verifiedWithPrevious = false;

  if (!verifiedWithCurrent && previous) {
    const expectedPrevSig = hmacSign(encodedPayload, previous);
    verifiedWithPrevious = constantTimeCompareStrings(submittedSig, expectedPrevSig);
  }

  if (!verifiedWithCurrent && !verifiedWithPrevious) {
    return { valid: false };
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as SignedSessionTokenPayload;
    if (
      !decoded ||
      typeof decoded.sid !== 'string' ||
      typeof decoded.uid !== 'string' ||
      typeof decoded.exp !== 'number'
    ) {
      return { valid: false };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (decoded.exp <= nowSec) {
      return { valid: false };
    }
    return {
      valid: true,
      payload: decoded,
      usedPreviousKey: verifiedWithPrevious,
    };
  } catch {
    return { valid: false };
  }
}

export interface IssuedPortalSession {
  sessionRecord: ServerAuthSessionRecord;
  sessionCookieValue: string;
  csrfToken: string;
}

export function createPortalSession(
  store: PersistedServerStore,
  user: UserProfile,
  req: NextRequest
): IssuedPortalSession {
  const sessionId = `sess_${crypto.randomUUID().replace(/-/g, '')}`;
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const csrfTokenHash = sha256Hex(csrfToken);
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + SESSION_TTL_SECONDS;
  const ipSubnet = extractTrustedClientIp(req);
  const userAgentHash = sha256Hex(req.headers.get('user-agent') || 'unknown');

  const sessionRecord: ServerAuthSessionRecord = {
    sessionId,
    userUid: user.uid,
    csrfTokenHash,
    ipSubnet,
    userAgentHash,
    keyId: 'curr',
    createdAt: new Date(nowSec * 1000).toISOString(),
    expiresAt: new Date(expSec * 1000).toISOString(),
    revokedAt: null,
    revokeReason: null,
  };

  if (!Array.isArray(store.authSessions)) {
    store.authSessions = [];
  }
  // Prune expired sessions while appending
  const nowIso = new Date().toISOString();
  store.authSessions = store.authSessions.filter(
    (s) => !s.revokedAt && s.expiresAt > nowIso
  );
  store.authSessions.push(sessionRecord);
  saveServerStore(store);

  const sessionCookieValue = signSessionCookieValue({
    sid: sessionId,
    uid: user.uid,
    iat: nowSec,
    exp: expSec,
    kid: 'curr',
  });

  return {
    sessionRecord,
    sessionCookieValue,
    csrfToken,
  };
}

export function attachSessionCookies(
  res: NextResponse,
  issued: IssuedPortalSession
): NextResponse {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookies.set(SESSION_COOKIE_NAME, issued.sessionCookieValue, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  res.cookies.set(CSRF_COOKIE_NAME, issued.csrfToken, {
    httpOnly: false,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}

export function clearSessionCookies(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  res.cookies.set(CSRF_COOKIE_NAME, '', {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}

export function revokeSessionById(
  store: PersistedServerStore,
  sessionId: string,
  reason = 'LOGOUT'
): boolean {
  if (!Array.isArray(store.authSessions)) return false;
  const found = store.authSessions.find((s) => s.sessionId === sessionId && !s.revokedAt);
  if (!found) return false;
  found.revokedAt = new Date().toISOString();
  found.revokeReason = reason;
  saveServerStore(store);
  return true;
}

export function revokeAllUserSessions(
  store: PersistedServerStore,
  userUid: string,
  reason = 'PASSWORD_OR_STATUS_CHANGE'
): number {
  if (!Array.isArray(store.authSessions)) return 0;
  let count = 0;
  const nowIso = new Date().toISOString();
  for (const s of store.authSessions) {
    if (s.userUid === userUid && !s.revokedAt) {
      s.revokedAt = nowIso;
      s.revokeReason = reason;
      count += 1;
    }
  }
  if (count > 0) {
    saveServerStore(store);
  }
  return count;
}

export interface VerifiedRequestActorResult {
  authenticated: boolean;
  actor: UserProfile | null;
  session: ServerAuthSessionRecord | null;
  csrfValid: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * Resolves the authenticated actor from the signed HttpOnly session cookie (with live server-side
 * session revocation and active user status verification).
 * For local/test backward compatibility when no session cookie is present and PORTAL_REQUIRE_STRICT_COOKIE !== 'true',
 * falls back to verifying active user existence only if explicitly permitted.
 */
export function resolveAuthenticatedActor(
  req: NextRequest,
  store?: PersistedServerStore,
  options?: {
    requireCsrf?: boolean;
    fallbackActorUid?: string;
  }
): VerifiedRequestActorResult {
  const activeStore = store || loadServerStore();
  const rawSessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value || '';

  if (rawSessionCookie) {
    const verifiedCookie = verifySessionCookieValue(rawSessionCookie);
    if (!verifiedCookie.valid || !verifiedCookie.payload) {
      return {
        authenticated: false,
        actor: null,
        session: null,
        csrfValid: false,
        error: 'Invalid or expired session signature.',
        statusCode: 401,
      };
    }

    const { sid, uid } = verifiedCookie.payload;
    const nowIso = new Date().toISOString();
    const sessionRecord = (activeStore.authSessions || []).find(
      (s) => s.sessionId === sid && s.userUid === uid
    );

    if (!sessionRecord || sessionRecord.revokedAt || sessionRecord.expiresAt <= nowIso) {
      return {
        authenticated: false,
        actor: null,
        session: null,
        csrfValid: false,
        error: 'Session has been revoked or expired. Please log in again.',
        statusCode: 401,
      };
    }

    const liveUser = activeStore.state.users.find(
      (u) => u.uid === uid && u.status === 'active'
    );
    if (!liveUser) {
      return {
        authenticated: false,
        actor: null,
        session: null,
        csrfValid: false,
        error: 'Account is deactivated or no longer exists.',
        statusCode: 403,
      };
    }

    let csrfValid = true;
    if (options?.requireCsrf) {
      const submittedCsrf =
        req.headers.get(CSRF_HEADER_NAME) ||
        req.cookies.get(CSRF_COOKIE_NAME)?.value ||
        '';
      if (!submittedCsrf) {
        csrfValid = false;
      } else {
        const submittedHash = sha256Hex(submittedCsrf);
        csrfValid = constantTimeCompareStrings(submittedHash, sessionRecord.csrfTokenHash);
      }
      if (!csrfValid) {
        return {
          authenticated: false,
          actor: null,
          session: sessionRecord,
          csrfValid: false,
          error: 'CSRF token validation failed.',
          statusCode: 403,
        };
      }
    }

    return {
      authenticated: true,
      actor: liveUser,
      session: sessionRecord,
      csrfValid,
    };
  }

  // Fallback for local unit tests / same-origin client transitions when no session cookie was sent
  if (
    process.env.PORTAL_REQUIRE_STRICT_COOKIE !== 'true' &&
    options?.fallbackActorUid
  ) {
    const fallbackUser = activeStore.state.users.find(
      (u) => u.uid === options.fallbackActorUid && u.status === 'active'
    );
    if (fallbackUser) {
      return {
        authenticated: true,
        actor: fallbackUser,
        session: null,
        csrfValid: true,
      };
    }
  }

  return {
    authenticated: false,
    actor: null,
    session: null,
    csrfValid: false,
    error: 'Authentication required.',
    statusCode: 401,
  };
}

/**
 * Composite (ip_subnet, username) login rate limiter.
 * Prevents brute-force attacks from an IP subnet without enabling global Account-Lockout DoS
 * against legitimate users on other networks.
 */
export function checkAndRecordLoginRateLimit(
  store: PersistedServerStore,
  ipSubnet: string,
  rawUsername: string,
  nowMs = Date.now()
): { allowed: boolean; retryAfterSeconds: number } {
  if (!store.loginRateLimits) {
    store.loginRateLimits = {};
  }
  const usernameNormalized = rawUsername.trim().toLowerCase().slice(0, 64);
  const compositeKey = `${ipSubnet}::${usernameNormalized}`;
  const ipGlobalKey = `${ipSubnet}::*`;

  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxCompositeAttempts = 8;
  const maxIpGlobalAttempts = 30;

  for (const [key, limit] of [
    [compositeKey, maxCompositeAttempts] as const,
    [ipGlobalKey, maxIpGlobalAttempts] as const,
  ]) {
    const entry = store.loginRateLimits[key];
    if (entry) {
      if (entry.lockedUntil && Date.parse(entry.lockedUntil) > nowMs) {
        const retryAfterSeconds = Math.ceil((Date.parse(entry.lockedUntil) - nowMs) / 1000);
        return { allowed: false, retryAfterSeconds };
      }
      if (nowMs - Date.parse(entry.windowStartAt) > windowMs) {
        delete store.loginRateLimits[key];
      } else if (entry.attemptCount >= limit) {
        const lockedUntil = new Date(nowMs + 15 * 60 * 1000).toISOString();
        entry.lockedUntil = lockedUntil;
        entry.updatedAt = new Date(nowMs).toISOString();
        saveServerStore(store);
        return { allowed: false, retryAfterSeconds: 900 };
      }
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordLoginFailure(
  store: PersistedServerStore,
  ipSubnet: string,
  rawUsername: string,
  nowMs = Date.now()
): void {
  if (!store.loginRateLimits) {
    store.loginRateLimits = {};
  }
  const usernameNormalized = rawUsername.trim().toLowerCase().slice(0, 64);
  const keys = [`${ipSubnet}::${usernameNormalized}`, `${ipSubnet}::*`];
  const nowIso = new Date(nowMs).toISOString();

  for (const key of keys) {
    const existing = store.loginRateLimits[key];
    if (!existing || nowMs - Date.parse(existing.windowStartAt) > 15 * 60 * 1000) {
      store.loginRateLimits[key] = {
        compositeKey: key,
        ipSubnet,
        usernameNormalized,
        attemptCount: 1,
        windowStartAt: nowIso,
        lockedUntil: null,
        updatedAt: nowIso,
      };
    } else {
      existing.attemptCount += 1;
      existing.updatedAt = nowIso;
    }
  }
  saveServerStore(store);
}

export function clearLoginFailuresOnSuccess(
  store: PersistedServerStore,
  ipSubnet: string,
  rawUsername: string
): void {
  if (!store.loginRateLimits) return;
  const usernameNormalized = rawUsername.trim().toLowerCase().slice(0, 64);
  const compositeKey = `${ipSubnet}::${usernameNormalized}`;
  if (store.loginRateLimits[compositeKey]) {
    delete store.loginRateLimits[compositeKey];
    saveServerStore(store);
  }
}
