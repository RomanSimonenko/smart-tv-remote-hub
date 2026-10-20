import {expect} from '@playwright/test';
import {test,tvHost} from '../support/tv-fixture.js';
test('TV camera captures and recognizes in one action with side-by-side results',async({page,tv})=>{
 test.setTimeout(60_000);await page.setViewportSize({width:1440,height:1024});
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
   async getUserMedia(){const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const ctx=canvas.getContext('2d')!;let frame=0;const stream=canvas.captureStream(30);const track=stream.getVideoTracks()[0]!;Object.defineProperty(track,'label',{value:'Синтетическая камера'});
    function draw(){if(track.readyState!=='live')return;frame++;ctx.fillStyle='#202020';ctx.fillRect(0,0,1920,1080);ctx.fillStyle='#777';ctx.fillRect(282,207,1356,786);ctx.fillStyle='#203080';ctx.fillRect(300,225,1320,750);ctx.fillStyle='#eee';for(let y=280;y<940;y+=90)for(let x=360;x<1580;x+=90){ctx.beginPath();ctx.arc(x,y,30,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#11161D';ctx.fillRect(620,480,700,120);ctx.fillStyle='#F2F5F8';ctx.font='32px sans-serif';ctx.fillText(`Синтетический кадр ${frame}`,650,550);requestAnimationFrame(draw);}draw();return stream;},
   async enumerateDevices(){return [{kind:'videoinput',deviceId:'synthetic',label:'Синтетическая камера',groupId:''}];},
  }});
 });
 await tv.setupAndLogin(page);
 await expect(page.getByRole('button',{name:'Настройки — появится позже',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Добавить ТВ',exact:true}).click();
 await page.getByLabel('IP-адрес телевизора').fill(tvHost);
 await page.getByLabel(/MAC-адрес телевизора/).fill('02:00:00:00:00:03');
 await page.getByRole('button',{name:'Подключить',exact:true}).click();
 await tv.tv.waitForRequestCount(1);tv.promptGate.release();
 await page.getByRole('button',{name:/^Открыть телевизор /}).click();
 await expect(page.getByRole('region',{name:'Вебкамера'})).toHaveCount(1);
 await page.getByLabel('Разрешение',{exact:true}).selectOption('720');
 await page.reload();await expect(page.getByLabel('Разрешение',{exact:true})).toHaveValue('720');
 await page.locator('.camera-diagnostics > summary').click();
 await expect(page.getByRole('button',{name:'Распознать текст',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Включить камеру',exact:true}).click();
 await expect(page.getByRole('button',{name:'Распознать текст',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Сделать снимок',exact:true})).toHaveCount(0);
 let releaseRetry!:()=>void;const retryGate=new Promise<void>(resolve=>{releaseRetry=resolve;});
 let requests=0;
 await page.route('**/api/camera/ocr',async route=>{requests++;if(requests===2)await retryGate;expect(route.request().postDataBuffer()!.length).toBeGreaterThan(100);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({blocks:[{text:'Синтетический текст'},...Array.from({length:25},(_,index)=>({text:`Строка ${index}`}))],engine:'synthetic',model:'synthetic',elapsedMs:1250})});});
 await page.getByRole('button',{name:'Распознать текст',exact:true}).click();
 await expect(page.locator('.camera-ocr-result')).toBeVisible();
 await expect(page.getByAltText('Проверочный снимок',{exact:true})).toBeVisible();
 await expect(page.locator('.camera-ocr-result pre')).toContainText('Синтетический текст');expect(requests).toBe(1);
 const image=await page.getByAltText('Проверочный снимок',{exact:true}).boundingBox(),text=await page.locator('.camera-ocr-result').boundingBox();
 expect(text!.x).toBeGreaterThan(image!.x+image!.width);expect(text!.y).toBeCloseTo(image!.y,0);
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
 const beforeRetry=await page.evaluate(()=>({scrollY:window.scrollY,height:document.documentElement.scrollHeight}));
 await page.getByRole('button',{name:'Распознать текст',exact:true}).click();
 await expect.poll(()=>requests).toBe(2);
 const duringRetry=await page.evaluate(()=>({scrollY:window.scrollY,height:document.documentElement.scrollHeight}));
 releaseRetry();
 expect(duringRetry.scrollY).toBeCloseTo(beforeRetry.scrollY,0);
 expect(duringRetry.height).toBeCloseTo(beforeRetry.height,0);
 await expect(page.getByRole('button',{name:'Распознать текст',exact:true})).toBeEnabled();
 await page.setViewportSize({width:800,height:1024});
 const narrowImage=await page.getByAltText('Проверочный снимок',{exact:true}).boundingBox(),narrowText=await page.locator('.camera-ocr-result').boundingBox();
 expect(narrowText!.y).toBeGreaterThan(narrowImage!.y+narrowImage!.height);
 await page.setViewportSize({width:1440,height:1024});
 await page.screenshot({path:'.local/playwright/camera-settings.png'});
 await page.getByRole('button',{name:'Тест-кейсы',exact:true}).click();
 await page.getByRole('button',{name:'Телевизоры',exact:true}).click();
 await page.getByRole('button',{name:/^Открыть телевизор /}).click();
 await expect(page.getByRole('button',{name:'Включить камеру',exact:true})).toBeVisible();
 await expect(page.getByAltText('Проверочный снимок')).toHaveCount(0);

});
