import { expect } from '@playwright/test';
import { test } from '../support/tv-fixture.js';

test('profile saves across reload and protects unsaved edits in both menu states', async ({ page, tv }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await tv.setupAndLogin(page);
  const commands: string[] = [];
  page.on('request', request => { if (/\/(commands|holds|power)(\/|$)/.test(new URL(request.url()).pathname) && request.method() !== 'GET') commands.push(request.url()); });
  await page.getByRole('button', { name: /^Мой профиль:/ }).click();
  await expect(page.getByRole('heading', { name: 'Мой профиль' })).toBeVisible();
  await page.getByLabel('Отображаемое имя').fill('QA Team');
  await page.getByRole('radio', { name: 'Робот', exact: true }).check();
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByText('Изменения сохранены', { exact: true })).toBeVisible();
  const saveBox = await page.getByRole('button', { name: 'Сохранить изменения' }).boundingBox();
  const statusBox = await page.getByRole('status').filter({ hasText: 'Изменения сохранены' }).boundingBox();
  expect(statusBox!.x).toBeGreaterThan(saveBox!.x + saveBox!.width);
  expect(Math.abs(statusBox!.y - saveBox!.y)).toBeLessThan(30);
  await expect(page.locator('.profile-session-row h3')).toContainText('Blink · Chromium');

  await expect(page.getByRole('button', { name: 'Мой профиль: QA Team' })).toBeVisible();
  // Desktop composition follows the approved profile mock: identity left, picker right.
  const identity = await page.locator('.profile-intro').boundingBox();
  const picker = await page.getByRole('group', { name: 'Иконка профиля' }).boundingBox();
  expect(identity).not.toBeNull(); expect(picker).not.toBeNull();
  expect(picker!.x).toBeGreaterThan(identity!.x + identity!.width);
  expect(Math.abs(picker!.y - identity!.y)).toBeLessThan(30);
  await expect(page.locator('.app-header')).toBeHidden();
  await expect(page.locator('.profile-session').getByRole('button', { name: 'Выйти', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('profile-expanded.png'), fullPage: true });
  await page.getByLabel('Отображаемое имя').fill('Unsaved draft');
  await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Телевизоры', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Несохранённые изменения' })).toBeVisible();
  await page.getByRole('button', { name: 'Остаться', exact: true }).click();
  await expect(page.getByLabel('Отображаемое имя')).toHaveValue('Unsaved draft');
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await page.getByRole('button', { name: 'Не сохранять и продолжить' }).click();
  await expect(page.getByRole('dialog', { name: 'Выйти из приложения?' })).toBeVisible();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  // Discard to the list, then re-open the persisted profile.
  await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Телевизоры', exact: true }).click();
  await page.getByRole('button', { name: /^Мой профиль:/ }).click();
  await expect(page.getByLabel('Отображаемое имя')).toHaveValue('QA Team');
  await page.getByRole('button', { name: 'Свернуть меню' }).click();
  await expect(page.getByRole('button', { name: 'Мой профиль: QA Team' }).locator('.profile-avatar')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('profile-collapsed.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Мой профиль' })).toBeVisible();
  await expect(page.getByLabel('Отображаемое имя')).toHaveValue('QA Team');
  await expect(page.getByRole('radio', { name: 'Робот', exact: true })).toBeChecked();
  for (const width of [1280, 640, 320]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Мой профиль: QA Team' })).toBeVisible();
  }
  expect(commands).toEqual([]);
});
