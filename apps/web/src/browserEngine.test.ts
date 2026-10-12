import { expect, test } from 'vitest';
import { browserEngineLabel } from './browserEngine.js';
test.each([
  ['Mozilla/5.0 AppleWebKit/537.36 Chrome/142.0.7444.0 Safari/537.36', 'Blink · Chromium 142.0.7444.0'],
  ['Mozilla/5.0 AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0', 'Blink · Chromium 142.0.0.0'],
  ['Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/142.0 Mobile Safari/604.1', 'WebKit 605.1.15 (версия из User-Agent)'],
  ['Mozilla/5.0 AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 'WebKit 605.1.15 (версия из User-Agent)'],
  ['Mozilla/5.0 (X11; rv:144.0) Gecko/20100101 Firefox/144.0', 'Gecko 144.0'],
  ['', 'Движок и версия не определены'],
  ['unknown', 'Движок и версия не определены'],
])('identifies the reported engine without confusing compatibility tokens: %s', (ua, expected) => {
  expect(browserEngineLabel(ua)).toBe(expected);
});
