import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { openDatabase } from '../src/storage/database.js';
import { createOwnerRepository } from '../src/auth/repository.js';
import { createAuthSessionService } from '../src/auth/sessions.js';
import { hashPassword, verifyPassword } from '../src/auth/passwords.js';

async function fixture(run: (value: { repository: ReturnType<typeof createOwnerRepository>; db: Awaited<ReturnType<typeof openDatabase>> }) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'synthetic-password-change-'));
  const db = await openDatabase({ dataDir: directory });
  try {
    db.sqlite.prepare('INSERT INTO owner (id, username, password_hash) VALUES (1, ?, ?)').run('qa', await hashPassword('old123'));
    await run({ repository: createOwnerRepository(db.sqlite), db });
  } finally { db.close(); await rm(directory, { recursive: true, force: true }); }
}
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }

test('changes password, rotates current token and revokes every other token through listeners', async () => fixture(async ({ repository, db }) => {
  const service = await createAuthSessionService({ repository, masterKey: Buffer.alloc(32, 1) });
  const a = (await service.login('qa', 'old123'))!, b = (await service.login('qa', 'old123'))!;
  const revoked = vi.fn(); service.onRevoke(revoked);
  const result = await service.changePassword(a.token, 'old123', 'new123');
  expect(result.cleanupWarning).toBe(false);
  expect(service.authenticate(a.token)).toBeUndefined(); expect(service.authenticate(b.token)).toBeUndefined();
  expect(service.authenticate(result.token)).toEqual({ username: 'qa', csrfToken: result.csrfToken });
  expect(service.verifyCsrf(result.token, result.csrfToken)).toBe(true);
  expect(revoked.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([a.token, b.token]));
  expect(await service.login('qa', 'old123')).toBeUndefined();
  expect(await service.login('qa', 'new123')).toBeDefined();
  expect(db.sqlite.prepare('SELECT count(*) FROM sessions').pluck().get()).toBe(2);
}));

test('wrong current password and failed transaction preserve credentials and sessions', async () => fixture(async ({ repository, db }) => {
  const service = await createAuthSessionService({ repository, masterKey: Buffer.alloc(32, 1) });
  const a = (await service.login('qa', 'old123'))!;
  const before = db.sqlite.prepare('SELECT * FROM sessions').all();
  const owner = repository.getOwnerCredentials('qa');
  await expect(service.changePassword(a.token, 'bad123', 'new123')).rejects.toMatchObject({ code: 'INVALID_CURRENT_PASSWORD' });
  db.sqlite.exec("CREATE TRIGGER synthetic_insert_failure BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
  await expect(service.changePassword(a.token, 'old123', 'new123')).rejects.toThrow();
  expect(db.sqlite.prepare('SELECT * FROM sessions').all()).toEqual(before);
  expect(repository.getOwnerCredentials('qa')).toEqual(owner);
}));

test('login verified against an old hash cannot create a session after password change', async () => fixture(async ({ repository }) => {
  const waiting = gate(), entered = gate(); let pause = false;
  const service = await createAuthSessionService({ repository, masterKey: Buffer.alloc(32, 1), passwordOperations: {
    hash: hashPassword, verify: async (password, hash) => { const result = await verifyPassword(password, hash); if (pause) { pause = false; entered.release(); await waiting.promise; } return result; },
  } });
  const a = (await service.login('qa', 'old123'))!;
  pause = true; const login = service.login('qa', 'old123'); await entered.promise;
  const updated = await service.changePassword(a.token, 'old123', 'new123');
  waiting.release(); expect(await login).toBeUndefined(); expect(service.authenticate(updated.token)).toBeDefined();
}));

test.each(['logout', 'other-change'] as const)('rechecks session and hash after asynchronous hashing: %s', async mode => fixture(async ({ repository }) => {
  const waiting = gate(), entered = gate(); let pause = false;
  const service = await createAuthSessionService({ repository, masterKey: Buffer.alloc(32, 1), passwordOperations: {
    verify: verifyPassword, hash: async password => { const hash = await hashPassword(password); if (pause) { pause = false; entered.release(); await waiting.promise; } return hash; },
  } });
  const a = (await service.login('qa', 'old123'))!;
  pause = true; const change = service.changePassword(a.token, 'old123', 'new123');
  const rejected = expect(change).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  await entered.promise;
  if (mode === 'logout') await service.revoke(a.token);
  else await service.changePassword(a.token, 'old123', 'other6');
  waiting.release(); await rejected;
}));

test('all cleanup listeners run and a committed change returns a new session with warning on cleanup failure', async () => fixture(async ({ repository }) => {
  const service = await createAuthSessionService({ repository, masterKey: Buffer.alloc(32, 1) });
  const a = (await service.login('qa', 'old123'))!;
  const cleaned = vi.fn(); service.onRevoke(() => { throw new Error('synthetic cleanup'); }); service.onRevoke(cleaned);
  const result = await service.changePassword(a.token, 'old123', 'new123');
  expect(result.cleanupWarning).toBe(true); expect(cleaned).toHaveBeenCalledWith(a.token);
  expect(service.authenticate(result.token)).toBeDefined(); expect(service.authenticate(a.token)).toBeUndefined();
}));
