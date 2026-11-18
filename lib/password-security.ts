import crypto from 'node:crypto';
import { hashPasswordSync } from './portal-logic';

/**
 * Exact 26-character ASCII legacy credential format:
 * "pbkdf2_v1$" (10 chars) + 16 lowercase hexadecimal chars = 26 chars (26 UTF-8 bytes).
 */
export const LEGACY_PBKDF2_V1_REGEX = /^pbkdf2_v1\$[0-9a-f]{16}$/;
export const LEGACY_PBKDF2_V1_BYTE_LENGTH = 26;

/**
 * Direct scrypt v2 credential format:
 * $scrypt$v=2$N=16384,r=8,p=1$<base64(16B-salt)>$<base64(64B-key)>
 */
export const SCRYPT_V2_PREFIX = '$scrypt$v=2$';
export const SCRYPT_V2_REGEX =
  /^\$scrypt\$v=2\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/;

export const SCRYPT_DEFAULT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64,
  saltBytes: 16,
  maxmem: 32 * 1024 * 1024, // 32 MiB ceiling
} as const;

export const MAX_CONCURRENT_SCRYPT = 4;
export const MAX_SCRYPT_QUEUE = 32;

let activeScryptCount = 0;
const scryptWaitQueue: Array<{
  resolve: () => void;
  reject: (err: Error) => void;
}> = [];

async function acquireScryptSlot(): Promise<void> {
  if (activeScryptCount < MAX_CONCURRENT_SCRYPT) {
    activeScryptCount += 1;
    return;
  }
  if (scryptWaitQueue.length >= MAX_SCRYPT_QUEUE) {
    throw new Error('SCRYPT_CONCURRENCY_LIMIT_EXCEEDED');
  }
  await new Promise<void>((resolve, reject) => {
    scryptWaitQueue.push({ resolve, reject });
  });
}

function releaseScryptSlot(): void {
  const next = scryptWaitQueue.shift();
  if (next) {
    next.resolve();
  } else {
    activeScryptCount = Math.max(0, activeScryptCount - 1);
  }
}

export function normalizePasswordForScrypt(rawPassword: string): Buffer {
  return Buffer.from(rawPassword.normalize('NFKC'), 'utf8');
}

export function isLegacyPbkdf2V1Hash(hash: unknown): hash is string {
  return (
    typeof hash === 'string' &&
    hash.length === LEGACY_PBKDF2_V1_BYTE_LENGTH &&
    LEGACY_PBKDF2_V1_REGEX.test(hash)
  );
}

export function isScryptV2Hash(hash: unknown): hash is string {
  if (typeof hash !== 'string' || !hash.startsWith(SCRYPT_V2_PREFIX)) {
    return false;
  }
  const match = SCRYPT_V2_REGEX.exec(hash);
  if (!match) return false;
  const N = Number(match[1]);
  const r = Number(match[2]);
  const p = Number(match[3]);
  if (
    !Number.isInteger(N) ||
    N < 16384 ||
    N > 65536 ||
    (N & (N - 1)) !== 0 ||
    !Number.isInteger(r) ||
    r < 1 ||
    r > 16 ||
    !Number.isInteger(p) ||
    p < 1 ||
    p > 4
  ) {
    return false;
  }
  try {
    const saltBuf = Buffer.from(match[4], 'base64');
    const keyBuf = Buffer.from(match[5], 'base64');
    return (
      saltBuf.byteLength === SCRYPT_DEFAULT_PARAMS.saltBytes &&
      keyBuf.byteLength === SCRYPT_DEFAULT_PARAMS.keylen
    );
  } catch {
    return false;
  }
}

function deriveScryptAsync(
  passwordBuf: Buffer,
  saltBuf: Buffer,
  keylen: number,
  options: crypto.ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(passwordBuf, saltBuf, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Generates a direct $scrypt$v=2$ hash using a fresh 16-byte CSPRNG salt and NFKC normalization.
 */
export async function hashPasswordScryptV2(rawPassword: string): Promise<string> {
  if (typeof rawPassword !== 'string' || rawPassword.length === 0 || rawPassword.length > 512) {
    throw new Error('INVALID_PASSWORD_LENGTH');
  }
  await acquireScryptSlot();
  try {
    const salt = crypto.randomBytes(SCRYPT_DEFAULT_PARAMS.saltBytes);
    const passwordBuf = normalizePasswordForScrypt(rawPassword);
    const derivedKey = await deriveScryptAsync(
      passwordBuf,
      salt,
      SCRYPT_DEFAULT_PARAMS.keylen,
      {
        N: SCRYPT_DEFAULT_PARAMS.N,
        r: SCRYPT_DEFAULT_PARAMS.r,
        p: SCRYPT_DEFAULT_PARAMS.p,
        maxmem: SCRYPT_DEFAULT_PARAMS.maxmem,
      }
    );
    const { N, r, p } = SCRYPT_DEFAULT_PARAMS;
    return `$scrypt$v=2$N=${N},r=${r},p=${p}$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
  } finally {
    releaseScryptSlot();
  }
}

export function hashPasswordScryptV2Sync(rawPassword: string): string {
  if (typeof rawPassword !== 'string' || rawPassword.length === 0 || rawPassword.length > 512) {
    throw new Error('INVALID_PASSWORD_LENGTH');
  }
  const salt = crypto.randomBytes(SCRYPT_DEFAULT_PARAMS.saltBytes);
  const passwordBuf = normalizePasswordForScrypt(rawPassword);
  const derivedKey = crypto.scryptSync(passwordBuf, salt, SCRYPT_DEFAULT_PARAMS.keylen, {
    N: SCRYPT_DEFAULT_PARAMS.N,
    r: SCRYPT_DEFAULT_PARAMS.r,
    p: SCRYPT_DEFAULT_PARAMS.p,
    maxmem: SCRYPT_DEFAULT_PARAMS.maxmem,
  });
  const { N, r, p } = SCRYPT_DEFAULT_PARAMS;
  return `$scrypt$v=2$N=${N},r=${r},p=${p}$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

/**
 * Verifies a password against a $scrypt$v=2$ hash using constant-time comparison
 * with strict 64-byte buffer length validation prior to timingSafeEqual.
 */
export async function verifyScryptV2Password(
  rawPassword: string,
  storedScryptHash: string
): Promise<boolean> {
  if (typeof rawPassword !== 'string' || rawPassword.length === 0 || rawPassword.length > 512) {
    return false;
  }
  if (!isScryptV2Hash(storedScryptHash)) {
    return false;
  }
  const match = SCRYPT_V2_REGEX.exec(storedScryptHash);
  if (!match) return false;

  const N = Number(match[1]);
  const r = Number(match[2]);
  const p = Number(match[3]);
  const saltBuf = Buffer.from(match[4], 'base64');
  const expectedKeyBuf = Buffer.from(match[5], 'base64');

  if (
    saltBuf.byteLength !== SCRYPT_DEFAULT_PARAMS.saltBytes ||
    expectedKeyBuf.byteLength !== SCRYPT_DEFAULT_PARAMS.keylen
  ) {
    return false;
  }

  await acquireScryptSlot();
  try {
    const passwordBuf = normalizePasswordForScrypt(rawPassword);
    const derivedKeyBuf = await deriveScryptAsync(
      passwordBuf,
      saltBuf,
      SCRYPT_DEFAULT_PARAMS.keylen,
      {
        N,
        r,
        p,
        maxmem: SCRYPT_DEFAULT_PARAMS.maxmem,
      }
    );
    if (
      derivedKeyBuf.byteLength !== expectedKeyBuf.byteLength ||
      expectedKeyBuf.byteLength !== SCRYPT_DEFAULT_PARAMS.keylen
    ) {
      return false;
    }
    return crypto.timingSafeEqual(derivedKeyBuf, expectedKeyBuf);
  } catch {
    return false;
  } finally {
    releaseScryptSlot();
  }
}

/**
 * Verifies a password against a 26-char legacy pbkdf2_v1$ hash using constant-time comparison.
 * Checks both raw UTF-16 code units (exact match to original hashPasswordSync) and NFKC-normalized
 * string so existing passwords with non-NFKC characters never break on first login.
 */
export function verifyLegacyPbkdf2V1PasswordConstantTime(
  rawPassword: string,
  storedLegacyHash: string
): boolean {
  if (typeof rawPassword !== 'string' || rawPassword.length === 0 || rawPassword.length > 512) {
    return false;
  }
  if (!isLegacyPbkdf2V1Hash(storedLegacyHash)) {
    return false;
  }

  const storedBuf = Buffer.from(storedLegacyHash, 'utf8');
  if (storedBuf.byteLength !== LEGACY_PBKDF2_V1_BYTE_LENGTH) {
    return false;
  }

  const candidateRaw = hashPasswordSync(rawPassword);
  const candidateNfkc = hashPasswordSync(rawPassword.normalize('NFKC'));

  const rawBuf = Buffer.from(candidateRaw, 'utf8');
  const nfkcBuf = Buffer.from(candidateNfkc, 'utf8');

  if (
    rawBuf.byteLength !== LEGACY_PBKDF2_V1_BYTE_LENGTH ||
    nfkcBuf.byteLength !== LEGACY_PBKDF2_V1_BYTE_LENGTH
  ) {
    return false;
  }

  const rawMatches = crypto.timingSafeEqual(rawBuf, storedBuf);
  const nfkcMatches = crypto.timingSafeEqual(nfkcBuf, storedBuf);
  return rawMatches || nfkcMatches;
}

export interface PasswordVerificationMigrationResult {
  verified: boolean;
  scheme: 'scrypt_v2' | 'legacy_pbkdf2_v1' | 'none';
  needsUpgrade: boolean;
  upgradedScryptHash?: string;
}

/**
 * 2-State Password Verification & Automatic Migration:
 * 1. If a user already has a $scrypt$v=2$ credential, ONLY $scrypt$v=2$ is accepted (legacy fallback is permanently disabled for that user).
 * 2. If a user only has a legacy pbkdf2_v1$ credential, it is verified in constant time and immediately upgraded to a fresh $scrypt$v=2$ hash upon success.
 */
export async function verifyAndMigratePassword(params: {
  submittedPassword: string;
  scryptHash?: string | null;
  legacyHash?: string | null;
}): Promise<PasswordVerificationMigrationResult> {
  const { submittedPassword, scryptHash, legacyHash } = params;

  if (typeof submittedPassword !== 'string' || submittedPassword.length === 0) {
    return { verified: false, scheme: 'none', needsUpgrade: false };
  }

  // State 2: Account has already migrated to $scrypt$v=2$ -> never consult legacyHash
  if (scryptHash && scryptHash.trim().length > 0) {
    const ok = await verifyScryptV2Password(submittedPassword, scryptHash.trim());
    return {
      verified: ok,
      scheme: ok ? 'scrypt_v2' : 'none',
      needsUpgrade: false,
    };
  }

  // State 1: Account has only legacy pbkdf2_v1$ hash -> verify and immediately upgrade on success
  if (legacyHash && legacyHash.trim().length > 0) {
    // Also support if scrypt v2 hash was stored directly in credentials map
    if (isScryptV2Hash(legacyHash.trim())) {
      const ok = await verifyScryptV2Password(submittedPassword, legacyHash.trim());
      return {
        verified: ok,
        scheme: ok ? 'scrypt_v2' : 'none',
        needsUpgrade: false,
      };
    }

    const legacyOk = verifyLegacyPbkdf2V1PasswordConstantTime(
      submittedPassword,
      legacyHash.trim()
    );
    if (!legacyOk) {
      return { verified: false, scheme: 'none', needsUpgrade: false };
    }

    const upgradedScryptHash = await hashPasswordScryptV2(submittedPassword);
    return {
      verified: true,
      scheme: 'legacy_pbkdf2_v1',
      needsUpgrade: true,
      upgradedScryptHash,
    };
  }

  return { verified: false, scheme: 'none', needsUpgrade: false };
}
