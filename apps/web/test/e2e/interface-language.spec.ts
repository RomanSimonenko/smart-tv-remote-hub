import {expect} from '@playwright/test';
import {test,tvHost} from '../support/tv-fixture.js';

test('switches RU/EN, restores the choice after reload and logout, and preserves case content',async({page,tv},testInfo)=>{
 await page.setViewportSize({width:1440,height:1024});
 await tv.setupAndLogin(page);
 const nav=page.locator('.app-sidebar');
 await nav.getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByLabel('Язык интерфейса').selectOption('en');
 await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.reload();
 await expect(page.getByLabel('Interface language')).toHaveValue('en');
 const contentStart=await page.locator('.app-content').evaluate(element=>element.getBoundingClientRect().left+parseFloat(getComputedStyle(element).paddingLeft));
 expect((await page.locator('.interface-settings').boundingBox())!.x).toBeCloseTo(contentStart,0);
 await page.screenshot({path:testInfo.outputPath('settings-en-1440.png')});
 await nav.getByRole('button',{name:'Test cases',exact:true}).click();
 await page.getByRole('button',{name:'Create test case',exact:true}).click();
 await page.getByLabel('Title',{exact:true}).fill('Синтетический сценарий');
 await page.getByLabel('Description',{exact:true}).fill('Текст пользователя остаётся русским.');
 await page.getByRole('button',{name:'Save test case',exact:true}).click();
 await expect(page.getByText('Test case saved',{exact:true})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('editor-en-1440.png')});
 await nav.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByLabel('Interface language').selectOption('ru');
 await nav.getByRole('button',{name:'Тест-кейсы',exact:true}).click();
 await page.getByRole('button',{name:'Синтетический сценарий',exact:true}).click();
 await expect(page.getByLabel('Название',{exact:true})).toHaveValue('Синтетический сценарий');
 await expect(page.getByLabel('Описание',{exact:true})).toHaveValue('Текст пользователя остаётся русским.');
 await nav.getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByLabel('Язык интерфейса').selectOption('en');
 await nav.getByRole('button',{name:'Runs',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Runs',exact:true})).toBeVisible();
 await nav.getByRole('button',{name:'TVs',exact:true}).click();
 await expect(page.getByRole('heading',{name:'TVs',exact:true})).toBeVisible();
 await page.setViewportSize({width:1280,height:800});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('televisions-en-1280.png')});
 await page.locator('.sidebar-profile').click();
 await expect(page.getByRole('heading',{name:'My profile',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible();
 await expect(page.getByLabel('Interface language')).toHaveValue('en');
 await page.reload();
 await expect(page.getByLabel('Interface language')).toHaveValue('en');
 await page.getByLabel('Interface language').selectOption('ru');
 await expect(page.getByRole('heading',{name:'Вход',exact:true})).toBeVisible();
});

test('English remote, camera diagnostics and TV settings use translated labels without sending commands',async({page,tv},testInfo)=>{
 await tv.setupAndLogin(page);
 await page.getByRole('button',{name:'Добавить ТВ',exact:true}).click();
 await page.getByLabel('IP-адрес телевизора').fill(tvHost);
 await page.getByLabel(/MAC-адрес телевизора/).fill('02:00:00:00:00:03');
 await page.getByRole('button',{name:'Подключить',exact:true}).click();
 await tv.tv.waitForRequestCount(1);tv.promptGate.release();
 await expect(page.getByRole('button',{name:/^Открыть телевизор /})).toBeVisible();
 await page.locator('.app-sidebar').getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByLabel('Язык интерфейса').selectOption('en');
 await page.locator('.app-sidebar').getByRole('button',{name:'TVs',exact:true}).click();
 await page.getByRole('button',{name:/^Open TV /}).click();
 await expect(page.getByRole('button',{name:'Up',exact:true})).toBeVisible();
 await expect(page.getByText('Camera is off',{exact:true})).toBeVisible();
 await page.getByText('Check recognition',{exact:true}).click();
 await expect(page.getByRole('button',{name:'Recognize text',exact:true})).toBeDisabled();
 for(const width of [1280,1440]){
  await page.setViewportSize({width,height:1024});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`remote-en-${width}.png`),fullPage:true});
 }
 await page.getByRole('button',{name:'TV settings',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('tv-settings-en.png'),fullPage:true});
});

test('setup language changes immediately and keeps entered owner name',async({page,tv})=>{
 await page.goto(tv.origin);
 await page.getByLabel('Имя владельца').fill('Synthetic owner');
 await page.getByLabel('Язык интерфейса').selectOption('en');
 await expect(page.getByRole('heading',{name:'Initial setup',exact:true})).toBeVisible();
 await expect(page.getByLabel('Owner name')).toHaveValue('Synthetic owner');
 await page.getByLabel('Interface language').selectOption('ru');
 await expect(page.getByLabel('Имя владельца')).toHaveValue('Synthetic owner');
});
