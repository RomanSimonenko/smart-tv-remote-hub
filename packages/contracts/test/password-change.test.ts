import { expect, test } from 'vitest';
import { passwordSchema, passwordChangeRequestSchema, passwordChangeResponseSchema } from '../src/auth.js';
test.each([5, 6, 128, 129])('password boundary %i uses Unicode code points', length => {
  expect(passwordSchema.safeParse('😀'.repeat(length)).success).toBe(length >= 6 && length <= 128);
});
test('password retains spaces and change contracts reject extra data', () => {
  expect(passwordSchema.parse(' a b c ')).toBe(' a b c ');
  expect(passwordChangeRequestSchema.safeParse({ currentPassword: 'old123', newPassword: 'new123', repeat: 'new123' }).success).toBe(false);
  expect(passwordChangeResponseSchema.parse({ username: 'qa', csrfToken: 'A'.repeat(43), cleanupWarning: false })).toHaveProperty('cleanupWarning', false);
});
