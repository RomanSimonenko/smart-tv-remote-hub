import { expect } from '@playwright/test';
import { test, tvHost } from '../support/tv-fixture.js';

test('sidebar toggles with keyboard, restores after reload and does not send commands', async ({ page, tv }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await tv.setupAndLogin(page);
  await page.getByRole('button', { name: 'Добавить ТВ' }).click();
  await page.getByLabel('IP-адрес телевизора').fill(tvHost);
  await page.getByLabel(/MAC-адрес телевизора/).fill('02:00:00:00:00:03');
  await page.getByRole('button', { name: 'Подключить', exact: true }).click();
  await tv.tv.waitForRequestCount(1);
  tv.promptGate.release();
  await page.getByRole('button', { name: /^Открыть телевизор / }).click();
  await expect(page.getByRole('button', { name: 'Вверх', exact: true })).toBeEnabled();
  const mutations: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') mutations.push(request.url()); });
  await page.screenshot({ path: testInfo.outputPath('shell-expanded.png'), fullPage: true });
  await page.getByRole('button', { name: 'Свернуть меню' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Развернуть меню' })).toBeFocused();
  await expect(page.getByRole('group', { name: 'Пульт', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Боковое меню' })).toHaveCSS('width', '72px');
  await page.screenshot({ path: testInfo.outputPath('shell-collapsed.png'), fullPage: true });
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Свернуть меню' })).toBeFocused();
  await page.getByRole('button', { name: 'Свернуть меню' }).click();
  await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Телевизоры', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Телевизоры', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Развернуть меню' })).toBeVisible();
  expect(mutations).toEqual([]);
  for (const width of [1280, 640, 320]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
