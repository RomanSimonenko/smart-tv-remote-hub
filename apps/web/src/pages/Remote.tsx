import { i18n, useTranslation, useUiMessage } from '../i18n.js';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { RemoteLayout } from '../components/RemoteLayout.js';
import type { BasicTvButton, TvRemoteState, TvCommandResult, TvId, TvPlatform } from '@remote-webos-tv/contracts';
import { tvActionCatalog, getTvAction, tvCommandResultSchema, TV_HOLD_REPEAT_DELAY_MS, TV_HOLD_REPEAT_INTERVAL_MS } from '@remote-webos-tv/contracts';
import { api, ApiFailure } from '../api.js';
import { requestId } from '../requestId.js';
import { useTvHold } from '../useTvHold.js';

interface Props { tvId?: TvId; platform?: TvPlatform; csrfToken: string; active: boolean; onSessionExpired(): void; onBusyChange?(busy: boolean): void; interactionBlocked?: boolean; activityTarget?: HTMLElement | null; quietOffline?: boolean; serverUnavailable?: boolean }
interface Runtime { active: boolean; pending: boolean; command: AbortController | null; refresh(): void }
const unknownMessage = () => i18n.t('unknownCommand', { ns: 'devices' });
const reasons = {
  get UNAVAILABLE() { return i18n.t('remoteUnavailable', { ns: 'devices' }); },
  get BUSY() { return i18n.t('remoteBusy', { ns: 'devices' }); },
  get UNSUPPORTED() { return i18n.t('remoteUnsupported', { ns: 'devices' }); },
};
const rejectionMessages = {
  get TV_UNAVAILABLE() { return reasons.UNAVAILABLE; },
  get TV_BUSY() { return reasons.BUSY; },
  get UNSUPPORTED_CAPABILITY() { return reasons.UNSUPPORTED; },
  get COMMAND_NOT_SENT() { return i18n.t('commandNotSent', { ns: 'devices' }); },
  get APP_LIST_UNAVAILABLE() { return i18n.t('appsUnavailable', { ns: 'devices' }); },
  get APP_NOT_AVAILABLE() { return i18n.t('appMissing', { ns: 'devices' }); },
  get RATE_LIMITED() { return i18n.t('commandsRateLimited', { ns: 'devices' }); },
};
const keys: Readonly<Record<string, BasicTvButton>> = Object.fromEntries(tvActionCatalog
  .filter(action => action.kind === 'button').flatMap(action => action.keyboardKeys.map(key => [key, action.id as BasicTvButton])));

export function Remote({ tvId, platform = 'webos', csrfToken, active, onSessionExpired, onBusyChange, interactionBlocked = false, activityTarget, quietOffline = false, serverUnavailable = false }: Props) {
  useTranslation('devices');
  const repeatable = new Set(tvActionCatalog.filter(action => action.kind === 'button' && action.holdByPlatform[platform] === 'repeat').map(action => action.id as BasicTvButton));
  const [state, setState] = useState<TvRemoteState | null>(null);
  const [readError, setReadError] = useUiMessage();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: () => string; alert: boolean } | null>(null);
  const runtime = useRef<Runtime | null>(null);
  const held = useRef<{ button: BasicTvButton; native?: boolean; key?: string; pointerId?: number; timer: ReturnType<typeof setTimeout> | undefined } | null>(null);
  const [heldButton, setHeldButton] = useState<BasicTvButton | null>(null);
  const suppressedClick = useRef<BasicTvButton | null>(null);
  const nativeHold = useTvHold({ csrfToken, ...(tvId ? { tvId } : {}),
    onBusy(value) { if (runtime.current) runtime.current.pending = value; setBusy(value); if (!value) runtime.current?.refresh(); },
    onResult(value) {
      if (!runtime.current?.active) return;
      const parsed = tvCommandResultSchema.safeParse(value);
      if (parsed.success) {
        const result = parsed.data;
        if (result.outcome !== 'sent') stopHold();
        setFeedback(result.outcome === 'sent' ? null : { text: () => (result.outcome === 'unknown' ? unknownMessage() : rejectionMessages[result.error.code]), alert: true });
      } else if (value instanceof ApiFailure && value.status === 401) { stopHold(); expired.current(); }
      else { stopHold(); setFeedback({ text: () => (unknownMessage()), alert: true }); }
    },
  });
  const stopHold = useCallback(() => {
    if (held.current?.timer !== undefined) clearTimeout(held.current.timer);
    held.current = null; setHeldButton(null);
    nativeHold.stop();
  }, [nativeHold.stop]);
  const canNativeHold = (button: BasicTvButton) => getTvAction(button).holdByPlatform[platform] === 'native' && state?.enabled === true && state.nativeHoldButtons?.includes(button) === true;
  const canHold = (button: BasicTvButton) => repeatable.has(button) || canNativeHold(button);
  const sendLatest = useRef(send);
  sendLatest.current = send;
  function beginHold(button: BasicTvButton, owner: { key?: string; pointerId?: number }) {
    if (held.current?.button === button) return;
    stopHold();
    if (interactionBlocked || !active || !state?.enabled || runtime.current?.pending || document.visibilityState === 'hidden') return;
    if (canNativeHold(button)) {
      if (nativeHold.start(button)) { held.current = { button, ...owner, native: true, timer: undefined }; setHeldButton(button); }
      return;
    }
    const hold = { button, ...owner, timer: undefined as ReturnType<typeof setTimeout> | undefined };
    held.current = hold; setHeldButton(button);
    void sendLatest.current(button);
    function tick() {
      if (held.current !== hold) return;
      // Never queue behind an outstanding command; missed ticks are discarded.
      if (!runtime.current?.pending) void sendLatest.current(button);
      if (held.current === hold) hold.timer = setTimeout(tick, TV_HOLD_REPEAT_INTERVAL_MS);
    }
    hold.timer = setTimeout(tick, TV_HOLD_REPEAT_DELAY_MS);
  }
  useEffect(() => {
    if (!active || interactionBlocked || !state?.enabled && !(held.current?.native && state?.reason === 'BUSY')) stopHold();
  }, [active, interactionBlocked, state, stopHold]);
  useEffect(() => () => stopHold(), [csrfToken, tvId, platform, stopHold]);
  useEffect(() => {
    const releasePointer = (event: PointerEvent) => { if (held.current?.pointerId === event.pointerId) stopHold(); };
    const releaseKey = (event: globalThis.KeyboardEvent) => { if (held.current?.key === event.key) stopHold(); };
    const visibility = () => { if (document.visibilityState !== 'visible') stopHold(); };
    window.addEventListener('pointerup', releasePointer); window.addEventListener('pointercancel', releasePointer);
    window.addEventListener('keyup', releaseKey); window.addEventListener('blur', stopHold);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stopHold(); window.removeEventListener('pointerup', releasePointer); window.removeEventListener('pointercancel', releasePointer);
      window.removeEventListener('keyup', releaseKey); window.removeEventListener('blur', stopHold);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [stopHold]);
  const expired = useRef(onSessionExpired);
  expired.current = onSessionExpired;
  useEffect(() => { onBusyChange?.(active && busy); }, [active, busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  useEffect(() => {
    if (!feedback || feedback.alert) return;
    const timer = setTimeout(() => setFeedback((current) => current === feedback ? null : current), 2000);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    setState(null); setReadError(''); setFeedback(null); setBusy(false);
    if (!active) return;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let readController: AbortController | undefined;
    const current: Runtime = { active: true, pending: false, command: null, refresh: schedule };
    runtime.current = current;
    // Same completion-based cooldown as useTvStatus: refresh never bypasses
    // the interval or overlaps a capability read already in progress.
    function schedule() {
      if (current.active && !inFlight && timer === undefined) timer = setTimeout(() => { timer = undefined; void read(); }, 2000);
    }
    async function read() {
      if (!current.active || inFlight) return;
      inFlight = true;
      readController = new AbortController();
      try {
        const next = await api.remoteState(readController.signal, tvId);
        if (!current.active) return;
        setState(next); setReadError('');
      } catch (cause) {
        if (!current.active) return;
        setState(null);
        if (cause instanceof ApiFailure && cause.status === 401) {
          current.active = false; current.command?.abort(); expired.current();
        } else setReadError(() => (i18n.t('remoteReadFailed', { ns: 'devices' })));
      } finally { inFlight = false; schedule(); }
    }
    void read();
    return () => {
      current.active = false;
      if (timer !== undefined) clearTimeout(timer);
      readController?.abort(); current.command?.abort();
      if (runtime.current === current) runtime.current = null;
    };
  }, [active, csrfToken, tvId]);

  async function send(button: BasicTvButton | 'wink') {
    const current = runtime.current;
    if (interactionBlocked || !active || !current?.active || current.pending || !state?.enabled || button === 'wink' && state.apps === false || document.visibilityState === 'hidden') return;
    current.pending = true; current.command = new AbortController();
    setBusy(true); setFeedback(null);
    try {
      let id: string;
      try { id = requestId(); }
      catch {
        stopHold();
        // No API call has started: this failure proves the command was not sent.
        setFeedback({ text: () => i18n.t('commandIdFailed', { ns: 'devices' }), alert: true });
        return;
      }
      const result: TvCommandResult = await api.sendCommand(button === 'wink' ? { id, app: 'wink' } : { id, button }, csrfToken, current.command.signal, tvId);
      if (!current.active) return;
      if (result.outcome !== 'sent') stopHold();
      setFeedback({ text: () => (result.outcome === 'sent' ? i18n.t('commandSent', { ns: 'devices' }) : result.outcome === 'unknown' ? unknownMessage() : rejectionMessages[result.error.code]), alert: result.outcome !== 'sent' });
    } catch (cause) {
      if (!current.active) return;
      stopHold();
      if (cause instanceof ApiFailure && cause.status === 401) {
        current.active = false; setState(null); expired.current();
      } else {
        // Auth/schema rejection is before dispatch. All lost or malformed
        // command responses remain uncertain; no automatic POST retry.
        const rejected = cause instanceof ApiFailure && cause.commandRejectedBeforeDispatch;
        setFeedback({ text: () => (rejected ? i18n.t('commandRejected', { ns: 'devices' }) : unknownMessage()), alert: true });
      }
    } finally {
      current.pending = false;
      if (current.active) { setBusy(false); current.refresh(); }
    }
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (interactionBlocked) return;
    if (event.ctrlKey || event.altKey || event.metaKey) stopHold();
    const target = event.target as HTMLElement;
    if (!event.currentTarget.contains(document.activeElement) || target.closest('summary, input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    if ((event.key === 'Enter' || event.key === ' ') && target.closest('button[data-app]')) { stopHold(); if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) event.preventDefault(); return; }
    const focusedButton = target.closest<HTMLButtonElement>('button[data-command]');
    const spaceButton = event.key === ' ' ? focusedButton?.dataset.command as BasicTvButton | undefined : undefined;
    const button = keys[event.key] ?? (spaceButton && canHold(spaceButton) ? spaceButton : undefined);
    if (!button) return;
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
      // Suppress the button's native Enter click as well as the mapped command.
      if ((event.key === 'Enter' || spaceButton) && target.closest('button')) event.preventDefault();
      return;
    }
    if (document.visibilityState === 'hidden') { event.preventDefault(); return; }
    // One owner for Enter, including when a native button has focus.
    event.preventDefault();
    if (canHold(button)) beginHold(button, { key: event.key });
    else { stopHold(); void send(button); }
  }

  if (!active) return null;
  const disabled = interactionBlocked || busy || !state?.enabled;
  const explanation = readError || (state ? state.enabled || (quietOffline && state.reason === 'UNAVAILABLE') ? '' : reasons[state.reason] : i18n.t('checkingRemote', { ns: 'devices' }));
  const activity = <div className="remote-activity">
    {!serverUnavailable && explanation && !(state?.reason === 'BUSY' && !readError) && <p>{explanation}</p>}
    <p role="status" aria-label={i18n.t('commandsAria', { ns: 'devices' })} aria-live="polite">{!busy && feedback && !feedback.alert ? feedback.text() : ''}</p>
    {feedback?.alert && <p role="alert" className="error">{feedback.text()}</p>}
  </div>;
  return <><RemoteLayout groupProps={{'aria-describedby':'remote-help','aria-busy':busy,onKeyDown:keyDown,onBlur:stopHold}} buttonProps={action => {
    if(action==='wink')return {disabled:!!(disabled || state?.enabled && state.apps===false),onClick:()=>{stopHold();void send('wink');}};
    const button=action as BasicTvButton;
    const supportsHold=canHold(button);
    return {
      disabled:disabled && heldButton!==button,
      ...(supportsHold ? {style:{touchAction:'none'}} : {}),
      onPointerDown:event=>{
        if(!supportsHold || event.button!==0 || !event.isPrimary)return;
        event.preventDefault();event.currentTarget.focus();suppressedClick.current=button;
        beginHold(button,{pointerId:event.pointerId});event.currentTarget.setPointerCapture?.(event.pointerId);
      },
      onPointerLeave:()=>{if(held.current?.button===button && held.current.pointerId!==undefined)stopHold();},
      onBlur:stopHold,
      onClick:event=>{if(event.detail>0 && suppressedClick.current===button){suppressedClick.current=null;return;}void send(button);},
    };
  }}/>{activityTarget ? createPortal(activity, activityTarget) : activity}</>;
}
