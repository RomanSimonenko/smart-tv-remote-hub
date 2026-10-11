import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createApiRuntime } from '../src/runtime.js';
import { openDatabase } from '../src/storage/database.js';
import { hashPassword } from '../src/auth/passwords.js';
const origin = 'http://remote.example.test';
async function fixture(run: (app: Awaited<ReturnType<typeof createApiRuntime>>, dataDir: string) => Promise<void>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'synthetic-password-routes-'));
  const db = await openDatabase({ dataDir });
  db.sqlite.prepare('INSERT INTO owner (id, username, password_hash, display_name) VALUES (1, ?, ?, ?)').run('qa', await hashPassword('old123'), 'QA Team');
  db.close();
  const app = await createApiRuntime({ dataDir, host: '127.0.0.1', port: 8080, publicOrigin: origin, secureCookies: false, trustedProxy: [] });
  try { await run(app, dataDir); } finally { await app.close(); await rm(dataDir, { recursive: true, force: true }); }
}
async function login(app: Awaited<ReturnType<typeof createApiRuntime>>, password = 'old123') {
  const reply = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { username: 'qa', password } });
  expect(reply.statusCode).toBe(200);
  const cookie = String(reply.headers['set-cookie']).split(';')[0]!;
  const identity = (await app.inject({ url: '/api/auth/session', headers: { cookie } })).json();
  return { cookie, origin, 'x-csrf-token': identity.csrfToken };
}
test('password route rotates cookie/CSRF, revokes two clients and retains profile across restart', async () => fixture(async (app, dataDir) => {
  const first = await login(app), second = await login(app);
  const payload = { currentPassword: 'old123', newPassword: 'new123' };
  for (const headers of [{}, { ...first, origin: 'http://foreign.test' }, { ...first, 'x-csrf-token': 'invalid' }]) {
    expect((await app.inject({ method: 'POST', url: '/api/auth/password', headers, payload })).statusCode).toBe(403);
  }
  expect((await app.inject({ method: 'POST', url: '/api/auth/password', headers: first, payload: { ...payload, repeat: 'new123' } })).statusCode).toBe(400);
  const wrong = await app.inject({ method: 'POST', url: '/api/auth/password', headers: first, payload: { ...payload, currentPassword: 'bad123' } });
  expect(wrong.statusCode).toBe(403); expect(wrong.json().code).toBe('INVALID_CURRENT_PASSWORD');
  const changed = await app.inject({ method: 'POST', url: '/api/auth/password', headers: first, payload });
  expect(changed.statusCode).toBe(200);
  expect(changed.json()).toEqual({ username: 'qa', csrfToken: expect.any(String), cleanupWarning: false });
  expect(changed.headers['cache-control']).toBe('no-store');
  expect(changed.headers['set-cookie']).toContain('HttpOnly; SameSite=Strict');
  const cookie = String(changed.headers['set-cookie']).split(';')[0]!;
  for (const old of [first, second]) expect((await app.inject({ url: '/api/auth/session', headers: old })).statusCode).toBe(401);
  const headers = { origin, cookie, 'x-csrf-token': changed.json().csrfToken };
  expect((await app.inject({ method: 'PATCH', url: '/api/profile', headers: { ...headers, 'x-csrf-token': first['x-csrf-token'] }, payload: { displayName: 'Next QA', avatarId: null } })).statusCode).toBe(403);
  expect((await app.inject({ method: 'PATCH', url: '/api/profile', headers, payload: { displayName: 'Next QA', avatarId: null } })).statusCode).toBe(200);
  const oldLogin = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { username: 'qa', password: 'old123' } });
  expect(oldLogin.statusCode).toBe(401); await login(app, 'new123');
  const db = await openDatabase({ dataDir });
  try { expect(db.sqlite.prepare('SELECT display_name FROM owner').pluck().get()).toBe('Next QA'); } finally { db.close(); }
}));
test('attempt limiter is shared across owner sessions and returns retry-after', async () => fixture(async app => {
  const first = await login(app), second = await login(app);
  for (let i = 0; i < 6; i++) {
    const reply = await app.inject({ method: 'POST', url: '/api/auth/password', headers: i % 2 ? first : second, payload: { currentPassword: 'bad123', newPassword: 'new123' } });
    expect(reply.statusCode).toBe(i < 5 ? 403 : 429);
    if (i === 5) expect(reply.headers['retry-after']).toBeDefined();
  }
}));
test('missing session is unauthorized and storage failure does not change credentials', async () => fixture(async (app, dataDir) => {
  const payload = { currentPassword: 'old123', newPassword: 'new123' };
  expect((await app.inject({ method: 'POST', url: '/api/auth/password', headers: { origin }, payload })).statusCode).toBe(401);
  const first = await login(app);
  const db = await openDatabase({ dataDir });
  db.sqlite.exec("CREATE TRIGGER synthetic_insert_failure BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
  try {
    const reply = await app.inject({ method: 'POST', url: '/api/auth/password', headers: first, payload });
    expect(reply.statusCode).toBe(503); expect(reply.body).not.toContain('synthetic failure');
    expect((await app.inject({ url: '/api/auth/session', headers: first })).statusCode).toBe(200);
  } finally { db.close(); }
}));
