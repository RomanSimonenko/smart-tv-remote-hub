import {useEffect,useRef,useState} from 'react';
import type {CleanupPreview,StoragePolicy,StorageSummary} from '@remote-webos-tv/contracts';
import {storagePolicySchema} from '@remote-webos-tv/contracts';
import {api,ApiFailure,friendlyError} from '../api.js';
import {formatLocale,m,useTranslation,useUiMessage} from '../i18n.js';
import {SettingsDialog} from '../components/SettingsDialog.js';
import type {SettingsProps} from './Settings.js';

export function formatBytes(bytes:number){
 const units=['B','KiB','MiB','GiB','TiB'];const power=Math.min(4,bytes>0?Math.floor(Math.log(bytes)/Math.log(1024)):0);
 return `${new Intl.NumberFormat(formatLocale(),{maximumFractionDigits:1}).format(bytes/1024**power)} ${units[power]}`;
}
export function StorageSettings({csrfToken,onSessionExpired,onDirtyChange}:SettingsProps){
 const {t}=useTranslation('settings');const [summary,setSummary]=useState<StorageSummary|null>(null),[draft,setDraft]=useState<StoragePolicy|null>(null);
 const [days,setDays]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[preview,setPreview]=useState<CleanupPreview|null>(null);
 const [error,setError]=useUiMessage(),[notice,setNotice]=useUiMessage();const lifetime=useRef<AbortController|null>(null);
 const dirty=!!(summary&&draft&&(days!==String(summary.policy.days)||draft.automatic!==summary.policy.automatic||draft.keepUnsuccessful!==summary.policy.keepUnsuccessful));
 useEffect(()=>onDirtyChange(dirty),[dirty,onDirtyChange]);
 useEffect(()=>{const controller=new AbortController();lifetime.current=controller;void load(controller.signal);return()=>controller.abort();},[]);
 function failure(cause:unknown){if(cause instanceof ApiFailure&&cause.status===401){onSessionExpired();return;}setError(cause instanceof ApiFailure&&cause.code.startsWith('CLEANUP_PREVIEW_')?m('settings','stale'):()=>friendlyError(cause));}
 async function load(signal:AbortSignal){setLoading(true);setError('');try{const value=await api.storageSummary(signal);if(!signal.aborted){setSummary(value);setDraft(value.policy);setDays(String(value.policy.days));}}catch(cause){if(!signal.aborted)failure(cause);}finally{if(!signal.aborted)setLoading(false);}}
 async function act(action:(signal:AbortSignal)=>Promise<void>){const signal=lifetime.current!.signal;setBusy(true);setError('');setNotice('');try{await action(signal);}catch(cause){if(!signal.aborted)failure(cause);}finally{if(!signal.aborted)setBusy(false);}}
 const value=draft?{...draft,days:Number(days)}:null,valid=storagePolicySchema.safeParse(value).success&&days.trim()!=='';
 return <><div className="settings-title-row"><div><h2>{t('storageTitle')}</h2><p className="settings-muted">{t('storageHint')}</p></div><button type="button" disabled={loading||busy||dirty} onClick={()=>void load(lifetime.current!.signal)}>{t('refresh')}</button></div>
 {loading&&<p role="status">{t('loading')}</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {!loading&&!summary&&<button type="button" onClick={()=>void load(lifetime.current!.signal)}>{t('retry')}</button>}
 {summary&&draft&&<>
 <section className="settings-block"><h3>{t('usage')}</h3><dl className="settings-data-list">
  <div><dt>{t('total')}</dt><dd>{formatBytes(summary.totalBytes)}</dd></div>
  <div><dt>{t('database')}<small>{t('reportsDetail',{count:summary.reports.count,bytes:formatBytes(summary.reports.bytes)})}</small></dt><dd>{formatBytes(summary.databaseBytes)}</dd></div>
  <div><dt>{t('snapshots')}<small>{t('snapshotsDetail',{count:summary.snapshots.count,bytes:formatBytes(summary.snapshots.quotaBytes)})}</small></dt><dd>{formatBytes(summary.snapshots.bytes)}</dd></div>
  <div><dt>{t('backups')}</dt><dd>{formatBytes(summary.backupBytes)}</dd></div><div><dt>{t('other')}</dt><dd>{formatBytes(summary.otherBytes)}</dd></div><div><dt>{t('free')}</dt><dd>{formatBytes(summary.freeBytes)}</dd></div>
 </dl><label className="settings-quota">{t('quota')}<progress max={summary.snapshots.quotaBytes||1} value={summary.snapshots.bytes}/></label>
 <p className="settings-muted"><strong>{t('videoTitle')}. </strong>{t('videoHint')}</p></section>
 <form onSubmit={event=>{event.preventDefault();if(!value||!valid)return;void act(async signal=>{const policy=await api.saveStoragePolicy(value,csrfToken,signal);if(signal.aborted)return;setSummary({...summary,policy});setDraft(policy);setDays(String(policy.days));setNotice(m('settings','saved'));});}}>
 <fieldset disabled={busy||loading}><legend>{t('retention')}</legend><p className="settings-muted">{t('retentionHint')}</p>
 <label className="settings-days">{t('days')}<input type="number" min={1} max={3650} step={1} required value={days} onChange={event=>{setDays(event.target.value);setPreview(null);setNotice('');}}/></label>
 <label className="settings-checkbox"><input type="checkbox" checked={draft.automatic} onChange={event=>{setDraft({...draft,automatic:event.target.checked});setNotice('');}}/><span>{t('automatic')}<small>{t('automaticHint')}</small></span></label>
 <label className="settings-checkbox"><input type="checkbox" checked={draft.keepUnsuccessful} onChange={event=>{setDraft({...draft,keepUnsuccessful:event.target.checked});setPreview(null);setNotice('');}}/><span>{t('keep')}<small>{t('keepHint')}</small></span></label>
 </fieldset><div className="settings-actions"><button className="primary" type="submit" disabled={busy||!dirty||!valid}>{t('save')}</button></div></form>
 <section className="settings-block"><h3>{t('cleanupTitle')}</h3><p className="settings-muted">{t('cleanupHint')}</p>
 <button type="button" disabled={busy||!valid} onClick={()=>void act(async signal=>{const p=await api.previewCleanup({days:Number(days),keepUnsuccessful:draft.keepUnsuccessful},csrfToken,signal);if(!signal.aborted)setPreview(p);})}>{t('preview')}</button>
 {summary.pendingFiles>0&&<p role="status">{t('pending',{count:summary.pendingFiles})}</p>}</section>
 </>}
 <SettingsDialog open={!!preview} title={t('previewTitle')} closeLabel={t('common:closeDialog')} busy={busy} dismissOnBackdrop={!busy} onClose={()=>{if(!busy)setPreview(null);}} footer={<div className="settings-actions"><button type="button" disabled={busy} onClick={()=>setPreview(null)}>{t('cancel')}</button>{!!preview?.candidates.length&&<button className="danger" type="button" disabled={busy||Date.now()>=preview.expiresAt} onClick={()=>void act(async signal=>{const result=await api.cleanupStorage(preview.token,csrfToken,signal);if(signal.aborted)return;setPreview(null);setNotice(m('settings','deleted',{count:result.deleted}));const fresh=await api.storageSummary(signal);if(!signal.aborted)setSummary(fresh);})}>{t('delete')}</button>}</div>}>
 {error&&preview&&<p role="alert">{error}</p>}
 {preview&&(preview.candidates.length?<><p>{t('previewHint',{count:preview.candidates.length,snapshots:preview.candidates.reduce((sum,r)=>sum+r.snapshots,0),bytes:formatBytes(preview.snapshotBytes)})}</p><p className="settings-muted">{t('reportSpace',{bytes:formatBytes(preview.reportBytes)})}</p><ul className="cleanup-candidates">{preview.candidates.map(row=><li key={row.id}><span>{row.title}</span><small>{new Date(row.endedAt).toLocaleString(formatLocale())} · {formatBytes(row.snapshotBytes)}</small></li>)}</ul>{preview.truncated&&<p>{t('truncated')}</p>}</>:<p>{t('empty')}</p>)}
 </SettingsDialog></>;
}
