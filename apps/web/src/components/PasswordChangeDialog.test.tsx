// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PasswordChangeDialog } from './PasswordChangeDialog.js';
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(cleanup);
function fill() {
  fireEvent.change(screen.getByLabelText('Текущий пароль'), { target: { value: 'old123' } });
  fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'new123' } });
  fireEvent.change(screen.getByLabelText('Повторите новый пароль'), { target: { value: 'new123' } });
}
test('shows permanent requirements, validates repeat, saves and clears secrets on success', async () => {
  const save = vi.fn().mockResolvedValue({ username: 'qa', csrfToken: 'A'.repeat(43), cleanupWarning: false }), close = vi.fn(), success = vi.fn();
  render(<PasswordChangeDialog onClose={close} onSave={save} onSuccess={success} />);
  expect(screen.getByText('От 6 до 128 символов. Можно использовать буквы, цифры, пробелы и специальные символы.')).toBeTruthy();
  fill();
  fireEvent.change(screen.getByLabelText('Повторите новый пароль'), { target: { value: 'bad123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));
  expect(screen.getByRole('alert').textContent).toBe('Пароли не совпадают');
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Повторите новый пароль'), { target: { value: 'new123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));
  await waitFor(() => expect(success).toHaveBeenCalledWith(false));
  expect(save).toHaveBeenCalledWith({ currentPassword: 'old123', newPassword: 'new123' });
  expect((screen.getByLabelText('Текущий пароль') as HTMLInputElement).value).toBe('');
});
test('blocks duplicate submission and closing while saving, then reports failure without claiming success', async () => {
  let reject!: (error: Error) => void;
  const save = vi.fn(() => new Promise<never>((_, no) => { reject = no; })), close = vi.fn();
  render(<PasswordChangeDialog onClose={close} onSave={save} onSuccess={vi.fn()} />);
  fill(); fireEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(close).not.toHaveBeenCalled(); expect(save).toHaveBeenCalledTimes(1);
  reject(new Error('synthetic failure'));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Сохранить пароль' }).hasAttribute('disabled')).toBe(false);
});
test('cancelling clears password fields', () => {
  const close = vi.fn();
  render(<PasswordChangeDialog onClose={close} onSave={vi.fn()} onSuccess={vi.fn()} />);
  fill(); fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(close).toHaveBeenCalled(); expect((screen.getByLabelText('Новый пароль') as HTMLInputElement).value).toBe('');
});
