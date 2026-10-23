import {useTranslation} from '../i18n.js';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { loginRequestSchema, type LoginRequest } from '@remote-webos-tv/contracts';

interface Props { busy: boolean; error: ReactNode; feedback?: string | undefined; credentialsInvalid?: boolean; onEdit?(): void; onSubmit(input: LoginRequest): void }
export function Login({ busy, error, feedback, credentialsInvalid = false, onEdit, onSubmit }: Props) {
  const {t}=useTranslation('auth');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState({ username: '', password: '' });
  const usernameRef = useRef<HTMLInputElement>(null), passwordRef = useRef<HTMLInputElement>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    onEdit?.();
    const parsed = loginRequestSchema.safeParse({ username, password });
    if (!parsed.success) {
      const invalid = new Set(parsed.error.issues.map((issue) => issue.path[0]));
      setFields({ username: invalid.has('username') ? (username ? 'usernameLength' : 'enterUsername') : '', password: invalid.has('password') ? (password ? 'passwordLength' : 'enterPassword') : '' });
      (invalid.has('username') ? usernameRef : passwordRef).current?.focus(); return;
    }
    setFields({ username: '', password: '' }); onSubmit(parsed.data);
  }
  return <section className="form-card login-card">
    <h1>{t('signInTitle')}</h1>
    {feedback && <p role="status">{feedback}</p>}
    <form noValidate onSubmit={submit}>
      <div><label>{t('username')}<input ref={usernameRef} disabled={busy} value={username} onChange={(event) => { setUsername(event.target.value); setFields((current) => ({ ...current, username: '' })); onEdit?.(); }} autoComplete="username" aria-invalid={!!fields.username || credentialsInvalid} aria-describedby={fields.username ? 'login-username-error' : credentialsInvalid ? 'app-error' : undefined} required /></label>
      {fields.username && <p id="login-username-error" role="alert" className="error field-error">{t(fields.username)}</p>}</div>
      <div><label>{t('password')}<input ref={passwordRef} disabled={busy} value={password} onChange={(event) => { setPassword(event.target.value); setFields((current) => ({ ...current, password: '' })); onEdit?.(); }} type="password" autoComplete="current-password" aria-invalid={!!fields.password || credentialsInvalid} aria-describedby={fields.password ? 'login-password-error' : credentialsInvalid ? 'app-error' : undefined} required /></label>
      {fields.password && <p id="login-password-error" role="alert" className="error field-error">{t(fields.password)}</p>}</div>
      {error}
      <p role="status" aria-live="polite">{busy ? t('signingInStatus') : ''}</p>
      <button className="settings-primary" disabled={busy} type="submit">{busy ? t('signingIn') : t('signIn')}</button>
    </form>
  </section>;
}
