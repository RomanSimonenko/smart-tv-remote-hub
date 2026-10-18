import { IconChevronDown, IconVideo, IconVideoOff } from '@tabler/icons-react';
import { useEffect, useRef, useState,useImperativeHandle,type Ref } from 'react';
import {captureCameraFrame,CameraCaptureError,type CameraSnapshot} from '../camera-snapshot.js';
import {rectifyCameraSnapshot} from '../rectify-camera-snapshot.js';
import {useScreenPreview} from '../use-screen-preview.js';
export interface WebcamHandle {capture(signal:AbortSignal):Promise<CameraSnapshot>}

function cameraError(cause: unknown): string {
  const name = cause instanceof Error ? cause.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Доступ к камере запрещён. Разрешите его в настройках браузера и попробуйте снова.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Выбранная камера не найдена. Подключите камеру или выберите другую.';
  if (name === 'NotReadableError') return 'Камера недоступна. Возможно, её использует другое приложение.';
  return `Не удалось включить камеру${name ? ` (${name})` : ''}. Попробуйте снова.`;
}

export function Webcam({ref,onReadyChange,locked=false,alignSnapshots=false}:{alignSnapshots?:boolean;ref?:Ref<WebcamHandle>;onReadyChange?:(ready:boolean)=>void;locked?:boolean}={}) {
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
  const [deviceId, setDeviceId] = useState('');
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
      if (enabled && stream.current) void start(deviceId);
    };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, [enabled, deviceId]);

  async function start(selected = deviceId) {
    const request = ++generation.current;
    release(); setEnabled(true); setError(''); setStatus('');
    waitingTimer.current = setTimeout(() => {
      waitingTimer.current = null;
      if (request === generation.current) setStatus('Ожидаем доступ к камере…');
    }, 400);
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: {width:{ideal:1920},height:{ideal:1080},...(selected?{deviceId:{exact:selected}}:{})} });
      if (request !== generation.current) { next.getTracks().forEach((track) => track.stop()); return; }
      clearWaiting();
      stream.current = next;
      next.getVideoTracks?.().forEach(track=>track.addEventListener?.('ended',()=>{if(stream.current===next){stop();setError('Поток камеры завершён. Включите камеру снова.');}},{once:true}));
      if (video.current) video.current.srcObject = next;
      setStatus('');
      try {
        const available = await navigator.mediaDevices.enumerateDevices();
        if (request === generation.current) setDevices(available.filter((device) => device.kind === 'videoinput'));
      } catch (cause) {
        if (request === generation.current) setError(`Видео включено, но список камер недоступен${cause instanceof Error ? ` (${cause.name})` : ''}.`);
      }
    } catch (cause) {
      if (request !== generation.current) return;
      release(); setEnabled(false); setStatus(''); setError(cameraError(cause));
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
    <div className="webcam-controls"><label>Камера<span className="webcam-select"><select value={deviceId} disabled={!supported||locked} onChange={(event) => { const selected = event.target.value; setDeviceId(selected); if (enabled) void start(selected); }}>
      <option value="">По умолчанию</option>
      {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Камера ${index + 1}`}</option>)}
    </select><IconChevronDown aria-hidden="true" /></span></label>
    <button type="button" className="webcam-align-toggle" role="switch" aria-checked={mode==='screen'} onClick={()=>setMode(mode==='screen'?'source':'screen')}><span>Выровнять экран</span><span className="webcam-switch-track" aria-hidden="true"/></button></div>
    <div className="webcam-actions"><button type="button" disabled={!supported||locked} onClick={() => enabled ? stop() : void start()}>{enabled ? playing?'Выключить камеру':'Отмена' : error?'Повторить':'Включить камеру'}</button><div className="webcam-feedback">
    {playing&&error&&<p role="alert" className="error">{error}</p>}
    </div></div>
  </section>;
}
