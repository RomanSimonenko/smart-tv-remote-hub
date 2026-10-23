import type { TvPlatform } from './tv.js';
import type { BasicTvButton } from './tv-command.js';
import type { TvRemoteState } from './tv-command.js';

export type TvActionId = BasicTvButton | 'wink' | 'power';
export type TvHoldMode = 'none' | 'repeat' | 'native';
export type TvActionGroup = 'numeric' | 'navigation' | 'volume' | 'channel' | 'color' | 'app' | 'power';
export interface TvActionDefinition {
  readonly id: TvActionId;
  readonly label: string;
  readonly group: TvActionGroup;
  readonly kind: 'button' | 'app' | 'power';
  readonly keyboardKeys: readonly string[];
  readonly holdByPlatform: Readonly<Record<TvPlatform, TvHoldMode>>;
}

function button(id: BasicTvButton, label: string, group: TvActionGroup, keyboardKeys: readonly string[] = [], repeat = false, native = false): TvActionDefinition {
  return { id, label, group, kind: 'button', keyboardKeys,
    holdByPlatform: { webos: repeat ? 'repeat' : 'none', tizen: native ? 'native' : 'none', whale: 'none' } };
}

/** Protocol-independent actions. Runtime capabilities still gate execution. */
export const tvActionCatalog: readonly TvActionDefinition[] = [
  ...(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const).map(id => button(id, id, 'numeric')),
  button('HOME', 'Домой', 'navigation', ['Home']),
  button('UP', 'Вверх', 'navigation', ['ArrowUp'], true, true),
  button('BACK', 'Назад', 'navigation', ['Escape']),
  button('LEFT', 'Влево', 'navigation', ['ArrowLeft'], true, true),
  button('ENTER', 'OK', 'navigation', ['Enter']),
  button('RIGHT', 'Вправо', 'navigation', ['ArrowRight'], true, true),
  button('DOWN', 'Вниз', 'navigation', ['ArrowDown'], true, true),
  button('VOLUME_DOWN', 'Громкость −', 'volume', ['-'], true, true),
  button('MUTE', 'Без звука', 'volume', ['m', 'M']),
  button('VOLUME_UP', 'Громкость +', 'volume', ['+'], true, true),
  button('CHANNEL_DOWN', 'Канал −', 'channel', [], true, true), button('CHANNEL_UP', 'Канал +', 'channel', [], true, true),
  button('RED', 'Красная', 'color'), button('GREEN', 'Зелёная', 'color'),
  button('YELLOW', 'Жёлтая', 'color'), button('BLUE', 'Синяя', 'color'),
  { id: 'wink', label: 'Запустить Wink', group: 'app', kind: 'app', keyboardKeys: [], holdByPlatform: { webos: 'none', tizen: 'none', whale: 'none' } },
  { id: 'power', label: 'Питание', group: 'power', kind: 'power', keyboardKeys: [], holdByPlatform: { webos: 'none', tizen: 'none', whale: 'none' } },
];

export function getTvAction(id: TvActionId): TvActionDefinition {
  const action = tvActionCatalog.find(action => action.id === id);
  if (!action) throw new Error('Unknown TV action');
  return action;
}

export function canHoldTvAction(id: TvActionId): boolean {
  return Object.values(getTvAction(id).holdByPlatform).some(mode => mode !== 'none');
}

export function supportsTvActionHold(id: TvActionId, platform: TvPlatform, remote: TvRemoteState): boolean {
  if (!remote.enabled) return false;
  const mode = getTvAction(id).holdByPlatform[platform];
  return mode === 'repeat' || mode === 'native' && remote.nativeHoldButtons?.some(button => button === id) === true;
}

export const TV_HOLD_REPEAT_DELAY_MS = 400;
export const TV_HOLD_REPEAT_INTERVAL_MS = 200;
