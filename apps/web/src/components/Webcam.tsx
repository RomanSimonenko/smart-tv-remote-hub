import { IconChevronDown, IconVideo, IconVideoOff } from '@tabler/icons-react';
import { useEffect, useRef, useState,useImperativeHandle,type Ref } from 'react';
import {captureCameraFrame,CameraCaptureError,type CameraSnapshot} from '../camera-snapshot.js';
export interface WebcamHandle {capture(signal:AbortSignal):Promise<CameraSnapshot>}

function cameraError(cause: unknown): string {
  const name = cause instanceof Error ? cause.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Доступ к камере запрещён. Разрешите его в настройках браузера и попробуйте снова.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Выбранная камера не найдена. Подключите камеру или выберите другую.';
  if (name === 'NotReadableError') return 'Камера недоступна. Возможно, её использует другое приложение.';
  return `Не удалось включить камеру${name ? ` (${name})` : ''}. Попробуйте снова.`;
}

export function Webcam({ref,onReadyChange,locked=false}:{ref?:Ref<WebcamHandle>;onReadyChange?:(ready:boolean)=>void;locked?:boolean}={}) {
  const readyCallback=useRef(onReadyChange);readyCallback.current=onReadyChange;
  const captureController=useRef(new AbortController());
  useImperativeHandle(ref,()=>({capture(signal){if(!video.current)return Promise.reject(new CameraCaptureError('CAMERA_NOT_READY'));return captureCameraFrame(video.current,stream.current,AbortSignal.any([signal,captureController.current.signal]),stream.current?.getVideoTracks()[0]?.label?.slice(0,200)||'Камера по умолчанию');}}));
  const supported = !!navigator.mediaDevices?.getUserMedia;
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
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

  async function start(selected = deviceId) {
    const request = ++generation.current;
    release(); setEnabled(true); setError(''); setStatus('');
    waitingTimer.current = setTimeout(() => {
      waitingTimer.current = null;
      if (request === generation.current) setStatus('Ожидаем доступ к камере…');
    }, 400);
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: selected ? { deviceId: { exact: selected } } : true });
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
    <div className="webcam-preview">
    <video ref={video} aria-hidden={!playing} autoPlay muted playsInline aria-label="Видео с вебкамеры" onPlaying={()=>{if(!stream.current)return;setPlaying(true);readyCallback.current?.(!!video.current?.videoWidth&&!!video.current?.videoHeight&&!!video.current?.requestVideoFrameCallback);}} onError={() => { stop(); setError('Не удалось воспроизвести видео с камеры. Попробуйте снова.'); }} />
    {!playing && <div className="webcam-placeholder" data-error={!supported||!!error}>
      {enabled ? <span className="activity-spinner" aria-hidden="true"/> : error||!supported ? <IconVideoOff aria-hidden="true"/> : <IconVideo aria-hidden="true"/>}
      <strong>{enabled ? 'Подключаем камеру…' : error||!supported ? 'Камера недоступна' : 'Камера выключена'}</strong>
      {!enabled&&!error&&supported&&<p>Включите камеру, чтобы видеть экран телевизора.</p>}
      {enabled&&<p className="webcam-status" role="status">{status||'Ожидаем изображение с камеры…'}</p>}
      {(!supported||error)&&<p role={supported?'alert':undefined}>{!supported?'Браузер не предоставляет доступ к камере. Откройте страницу через HTTPS или localhost.':error}</p>}
    </div>}
    </div>
    <label>Камера<span className="webcam-select"><select value={deviceId} disabled={!supported||locked} onChange={(event) => { const selected = event.target.value; setDeviceId(selected); if (enabled) void start(selected); }}>
      <option value="">По умолчанию</option>
      {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Камера ${index + 1}`}</option>)}
    </select><IconChevronDown aria-hidden="true" /></span></label>
    <div className="webcam-actions"><button type="button" disabled={!supported||locked} onClick={() => enabled ? stop() : void start()}>{enabled ? playing?'Выключить камеру':'Отмена' : error?'Повторить':'Включить камеру'}</button><div className="webcam-feedback">
    {playing&&error&&<p role="alert" className="error">{error}</p>}
    </div></div>
  </section>;
}
