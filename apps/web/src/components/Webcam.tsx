import {readCameraPreferences,saveCameraPreferences} from '../camera-preferences.js';
import { IconChevronDown, IconVideo, IconVideoOff, IconPlayerRecord, IconPlayerStop } from '@tabler/icons-react';
import { useEffect, useRef, useState,useImperativeHandle,type Ref,type ReactNode } from 'react';
import {captureCameraFrame,CameraCaptureError,type CameraSnapshot} from '../camera-snapshot.js';
import {rectifyCameraSnapshot} from '../rectify-camera-snapshot.js';
import {useCameraRecording} from '../use-camera-recording.js';
import {useScreenPreview} from '../use-screen-preview.js';
export interface WebcamHandle {capture(signal:AbortSignal):Promise<CameraSnapshot>}

function cameraError(cause: unknown,assignedTv=false): string {
  const name = cause instanceof Error || cause instanceof DOMException ? cause.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Доступ к камере запрещён. Разрешите его в настройках браузера и попробуйте снова.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return assignedTv?'Камера для этого ТВ не найдена. Подключите её или выберите другую.':'Выбранная камера не найдена. Подключите камеру или выберите другую.';
  if (name === 'NotReadableError') return 'Камера недоступна. Возможно, её использует другое приложение.';
  return `Не удалось включить камеру${name ? ` (${name})` : ''}. Попробуйте снова.`;
}

interface WebcamProps {tvId?:string;onRecordingChange?:(active:boolean)=>void;recordingEnabled?:boolean;recordingModel?:string;footer?:ReactNode;showResolution?:boolean;alignSnapshots?:boolean;ref?:Ref<WebcamHandle>;onReadyChange?:(ready:boolean)=>void;locked?:boolean}
export function Webcam(props:WebcamProps={}) {
  return <WebcamSession key={props.tvId??''} {...props}/>;
}
function WebcamSession({tvId,ref,onReadyChange,locked=false,alignSnapshots=false,showResolution=false,recordingEnabled=false,recordingModel,onRecordingChange,footer}:WebcamProps) {
  const recording=useCameraRecording();
  useEffect(()=>{onRecordingChange?.(recording.phase!=='idle');},[recording.phase,onRecordingChange]);
  useEffect(()=>()=>onRecordingChange?.(false),[onRecordingChange]);
  const recordingActive=useRef(recording.isActive);recordingActive.current=recording.isActive;
  const readyCallback=useRef(onReadyChange);readyCallback.current=onReadyChange;
  const captureController=useRef(new AbortController());
  useImperativeHandle(ref,()=>({async capture(signal){
    if(!video.current)throw new CameraCaptureError('CAMERA_NOT_READY');
    const combined=AbortSignal.any([signal,captureController.current.signal]);
    const prior=alignSnapshots?screen.getSearchPrior():undefined;
    if(alignSnapshots&&!prior)throw new CameraCaptureError('SCREEN_NOT_FOUND');
    const raw=await captureCameraFrame(video.current,stream.current,combined,stream.current?.getVideoTracks()[0]?.label?.slice(0,200)||'Камера по умолчанию',alignSnapshots?'image/png':'image/jpeg');
    return alignSnapshots?rectifyCameraSnapshot(raw,prior,combined):raw;
  }}));
  const supported = !!navigator.mediaDevices?.getUserMedia;
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [initialPreferences]=useState(()=>readCameraPreferences(tvId));
  const [deviceId, setDeviceId] = useState(initialPreferences.deviceId);
  const [height,setHeight]=useState<720|1080>(initialPreferences.height);
  const [preferencesError,setPreferencesError]=useState('');
  function persist(selected:string,resolution:720|1080){try{saveCameraPreferences({deviceId:selected,height:resolution},tvId);setPreferencesError('');}catch{setPreferencesError('Не удалось сохранить параметры камеры в браузере.');}}
  const [devicesError,setDevicesError]=useState('');
  useEffect(()=>{
    if(!supported)return;
    let disposed=false;
    async function refreshDevices(){
      try{const available=await navigator.mediaDevices.enumerateDevices();if(!disposed){setDevices(available.filter(device=>device.kind==='videoinput'&&device.deviceId));setDevicesError('');}}
      catch{if(!disposed)setDevicesError('Не удалось получить список камер. Проверьте разрешения браузера и включите камеру повторно.');}
    }
    void refreshDevices();
    navigator.mediaDevices.addEventListener?.('devicechange',refreshDevices);
    return()=>{disposed=true;navigator.mediaDevices.removeEventListener?.('devicechange',refreshDevices);};
  },[supported]);
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const [mode,setMode]=useState<'source'|'screen'>('source');
  const screen=useScreenPreview(video,(alignSnapshots||mode==='screen')&&playing);
  useEffect(()=>{readyCallback.current?.(playing&&!!video.current?.videoWidth&&!!video.current?.videoHeight&&!!video.current?.requestVideoFrameCallback&&(!alignSnapshots||!!screen.image));},[playing,alignSnapshots,screen.image]);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);

  const waitingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clearWaiting() {
    if (waitingTimer.current !== null) clearTimeout(waitingTimer.current);
    waitingTimer.current = null;
  }

  function release() {
    recording.stop();
    setPlaying(false);
    readyCallback.current?.(false);captureController.current.abort(new CameraCaptureError('CAMERA_NOT_READY'));captureController.current=new AbortController();
    clearWaiting();
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  function stop() {
    generation.current += 1;
    release(); setEnabled(false); setStatus('');
  }
  useEffect(() => () => { generation.current += 1; release(); }, []);

  useEffect(() => {
    let wasHidden = document.visibilityState === 'hidden';
    const resume = () => {
      if (document.visibilityState === 'hidden') { wasHidden = true; return; }
      if (!wasHidden) return;
      wasHidden = false;
      // Embedded browsers can keep playing black frames after background capture
      // is suspended. Reacquire through the same lifecycle as an explicit start.
      if (enabled && stream.current && !recordingActive.current()) void start(deviceId);
    };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, [enabled, deviceId,height]);

  async function start(selected = deviceId,resolution = height) {
    const request = ++generation.current;
    release(); setEnabled(true); setError(''); setStatus('');
    waitingTimer.current = setTimeout(() => {
      waitingTimer.current = null;
      if (request === generation.current) setStatus('Ожидаем доступ к камере…');
    }, 400);
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: {width:{ideal:resolution===1080?1920:1280},height:{ideal:resolution},...(selected?{deviceId:{exact:selected}}:{})} });
      if (request !== generation.current) { next.getTracks().forEach((track) => track.stop()); return; }
      clearWaiting();
      stream.current = next;
      if(tvId&&!selected){
        const actual=next.getVideoTracks?.()[0]?.getSettings?.().deviceId;
        if(typeof actual==='string'&&actual&&actual.length<=1000){setDeviceId(actual);persist(actual,resolution);}
        else setPreferencesError('Камера включена, но привязка не сохранена. Выберите источник в списке камер.');
      }
      next.getVideoTracks?.().forEach(track=>track.addEventListener?.('ended',()=>{if(stream.current===next){stop();setError('Поток камеры завершён. Включите камеру снова.');}},{once:true}));
      if (video.current) video.current.srcObject = next;
      setStatus('');
      try {
        const available = await navigator.mediaDevices.enumerateDevices();
        if (request === generation.current) {setDevices(available.filter((device) => device.kind === 'videoinput'&&device.deviceId));setDevicesError('');}
      } catch (cause) {
        if (request === generation.current) setError(`Видео включено, но список камер недоступен${cause instanceof Error ? ` (${cause.name})` : ''}.`);
      }
    } catch (cause) {
      if (request !== generation.current) return;
      release(); setEnabled(false); setStatus(''); setError(cameraError(cause,!!tvId&&!!selected));
    }
  }

  return <section className="webcam-card" aria-label="Вебкамера">
    <div className="webcam-preview" data-mode={mode} data-screen-observations={JSON.stringify(screen.observations)}>
    <video ref={video} aria-hidden={!playing} autoPlay muted playsInline aria-label="Видео с вебкамеры" onPlaying={()=>{if(!stream.current)return;setPlaying(true);if(!alignSnapshots)readyCallback.current?.(!!video.current?.videoWidth&&!!video.current?.videoHeight&&!!video.current?.requestVideoFrameCallback);}} onError={() => { stop(); setError('Не удалось воспроизвести видео с камеры. Попробуйте снова.'); }} />
    {!playing && <div className="webcam-placeholder" data-error={!supported||!!error}>
      {enabled ? <span className="activity-spinner" aria-hidden="true"/> : error||!supported ? <IconVideoOff aria-hidden="true"/> : <IconVideo aria-hidden="true"/>}
      <strong>{enabled ? 'Подключаем камеру…' : error||!supported ? 'Камера недоступна' : 'Камера выключена'}</strong>
      {!enabled&&!error&&supported&&<p>Включите камеру, чтобы видеть экран телевизора.</p>}
      {enabled&&<p className="webcam-status" role="status">{status||'Ожидаем изображение с камеры…'}</p>}
      {(!supported||error)&&<p role={supported?'alert':undefined}>{!supported?'Браузер не предоставляет доступ к камере. Откройте страницу через HTTPS или localhost.':error}</p>}
    </div>}
    {playing&&mode==='screen'&&(screen.image?<img className="webcam-aligned" src={screen.image} alt="Экран ТВ без рамки"/>:<div className="webcam-placeholder" role="status"><IconVideoOff aria-hidden="true"/><strong>{screen.message||'Экран не найден'}</strong></div>)}
    </div>
    <div className="webcam-controls"><label>Камера<span className="webcam-select"><select value={deviceId} disabled={!supported||locked} onChange={(event) => { const selected = event.target.value; setDeviceId(selected);setError('');persist(selected,height); if (enabled) void start(selected); }}>
      <option value="" disabled={!!tvId&&!!deviceId}>{tvId?'Выберите камеру':'По умолчанию'}</option>
      {deviceId&&!devices.some(device=>device.deviceId===deviceId)&&<option value={deviceId}>Сохранённая камера</option>}
      {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Камера ${index + 1}`}</option>)}
    </select><IconChevronDown aria-hidden="true" /></span></label>
    {showResolution&&<label>Разрешение<span className="webcam-select"><select aria-label="Разрешение" value={height} disabled={locked} onChange={event=>{const selected=Number(event.target.value) as 720|1080;setHeight(selected);persist(deviceId,selected);if(enabled)void start(deviceId,selected);}}><option value="1080">Full HD · 1920 × 1080</option><option value="720">HD · 1280 × 720</option></select><IconChevronDown aria-hidden="true"/></span></label>}
    <button type="button" className="webcam-align-toggle" role="switch" aria-checked={mode==='screen'} onClick={()=>setMode(mode==='screen'?'source':'screen')}><span>Выровнять экран</span><span className="webcam-switch-track" aria-hidden="true"/></button></div>
    {devicesError&&<p role="alert">{devicesError}</p>}
    {preferencesError&&<p role="alert">{preferencesError}</p>}
    <div className="webcam-actions" data-recording-enabled={recordingEnabled}><button type="button" disabled={!supported||locked} onClick={() => enabled ? stop() : void start()}>{enabled ? playing?'Выключить камеру':'Отмена' : error?'Повторить':'Включить камеру'}</button>{recordingEnabled&&<button type="button" className="webcam-recording-toggle" data-recording={recording.phase!=='idle'} disabled={recording.phase==='stopping'||(recording.phase==='idle'&&(!recording.supported||!playing||locked))} title="Запись исходного видео камеры без звука" onClick={()=>{if(recording.phase==='recording')recording.stop();else if(stream.current&&playing)recording.start(stream.current,recordingModel);}}>{recording.phase!=='idle'?<IconPlayerStop aria-hidden="true"/>:<IconPlayerRecord aria-hidden="true"/>}{recording.phase==='stopping'?'Завершение записи…':recording.phase==='recording'?'Остановить запись':'Записать видео'}</button>}{recordingEnabled&&recording.phase!=='idle'&&<button type="button" onClick={recording.cancel}>Отменить запись</button>}<div className="webcam-feedback">
    {playing&&error&&<p role="alert" className="error">{error}</p>}
    </div></div>
    {recordingEnabled&&<div className="camera-recording-feedback">
     {recording.notice&&<p role="status">{recording.notice}</p>}
     {!recording.supported&&<p>Запись видео недоступна в этом браузере.</p>}
     {recording.phase!=='idle'&&<p className="camera-recording-status"><IconPlayerRecord aria-hidden="true"/><span>{recording.phase==='stopping'?'Подготовка видео…':'Запись камеры без звука'}</span><span role="timer" aria-label="Длительность записи">{String(Math.floor(recording.elapsed/60)).padStart(2,'0')}:{String(recording.elapsed%60).padStart(2,'0')}</span></p>}
     {recording.error&&<p role="alert" className="field-error">{recording.error}</p>}
     {recording.download&&<p role="status">{recording.download.partial?'Доступная часть записи готова.':'Запись готова.'} <a href={recording.download.url} download={recording.download.name}>Скачать запись</a></p>}
    </div>}
    {footer}
  </section>;
}
