import { i18n, useTranslation, useUiMessage } from '../i18n.js';
import { useEffect, useRef, useState } from 'react';
import { addTvRequestSchema, tvMacAddressSchema, tvPlatformSchema, type TvId, type TvPlatform } from '@remote-webos-tv/contracts';
import { api, ApiFailure, friendlyError } from '../api.js';
import { requestId } from '../requestId.js';
import { TvSetup } from './TvSetup.js';
import { IconChevronDown } from '@tabler/icons-react';

interface Props { csrfToken: string; onSessionExpired(): void; onReady(): void }
export function AddTv({ csrfToken, onSessionExpired, onReady }: Props) {
  useTranslation('devices');
  const [host, setHost] = useState('');
  const [mac, setMac] = useState('');
  const [platform, setPlatform] = useState<TvPlatform>('webos');
  const [tvId, setTvId] = useState<TvId | null>(null);
  const [error, setError] = useUiMessage();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; }, []);
  async function submit() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    controller.current = new AbortController();
    try {
      const address = platform === 'webos' ? tvMacAddressSchema.safeParse(mac) : null;
      if (address && !address.success) { setError(() => (i18n.t('invalidMacActive', { ns: 'devices' }))); return; }
      const input = addTvRequestSchema.safeParse({ id: requestId(), platform, host, ...(address?.success ? { mac: address.data } : {}) });
      if (!input.success) { setError(() => (i18n.t('invalidIp', { ns: 'devices' }))); return; }
      const result = await api.addTv(input.data, csrfToken, controller.current.signal);
      if (active.current) setTvId(result.tvId);
    } catch (cause) {
      if (!active.current) return;
      if (cause instanceof ApiFailure && cause.status === 401) onSessionExpired();
      else setError(() => (friendlyError(cause)));
    } finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return tvId ? <TvSetup key={tvId} tvId={tvId} initialHost={host} platform={platform} csrfToken={csrfToken} onReady={onReady} onSessionExpired={onSessionExpired} settingsOpen={false} onCloseSettings={() => {}} /> : <section className="form-card add-tv">
    <h1>{i18n.t('addTv', { ns: 'devices' })}</h1>
    <p>{platform === 'whale' ? i18n.t('addWhaleHint', { ns: 'devices' }) : i18n.t('addHint', { ns: 'devices' })}</p>
    <form noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label>{i18n.t('platform', { ns: 'devices' })}<span className="platform-select"><select disabled={busy} value={platform} onChange={(event) => setPlatform(tvPlatformSchema.parse(event.target.value))}><option value="webos">LG webOS</option><option value="tizen">Samsung Tizen</option><option value="whale">Philips Whale</option></select><IconChevronDown aria-hidden="true" /></span></label>
      <label>{i18n.t('ip', { ns: 'devices' })}<input inputMode="decimal" autoComplete="off" disabled={busy} value={host} onChange={(event) => setHost(event.target.value)} /></label>
      {platform === 'webos' && <label>{i18n.t('mac', { ns: 'devices' })}<input autoComplete="off" spellCheck={false} placeholder="AA:BB:CC:DD:EE:FF" disabled={busy} value={mac} onChange={(event) => setMac(event.target.value)} /><span className="muted">{i18n.t('macHint', { ns: 'devices' })}</span></label>}
      <button className="primary" type="submit" disabled={busy}>{busy ? i18n.t('connectingEllipsis', { ns: 'devices' }) : i18n.t('connect', { ns: 'devices' })}</button>
    </form>
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
