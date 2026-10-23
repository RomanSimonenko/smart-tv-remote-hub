import { i18n } from './i18n.js';
import type { TvConnectionState } from '@remote-webos-tv/contracts';

export const connectionLabels: Record<TvConnectionState, string> = {
  get unconfigured() { return i18n.t('enterIp', { ns: 'devices' }); }, get pairing() { return i18n.t('pairing', { ns: 'devices' }); }, get connecting() { return i18n.t('connecting', { ns: 'devices' }); },
  get available() { return i18n.t('connected', { ns: 'devices' }); }, get unavailable() { return i18n.t('disconnected', { ns: 'devices' }); }, get reconnecting() { return i18n.t('connecting', { ns: 'devices' }); },
  get authorization_error() { return i18n.t('authError', { ns: 'devices' }); }, get compatibility_error() { return i18n.t('compatibilityError', { ns: 'devices' }); },
};

/** Render the public diagnostic by code; Russian retains the producer's approved copy. */
export function getTvErrorMessage(error: { code: string; message: string } | null | undefined): string {
  if (!error) return '';
  if (i18n.language !== 'en') return error.message;
  const suffix = '_CLEANUP_FAILED';
  const cleanup = error.code.endsWith(suffix);
  const code = cleanup ? error.code.slice(0, -suffix.length) : error.code;
  const detail = i18n.t(`error${code}`, { ns: 'devices', defaultValue: i18n.t('errorTV_OPERATION_FAILED', { ns: 'devices' }) });
  return cleanup ? `${detail} ${i18n.t('errorCLEANUP_FAILED', { ns: 'devices' })}` : detail;
}
