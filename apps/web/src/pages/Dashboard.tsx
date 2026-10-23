import { i18n, useTranslation, useUiMessage } from '../i18n.js';
import type { TvDevice, TvId } from '@remote-webos-tv/contracts';
import { IconDeviceDesktop, IconDeviceDesktopPlus, IconPlus, IconCircleFilled, IconTrash } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { SettingsDialog } from '../components/SettingsDialog.js';
import { friendlyError } from '../api.js';
import { connectionLabels } from '../tv-connection.js';
import { TvBrand, tvPlatformLabel } from '../tv-presentation.js';

interface Props { devices: TvDevice[] | null; loading: boolean; error: string; onOpenTv(tvId: TvId): void; onAddTv(): void; onRetry(): void; onDeleteTv(tvId: TvId, signal: AbortSignal): Promise<void> }
export function Dashboard({ devices, loading, error, onOpenTv, onAddTv, onRetry, onDeleteTv }: Props) {
  useTranslation('devices');
  const [selected, setSelected] = useState<TvDevice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useUiMessage();
  const controller = useRef<AbortController | null>(null);
  const active = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfterDelete = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (!selected && focusAfterDelete.current) { focusAfterDelete.current = false; heading.current?.focus(); } }, [selected]);
  function dismiss() { if (!controller.current) { setSelected(null); setDeleteError(''); } }
  async function confirmDelete() {
    if (!selected || controller.current) return;
    const current = new AbortController(); controller.current = current; setDeleting(true); setDeleteError('');
    try { await onDeleteTv(selected.tvId, current.signal); if (active.current) { focusAfterDelete.current = true; setSelected(null); } }
    catch (cause) { if (active.current) setDeleteError(() => (friendlyError(cause))); }
    finally { if (controller.current === current) controller.current = null; if (active.current) setDeleting(false); }
  }
  return <section className="dashboard" aria-labelledby="dashboard-title">
    <div className="dashboard-heading"><h1 ref={heading} tabIndex={-1} id="dashboard-title">{i18n.t('tvs', { ns: 'devices' })}</h1>{!!devices?.length && <button type="button" onClick={onAddTv}><IconPlus aria-hidden="true" />{i18n.t('addTvShort', { ns: 'devices' })}</button>}</div>
    {loading ? <p role="status">{i18n.t('loadingTvs', { ns: 'devices' })}</p> : error ? <div className="dashboard-error"><p role="alert" className="error">{error}</p><button type="button" onClick={onRetry}>{i18n.t('retry', { ns: 'devices' })}</button></div> : devices?.length ?
      <div className="device-grid">{devices.map(({ tvId, platform, status }) => <article key={tvId} className="device-card">
        <button type="button" className="device-delete" aria-label={i18n.t('deleteTvNamed', { ns: 'devices', name: status.tv?.identity.model ?? i18n.t('tv', { ns: 'devices' }) })} title={i18n.t('deleteTv', { ns: 'devices' })} aria-haspopup="dialog" onClick={() => { setDeleteError(''); setSelected(devices.find(device => device.tvId === tvId)!); }}><IconTrash aria-hidden="true" /></button>
        <button type="button" className="device-card-main" aria-label={i18n.t('openTvNamed', { ns: 'devices', name: status.tv?.identity.model ?? i18n.t('tv', { ns: 'devices' }) })} onClick={() => onOpenTv(tvId)}>
          <IconDeviceDesktop className="device-illustration" stroke={1.2} aria-hidden="true" />
          <span className="device-identity"><h2>{status.tv?.identity.model ?? i18n.t('tv', { ns: 'devices' })}</h2><span className="platform-badge"><TvBrand platform={platform} /><span>{tvPlatformLabel(platform, status.tv?.identity)}</span></span></span>
          <span className="device-connection" data-connection={status.connection}><IconCircleFilled aria-hidden="true" />{connectionLabels[status.connection]}</span>
        </button>
      </article>)}</div> : devices ? <div className="dashboard-empty">
        <div className="empty-illustration"><IconDeviceDesktopPlus stroke={1.2} aria-hidden="true" /></div>
        <h2>{i18n.t('emptyTvs', { ns: 'devices' })}</h2><p>{i18n.t('emptyTvsHint', { ns: 'devices' })}</p>
        <button type="button" className="dashboard-primary" onClick={onAddTv}><IconPlus aria-hidden="true" />{i18n.t('addTvShort', { ns: 'devices' })}</button>
        <p className="muted">{i18n.t('networkHint', { ns: 'devices' })}</p>
      </div> : null}
    <SettingsDialog title={i18n.t('deleteTitle', { ns: 'devices' })} closeLabel={i18n.t('cancelDeletion', { ns: 'devices' })} open={selected !== null} onClose={dismiss}>
      <p>{i18n.t('deleteDescription', { ns: 'devices', name: selected?.status.tv?.identity.model ?? i18n.t('tv', { ns: 'devices' }) })}</p>
      <p className="muted">{i18n.t('deleteSafe', { ns: 'devices' })}</p>
      {deleteError && <p role="alert" className="error">{deleteError}</p>}
      <div className="delete-tv-actions"><button type="button" disabled={deleting} onClick={dismiss}>{i18n.t('cancel', { ns: 'devices' })}</button><button type="button" className="delete-tv-confirm" disabled={deleting} onClick={() => void confirmDelete()}>{deleting ? i18n.t('deleting', { ns: 'devices' }) : i18n.t('delete', { ns: 'devices' })}</button></div>
    </SettingsDialog>
  </section>;
}
