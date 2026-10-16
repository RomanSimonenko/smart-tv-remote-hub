import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import { waitForListening } from '../api-process.js';

test.use({timezoneId:'Asia/Tokyo'});
const runFile = promisify(execFile);
const apiEntry = fileURLToPath(new URL('../../../api/dist/src/index.js', import.meta.url));
const tokenEntry = fileURLToPath(new URL('../../../api/dist/src/auth/cli.js', import.meta.url));
const password = 'correct horse battery staple';

let directory: string;
let origin: string;
let setupToken: string;
let apiProcess: ChildProcess;

async function availablePort(): Promise<number> {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = (socket.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'remote-webos-browser-'));
  const dataDir = join(directory, 'data');
  const { stdout } = await runFile(process.execPath, [tokenEntry, 'setup-token'], {
    env: { REMOTE_WEBOS_DATA_DIR: dataDir },
  });
  setupToken = stdout.trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(setupToken)) throw new Error('CLI did not return a valid setup token');
  origin = `http://127.0.0.1:${await availablePort()}`;
  apiProcess = spawn(process.execPath, [apiEntry], {
    env: {
      REMOTE_WEBOS_DATA_DIR: dataDir,
      REMOTE_WEBOS_HOST: '127.0.0.1',
      REMOTE_WEBOS_PORT: new URL(origin).port,
      REMOTE_WEBOS_PUBLIC_ORIGIN: origin,
      REMOTE_WEBOS_SECURE_COOKIES: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForListening(apiProcess);
});

test.afterEach(async () => {
  if (apiProcess?.pid && apiProcess.exitCode === null && apiProcess.signalCode === null) {
    const stopped = once(apiProcess, 'exit');
    apiProcess.kill('SIGTERM');
    await stopped;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('creates, edits, preserves and protects test case drafts', async ({page})=>{
 await page.setViewportSize({width:1484,height:1060});
 await page.goto(origin);
 await page.getByLabel('Установочный токен').fill(setupToken);
 await page.getByLabel('Имя владельца').fill('qa');await page.getByLabel('Пароль').fill(password);
 await page.getByRole('button',{name:'Создать владельца'}).click();
 await page.getByLabel('Логин').fill('qa');await page.getByLabel('Пароль').fill(password);
 await page.getByRole('button',{name:'Войти',exact:true}).click();

 const sidebarGeometry=()=>page.locator('.app-sidebar').evaluate(sidebar=>{
  const rect=(selector:string)=>{const r=sidebar.querySelector(selector)!.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y,height:r.height};};
  return {toggle:rect('.sidebar-toggle'),brand:rect('.brand-icon'),profile:rect('.profile-avatar'),profileButton:rect('.sidebar-profile'),icons:Array.from(sidebar.querySelectorAll('nav svg')).map(el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y};}),nav:rect('nav button')};
 });
 const expanded=await sidebarGeometry();
 expect(expanded.profileButton.height).toBe(expanded.nav.height);
 for(const icon of expanded.icons) expect(icon.x).toBe(expanded.brand.x);
 expect(expanded.profile.x).toBe(expanded.brand.x);
 await page.getByRole('button',{name:'Свернуть меню',exact:true}).click();
 const collapsed=await sidebarGeometry();
 const collapsedWidths=await page.locator('.app-sidebar nav button, .sidebar-profile').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().width));
 expect(new Set(collapsedWidths).size).toBe(1);
 expect(collapsed.toggle).toEqual(expanded.toggle);
 expect(collapsed.icons).toEqual(expanded.icons);
 expect(collapsed.brand).toEqual(expanded.brand);
 expect(collapsed.profile).toEqual(expanded.profile);
 expect(await page.locator('.app-sidebar').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:'../../.local/sidebar-collapsed.png'});
 await page.getByRole('button',{name:'Развернуть меню',exact:true}).click();
 await page.screenshot({path:'../../.local/sidebar-expanded.png'});
 await page.locator('.app-sidebar').getByRole('button',{name:'Тест-кейсы',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Пока нет тест-кейсов'})).toBeVisible();
 await page.screenshot({path:'../../.local/test-cases-empty.png'});
 await page.getByRole('button',{name:'Импортировать',exact:true}).click();
 const importDialog=page.getByRole('dialog',{name:'Импорт тест-кейса'});
 await importDialog.getByLabel('Файл сценария').dispatchEvent('cancel',{bubbles:true});
 await expect(importDialog).toBeVisible();
 const bddSource=`scenario.manual.skip('Просмотр каталога',async()=>{
 await given('Открыта главная страница демо-приложения.');
 when('Пользователь открывает раздел «Каталог».');
 then('Отображается список материалов.');
 when('Пользователь открывает первый материал.');
 then('Отображается карточка материала.',async()=>{throw new Error('not executed');});
 });`;
 await importDialog.getByLabel('Файл сценария').setInputFiles({name:'synthetic.ts',mimeType:'text/plain',buffer:Buffer.from(bddSource)});
 await expect(importDialog.getByLabel('Исходный текст')).toHaveValue(bddSource);
 await importDialog.getByRole('button',{name:'Проверить',exact:true}).click();
 await expect(importDialog.getByLabel('Предпросмотр импорта')).toBeVisible();
 await expect(importDialog.getByLabel('Название',{exact:true})).toHaveValue('Просмотр каталога');
 await expect(importDialog.getByRole('status')).toContainText('Функции при шагах пропущены: 1');
 await page.screenshot({path:'../../.local/bdd-import-preview.png'});
 await page.setViewportSize({width:640,height:900});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:1484,height:1060});
 expect((await (await page.request.get(origin+'/api/test-cases')).json()).cases).toHaveLength(0);
 await importDialog.getByRole('button',{name:'Открыть в редакторе'}).click();
 await page.locator('.case-breadcrumb button').hover();
 await expect(page.locator('.case-breadcrumb button')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await page.locator('.case-breadcrumb button').focus();
 await page.keyboard.press('Shift+Tab');
 await page.keyboard.press('Tab');
 await expect(page.locator('.case-breadcrumb button')).toHaveCSS('outline-width','2px');
 await page.locator('.case-breadcrumb button').click();
 await expect(page.getByRole('dialog',{name:'Несохранённые изменения'})).toBeVisible();
 await page.getByRole('button',{name:'Продолжить редактирование',exact:true}).click();
 await page.getByLabel('Группа',{exact:true}).fill('Демо');
 await page.getByLabel('Описание',{exact:true}).fill('Проверка переходов в каталоге.');
 await expect(page.locator('.case-step-kind')).toHaveText(['Дано','Когда','Тогда','Когда','Тогда']);
 await page.getByRole('button',{name:'Сохранить тест-кейс',exact:true}).click();
 await expect(page.getByText('Тест-кейс сохранён',{exact:true})).toBeVisible();
 await page.screenshot({path:'../../.local/test-cases-editor.png'});
 await page.reload();
 await expect(page.getByLabel('Название',{exact:true})).toHaveValue('Просмотр каталога');
 await page.locator('.app-sidebar').getByRole('button',{name:'Тест-кейсы',exact:true}).click();
 await page.reload();
 await expect(page.getByRole('heading',{name:'Тест-кейсы',exact:true})).toBeVisible();
 await expect(page.getByText('v1',{exact:true})).toBeVisible();
 const savedCase=(await (await page.request.get(origin+'/api/test-cases')).json()).cases[0];
 const localTime=await page.evaluate(value=>new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(value),savedCase.updatedAt);
 await expect(page.locator('tbody tr').first().locator('td').nth(3)).toHaveText(localTime);
 await page.locator('tbody tr').first().locator('.case-open').hover();
 await expect(page.locator('tbody tr').first().locator('.case-open')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(page.locator('tbody tr').first()).toHaveCSS('outline-style','none');
 await page.locator('tbody tr').first().locator('td').last().hover();
 await expect(page.locator('tbody tr').first()).toHaveCSS('outline-style','none');
 await page.screenshot({path:'../../.local/test-cases-row-hover.png'});
 await page.getByRole('heading',{name:'Тест-кейсы',exact:true}).hover();
 await expect(page.locator('tbody tr').first()).toHaveCSS('outline-style','none');
 await page.getByRole('searchbox',{name:'Поиск тест-кейсов'}).focus();
 await page.keyboard.press('Tab');
 await expect(page.locator('tbody tr').first()).toBeFocused();
 await expect(page.locator('tbody tr').first()).toHaveCSS('outline-style','solid');
 await expect(page.locator('tbody tr').first()).toHaveCSS('outline-width','2px');
 await page.locator('tbody tr').first().locator('.case-open').focus();
 await expect(page.locator('tbody tr').first()).toHaveCSS('outline-style','solid');
 await expect(page.locator('tbody tr').first().locator('.case-open')).toHaveCSS('outline-style','none');
 await page.screenshot({path:'../../.local/test-cases-row-focus.png'});
 await page.screenshot({path:'../../.local/test-cases-list.png'});
 await page.getByRole('button',{name:'Просмотр каталога',exact:true}).click();
 await expect(page.locator('.case-step-kind')).toHaveText(['Дано','Когда','Тогда','Когда','Тогда']);
 await page.getByRole('button',{name:/Выбрать шаг 3/}).click();
 await page.getByRole('button',{name:'Вставить шаг после №3'}).click();
 await expect(page.getByRole('button',{name:'Добавить шаг Дано'})).toHaveCSS('width','166px');
 await page.screenshot({path:'../../.local/ordered-editor-insert.png'});
 await page.getByRole('button',{name:'Добавить шаг Когда'}).press('Escape');
 await page.getByRole('button',{name:/Выбрать шаг 4/}).click();
 const firstStep=page.locator('.case-step-row').first();
 // Click the padding by each edge, not the smaller content button.
 for(const corner of [{x:2,y:30},{x:20,y:2},{x:20,y:57}]) {
  await page.getByRole('button',{name:/Выбрать шаг 4/}).click();
  await firstStep.click({position:corner});
  await expect(firstStep.locator('.case-step-select')).toHaveAttribute('aria-pressed','true');
  await expect(firstStep.locator('.case-step-select')).toBeFocused();
 }
 const bounds=await firstStep.boundingBox();
 await page.getByRole('button',{name:/Выбрать шаг 4/}).click();
 await firstStep.click({position:{x:bounds!.width-2,y:30}});
 await expect(firstStep.locator('.case-step-select')).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Опустить шаг 1 Дано',exact:true}).click();
 await expect(page.locator('.case-step-kind').first()).toHaveText('Когда');
 await page.getByRole('button',{name:'Поднять шаг 2 Дано',exact:true}).click();
 await page.getByRole('button',{name:/Выбрать шаг 4/}).click();
 await expect(page.locator('.case-step-row').first()).toHaveCSS('height','60px');
 await expect(page.getByLabel('Описание шага',{exact:true})).toHaveCSS('height','96px');
 await expect(page.getByLabel('Тип шага')).toHaveCSS('height','40px');
 await expect(page.locator('body')).toHaveCSS('background-color','rgb(17, 22, 29)');
 await expect(page.locator('.case-step-parameters')).toHaveCSS('background-color','rgb(26, 34, 44)');
 const panels=await page.locator('.case-steps, .case-step-parameters').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().bottom));
 expect(panels[1]!).toBeLessThan(panels[0]!);
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
 const saveWidth=await page.getByRole('button',{name:'Сохранить шаг',exact:true}).evaluate(element=>element.getBoundingClientRect().width);
 const textWidth=await page.getByLabel('Описание шага',{exact:true}).evaluate(element=>element.parentElement!.getBoundingClientRect().width);
 expect(saveWidth).toBe(textWidth);
 await page.screenshot({path:'../../.local/ordered-editor.png'});
 await page.getByLabel('Описание',{exact:true}).fill('Локальная правка');
 await page.getByRole('button',{name:'Телевизоры',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Несохранённые изменения'});
 await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Продолжить редактирование',exact:true}).click();
 await expect(page.getByLabel('Описание',{exact:true})).toHaveValue('Локальная правка');
 const session=await (await page.request.get(origin+'/api/auth/session')).json();
 const cases=await (await page.request.get(origin+'/api/test-cases')).json();const item=cases.cases[0];
 const {id,version,title,description,group,steps}=item;
 await page.request.put(origin+'/api/test-cases/'+id,{headers:{origin,'x-csrf-token':session.csrfToken},data:{title,description:'Другой редактор',group,steps,version}});
 await page.getByRole('button',{name:'Сохранить тест-кейс',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('другой вкладке');
 await expect(page.getByLabel('Описание',{exact:true})).toHaveValue('Локальная правка');
 await page.getByRole('button',{name:'Загрузить сохранённую версию'}).click();
 await page.route('**/api/test-cases/*',route=>route.abort());
 await dialog.getByRole('button',{name:'Не сохранять и продолжить'}).click();
 await expect(page.getByRole('alert')).toBeVisible();
 await page.getByRole('button',{name:'Телевизоры',exact:true}).click();
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Продолжить редактирование',exact:true}).click();
 await page.unroute('**/api/test-cases/*');
 await page.getByRole('button',{name:'Загрузить сохранённую версию'}).click();
 await dialog.getByRole('button',{name:'Не сохранять и продолжить'}).click();
 await expect(page.getByLabel('Описание',{exact:true})).toHaveValue('Другой редактор');
 await page.getByLabel('Описание',{exact:true}).fill('Новая версия');
 await page.getByRole('button',{name:'Телевизоры',exact:true}).click();
 await page.route('**/api/test-cases/*',async route=> { if(route.request().method()==='PUT') await route.abort(); else await route.continue(); });
 await dialog.getByRole('button',{name:'Сохранить и продолжить'}).click();
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('alert')).toBeVisible();
 await page.unroute('**/api/test-cases/*');
 await dialog.getByRole('button',{name:'Сохранить и продолжить'}).click();
 await expect(page.getByRole('heading',{name:'Телевизоры',exact:true})).toBeVisible();
 await page.locator('.app-sidebar').getByRole('button',{name:'Тест-кейсы',exact:true}).click();
 await expect(page.getByText('v3',{exact:true})).toBeVisible();
 await page.setViewportSize({width:640,height:900});await page.getByRole('button',{name:'Просмотр каталога',exact:true}).click();
 await expect(page.getByLabel('Название',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByLabel('Описание',{exact:true}).fill('Черновик после истечения сессии');
 await page.request.post(origin+'/api/auth/logout',{headers:{origin,'x-csrf-token':session.csrfToken}});
 await page.getByRole('button',{name:'Телевизоры',exact:true}).click();
 await dialog.getByRole('button',{name:'Сохранить и продолжить'}).click();
 await expect(page.getByRole('button',{name:'Войти',exact:true})).toBeVisible();
 await page.getByLabel('Логин').fill('qa');await page.getByLabel('Пароль').fill(password);await page.getByRole('button',{name:'Войти',exact:true}).click();
 await expect(page.getByLabel('Описание',{exact:true})).toHaveValue('Черновик после истечения сессии');
});

test('scrolls a long sequence inside its panel and keeps compact parameters',async({page})=>{
 await page.setViewportSize({width:1484,height:1060});await page.goto(origin);
 await expect(page.getByLabel('Пароль')).toBeVisible();
 if(await page.getByLabel('Установочный токен').isVisible()){await page.getByLabel('Установочный токен').fill(setupToken);await page.getByLabel('Имя владельца').fill('qa');await page.getByLabel('Пароль').fill(password);await page.getByRole('button',{name:'Создать владельца'}).click();}
 await page.getByLabel('Логин').fill('qa');await page.getByLabel('Пароль').fill(password);await page.getByRole('button',{name:'Войти',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Телевизоры',exact:true})).toBeVisible();
 const session=await (await page.request.get(origin+'/api/auth/session')).json();
 const id=crypto.randomUUID();
 const response=await page.request.post(origin+'/api/test-cases',{headers:{origin,'x-csrf-token':session.csrfToken},data:{id,title:'Длинная последовательность',description:'',group:'',steps:Array.from({length:40},(_,index)=>({id:crypto.randomUUID(),kind:'when',text:`Синтетический шаг ${index+1}`}))}});
 expect(response.ok()).toBe(true);
 await page.locator('.app-sidebar').getByRole('button',{name:'Тест-кейсы',exact:true}).click();
 await page.getByRole('button',{name:'Длинная последовательность',exact:true}).click();
 await page.getByRole('button',{name:/Выбрать шаг 1 Когда:/}).click();
 const panel=page.locator('.case-step-parameters');const before=await panel.boundingBox();
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
 expect(await page.locator('.case-sequence').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
 await expect(page.locator('.case-sequence')).toHaveCSS('scrollbar-color','rgb(58, 72, 89) rgb(26, 34, 44)');
 await expect(page.locator('.case-sequence')).toHaveCSS('scrollbar-width','thin');
 await page.getByRole('button',{name:/Выбрать шаг 40 Когда:/}).focus();
 expect(await page.locator('.case-sequence').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 expect(await panel.boundingBox()).toEqual(before);
 expect(await page.evaluate(()=>scrollY)).toBe(0);
 await page.getByRole('button',{name:'Вставить шаг после №40'}).click();
 await expect(page.getByRole('button',{name:'Добавить шаг Тогда'})).toBeVisible();
 await expectClickable(page,page.getByRole('button',{name:'Добавить шаг Тогда'}));
 await page.screenshot({path:'../../.local/editor-long-sequence.png'});
 await page.route('**/api/test-cases/'+id,route=>route.abort());
 await page.reload();
 await expect(page.getByRole('heading',{name:'Тест-кейсы',exact:true})).toBeVisible();
 await expect(page.getByRole('alert')).toBeVisible();
 await expect(page.getByText('Загрузка тест-кейсов…')).toHaveCount(0);
 await page.locator('.sidebar-profile').click();
 await expect(page.getByRole('heading',{name:'Мой профиль',exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('heading',{name:'Мой профиль',exact:true})).toBeVisible();
});

async function loginAudit(page: import('@playwright/test').Page) {
 await page.goto(origin);
 await expect(page.getByLabel('Пароль')).toBeVisible();
 if(await page.getByLabel('Установочный токен').isVisible()) {
  await page.getByLabel('Установочный токен').fill(setupToken);await page.getByLabel('Имя владельца').fill('qa');await page.getByLabel('Пароль').fill(password);await page.getByRole('button',{name:'Создать владельца'}).click();
 }
 await page.getByLabel('Логин').fill('qa');await page.getByLabel('Пароль').fill(password);await page.getByRole('button',{name:'Войти',exact:true}).click();
 await page.locator('.app-sidebar').getByRole('button',{name:'Тест-кейсы',exact:true}).click();
}

// A menu clipped by a scroll panel can be "visible" to Playwright but impossible to click.
async function expectClickable(page: import('@playwright/test').Page, locator: import('@playwright/test').Locator) {
 const reachable=await locator.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
 expect(reachable).toBe(true);
}

test('keeps insertion choices clickable in a short window',async({page})=>{
 await page.setViewportSize({width:1280,height:600});await loginAudit(page);
 await page.getByRole('button',{name:'Создать тест-кейс'}).click();
 await page.getByRole('button',{name:'Добавить шаг',exact:true}).click();
 const then=page.getByRole('button',{name:'Добавить шаг Тогда',exact:true});
 await expect(then).toBeVisible();await expectClickable(page,then);
 const menu=await page.locator('.case-insert-menu').boundingBox();const last=await then.boundingBox();
 expect(menu!.y+menu!.height-last!.y-last!.height).toBeLessThanOrEqual(16);
 await then.press('Escape');await expect(page.getByRole('button',{name:'Добавить шаг',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Добавить шаг',exact:true}).click();await then.click();
 await expect(page.getByLabel('Тип шага')).toHaveValue('then');
});

test('keeps long descriptions compact and parameters reachable at 1024 px',async({page})=>{
 await page.setViewportSize({width:1558,height:1248});await loginAudit(page);
 const session=await(await page.request.get(origin+'/api/auth/session')).json();
 const group='Длинное название группы '.repeat(5).slice(0,100);
 const text='Полное синтетическое описание шага для проверки интерфейса. '.repeat(40).slice(0,2000);
 const response=await page.request.post(origin+'/api/test-cases',{headers:{origin,'x-csrf-token':session.csrfToken},data:{id:crypto.randomUUID(),title:'Границы редактора',description:'',group,steps:Array.from({length:200},()=>({id:crypto.randomUUID(),kind:'when',text}))}});
 expect(response.ok()).toBe(true);await page.reload();
 const longGroup=page.locator('.case-groups button').filter({hasText:group});
 expect.soft((await longGroup.boundingBox())!.height).toBeLessThanOrEqual(64);
 await expect.soft(page.locator('tbody td').first()).toHaveCSS('font-size','14px');
 await page.getByRole('button',{name:'Границы редактора',exact:true}).click();
 expect.soft((await page.locator('.case-step-row').first().boundingBox())!.height).toBeLessThanOrEqual(80);
 await page.locator('.case-step-select').first().click();await expect(page.getByLabel('Описание шага',{exact:true})).toHaveValue(text);
 await page.setViewportSize({width:1024,height:768});
 expect(await page.locator('.case-sequence').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
 await expectClickable(page,page.getByLabel('Тип шага'));
 await expectClickable(page,page.getByLabel('Описание шага',{exact:true}));
 await expect(page.locator('.case-step-row')).toHaveCount(200);
});

test('keeps import actions visible and moves focus to close confirmation',async({page})=>{
 await page.setViewportSize({width:1280,height:720});await loginAudit(page);
 await page.getByRole('button',{name:'Импортировать',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Импорт тест-кейса'});
 await dialog.getByLabel('Название',{exact:true}).fill('Демо');
 await dialog.getByLabel('Исходный текст').fill(Array.from({length:11},(_,i)=>`when('Синтетический шаг ${i+1}');`).join('\n'));
 await dialog.getByRole('button',{name:'Проверить',exact:true}).click();
 await expectClickable(page,dialog.getByRole('button',{name:'Открыть в редакторе'}));
 await dialog.getByRole('button',{name:'Проверить',exact:true}).press('Escape');
 const continueButton=dialog.getByRole('button',{name:'Продолжить редактирование'});
 await expect(continueButton).toBeFocused();await expectClickable(page,continueButton);
 await continueButton.click();await expect(dialog.getByRole('button',{name:'Проверить',exact:true})).toBeFocused();
 await expect(dialog.getByLabel('Название',{exact:true})).toHaveValue('Демо');
});

test('drags steps in both directions without losing pending text and persists order',async({page})=>{
 await page.setViewportSize({width:1484,height:1060});await loginAudit(page);
 await page.getByRole('button',{name:'Создать тест-кейс'}).click();
 await page.getByLabel('Название',{exact:true}).fill('Перетаскивание шагов');
 for(const text of ['Первый','Второй','Третий']) {
  await page.getByRole('button',{name:'Добавить шаг',exact:true}).click();await page.getByRole('button',{name:'Добавить шаг Когда',exact:true}).click();
  await page.getByLabel('Описание шага',{exact:true}).fill(text);await page.getByRole('button',{name:'Сохранить шаг',exact:true}).click();
 }
 await page.getByRole('button',{name:/Выбрать шаг 1 Когда:/}).click();
 await page.getByLabel('Описание шага',{exact:true}).fill('Первый — правка');
 await page.getByRole('button',{name:'Перетащить шаг 1',exact:true}).dragTo(page.locator('.case-step-row').nth(2),{targetPosition:{x:80,y:55}});
 await expect(page.locator('.case-step-text')).toHaveText(['Второй','Третий','Первый']);
 await expect(page.getByLabel('Описание шага',{exact:true})).toHaveValue('Первый — правка');
 await expect(page.locator('.case-parameter-number')).toHaveText('Шаг 3');
 await page.getByRole('button',{name:'Сохранить шаг',exact:true}).click();
 await page.getByRole('button',{name:'Перетащить шаг 3',exact:true}).dragTo(page.locator('.case-step-row').first(),{targetPosition:{x:80,y:3}});
 await expect(page.locator('.case-step-text')).toHaveText(['Первый — правка','Второй','Третий']);
 await page.getByRole('button',{name:'Сохранить тест-кейс',exact:true}).click();await expect(page.getByText('Тест-кейс сохранён',{exact:true})).toBeVisible();
 await page.reload();await expect(page.locator('.case-step-text')).toHaveText(['Первый — правка','Второй','Третий']);
 await page.getByRole('button',{name:'Перетащить шаг 2',exact:true}).dragTo(page.locator('.case-step-row').nth(1),{targetPosition:{x:80,y:30}});
 await expect(page.getByRole('button',{name:'Сохранить тест-кейс',exact:true})).toBeDisabled();
});

test('autoscrolls a dragged step and Escape cancels without changing order',async({page})=>{
 await page.setViewportSize({width:1280,height:720});await loginAudit(page);
 const session=await(await page.request.get(origin+'/api/auth/session')).json();
 const response=await page.request.post(origin+'/api/test-cases',{headers:{origin,'x-csrf-token':session.csrfToken},data:{id:crypto.randomUUID(),title:'Прокрутка при переносе',description:'',group:'',steps:Array.from({length:40},(_,i)=>({id:crypto.randomUUID(),kind:'when',text:`Шаг ${i+1}`}))}});
 expect(response.ok()).toBe(true);await page.reload();await page.getByRole('button',{name:'Прокрутка при переносе',exact:true}).click();
 const handle=await page.getByRole('button',{name:'Перетащить шаг 1',exact:true}).boundingBox();const list=await page.locator('.case-sequence').boundingBox();
 await page.mouse.move(handle!.x+handle!.width/2,handle!.y+handle!.height/2);await page.mouse.down();
 await page.mouse.move(handle!.x+handle!.width/2+12,handle!.y+handle!.height/2+12,{steps:5});
 await page.mouse.move(list!.x+list!.width/2,list!.y+list!.height-4,{steps:10});
 await expect.poll(()=>page.locator('.case-sequence').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await expect(page.locator('[data-dragged=true]')).toHaveCount(1);
 await page.screenshot({path:'../../.local/dnd-active.png'});
 await page.keyboard.press('Escape');await page.mouse.up();
 await expect(page.locator('[data-dragged=true]')).toHaveCount(0);
 const stopped=await page.locator('.case-sequence').evaluate(el=>el.scrollTop);
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 expect(await page.locator('.case-sequence').evaluate(el=>el.scrollTop)).toBe(stopped);
 await expect(page.locator('.case-step-text').first()).toHaveText('Шаг 1');await expect(page.locator('.case-step-text').last()).toHaveText('Шаг 40');
 await expect(page.getByRole('button',{name:'Сохранить тест-кейс',exact:true})).toBeDisabled();
 await page.getByRole('heading',{name:'Параметры шага',exact:true}).hover();
 await page.locator('.case-sequence').evaluate(el=>{el.scrollTop=0;});
 await expect.poll(()=>page.locator('.case-sequence').evaluate(el=>el.scrollTop)).toBe(0);
 await page.getByRole('button',{name:'Перетащить шаг 1',exact:true}).dragTo(page.getByRole('heading',{name:'Параметры шага',exact:true}));
 await expect(page.locator('[data-dragged=true]')).toHaveCount(0);
 await expect(page.locator('.case-step-text').first()).toHaveText('Шаг 1');
 await expect(page.getByRole('button',{name:'Сохранить тест-кейс',exact:true})).toBeDisabled();
});
