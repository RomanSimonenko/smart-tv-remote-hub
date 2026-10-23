import {readFile} from 'node:fs/promises';
import {expect} from '@playwright/test';
import {test} from '../support/tv-fixture.js';

test('storage policy persists, empty cleanup is safe, and diagnostics downloads a redacted report',async({page,tv},testInfo)=>{
 await page.setViewportSize({width:1440,height:1024});await tv.setupAndLogin(page);
 const nav=page.locator('.app-sidebar');await nav.getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByRole('button',{name:'Хранение',exact:true}).click();
 await expect(page.getByLabel('Автоматически удалять старые результаты',{exact:false})).not.toBeChecked();
 await page.getByLabel('Срок хранения, дней').fill('90');await page.getByRole('button',{name:'Сохранить изменения',exact:true}).click();
 await expect(page.getByText('Настройки сохранены.',{exact:true})).toBeVisible();await page.reload();
 await page.getByRole('button',{name:'Хранение',exact:true}).click();await expect(page.getByLabel('Срок хранения, дней')).toHaveValue('90');
 await page.getByRole('button',{name:'Просмотреть кандидатов'}).click();const dialog=page.getByRole('dialog',{name:'Подтверждение очистки'});
 await expect(dialog.getByText('Подходящих результатов нет.')).toBeVisible();await expect(dialog.getByRole('button',{name:'Удалить результаты'})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Отмена',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:testInfo.outputPath('storage-ru-1440.png'),fullPage:true});
 await page.getByRole('button',{name:'Диагностика',exact:true}).click();await expect(page.getByText('Версии компонентов',{exact:true})).toBeVisible();
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать отчёт'}).click();const download=await downloadEvent;
 const report=JSON.parse(await readFile((await download.path())!,'utf8'));expect(report.checks).toEqual({api:'ok',database:'ok',storage:'ok'});
 expect(Object.keys(report).sort()).toEqual(['applicationVersion','checkedAt','checks','cleanup','nodeVersion','ocr','schemaVersion','sqliteVersion']);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:testInfo.outputPath('diagnostics-ru-1440.png'),fullPage:true});
 await page.getByRole('button',{name:'Интерфейс',exact:true}).click();await page.getByLabel('Язык интерфейса').selectOption('en');
 await page.getByRole('button',{name:'Storage',exact:true}).click();await expect(page.getByLabel('Retention period, days')).toHaveValue('90');
 await page.setViewportSize({width:1280,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Diagnostics',exact:true}).click();await expect(page.getByRole('button',{name:'Download report'})).toBeEnabled();
 await page.getByRole('button',{name:'Check again'}).click();await expect(page.getByRole('button',{name:'Check again'})).toBeEnabled();
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:testInfo.outputPath('diagnostics-en-1280.png'),fullPage:true});
});
