import Database from 'better-sqlite3';
import { expect, test } from 'vitest';
import { schemaMigrations } from '../src/storage/migrations.js';
import { createProfileRepository } from '../src/profile/repository.js';

test('migrates an existing owner without changing credentials or sessions', () => {
  const sqlite = new Database(':memory:');
  try {
    for (const migration of schemaMigrations.filter(m => m.version <= 5)) migration.up(sqlite);
    sqlite.prepare('INSERT INTO owner VALUES (1, ?, ?)').run('qa', 'synthetic-hash');
    sqlite.prepare('INSERT INTO sessions VALUES (?, 1, 1, 999, ?)').run('token-hash', 'csrf-hash');
    for (const migration of schemaMigrations.filter(m => m.version > 5)) migration.up(sqlite);
    const repository = createProfileRepository(sqlite);
    expect(repository.read()).toEqual({ username: 'qa', displayName: 'qa', avatarId: null });
    expect(repository.update({ displayName: 'QA Team', avatarId: 'robot' })).toEqual({ username: 'qa', displayName: 'QA Team', avatarId: 'robot' });
    expect(createProfileRepository(sqlite).read()).toEqual(repository.read());
    expect(sqlite.prepare('SELECT username, password_hash FROM owner').get()).toEqual({ username: 'qa', password_hash: 'synthetic-hash' });
    expect(sqlite.prepare('SELECT count(*) AS n FROM sessions').get()).toEqual({ n: 1 });
  } finally { sqlite.close(); }
});
