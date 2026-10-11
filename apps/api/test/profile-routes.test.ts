import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createApiRuntime } from '../src/runtime.js';
import { openDatabase } from '../src/storage/database.js';
import { createOwnerRepository } from '../src/auth/repository.js';
import { createOwnerSetupService } from '../src/auth/service.js';
const origin = 'https://profile.example.test';
test('profile persists, validates and protects mutations with session Origin and CSRF', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'profile-routes-'));
  const config = { dataDir, host: '127.0.0.1', port: 0, publicOrigin: origin, secureCookies: true, trustedProxy: [] };
  const db = await openDatabase({ dataDir });
  const setup = createOwnerSetupService({ repository: createOwnerRepository(db.sqlite) });
  const token = await setup.issueSetupToken();
  await setup.claimOwner({ token, username: 'qa', password: 'synthetic-password-only' });
  db.close();
  const app = await createApiRuntime(config);
  try {
    expect((await app.inject('/api/profile')).statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { username: 'qa', password: 'synthetic-password-only' } });
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    const session = (await app.inject({ url: '/api/auth/session', headers: { cookie } })).json();
    const headers = { cookie, origin, 'x-csrf-token': session.csrfToken };
    expect((await app.inject({ url: '/api/profile', headers })).json()).toEqual({ username: 'qa', displayName: 'qa', avatarId: null });
    const payload = { displayName: ' QA Team ', avatarId: 'robot' };
    for (const badHeaders of [{ cookie, origin }, { cookie, 'x-csrf-token': session.csrfToken, origin: 'https://other.example.test' }]) expect((await app.inject({ method: 'PATCH', url: '/api/profile', headers: badHeaders, payload })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PATCH', url: '/api/profile', headers, payload: { ...payload, username: 'changed' } })).statusCode).toBe(400);
    const saved = await app.inject({ method: 'PATCH', url: '/api/profile', headers, payload });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ username: 'qa', displayName: 'QA Team', avatarId: 'robot' });
    expect(saved.body).not.toMatch(/password|hash|csrf/);
    expect((await app.inject({ url: '/api/auth/session', headers })).json()).toEqual(session);
    const reopened = await openDatabase({ dataDir });
    expect(reopened.sqlite.prepare('SELECT display_name, avatar_id FROM owner').get()).toEqual({ display_name: 'QA Team', avatar_id: 'robot' });
    reopened.close();
    for (let i = 0; i < 20; i++) await app.inject({ method: 'PATCH', url: '/api/profile', headers, payload });
    expect((await app.inject({ method: 'PATCH', url: '/api/profile', headers, payload })).statusCode).toBe(429);
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers });
    expect((await app.inject({ url: '/api/profile', headers })).statusCode).toBe(401);
  } finally { await app.close(); await rm(dataDir, { recursive: true, force: true }); }
});

test('profile storage failure returns a safe diagnostic and does not expose private cause', async () => {
  const { buildApp } = await import('../src/app.js');
  const { Writable } = await import('node:stream');
  const diagnostics: unknown[] = [];
  const app = buildApp({
    config: { dataDir: 'synthetic', host: '127.0.0.1', port: 0, publicOrigin: origin, secureCookies: true, trustedProxy: [] },
    getSetupState: async () => 'claimed',
    logStream: new Writable({ write(_chunk, _encoding, done) { done(); } }),
    reportError: report => diagnostics.push(report),
    auth: { setup: {} as never, sessions: { authenticate: () => ({ username: 'qa', csrfToken: 'synthetic' }), verifyCsrf: () => true } as never },
    profile: { read: () => { throw new Error('private synthetic storage cause'); }, update: () => { throw new Error('private synthetic storage cause'); } },
  });
  try {
    for (const method of ['GET', 'PATCH'] as const) {
      const response = await app.inject({ method, url: '/api/profile', headers: { origin }, ...(method === 'PATCH' ? { payload: { displayName: 'QA', avatarId: null } } : {}) });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: expect.any(String) });
      expect(response.body).not.toMatch(/private|storage cause/);
    }
    expect(diagnostics).toHaveLength(2);
  } finally { await app.close(); }
});
