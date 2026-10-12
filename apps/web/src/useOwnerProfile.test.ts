// @vitest-environment jsdom
import { cleanup, renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { api, ApiFailure } from './api.js';
import { useOwnerProfile } from './useOwnerProfile.js';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const profile = { username: 'qa', displayName: 'QA', avatarId: null } as const;
test('loads and updates only on confirmed save, preserving profile on error', async () => {
  vi.spyOn(api, 'getProfile').mockResolvedValue(profile);
  const save = vi.spyOn(api, 'updateProfile').mockRejectedValue(new ApiFailure(500, 'INTERNAL_ERROR'));
  const { result } = renderHook(() => useOwnerProfile('csrf', vi.fn(), true));
  await waitFor(() => expect(result.current.profile).toEqual(profile));
  await act(async () => { expect(await result.current.save({ displayName: 'Draft', avatarId: 'cat' })).toBe(false); });
  expect(result.current.profile).toEqual(profile);
  expect(result.current.error).toBeTruthy();
  save.mockResolvedValue({ ...profile, displayName: 'Draft', avatarId: 'cat' });
  await act(async () => { expect(await result.current.save({ displayName: 'Draft', avatarId: 'cat' })).toBe(true); });
  expect(result.current.profile?.displayName).toBe('Draft');
});
test('expires session on 401 and ignores responses after deactivation', async () => {
  const expired = vi.fn();
  vi.spyOn(api, 'getProfile').mockRejectedValue(new ApiFailure(401, 'UNAUTHORIZED'));
  const { result, rerender } = renderHook(({ active }) => useOwnerProfile('csrf', expired, active), { initialProps: { active: true } });
  await waitFor(() => expect(expired).toHaveBeenCalledTimes(1));
  let resolve!: (value: typeof profile) => void;
  vi.mocked(api.getProfile).mockImplementation(() => new Promise(done => { resolve = done; }));
  act(() => result.current.refresh());
  rerender({ active: false });
  await act(async () => resolve(profile));
  expect(result.current.profile).toBeNull();
});
