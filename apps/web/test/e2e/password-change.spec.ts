import { expect } from '@playwright/test';
import { test } from '../support/tv-fixture.js';

test('password change keeps this browser, revokes another client and updates CSRF in sibling tabs', async ({ page, context, browser, tv }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await tv.setupAndLogin(page);
  const otherContext = await browser.newContext();
  const other = otherContext.request;
  try {
    const login = await other.post(tv.origin + '/api/auth/login', { headers: { origin: tv.origin }, data: { username: 'synthetic-owner', password: 'synthetic browser acceptance password' } });
    expect(login.status()).toBe(200);
    const sibling = await context.newPage(); await sibling.goto(tv.origin);
    await expect(sibling.getByRole('heading', { name: 'Телевизоры', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Мой профиль:/ }).click();
    await page.getByRole('button', { name: 'Изменить пароль', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Изменить пароль' });
    await expect(dialog.getByText('От 6 до 128 символов. Можно использовать буквы, цифры, пробелы и специальные символы.')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('password-dialog.png'), fullPage: false });
    await dialog.getByLabel('Текущий пароль').fill('bad123');
    await dialog.getByLabel('Новый пароль', { exact: true }).fill('new123');
    await dialog.getByLabel('Повторите новый пароль').fill('new123');
    await dialog.getByRole('button', { name: 'Сохранить пароль' }).click();
    await expect(dialog.getByText('Неверный текущий пароль.')).toBeVisible();
    await dialog.getByLabel('Текущий пароль').fill('synthetic browser acceptance password');
    await dialog.getByRole('button', { name: 'Сохранить пароль' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Пароль изменён. Остальные сессии завершены.')).toBeVisible();
    expect((await other.get(tv.origin + '/api/auth/session')).status()).toBe(401);
    // The next protected mutation must use the newly returned CSRF.
    await page.getByLabel('Отображаемое имя').fill('QA Password');
    await page.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(page.getByText('Изменения сохранены', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('profile-security.png'), fullPage: true });
    const refreshedSession = sibling.waitForResponse(response => response.url() === tv.origin + '/api/auth/session' && response.status() === 200);
    await sibling.bringToFront(); await sibling.evaluate(() => window.dispatchEvent(new Event('focus')));
    await refreshedSession;
    await sibling.getByRole('button', { name: /^Мой профиль:/ }).click();
    await sibling.getByLabel('Отображаемое имя').fill('QA Sibling');
    await sibling.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(sibling.getByText('Изменения сохранены', { exact: true })).toBeVisible();
    const old = await other.post(tv.origin + '/api/auth/login', { headers: { origin: tv.origin }, data: { username: 'synthetic-owner', password: 'synthetic browser acceptance password' } });
    expect(old.status()).toBe(401);
    const fresh = await other.post(tv.origin + '/api/auth/login', { headers: { origin: tv.origin }, data: { username: 'synthetic-owner', password: 'new123' } });
    expect(fresh.status()).toBe(200);
    await tv.restart();
    expect((await other.get(tv.origin + '/api/auth/session')).status()).toBe(200);
    for (const width of [1280, 640, 320]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.getByRole('button', { name: 'Изменить пароль', exact: true }).click();
    await page.evaluate(() => { document.body.style.zoom = '2'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Изменить пароль', exact: true })).toBeFocused();
  } finally { await otherContext.close(); }
});
