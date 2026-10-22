import {expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {stat} from 'node:fs/promises';
import {test,tvHost} from '../support/tv-fixture.js';

test('synthetic camera video can be cancelled or downloaded with the TV model',async({page,tv},testInfo)=>{
 await page.addInitScript(()=>{
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;
  const context=canvas.getContext('2d')!;let frame=0;
  const draw=()=>{context.fillStyle=frame++%2?'#345678':'#567890';context.fillRect(0,0,160,90);requestAnimationFrame(draw);};draw();
  const stream=canvas.captureStream(15);
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>stream});
  Object.defineProperty(navigator.mediaDevices,'enumerateDevices',{configurable:true,value:async()=>[]});
 });
 await tv.replaceTv({kind:'success'});await tv.setupAndLogin(page);
 await expect(page.getByRole('button',{name:'Добавить ТВ',exact:true})).toBeVisible();
 const session=await(await page.request.get(`${tv.origin}/api/auth/session`)).json();
 expect((await page.request.post(`${tv.origin}/api/tvs`,{headers:{origin:tv.origin,'x-csrf-token':session.csrfToken},data:{id:randomUUID(),host:tvHost,platform:'webos'}})).status()).toBe(202);
 await page.getByRole('button',{name:'Телевизоры',exact:true}).click();
 await page.getByRole('button',{name:/^Открыть телевизор /}).click();
 const record=page.getByRole('button',{name:'Записать видео',exact:true});
 await expect(record).toBeDisabled();
 await page.getByRole('button',{name:'Включить камеру',exact:true}).click();await expect(record).toBeEnabled();
 const downloads:string[]=[];page.on('download',download=>downloads.push(download.suggestedFilename()));
 await record.click();await page.getByRole('button',{name:'Отменить запись',exact:true}).click();
 await expect(page.getByText('Запись отменена.',{exact:true})).toBeVisible();expect(downloads).toHaveLength(0);
 await record.click();
 await expect(page.getByRole('timer')).not.toHaveText('00:00');
 await page.getByRole('button',{name:'К списку телевизоров',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Идёт запись видео'})).toBeVisible();
 await page.getByRole('button',{name:'Вернуться к записи',exact:true}).click();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Остановить запись',exact:true}).click();const download=await pending;
 expect(download.suggestedFilename()).toMatch(/^43UP76906LE-.*\.webm$/);
 const path=await download.path();expect(path).toBeTruthy();expect((await stat(path!)).size).toBeGreaterThan(0);
 await expect(page.getByRole('link',{name:'Скачать запись',exact:true})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('camera-recording.png')});
});
