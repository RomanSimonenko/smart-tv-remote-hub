import { useEffect, useId, useRef, useState } from 'react';
import { passwordSchema, type PasswordChangeRequest, type PasswordChangeResponse } from '@remote-webos-tv/contracts';
import { ApiFailure, friendlyError } from '../api.js';
import { SettingsDialog } from './SettingsDialog.js';

interface Props {
  onClose(): void;
  onSave(input: PasswordChangeRequest): Promise<PasswordChangeResponse>;
  onSuccess(cleanupWarning: boolean): void;
}
export function PasswordChangeDialog({ onClose, onSave, onSuccess }: Props) {
  const id = useId();
  const [currentPassword, setCurrent] = useState(''), [newPassword, setNew] = useState(''), [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [invalid, setInvalid] = useState<'current' | 'new' | 'repeat' | null>(null);
  const pending = useRef(false);
  const currentInput = useRef<HTMLInputElement>(null), newInput = useRef<HTMLInputElement>(null), repeatInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (pending.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, []);
  useEffect(() => {
    if (invalid && !busy) ({ current: currentInput, new: newInput, repeat: repeatInput })[invalid].current?.focus();
  }, [invalid, busy]);
  function clear() { setCurrent(''); setNew(''); setRepeat(''); }
  function close() { if (pending.current) return; clear(); onClose(); }
  function fail(field: 'current' | 'new' | 'repeat', message: string) {
    setInvalid(field); setError(message);
    ({ current: currentInput, new: newInput, repeat: repeatInput })[field].current?.focus();
  }
  return <SettingsDialog open title="Изменить пароль" closeLabel="Закрыть смену пароля" onClose={close} busy={busy}>
    <form className="password-change-form" noValidate onSubmit={async event => {
      event.preventDefault(); if (pending.current) return;
      setError(''); setInvalid(null);
      if (!passwordSchema.safeParse(currentPassword).success) return fail('current', 'Введите текущий пароль: от 6 до 128 символов.');
      if (!passwordSchema.safeParse(newPassword).success) return fail('new', 'Новый пароль должен содержать от 6 до 128 символов.');
      if (newPassword !== repeat) return fail('repeat', 'Пароли не совпадают');
      pending.current = true; setBusy(true);
      try {
        const result = await onSave({ currentPassword, newPassword });
        clear(); onSuccess(result.cleanupWarning);
      } catch (cause) {
        if (cause instanceof ApiFailure && cause.code === 'INVALID_CURRENT_PASSWORD') fail('current', 'Неверный текущий пароль.');
        else if (cause instanceof ApiFailure && cause.code === 'PASSWORD_CHANGE_UNCERTAIN') {
          clear(); setError('Не удалось подтвердить результат. Пароль мог измениться. Проверьте вход с новым паролем.');
        } else setError(friendlyError(cause));
      } finally { pending.current = false; setBusy(false); }
    }}>
      <label>Текущий пароль<input ref={currentInput} type="password" autoComplete="current-password" disabled={busy} value={currentPassword} onChange={event => { setCurrent(event.target.value); setError(''); setInvalid(null); }} aria-invalid={invalid === 'current'} aria-describedby={invalid === 'current' ? id + '-error' : undefined} /></label>
      <label>Новый пароль<input ref={newInput} type="password" autoComplete="new-password" disabled={busy} value={newPassword} onChange={event => { setNew(event.target.value); setError(''); setInvalid(null); }} aria-invalid={invalid === 'new'} aria-describedby={id + '-help' + (invalid === 'new' ? ' ' + id + '-error' : '')} /></label>
      <p id={id + '-help'} className="profile-caption">От 6 до 128 символов. Можно использовать буквы, цифры, пробелы и специальные символы.</p>
      <label>Повторите новый пароль<input ref={repeatInput} type="password" autoComplete="new-password" disabled={busy} value={repeat} onChange={event => { setRepeat(event.target.value); setError(''); setInvalid(null); }} aria-invalid={invalid === 'repeat'} aria-describedby={invalid === 'repeat' ? id + '-error' : undefined} /></label>
      <p className="profile-caption">На остальных устройствах потребуется войти снова. Здесь вы останетесь в приложении.</p>
      {error && <p id={id + '-error'} role="alert" className="error">{error}</p>}
      <div className="password-change-actions"><button type="button" onClick={close} disabled={busy}>Отмена</button><button type="submit" className="primary" disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить пароль'}</button></div>
    </form>
  </SettingsDialog>;
}
