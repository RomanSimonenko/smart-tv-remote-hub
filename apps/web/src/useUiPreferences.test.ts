// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useUiPreferences } from './useUiPreferences.js';
const key = 'smart-tv-remote-hub.ui-preferences.v1';
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
test('reads and persists collapsed state across mounts', () => {
  const first = renderHook(() => useUiPreferences());
  expect(first.result.current.collapsed).toBe(false);
  act(() => first.result.current.setCollapsed(true));
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ collapsed: true });
  first.unmount();
  expect(renderHook(() => useUiPreferences()).result.current.collapsed).toBe(true);
});
test.each(['{', 'null', 'true', '{"collapsed":"true"}', '{"collapsed":true,"secret":"synthetic"}'])('rejects invalid stored shape %s', value => {
  localStorage.setItem(key, value);
  const { result } = renderHook(() => useUiPreferences());
  expect(result.current.collapsed).toBe(false);
  expect(result.current.persistenceError).toBeTruthy();
});
test('storage failure is observable and does not prevent toggling', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  const { result } = renderHook(() => useUiPreferences());
  expect(result.current.persistenceError).toBeTruthy();
  act(() => result.current.setCollapsed(true));
  expect(result.current.collapsed).toBe(true);
  expect(result.current.persistenceError).toBeTruthy();
});
