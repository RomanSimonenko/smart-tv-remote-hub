import {useEffect,useRef,useState,type RefObject} from 'react';
import {Webcam,type WebcamHandle} from './Webcam.js';
import {api,ApiFailure} from '../api.js';
import type {OcrDiagnostics} from '@remote-webos-tv/contracts';
export function DiagnosticWebcam({csrfToken,onSessionExpired}:{csrfToken:string;onSessionExpired():void}){
 const camera=useRef<WebcamHandle>(null);
 const [ready,setReady]=useState(false),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 return <Webcam ref={camera} showResolution alignSnapshots={open} locked={busy} onReadyChange={setReady} footer={<details className="camera-diagnostics" open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary>Проверить распознавание</summary>{open&&<CameraDiagnostics camera={camera} ready={ready} csrfToken={csrfToken} onSessionExpired={onSessionExpired} onBusyChange={setBusy}/>}</details>}/>;
}
function CameraDiagnostics({camera,ready,csrfToken,onSessionExpired,onBusyChange}:{camera:RefObject<WebcamHandle|null>;ready:boolean;csrfToken:string;onSessionExpired():void;onBusyChange(busy:boolean):void}){
 const controller=useRef<AbortController|null>(null);
 const [busy,setBusy]=useState<'capture'|'ocr'|null>(null),[error,setError]=useState('');
 useEffect(()=>{onBusyChange(!!busy);},[busy,onBusyChange]);
 useEffect(()=>()=>{onBusyChange(false);},[onBusyChange]);
 const [snapshot,setSnapshot]=useState<{blob:Blob;url:string}|null>(null),[size,setSize]=useState(''),[result,setResult]=useState<OcrDiagnostics|null>(null);
 useEffect(()=>()=>{controller.current?.abort();},[]);
 useEffect(()=>()=>{if(snapshot)URL.revokeObjectURL(snapshot.url);},[snapshot]);
 function failed(cause:unknown,phase:'capture'|'ocr'){
  if(cause instanceof ApiFailure&&cause.status===401){onSessionExpired();return;}
  const code=cause instanceof ApiFailure?cause.code:cause&&typeof cause==='object'&&'code'in cause?cause.code:undefined;
  setError(code==='OCR_BUSY'?'Распознавание занято текущим тестом или другой проверкой. Повторите позже.':code==='OCR_TIMEOUT'?'Распознавание не завершилось за 30 секунд.':code==='SCREEN_NOT_FOUND'?'Экран не найден. Настройте камеру так, чтобы были видны все границы телевизора.':code==='RATE_LIMITED'?'Слишком много проверок. Подождите минуту.':phase==='capture'?'Не удалось получить снимок. Проверьте изображение камеры.':'Не удалось распознать текст. Проверьте снимок и повторите.');
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
 return <section className="camera-check"><p>Сделайте снимок и распознайте текст одним нажатием. Проверка не создаёт запуск и не сохраняется в истории.</p>
    <div className="camera-check-actions"><button type="button" disabled={!ready||!!busy} onClick={()=>void recognize()}>{busy==='capture'?'Получение снимка…':busy==='ocr'?'Распознавание…':'Распознать текст'}</button></div>
    {error&&<p role="alert" className="error">{error}</p>}
    <div className="camera-check-results">
     <div><div className="camera-check-preview">{snapshot?<img className="camera-check-image" src={snapshot.url} alt="Проверочный снимок" onLoad={event=>setSize(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`)}/>:<div className="camera-check-empty">Здесь появится проверочный снимок</div>}</div><p className="camera-check-size case-step-hint">{size&&`Разрешение снимка: ${size}`}</p></div>
     <section className="camera-ocr-result" aria-label="Распознанный текст"><div className="camera-ocr-heading"><h3>Распознанный текст</h3>{result&&<span className="case-step-hint">Распознавание: {(result.elapsedMs/1000).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})} с</span>}</div>
      <div className="camera-ocr-body">{result?(result.blocks.length?<pre>{result.blocks.map(block=>block.text).join('\n')}</pre>:<p>Текст не найден. Проверьте фокус, освещение и размер экрана в кадре.</p>):<p className="case-step-hint">Здесь появится распознанный текст</p>}</div>
     </section>
    </div>
   </section>;
}
