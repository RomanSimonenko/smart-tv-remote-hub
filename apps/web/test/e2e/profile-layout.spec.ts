import { expect } from '@playwright/test';
import { test } from '../support/tv-fixture.js';

test('profile stays usable with a long name, keyboard selection and enlarged layout', async ({ page, tv }, testInfo) => {
  await tv.setupAndLogin(page);
  await page.getByRole('button', { name: /^Мой профиль:/ }).click();
  const name = 'Т'.repeat(64);
  await page.getByLabel('Отображаемое имя').fill(name);
  await page.getByRole('radio', { name: 'Робот', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('radio', { name: 'Робот', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByText('Изменения сохранены', { exact: true })).toBeVisible();
  for (const width of [1440, 1280, 640, 320]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: `Мой профиль: ${name}` })).toBeVisible();
    await expect(page.getByLabel('Отображаемое имя')).toBeVisible();
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('profile-enlarged.png'), fullPage: true });
});
