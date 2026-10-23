import { tvActionCatalog } from '@remote-webos-tv/contracts';
import { i18n } from './i18n.js';

/** Display labels only; action identifiers and the shared contract stay unchanged. */
export function getActionLabel(action: string): string {
  const definition = tvActionCatalog.find(entry => entry.id === action);
  if (!definition) return action;
  return i18n.t(`action${action}`, { ns: 'devices', defaultValue: definition.label });
}
