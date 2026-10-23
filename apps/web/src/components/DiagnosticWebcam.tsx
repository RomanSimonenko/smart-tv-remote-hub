import { i18n, useTranslation, useUiMessage, formatLocale } from '../i18n.js';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {Webcam,type WebcamHandle} from './Webcam.js';
import {api,ApiFailure} from '../api.js';
import type {OcrDiagnostics} from '@remote-webos-tv/contracts';
import {IconLoader2} from '@tabler/icons-react';
export function DiagnosticWebcam({tvId,csrfToken,onSessionExpired,onRecordingChange,recordingModel}:{tvId?:string;csrfToken:string;recordingModel?:string;onSessionExpired():void;onRecordingChange?:(active:boolean)=>void}){
  useTranslation('devices');
 const camera=useRef<WebcamHandle>(null);
 const [ready,setReady]=useState(false),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 return <Webcam {...(tvId?{tvId}:{})} {...(recordingModel?{recordingModel}:{})} {...(onRecordingChange?{onRecordingChange}:{})} recordingEnabled ref={camera} showResolution alignSnapshots={open||busy} locked={busy} onReadyChange={setReady} footer={<details className="camera-diagnostics" open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary>{i18n.t('ocrCheck', { ns: 'devices' })}{busy&&<span role="status" aria-label={i18n.t('ocrBusyAria', { ns: 'devices' })}><IconLoader2 className="run-spinner" aria-hidden="true"/></span>}</summary><CameraDiagnostics camera={camera} ready={ready} csrfToken={csrfToken} onSessionExpired={onSessionExpired} onBusyChange={setBusy}/></details>}/>;
}
function CameraDiagnostics({camera,ready,csrfToken,onSessionExpired,onBusyChange}:{camera:RefObject<WebcamHandle|null>;ready:boolean;csrfToken:string;onSessionExpired():void;onBusyChange(busy:boolean):void}){
  useTranslation('devices');
 const controller=useRef<AbortController|null>(null);
 const [busy,setBusy]=useState<'capture'|'ocr'|null>(null),[error,setError]=useUiMessage();
 useEffect(()=>{onBusyChange(!!busy);},[busy,onBusyChange]);
 useEffect(()=>()=>{onBusyChange(false);},[onBusyChange]);
 const [snapshot,setSnapshot]=useState<{blob:Blob;url:string}|null>(null),[size,setSize]=useState(''),[result,setResult]=useState<OcrDiagnostics|null>(null);
 useEffect(()=>()=>{controller.current?.abort();},[]);
 useEffect(()=>()=>{if(snapshot)URL.revokeObjectURL(snapshot.url);},[snapshot]);
 function failed(cause:unknown,phase:'capture'|'ocr'){
  if(cause instanceof ApiFailure&&cause.status===401){onSessionExpired();return;}
  const code=cause instanceof ApiFailure?cause.code:cause&&typeof cause==='object'&&'code'in cause?cause.code:undefined;
  setError(() => (code==='OCR_BUSY'?i18n.t('ocrBusy', { ns: 'devices' }):code==='OCR_TIMEOUT'?i18n.t('ocrTimeout', { ns: 'devices' }):code==='SCREEN_NOT_FOUND'?i18n.t('screenMissingHint', { ns: 'devices' }):code==='RATE_LIMITED'?i18n.t('ocrRateLimited', { ns: 'devices' }):phase==='capture'?i18n.t('captureFailed', { ns: 'devices' }):i18n.t('ocrFailed', { ns: 'devices' })));
 }
 async function recognize(){
  if(busy||!ready||!camera.current)return;
  const abort=new AbortController();controller.current=abort;setBusy('capture');setError('');setResult(null);setSnapshot(null);setSize('');
  let phase:'capture'|'ocr'='capture';
  try{
   const frame=await camera.current.capture(abort.signal);
   if(abort.signal.aborted)return;
   setSnapshot({blob:frame.blob,url:URL.createObjectURL(frame.blob)});
   phase='ocr';setBusy('ocr');
   const value=await api.diagnoseOcr(frame.blob,csrfToken,abort.signal);
   if(!abort.signal.aborted)setResult(value);
  }catch(cause){if(!abort.signal.aborted)failed(cause,phase);}
  finally{if(!abort.signal.aborted)setBusy(null);}
 }
 return <section className="camera-check"><p>{i18n.t('ocrHint', { ns: 'devices' })}</p>
    <div className="camera-check-actions"><button type="button" aria-busy={!!busy} disabled={!ready||!!busy} onClick={()=>void recognize()}>{busy&&<IconLoader2 className="run-spinner" aria-hidden="true"/>}{busy==='capture'?i18n.t('capturing', { ns: 'devices' }):busy==='ocr'?i18n.t('recognizing', { ns: 'devices' }):i18n.t('recognize', { ns: 'devices' })}</button></div>
    {error&&<p role="alert" className="error">{error}</p>}
    <div className="camera-check-results">
     <div><div className="camera-check-preview">{snapshot?<img className="camera-check-image" src={snapshot.url} alt={i18n.t('checkSnapshot', { ns: 'devices' })} onLoad={event=>setSize(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`)}/>:<div className="camera-check-empty">{i18n.t('snapshotPlaceholder', { ns: 'devices' })}</div>}</div><p className="camera-check-size case-step-hint">{size&&i18n.t('snapshotResolution', { ns: 'devices', size })}</p></div>
     <section className="camera-ocr-result" aria-label={i18n.t('recognizedText', { ns: 'devices' })}><div className="camera-ocr-heading"><h3>{i18n.t('recognizedText', { ns: 'devices' })}</h3>{result&&<span className="case-step-hint">{i18n.t('recognitionTime', { ns: 'devices', seconds: (result.elapsedMs/1000).toLocaleString(formatLocale(),{minimumFractionDigits:2,maximumFractionDigits:2}) })}</span>}</div>
      <div className="camera-ocr-body">{result?(result.blocks.length?<pre>{result.blocks.map(block=>block.text).join('\n')}</pre>:<p>{i18n.t('textMissing', { ns: 'devices' })}</p>):<p className="case-step-hint">{i18n.t('textPlaceholder', { ns: 'devices' })}</p>}</div>
     </section>
    </div>
   </section>;
}
