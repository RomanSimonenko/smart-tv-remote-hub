import { expect, test } from 'vitest';
import { basicTvButtonSchema } from '../src/tv-command.js';
import { getTvAction, tvActionCatalog } from '../src/tv-actions.js';

test('catalog covers every current remote button, application and power exactly once', () => {
  expect(tvActionCatalog).toHaveLength(28);
  expect(new Set(tvActionCatalog.map(action => action.id)).size).toBe(28);
  expect(tvActionCatalog.filter(action => action.kind === 'button').map(action => action.id).sort())
    .toEqual([...basicTvButtonSchema.options].sort());
  expect(getTvAction('wink')).toMatchObject({ kind: 'app', label: 'Запустить Wink' });
  expect(getTvAction('power')).toMatchObject({ kind: 'power' });
});

test('LG repeat and Samsung native hold cover only navigation arrows and volume', () => {
  expect(tvActionCatalog.filter(action => action.holdByPlatform.webos === 'repeat').map(action => action.id).sort())
    .toEqual(['DOWN', 'LEFT', 'RIGHT', 'UP', 'VOLUME_DOWN', 'VOLUME_UP']);
  expect(tvActionCatalog.filter(action => action.holdByPlatform.tizen === 'native').map(action => action.id).sort())
    .toEqual(['DOWN', 'LEFT', 'RIGHT', 'UP', 'VOLUME_DOWN', 'VOLUME_UP']);
  expect(getTvAction('power').holdByPlatform).toEqual({ webos: 'none', tizen: 'none' });
  expect(getTvAction('wink').holdByPlatform).toEqual({ webos: 'none', tizen: 'none' });
});

test('catalog preserves keyboard aliases and numeric layout order', () => {
  expect(getTvAction('MUTE').keyboardKeys).toEqual(['m', 'M']);
  expect(getTvAction('ENTER').keyboardKeys).toEqual(['Enter']);
  expect(tvActionCatalog.filter(action => action.group === 'numeric').map(action => action.id))
    .toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
});
