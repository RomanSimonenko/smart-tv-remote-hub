import { expect, test } from 'vitest';
import { profileUpdateSchema, profileResponseSchema, profileAvatarIds } from '../src/profile.js';

test('normalizes display name and counts Unicode code points', () => {
  expect(profileUpdateSchema.parse({ displayName: '  QA  ', avatarId: null })).toEqual({ displayName: 'QA', avatarId: null });
  for (const displayName of ['A', '😀'.repeat(64)]) expect(profileUpdateSchema.safeParse({ displayName, avatarId: 'cat' }).success).toBe(true);
  for (const displayName of ['', '   ', '😀'.repeat(65)]) expect(profileUpdateSchema.safeParse({ displayName, avatarId: null }).success).toBe(false);
});
test('allows exactly 16 icons and rejects unknown fields and icons', () => {
  expect(profileAvatarIds).toHaveLength(16);
  for (const avatarId of profileAvatarIds) expect(profileUpdateSchema.safeParse({ displayName: 'QA', avatarId }).success).toBe(true);
  for (const input of [{ displayName: 'QA', avatarId: 'bad' }, { displayName: 'QA', avatarId: null, username: 'changed' }]) expect(profileUpdateSchema.safeParse(input).success).toBe(false);
  expect(profileResponseSchema.safeParse({ username: 'qa', displayName: 'QA', avatarId: null, password: 'secret' }).success).toBe(false);
});
test('reads legacy owner names without normalizing the login-derived display name', () => {
  expect(profileResponseSchema.parse({ username: ' QA ', displayName: ' QA ', avatarId: null }).displayName).toBe(' QA ');
  expect(profileResponseSchema.safeParse({ username: ' ', displayName: ' ', avatarId: null }).success).toBe(true);
});
