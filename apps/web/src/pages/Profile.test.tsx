// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Profile } from './Profile.js';
afterEach(cleanup);
const profile = { username: 'qa-owner', displayName: 'QA', avatarId: null } as const;
test('edits name and one of 16 icons and saves only changed values', async () => {
  const save = vi.fn().mockResolvedValue(true);
  render(<Profile profile={profile} saving={false} error="" onSave={save} onDirtyChange={vi.fn()} />);
  expect((screen.getByLabelText('Имя пользователя') as HTMLInputElement).readOnly).toBe(true);
  expect(screen.getAllByRole('radio')).toHaveLength(17);
  const button = screen.getByRole('button', { name: 'Сохранить изменения' });
  expect(button.hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Отображаемое имя'), { target: { value: 'QA Team' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Робот' }));
  fireEvent.click(button);
  await waitFor(() => expect(save).toHaveBeenCalledWith({ displayName: 'QA Team', avatarId: 'robot' }));
});
test('retains unsaved name on failure and reports dirty state', async () => {
  const dirty = vi.fn();
  render(<Profile profile={profile} saving={false} error="Ошибка сохранения" onSave={vi.fn().mockResolvedValue(false)} onDirtyChange={dirty} />);
  fireEvent.change(screen.getByLabelText('Отображаемое имя'), { target: { value: 'Draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  expect((screen.getByLabelText('Отображаемое имя') as HTMLInputElement).value).toBe('Draft');
  expect(dirty).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole('alert').textContent).toBe('Ошибка сохранения');
});
test('legacy padded login fallback does not mark an untouched form dirty', () => {
  const dirty = vi.fn();
  render(<Profile profile={{ username: ' QA ', displayName: ' QA ', avatarId: null }} saving={false} error="" onSave={vi.fn()} onDirtyChange={dirty} />);
  expect(dirty).toHaveBeenLastCalledWith(false);
  expect(screen.getByRole('button', { name: 'Сохранить изменения' }).hasAttribute('disabled')).toBe(true);
});
