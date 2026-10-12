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
 await page.setViewportSize({width:1480,height:1000});
 await page.goto(origin);
 await page.getByLabel('Установочный токен').fill(setupToken);
 await page.getByLabel('Имя владельца').fill('qa');await page.getByLabel('Пароль').fill(password);
 await page.getByRole('button',{name:'Создать владельца'}).click();
 await page.getByLabel('Логин').fill('qa');await page.getByLabel('Пароль').fill(password);
 await page.getByRole('button',{name:'Войти',exact:true}).click();
 await page.getByRole('button',{name:'Тест-кейсы',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Пока нет тест-кейсов'})).toBeVisible();
 await page.screenshot({path:'../../.local/test-cases-empty.png'});
 await page.getByRole('button',{name:'Создать тест-кейс'}).click();
 await page.getByLabel('Название',{exact:true}).fill('Синтетический сценарий');
 await page.getByLabel('Группа',{exact:true}).fill('ТВ-каналы');
 await page.getByRole('button',{name:'Добавить шаг Дано'}).click();
 await page.getByLabel('Текст шага').fill('Открыт тестовый экран');
 await page.getByRole('button',{name:'Добавить шаг Когда'}).click();
 await page.getByLabel('Текст шага').fill('Выбрать тестовый пункт');
 await page.getByRole('button',{name:'Добавить шаг Тогда'}).click();
 await page.getByLabel('Текст шага').fill('Показан ожидаемый экран');
 await page.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(page.getByText('Тест-кейс сохранён',{exact:true})).toBeVisible();
 await page.screenshot({path:'../../.local/test-cases-editor.png'});
 await page.reload();await page.getByRole('button',{name:'Тест-кейсы',exact:true}).click();
 await expect(page.getByText('v1',{exact:true})).toBeVisible();
 await page.screenshot({path:'../../.local/test-cases-list.png'});
 await page.getByRole('button',{name:'Синтетический сценарий',exact:true}).click();
 await page.getByLabel('Описание',{exact:true}).fill('Локальная правка');
 await page.getByRole('button',{name:'Телевизоры',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Несохранённые изменения'});
 await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Продолжить редактирование',exact:true}).click();
 await expect(page.getByLabel('Описание',{exact:true})).toHaveValue('Локальная правка');
 const session=await (await page.request.get(origin+'/api/auth/session')).json();
 const cases=await (await page.request.get(origin+'/api/test-cases')).json();const item=cases.cases[0];
 const {id,version,title,description,group,steps}=item;
 await page.request.put(origin+'/api/test-cases/'+id,{headers:{origin,'x-csrf-token':session.csrfToken},data:{title,description:'Другой редактор',group,steps,version}});
 await page.getByRole('button',{name:'Сохранить',exact:true}).click();
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
 await page.getByRole('button',{name:'Тест-кейсы',exact:true}).click();
 await expect(page.getByText('v3',{exact:true})).toBeVisible();
 await page.setViewportSize({width:640,height:900});await page.getByRole('button',{name:'Синтетический сценарий',exact:true}).click();
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
