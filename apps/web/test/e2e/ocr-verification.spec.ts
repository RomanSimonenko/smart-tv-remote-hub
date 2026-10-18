import {expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {test,tvHost} from '../support/tv-fixture.js';
import {syntheticOcrJpeg} from '../../../api/test/support/synthetic-ocr-jpeg.js';
for(const missing of [false,true])test(`OCR conditions persist through API, history and report (${missing?'failed':'passed'})`,async({page,tv})=>{
 test.setTimeout(60_000);await page.setViewportSize({width:1280,height:900});await tv.replaceTv({kind:'success'});await tv.setupAndLogin(page);await expect(page.getByRole('button',{name:'Добавить ТВ',exact:true})).toBeVisible();
 const request=page.context().request;
 const session=await(await request.get(`${tv.origin}/api/auth/session`)).json();const headers={origin:tv.origin,'x-csrf-token':session.csrfToken};
 const device=await request.post(`${tv.origin}/api/tvs`,{headers,data:{id:randomUUID(),host:tvHost,platform:'webos'}});expect(device.status()).toBe(202);const {tvId}=await device.json();
 await expect.poll(async()=>(await tv.status(page)).connection).toBe('available');
 const caseId=randomUUID();const steps=[{id:randomUUID(),kind:'then',text:'Синтетический экран',textConditions:['Мое кино','Мои подписки']},{id:randomUUID(),kind:'when',text:'Следующий шаг',actions:[{id:randomUUID(),action:'RIGHT',pauseAfterMs:0}]}];
 expect((await request.post(`${tv.origin}/api/test-cases`,{headers,data:{id:caseId,title:'Синтетические условия OCR',description:'',group:'',steps}})).status()).toBe(201);
 const runId=randomUUID();const start=await request.post(`${tv.origin}/api/test-runs`,{headers,data:{id:runId,caseId,version:1,tvId}});expect(start.status()).toBe(201);let run=await start.json();
 expect((await request.post(`${tv.origin}/api/test-runs/${runId}/advance`,{headers,data:{itemId:run.items[0].id}})).status()).toBe(200);
 const image=await syntheticOcrJpeg(missing?['Мое кино']:['Мое кино','Мои подписки']);
 const uploaded=await request.put(`${tv.origin}/api/test-runs/${runId}/items/${run.items[0].id}/snapshot`,{headers:{...headers,'content-type':'image/jpeg','x-captured-at':'1','x-camera-label':'Synthetic'},data:image});expect(uploaded.status()).toBe(200);run=await uploaded.json();
 expect(run.items[0].verification.status).toBe(missing?'failed':'passed');
 if(!missing){expect((await request.post(`${tv.origin}/api/test-runs/${runId}/advance`,{headers,data:{itemId:run.items[1].id}})).status()).toBe(200);run=await(await request.put(`${tv.origin}/api/test-runs/${runId}/items/${run.items[1].id}/snapshot`,{headers:{...headers,'content-type':'image/jpeg','x-captured-at':'2','x-camera-label':'Synthetic'},data:image})).json();}
 expect(run.status).toBe(missing?'failed':'passed');
 await page.getByRole('button',{name:'Запуски',exact:true}).click();await page.getByRole('button',{name:'Синтетические условия OCR · v1'}).click();
 await expect(page.getByText(missing?'Тест провален':'Тест пройден',{exact:true})).toBeVisible();await expect(page.getByText(`Мои подписки — ${missing?'не найдено':'найдено'}`,{exact:true})).toBeVisible();
 await page.screenshot({path:`.local/playwright/ocr-report-${missing?'failed':'passed'}.png`});
 await page.reload();await expect(page.getByText(`Мои подписки — ${missing?'не найдено':'найдено'}`,{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Тест-кейсы',exact:true}).click();await page.getByRole('button',{name:'Синтетические условия OCR',exact:true}).click();await page.getByRole('button',{name:/Выбрать шаг 1/}).click();await expect(page.getByLabel('Надпись 2',{exact:true})).toHaveValue('Мои подписки');
 const input=page.getByLabel('Надпись 1',{exact:true});await input.focus();
 const focus=await input.evaluate(element=>{const box=element.getBoundingClientRect(),clip=element.closest('.text-condition-list')!.getBoundingClientRect(),style=getComputedStyle(element);return {space:box.left-clip.left,ring:parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset)};});expect(focus.space).toBeGreaterThanOrEqual(focus.ring);
 await expect(page.getByText('При запуске после каждого нажатия и паузы сохраняется снимок.',{exact:true})).toHaveCount(0);
 await page.screenshot({path:'.local/playwright/ocr-editor.png'});await page.getByRole('button',{name:'Свернуть меню',exact:true}).click();await expect(page.getByLabel('Надпись 2',{exact:true})).toBeVisible();await page.screenshot({path:'.local/playwright/ocr-editor-collapsed.png'});
 await page.setViewportSize({width:1280,height:1060});for(let i=2;i<20;i++){await page.getByRole('button',{name:'Добавить условие',exact:true}).click();}
 const last=page.getByLabel('Надпись 20',{exact:true});await last.scrollIntoViewIfNeeded();await expect(last).toBeVisible();await expect(page.getByRole('button',{name:'Сохранить шаг',exact:true})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
});
