import { useCallback, useEffect, useRef, useState } from 'react';
import type { OwnerProfile, ProfileUpdate } from '@remote-webos-tv/contracts';
import { api, ApiFailure, friendlyError } from './api.js';

export function useOwnerProfile(csrfToken: string, onSessionExpired: () => void, active: boolean) {
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [loading, setLoading] = useState(active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const expired = useRef(onSessionExpired);
  expired.current = onSessionExpired;
  const lifecycle = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!active) { setProfile(null); setLoading(false); return; }
    const controller = new AbortController(); lifecycle.current = controller;
    setLoading(true); setError('');
    void api.getProfile(controller.signal).then(value => {
      if (!controller.signal.aborted) setProfile(value);
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      if (cause instanceof ApiFailure && cause.status === 401) expired.current();
      else setError(friendlyError(cause));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); lifecycle.current = null; };
  }, [active, revision]);
  async function save(input: ProfileUpdate): Promise<boolean> {
    const controller = lifecycle.current;
    if (!active || !controller || controller.signal.aborted || pending.current) return false;
    pending.current = true; setSaving(true); setError('');
    try {
      const saved = await api.updateProfile(input, csrfToken, controller.signal);
      if (controller.signal.aborted) return false;
      setProfile(saved); return true;
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof ApiFailure && cause.status === 401) expired.current();
        else setError(friendlyError(cause));
      }
      return false;
    } finally { pending.current = false; if (!controller.signal.aborted) setSaving(false); }
  }
  return { profile, loading, saving, error, refresh, save };
}
