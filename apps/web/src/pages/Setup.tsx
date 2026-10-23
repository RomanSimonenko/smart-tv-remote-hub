import {useTranslation,useUiMessage,m} from '../i18n.js';
import { useState, type ReactNode, type FormEvent } from 'react';
import { setupRequestSchema, type SetupRequest } from '@remote-webos-tv/contracts';

interface Props { busy: boolean; error: ReactNode; onSubmit(input: SetupRequest): void }
export function Setup({ busy, error, onSubmit }: Props) {
  const {t}=useTranslation('auth');
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useUiMessage('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = setupRequestSchema.safeParse({ token, username, password });
    if (!parsed.success) {
      setValidationError(m('auth','setupValidation'));
      return;
    }
    setValidationError('');
    onSubmit(parsed.data);
  }
  return <section className="form-card">
    <h1>{t('setupTitle')}</h1>
    <p>{t('setupHelp')}</p>
    <details className="setup-token-help"><summary>{t('whereToken')}</summary>
      <p>{t('tokenCommandHelp')}</p>
      <p>Docker Compose:</p><code>docker compose exec app node apps/api/dist/src/auth/cli.js setup-token</code>
      <p>{t('sourceLaunch')}</p><code>pnpm --filter @remote-webos-tv/api setup-token</code>
      <p>{t('tokenSafety')}</p>
    </details>
    <form onSubmit={submit}>
      <label>{t('setupToken')}<input value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" required /></label>
      <label>{t('ownerName')}<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" aria-describedby="setup-lengths" required /></label>
      <label>{t('password')}<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" aria-describedby="setup-lengths" required /></label>
      <p id="setup-lengths">{t('setupLengths')}</p>
      {validationError ? <p role="alert">{validationError}</p> : error}
      <p role="status" aria-live="polite">{busy ? t('creatingOwner') : ''}</p>
      <button className="settings-primary" disabled={busy} type="submit">{busy ? t('creating') : t('createOwner')}</button>
    </form>
  </section>;
}
