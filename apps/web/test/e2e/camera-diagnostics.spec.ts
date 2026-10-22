import {expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {test,gate,tvHost} from '../support/tv-fixture.js';

test('collapsed camera diagnostics keep OCR running and preserve its result',async({page,tv})=>{
 await page.setViewportSize({width:1280,height:1000});
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
   async getUserMedia(){
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
    const stream=canvas.captureStream(30),track=stream.getVideoTracks()[0]!;
    const draw=()=>{if(track.readyState!=='live')return;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#202020';ctx.fillRect(0,0,640,480);ctx.fillStyle='white';ctx.fillRect(100,100,440,250);requestAnimationFrame(draw);};draw();return stream;
   },
   async enumerateDevices(){return [{kind:'videoinput',deviceId:'synthetic',label:'Synthetic camera',groupId:''}];},
  }});
 });
 await tv.replaceTv({kind:'success'});await tv.setupAndLogin(page);
 await expect(page.getByRole('button',{name:'Добавить ТВ',exact:true})).toBeVisible();
 const session=await(await page.request.get(`${tv.origin}/api/auth/session`)).json();
 const added=await page.request.post(`${tv.origin}/api/tvs`,{headers:{origin:tv.origin,'x-csrf-token':session.csrfToken},data:{id:randomUUID(),host:tvHost,platform:'webos'}});expect(added.status()).toBe(202);
 await expect.poll(async()=>(await tv.status(page)).connection).toBe('available');
 await page.reload();await page.getByRole('button',{name:/^Открыть телевизор /}).click();
 await page.getByRole('button',{name:'Включить камеру',exact:true}).click();
 const panel=page.locator('.camera-diagnostics'),summary=panel.locator('summary');await summary.click();
 await expect(page.getByRole('button',{name:'Распознать текст',exact:true})).toBeEnabled();
 const pending=gate();let requests=0;
 await page.route('**/api/camera/ocr',async route=>{requests++;await pending.promise;await route.fulfill({json:{blocks:[{text:'Синтетический результат'}],engine:'synthetic',model:'test',elapsedMs:1234}});});
 await page.getByRole('button',{name:'Распознать текст',exact:true}).click();
 try{
  await expect.poll(()=>requests).toBe(1);await summary.click();
  await expect(panel).not.toHaveAttribute('open');
  const progress=summary.getByRole('status',{name:'Распознавание выполняется'});await expect(progress).toBeVisible();
  await expect(progress.locator('svg')).toHaveCSS('animation-name','activity-spin');
  await page.screenshot({path:'.local/playwright/camera-diagnostics-collapsed.png'});
 }finally{pending.release();}
 await expect(summary.getByRole('status')).toHaveCount(0);await summary.click();
 await expect(page.getByText('Синтетический результат',{exact:true})).toBeVisible();
 await expect(page.getByAltText('Проверочный снимок')).toBeVisible();expect(requests).toBe(1);
 await page.screenshot({path:'.local/playwright/camera-diagnostics-result.png'});
});
