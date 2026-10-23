import {useEffect,useRef,useState} from 'react';
import type {Diagnostics} from '@remote-webos-tv/contracts';
import {api,ApiFailure,friendlyError} from '../api.js';
import {formatLocale,m,useTranslation,useUiMessage} from '../i18n.js';

export function DiagnosticsSettings({onSessionExpired}:{onSessionExpired():void}){
 const {t}=useTranslation('settings');const [data,setData]=useState<Diagnostics|null>(null),[busy,setBusy]=useState(false),[error,setError]=useUiMessage();
 const lifetime=useRef<AbortController|null>(null);
 useEffect(()=>{const controller=new AbortController();lifetime.current=controller;void check(controller.signal);return()=>controller.abort();},[]);
 async function check(signal:AbortSignal){setBusy(true);setError('');try{const value=await api.diagnostics(signal);if(!signal.aborted)setData(value);}catch(cause){if(!signal.aborted){if(cause instanceof ApiFailure&&cause.status===401)onSessionExpired();else setError(()=>friendlyError(cause));}}finally{if(!signal.aborted)setBusy(false);}}
 function download(){if(!data)return;try{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`blyudce-diagnostics-${new Date(data.checkedAt).toISOString().replace(/[:.]/g,'-')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);}catch{setError(m('settings','downloadError'));}}
 return <><div className="settings-title-row"><div><h2>{t('diagnosticsTitle')}</h2><p className="settings-muted">{t('diagnosticsHint')}</p></div><button type="button" disabled={busy} onClick={()=>void check(lifetime.current!.signal)}>{t('check')}</button></div>
 {busy&&<p role="status">{t('loading')}</p>}{error&&<p role="alert">{error}</p>}
 {data&&<><p className="settings-muted">{t('checked',{time:new Date(data.checkedAt).toLocaleString(formatLocale())})}</p><dl className="settings-data-list diagnostic-checks">
 {(['api','database','storage'] as const).map(key=><div key={key}><dt>{t(key==='storage'?'storageCheck':key)}</dt><dd data-state={data.checks[key]}>{t(data.checks[key])}</dd></div>)}<div><dt>{t('ocr')}</dt><dd data-state={data.ocr.state}>{t(data.ocr.state)}</dd></div></dl>
 <section className="settings-block"><h3>{t('versions')}</h3><dl className="settings-data-list">{(['applicationVersion','nodeVersion','sqliteVersion','schemaVersion'] as const).map(key=><div key={key}><dt>{t(key)}</dt><dd>{data[key]}</dd></div>)}<div><dt>{t('engine')}</dt><dd>{data.ocr.engine??'—'}</dd></div><div><dt>{t('model')}</dt><dd>{data.ocr.model??'—'}</dd></div></dl></section>
 <section className="settings-block"><h3>{t('cleanupState')}</h3><p>{t('lastCheck')}: {data.cleanup.pendingFiles===null?t('unknown'):data.cleanup.lastAutomaticCheckAt===null?t('never'):new Date(data.cleanup.lastAutomaticCheckAt).toLocaleString(formatLocale())}</p>{data.cleanup.lastAutomaticError&&<p role="alert">{t('cleanupError')}</p>}{data.cleanup.pendingFiles!==null&&data.cleanup.pendingFiles>0&&<p role="status">{t('pending',{count:data.cleanup.pendingFiles})}</p>}</section></>}
 <section className="settings-block"><p className="settings-muted">{t('safeReport')}</p><button type="button" disabled={!data||busy} onClick={download}>{t('download')}</button></section></>;
}
