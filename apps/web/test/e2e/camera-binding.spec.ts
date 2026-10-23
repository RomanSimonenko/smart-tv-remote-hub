import {randomUUID} from 'node:crypto';
import {expect,type Page} from '@playwright/test';
import {test,tvHost,secondHost} from '../support/tv-fixture.js';

async function add(page:Page,host:string){
 await page.getByRole('button',{name:'Добавить ТВ',exact:true}).click();
 await page.getByLabel('IP-адрес телевизора').fill(host);
 await page.getByLabel(/MAC-адрес телевизора/).fill('02:00:00:00:00:01');
 await page.getByRole('button',{name:'Подключить',exact:true}).click();
}

test('each TV and its runner restore their camera without starting or substituting it',async({page,tv},testInfo)=>{
 await page.setViewportSize({width:1440,height:1024});
 await page.addInitScript(()=>{
  const state={requests:[] as string[],stopped:[] as string[],missing:false};
  Object.assign(window,{syntheticCameras:state});
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
   async enumerateDevices(){return ['camera-a',...(!state.missing?['camera-b']:[])].map(deviceId=>({kind:'videoinput',deviceId,label:deviceId==='camera-a'?'Камера стенда А':'Камера стенда Б',groupId:''}));},
   async getUserMedia(constraints:MediaStreamConstraints){
    const video=constraints.video as MediaTrackConstraints;
    const id=(video.deviceId as ConstrainDOMStringParameters|undefined)?.exact as string|undefined??'camera-a';
    state.requests.push(id);
    if(id==='camera-b'&&state.missing)throw new DOMException('Missing synthetic camera','OverconstrainedError');
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
    const context=canvas.getContext('2d')!;const stream=canvas.captureStream(30);const track=stream.getVideoTracks()[0]!;
    const stop=track.stop.bind(track);track.stop=()=>{state.stopped.push(id);stop();};
    const settings=track.getSettings.bind(track);track.getSettings=()=>({...settings(),deviceId:id});
    function draw(){if(track.readyState!=='live')return;context.fillStyle=id==='camera-a'?'#222D39':'#1A222C';context.fillRect(0,0,1280,720);context.fillStyle='#F2F5F8';context.font='48px sans-serif';context.fillText(id==='camera-a'?'Стенд А':'Стенд Б',80,120);requestAnimationFrame(draw);}draw();
    return stream;
   },
  }});
 });
 await tv.setupAndLogin(page);await tv.enableSecondTv();
 await add(page,tvHost);await tv.tv.waitForRequestCount(1);tv.promptGate.release();
 await expect(page.locator('.device-card')).toHaveCount(1);
 await add(page,secondHost);await expect(page.locator('.device-card')).toHaveCount(2);
 const devices=await(await page.request.get(tv.origin+'/api/tvs')).json();
 const first=devices.devices[0].tvId as string,second=devices.devices[1].tvId as string;
 const open=async(index:number)=>{await page.getByRole('button',{name:/^Открыть телевизор /}).nth(index).click();await expect(page.getByRole('combobox',{name:'Камера',exact:true})).toBeVisible();};
 const back=()=>page.getByRole('button',{name:'К списку телевизоров',exact:true}).click();
 const evidence=()=>page.evaluate(()=>(window as unknown as {syntheticCameras:{requests:string[];stopped:string[]}}).syntheticCameras);
 await open(0);await page.getByRole('combobox',{name:'Камера',exact:true}).selectOption('camera-a');
 expect((await evidence()).requests).toEqual([]);
 await back();await open(1);await expect(page.getByRole('combobox',{name:'Камера',exact:true})).toHaveValue('');
 await page.getByRole('combobox',{name:'Камера',exact:true}).selectOption('camera-b');
 await page.getByRole('button',{name:'Включить камеру',exact:true}).click();
 await expect(page.getByRole('button',{name:'Выключить камеру',exact:true})).toBeVisible();
 await back();expect((await evidence()).stopped).toContain('camera-b');
 await open(0);await expect(page.getByRole('combobox',{name:'Камера',exact:true})).toHaveValue('camera-a');
 await page.reload();await expect(page.getByRole('combobox',{name:'Камера',exact:true})).toHaveValue('camera-a');
 expect((await evidence()).requests).toEqual([]);
 await page.screenshot({path:testInfo.outputPath('tv-camera-binding.png')});
 const session=await(await page.request.get(tv.origin+'/api/auth/session')).json();
 const item={id:randomUUID(),title:'Синтетическая проверка камер',description:'',group:'',steps:[{id:randomUUID(),kind:'given',text:'Стенд готов'}]};
 expect((await page.request.post(tv.origin+'/api/test-cases',{headers:{origin:tv.origin,'x-csrf-token':session.csrfToken},data:item})).status()).toBe(201);
 await page.getByRole('button',{name:'Тест-кейсы',exact:true}).click();
 await page.getByRole('button',{name:`Запустить тест-кейс: ${item.title}`,exact:true}).click();
 const television=page.getByRole('combobox',{name:'Телевизор',exact:true});
 await television.selectOption(first);await expect(page.getByRole('combobox',{name:'Камера',exact:true})).toHaveValue('camera-a');
 await page.getByRole('button',{name:'Включить камеру',exact:true}).click();
 await expect(page.getByRole('button',{name:'Выключить камеру',exact:true})).toBeVisible();
 await television.selectOption(second);await expect(page.getByRole('combobox',{name:'Камера',exact:true})).toHaveValue('camera-b');
 await expect(page.getByRole('button',{name:'Включить камеру',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Начать тест',exact:true})).toBeDisabled();
 expect((await evidence()).stopped).toContain('camera-a');
 await page.evaluate(()=>{(window as unknown as {syntheticCameras:{missing:boolean}}).syntheticCameras.missing=true;});
 await page.getByRole('button',{name:'Включить камеру',exact:true}).click();
 await expect(page.getByText('Камера для этого ТВ не найдена. Подключите её или выберите другую.',{exact:true})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'Камера',exact:true})).toHaveValue('camera-b');
 expect((await evidence()).requests).toEqual(['camera-a','camera-b']);
});
