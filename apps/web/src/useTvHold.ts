import { useCallback, useEffect, useRef } from 'react';
import type { BasicTvButton, TvCommandResult, TvHoldRequest, TvId } from '@remote-webos-tv/contracts';
import { api } from './api.js';
import { requestId } from './requestId.js';

interface Options {
  csrfToken: string;
  tvId?: TvId;
  onBusy(busy: boolean): void;
  onResult(result: TvCommandResult | unknown): void;
}
interface Gesture {
  input: TvHoldRequest;
  csrfToken: string;
  tvId: TvId | undefined;
  press: Promise<TvCommandResult>;
  releasing: boolean;
  generation: number;
}
export function useTvHold(options: Options) {
  const latest = useRef(options); latest.current = options;
  const gesture = useRef<Gesture | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const stop = useCallback(() => {
    const current = gesture.current;
    if (!current || current.releasing) return;
    current.releasing = true;
    void (async () => {
      let pressed: TvCommandResult | undefined;
      try { pressed = await current.press; }
      catch { /* Lost Press response is uncertain; Release is still required. */ }
      try {
        if (pressed?.outcome !== 'rejected') {
          const result = await api.holdTvButton({ ...current.input, phase: 'release' }, current.csrfToken, new AbortController().signal, current.tvId);
          if (mounted.current && current.generation === generation.current) latest.current.onResult(result);
        }
      } catch (cause) { if (mounted.current && current.generation === generation.current) latest.current.onResult(cause); }
      finally {
        if (gesture.current === current) gesture.current = null;
        if (mounted.current && current.generation === generation.current) latest.current.onBusy(false);
      }
    })();
  }, []);
  const start = useCallback((button: BasicTvButton) => {
    if (gesture.current) return false;
    let id: string;
    try { id = requestId(); }
    catch (cause) { latest.current.onResult(cause); return false; }
    const { csrfToken, tvId } = latest.current;
    const input: TvHoldRequest = { id, button, phase: 'press' };
    const current: Gesture = { input, csrfToken, tvId, generation: generation.current, releasing: false, press: api.holdTvButton(input, csrfToken, new AbortController().signal, tvId) };
    gesture.current = current;
    latest.current.onBusy(true);
    void current.press.then(result => {
      if (mounted.current && current.generation === generation.current) latest.current.onResult(result);
      if (result.outcome !== 'sent') stop();
    }, cause => { if (mounted.current && current.generation === generation.current) latest.current.onResult(cause); stop(); });
    return true;
  }, [stop]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; stop(); };
  }, [options.csrfToken, options.tvId, stop]);
  return { start, stop };
}
