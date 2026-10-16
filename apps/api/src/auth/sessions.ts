import { passwordChangeRequestSchema } from '@remote-webos-tv/contracts';
import { createHash, createHmac, randomBytes as nodeRandomBytes, timingSafeEqual } from 'node:crypto';
import { chmod, lstat, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { hashPassword, verifyPassword } from './passwords.js';
import type { OwnerRepository, StoredSessionRejection } from './repository.js';

const sessionLifetimeMs = 24 * 60 * 60 * 1000;
const cookiePattern = /^[A-Za-z0-9_-]{43}$/;
const csrfPattern = /^[A-Za-z0-9_-]{43}$/;
export type SessionRejectionReason = StoredSessionRejection | 'SESSION_COOKIE_UNAVAILABLE' | 'SESSION_TOKEN_MALFORMED' | 'SESSION_CSRF_MISMATCH';

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function exactBytes(source: (length: number) => Uint8Array, length: number): Buffer {
  const value = Buffer.from(source(length));
  if (value.length !== length) throw new Error('Auth entropy source returned an invalid length');
  return value;
}

export class AuthMasterKeyStorageError extends Error {
  constructor(cause: unknown) {
    super('Auth storage unavailable', { cause });
    this.name = 'AuthMasterKeyStorageError';
  }
}

async function readOrCreateAuthMasterKey(dataDir: string, hasSessions: () => boolean, entropy: (length: number) => Uint8Array): Promise<Buffer> {
  const path = join(dataDir, 'auth-master.key');
  let file;
  try {
    file = await open(path, 'wx', 0o600);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    const existing = await lstat(path);
    if (!existing.isFile()) throw new Error('Auth master key storage is invalid');
    await chmod(path, 0o600);
    const key = await readFile(path);
    if (key.length !== 32) throw new Error('Auth master key storage is invalid');
    return key;
  }
  try {
    if (hasSessions()) throw new Error('Auth master key is missing while sessions exist');
    const key = exactBytes(entropy, 32);
    await file.writeFile(key);
    await file.close();
    return key;
  } catch (error) {
    try {
      await file.close();
      await unlink(path);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Auth master key initialization and cleanup failed');
    }
    throw error;
  }
}

export async function loadAuthMasterKey(dataDir: string, hasSessions: () => boolean, entropy: (length: number) => Uint8Array = nodeRandomBytes): Promise<Buffer> {
  try {
    return await readOrCreateAuthMasterKey(dataDir, hasSessions, entropy);
  } catch (cause) {
    throw new AuthMasterKeyStorageError(cause);
  }
}

export class PasswordChangeStorageError extends Error {
  constructor(cause: unknown) { super('Password storage unavailable', { cause }); this.name = 'PasswordChangeStorageError'; }
}
export class PasswordChangeError extends Error {
  constructor(readonly code: 'UNAUTHORIZED' | 'INVALID_CURRENT_PASSWORD' | 'BAD_REQUEST') { super(code); this.name = 'PasswordChangeError'; }
}
export interface AuthSessionService {
  changePassword(token: string, currentPassword: string, newPassword: string): Promise<{ username: string; token: string; csrfToken: string; cleanupWarning: boolean }>;
  hasActiveSessions(): boolean;
  login(username: string, password: string): Promise<{ readonly username: string; readonly token: string } | undefined>;
  authenticate(token: string | undefined, onRejection?: (reason: SessionRejectionReason) => void): { readonly username: string; readonly csrfToken: string } | undefined;
  verifyCsrf(token: string, supplied: unknown): boolean;
  revoke(token: string): Promise<void>;
  onRevoke(listener: (token: string) => void | Promise<void>): () => void;
}

export async function createAuthSessionService(input: {
  readonly passwordOperations?: { hash: typeof hashPassword; verify: typeof verifyPassword };
  readonly repository: OwnerRepository;
  readonly masterKey: Buffer;
  readonly now?: () => number;
  readonly randomBytes?: (length: number) => Uint8Array;
}): Promise<AuthSessionService> {
  const { repository, masterKey, now = Date.now, randomBytes = nodeRandomBytes } = input;
  if (masterKey.length !== 32) throw new Error('Auth master key storage is invalid');
  // The absent-user path still performs the same asynchronous password derivation.
  const dummyHash = await hashPassword('dummy password for absent owner', () => Buffer.alloc(16));
  const csrfFor = (token: string) => createHmac('sha256', masterKey).update('csrf:v1:').update(token).digest('base64url');
  const revocationListeners = new Set<(token: string) => void | Promise<void>>();
  const revocations = new Map<string, Promise<void>>();
  const passwords = input.passwordOperations ?? { hash: hashPassword, verify: verifyPassword };
  // Only live tokens used by this process can own live resources. Persist only hashes.
  const observedTokens = new Map<string, number>();
  function observe(token: string) {
    for (const [value, until] of observedTokens) if (until <= now()) observedTokens.delete(value);
    observedTokens.set(token, now() + sessionLifetimeMs);
  }
  function notifyRevocation(token: string): Promise<void> {
    const tokenHash = digest(token);
    observedTokens.delete(token);
    const existing = revocations.get(tokenHash);
    if (existing) return existing;
    const pending: Promise<void>[] = [];
    for (const listener of revocationListeners) {
      try { pending.push(Promise.resolve(listener(token))); }
      catch (cause) { pending.push(Promise.reject(cause)); }
    }
    const cleanup = Promise.allSettled(pending).then(results => {
      const failures = results.filter(result => result.status === 'rejected').map(result => result.reason as unknown);
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, 'Session revocation cleanup failed');
    });
    revocations.set(tokenHash, cleanup);
    void cleanup.then(() => { revocations.delete(tokenHash); }, () => { revocations.delete(tokenHash); });
    return cleanup;
  }
  const service: AuthSessionService = {
    hasActiveSessions: () => repository.hasActiveSessions(now()),
    async login(username, password) {
      const owner = repository.getOwnerCredentials(username);
      const accepted = await passwords.verify(password, owner?.passwordHash ?? dummyHash);
      if (!owner || !accepted) return undefined;
      const token = exactBytes(randomBytes, 32).toString('base64url');
      const issuedAt = now();
      if (!repository.createSessionIfCredentialsMatch({
        username: owner.username, expectedPasswordHash: owner.passwordHash,
        tokenHash: digest(token), csrfHash: digest(csrfFor(token)), now: issuedAt, expiresAt: issuedAt + sessionLifetimeMs,
      })) return undefined;
      observe(token);
      return { username: owner.username, token };
    },
    authenticate(token, onRejection) {
      if (!token) { onRejection?.('SESSION_COOKIE_UNAVAILABLE'); return undefined; }
      if (!cookiePattern.test(token)) { onRejection?.('SESSION_TOKEN_MALFORMED'); return undefined; }
      const row = repository.findSession(digest(token), now(), onRejection);
      if (!row) return undefined;
      const csrfToken = csrfFor(token);
      if (!/^[a-f0-9]{64}$/.test(row.csrfHash) || !timingSafeEqual(Buffer.from(digest(csrfToken), 'hex'), Buffer.from(row.csrfHash, 'hex'))) { onRejection?.('SESSION_CSRF_MISMATCH'); return undefined; }
      observe(token);
      return { username: row.username, csrfToken };
    },
    verifyCsrf(token, supplied) {
      if (typeof supplied !== 'string' || !csrfPattern.test(supplied)) return false;
      const expected = csrfFor(token);
      return timingSafeEqual(Buffer.from(supplied, 'utf8'), Buffer.from(expected, 'utf8'));
    },
    async changePassword(token, currentPassword, newPassword) {
      if (!passwordChangeRequestSchema.safeParse({ currentPassword, newPassword }).success) throw new PasswordChangeError('BAD_REQUEST');
      const identity = service.authenticate(token);
      if (!identity) throw new PasswordChangeError('UNAUTHORIZED');
      const owner = repository.getOwnerCredentials(identity.username);
      if (!owner) throw new PasswordChangeError('UNAUTHORIZED');
      if (!await passwords.verify(currentPassword, owner.passwordHash)) throw new PasswordChangeError('INVALID_CURRENT_PASSWORD');
      const passwordHash = await passwords.hash(newPassword);
      const replacement = exactBytes(randomBytes, 32).toString('base64url');
      const issuedAt = now();
      let committed: boolean;
      try {
        committed = repository.changePasswordAndRotateSession({
          username: owner.username, expectedPasswordHash: owner.passwordHash, passwordHash, previousTokenHash: digest(token),
          tokenHash: digest(replacement), csrfHash: digest(csrfFor(replacement)), now: issuedAt, expiresAt: issuedAt + sessionLifetimeMs,
        });
      } catch (cause) { throw new PasswordChangeStorageError(cause); }
      if (!committed) throw new PasswordChangeError('UNAUTHORIZED');
      const revokedTokens = [...observedTokens.keys()];
      observe(replacement);
      // Start all listeners synchronously before yielding; one failure cannot skip another.
      const results = await Promise.allSettled(revokedTokens.map(notifyRevocation));
      return { username: owner.username, token: replacement, csrfToken: csrfFor(replacement), cleanupWarning: results.some(result => result.status === 'rejected') };
    },
    revoke(token) {
      repository.revokeSession(digest(token));
      return notifyRevocation(token);
    },
    onRevoke(listener) {
      revocationListeners.add(listener);
      return () => { revocationListeners.delete(listener); };
    },
  };
  return service;
}
