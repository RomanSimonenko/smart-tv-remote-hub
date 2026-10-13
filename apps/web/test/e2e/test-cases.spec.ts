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

test.beforeAll(async () => {
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

test.afterAll(async () => {
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
 await expect(page.locator('tbody tr').first().locator('td').last()).toHaveText(localTime);
 await page.locator('tbody tr').first().locator('.case-open').hover();
 await expect(page.locator('tbody tr').first().locator('.case-open')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(page.locator('tbody tr').first()).toHaveCSS('outline-style','solid');
 await page.locator('tbody tr').first().locator('td').last().hover();
 await expect(page.locator('tbody tr').first()).toHaveCSS('outline-style','solid');
 await page.screenshot({path:'../../.local/test-cases-row-hover.png'});
 await page.getByRole('heading',{name:'Тест-кейсы',exact:true}).hover();
 await expect(page.locator('tbody tr').first()).toHaveCSS('outline-style','none');
 await page.locator('tbody tr').first().focus();
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
 await expect(page.locator('.case-step-row').first()).toHaveCSS('height','60px');
 await expect(page.getByLabel('Текст шага')).toHaveCSS('height','96px');
 await expect(page.getByLabel('Тип шага')).toHaveCSS('height','40px');
 await expect(page.locator('body')).toHaveCSS('background-color','rgb(17, 22, 29)');
 await expect(page.locator('.case-step-parameters')).toHaveCSS('background-color','rgb(26, 34, 44)');
 const panels=await page.locator('.case-steps, .case-step-parameters').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().bottom));
 expect(panels[1]!).toBeLessThan(panels[0]!);
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
 const saveWidth=await page.getByRole('button',{name:'Сохранить шаг',exact:true}).evaluate(element=>element.getBoundingClientRect().width);
 const textWidth=await page.getByLabel('Текст шага').evaluate(element=>element.getBoundingClientRect().width);
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
