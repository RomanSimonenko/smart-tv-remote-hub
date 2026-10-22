import {expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {test,gate,tvHost} from '../support/tv-fixture.js';

test('camera runner saves five fresh frames, shows report and restores it on reload',async({page,tv})=>{
 // Five source-resolution jobs, a deliberate heartbeat barrier and a second failure run.
 test.setTimeout(60_000);
 await page.setViewportSize({width:1440,height:1024});
 // Only the external camera is synthetic; video frame callbacks, encoding,
 // uploads, persistence, TV adapter and API remain real.
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
   async getUserMedia(){const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const ctx=canvas.getContext('2d')!;let frame=0;const stream=canvas.captureStream(30);const track=stream.getVideoTracks()[0]!;Object.defineProperty(track,'label',{value:'Синтетическая камера'});
    function draw(){if(track.readyState!=='live')return;frame++;ctx.fillStyle='#202020';ctx.fillRect(0,0,1920,1080);ctx.fillStyle='#777';ctx.fillRect(282,207,1356,786);ctx.fillStyle='#203080';ctx.fillRect(300,225,1320,750);ctx.fillStyle='#eee';for(let y=280;y<940;y+=90)for(let x=360;x<1580;x+=90){ctx.beginPath();ctx.arc(x,y,30,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#11161D';ctx.fillRect(620,480,700,120);ctx.fillStyle='#F2F5F8';ctx.font='32px sans-serif';ctx.fillText(`Синтетический кадр ${frame}`,650,550);requestAnimationFrame(draw);}draw();return stream;},
   async enumerateDevices(){return [{kind:'videoinput',deviceId:'synthetic',label:'Синтетическая камера',groupId:''}];},
  }});
 });
 await tv.replaceTv({kind:'success'});await tv.setupAndLogin(page);
 await expect(page.getByRole('button',{name:'Добавить ТВ',exact:true})).toBeVisible();
 const session=await (await page.context().request.get(`${tv.origin}/api/auth/session`)).json();const headers={origin:tv.origin,'x-csrf-token':session.csrfToken};
 const device=await page.context().request.post(`${tv.origin}/api/tvs`,{headers,data:{id:randomUUID(),host:tvHost,platform:'webos'}});expect(device.status()).toBe(202);
 await expect.poll(async()=>(await tv.status(page)).connection).toBe('available');
 const caseId=randomUUID();const steps=(['given','when','then','when','then'] as const).map((kind,index)=>({id:randomUUID(),kind,text:['Главное меню открыто','Переход вправо','Фокус на втором пункте','Возврат влево','Фокус на первом пункте'][index],...(kind==='when'?{actions:[{id:randomUUID(),action:index===1?'RIGHT':'LEFT',pauseAfterMs:500}]}:{})}));
 expect((await page.context().request.post(`${tv.origin}/api/test-cases`,{headers,data:{id:caseId,title:'Переход между пунктами меню',description:'Синтетическая проверка запуска со снимками',group:'Демонстрация',status:'ready',steps}})).status()).toBe(201);
 await page.getByRole('button',{name:'Тест-кейсы',exact:true}).click();await page.getByRole('button',{name:'Запустить тест-кейс: Переход между пунктами меню'}).click();
 await expect(page.getByRole('heading',{name:'Подготовка запуска'})).toBeVisible();await expect(page.getByRole('button',{name:'Начать тест'})).toBeDisabled();
 await page.getByRole('button',{name:'Включить камеру',exact:true}).click();await expect(page.getByRole('button',{name:'Начать тест'})).toBeEnabled();
 await page.screenshot({path:'.local/playwright/runner-preparation.png'});
 const uploadGate=gate();let uploads=0;
 const heartbeatResponse=page.waitForResponse(response=>response.url().endsWith('/heartbeat')&&response.request().method()==='POST');
 const startGate=gate();await page.route('**/api/test-runs',async route=>{if(route.request().method()==='POST')await startGate.promise;await route.continue();});
 await page.route('**/api/test-runs/*/items/*/snapshot',async route=>{if(route.request().method()==='PUT'&&++uploads===2)await uploadGate.promise;await route.continue();});
 page.on('response',response=>{if(response.url().endsWith('/advance')&&response.ok())tv.clock.advance(500);});
 await page.getByRole('button',{name:'Начать тест'}).click();
 try{await expect(page.getByRole('heading',{name:'Выполнение теста'})).toBeVisible();await expect(page.getByLabel('Снимки сохранены')).toHaveCount(0);}finally{startGate.release();}
 try{await expect.poll(()=>uploads).toBe(2);const heartbeat=await heartbeatResponse;expect(heartbeat.status()).toBe(200);expect(heartbeat.request().postDataJSON()).toEqual({});await expect(page.getByRole('heading',{name:'Выполнение теста'})).toBeVisible();await page.screenshot({path:'.local/playwright/runner-execution.png'});}finally{uploadGate.release();}
 await expect(page.getByRole('heading',{name:'Результат запуска'})).toBeVisible({timeout:30_000});await expect(page.getByText('Требуется проверка',{exact:true})).toBeVisible();
 await expect(page.locator('.report-step-list > li')).toHaveCount(5);
 for(const step of await page.locator('.report-step').all())if(await step.getAttribute('open')===null)await step.locator('summary').click();
 await expect(page.getByText('Снимок сохранён',{exact:true})).toHaveCount(5);
 await page.screenshot({path:'.local/playwright/runner-report.png'});
 const stored=await (await page.context().request.get(`${tv.origin}/api/test-runs`)).json();expect(stored.runs[0].savedCount).toBe(5);const run=await (await page.context().request.get(`${tv.origin}/api/test-runs/${stored.runs[0].id}`)).json();expect(run.items).toHaveLength(5);expect(new Set(run.items.map((item:{sha256:string})=>item.sha256)).size).toBe(5);
 const jpeg=await page.context().request.get(`${tv.origin}/api/test-runs/${run.id}/items/${run.items[0].id}/snapshot`);expect(jpeg.headers()['content-type']).toContain('image/jpeg');
 const {createRequire}=await import('node:module');const req=createRequire(new URL('../../../../packages/screen-vision/package.json',import.meta.url));const sharp=req('sharp');const dimensions=await sharp(await jpeg.body()).metadata();expect(dimensions.width).toBeGreaterThan(1250);expect(dimensions.width).toBeLessThan(1340);
 await page.reload();await expect(page.getByRole('heading',{name:'Результат запуска'})).toBeVisible();expect(uploads).toBe(5);
 // Inject only the detector's explicit loss response; run failure persistence and
 // report rendering remain real, and no original frame may reach storage.
 await page.getByRole('button',{name:'Новый запуск',exact:true}).click();
 await page.getByRole('button',{name:'Включить камеру',exact:true}).click();await expect(page.getByRole('button',{name:'Начать тест'})).toBeEnabled();
 await page.route('**/api/camera/snapshot',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'not-found'})}));
 await page.getByRole('button',{name:'Начать тест'}).click();await expect(page.getByRole('heading',{name:'Результат запуска'})).toBeVisible();
 await expect(page.getByRole('alert').filter({hasText:'Экран не найден'})).toBeVisible();
 const failedList=await (await page.context().request.get(`${tv.origin}/api/test-runs`)).json();const failedRun=await (await page.context().request.get(`${tv.origin}/api/test-runs/${failedList.runs[0].id}`)).json();
 expect(failedRun.status).toBe('error');expect(failedRun.failure).toEqual({stage:'camera',code:'SCREEN_NOT_FOUND'});expect(failedRun.items.filter((item:{phase:string})=>item.phase==='saved')).toHaveLength(0);expect(uploads).toBe(5);
 await page.getByRole('button',{name:'Запуски',exact:true}).first().click();await expect(page.getByRole('heading',{name:'Запуски',exact:true})).toBeVisible();await page.screenshot({path:'.local/playwright/runner-history.png'});
});
