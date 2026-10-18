import {LiveScreenGate} from './live-state.js';
const video=document.querySelector('video'),result=document.querySelector('#result'),placeholder=document.querySelector('#placeholder');
const start=document.querySelector('#start'),stop=document.querySelector('#stop'),camera=document.querySelector('#camera'),status=document.querySelector('#status'),metrics=document.querySelector('#metrics');
const diagnostic=document.querySelector('#diagnostic'),candidateCount=document.querySelector('#candidate-count');
const capture=document.querySelector('#capture'),snapshotImage=document.querySelector('#snapshot-image'),snapshotStatus=document.querySelector('#snapshot-status'),snapshotDownload=document.querySelector('#snapshot-download');
let snapshotRequested=false,snapshotInFlight=false;
const synthetic=location.pathname==='/synthetic';
const inputSide=document.querySelector('meta[name="live-preview-width"]').content==='960'?1280:960;
if(synthetic){document.querySelector('h1').textContent='Синтетическое Full HD видео · live-проба';start.textContent='Запустить синтетическое видео';camera.disabled=true;}
let stream=null,generation=0,controller=null,timer=null,syntheticTimer=null,frameCallback=null,gate=new LiveScreenGate(),previousBoundary=null,previousPolarity=null;
let processed=0,displayed=0,refused=0,unstable=0,nestedSelections=0,started=0,lastLatency=0,lastProcessing=0,outputSize='';
function hide(message){result.hidden=true;result.removeAttribute('src');placeholder.hidden=false;placeholder.textContent=message;}
function release(){snapshotRequested=false;snapshotInFlight=false;capture.disabled=true;generation++;controller?.abort();controller=null;clearInterval(timer);timer=null;clearInterval(syntheticTimer);syntheticTimer=null;if(frameCallback!==null)video.cancelVideoFrameCallback(frameCallback);frameCallback=null;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;gate=new LiveScreenGate();start.disabled=false;stop.disabled=true;camera.disabled=synthetic;diagnostic.hidden=true;candidateCount.textContent='Кандидаты ещё не определены.';hide('Камера выключена');}
function summary(){const elapsed=(performance.now()-started)/1000;metrics.textContent=`Обработано: ${processed} · показано: ${displayed} · отказов: ${refused} · подтверждение: ${unstable} · выбор из вложенных контуров: ${nestedSelections} · обновления: ${(displayed/Math.max(elapsed,.001)).toFixed(1)}/с · обработка: ${lastProcessing} мс · задержка кадра: ${Math.round(lastLatency)} мс${outputSize}`;}
async function processFrame(gen){
 if(gen!==generation||!stream)return;
 if(snapshotRequested&&!gate.visible(performance.now()))snapshotStatus.textContent='Экран не найден';
 const snapshot=snapshotRequested&&gate.visible(performance.now());snapshotRequested=false;snapshotInFlight=snapshot;
 const captured=performance.now();const canvas=document.createElement('canvas');const scale=Math.min(1,(snapshot?1920:inputSide)/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
 try{
  if(!canvas.width||!canvas.height)throw new Error('Камера не выдаёт изображение');
  canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Не удалось закодировать кадр')),'image/png'));
  if(gen!==generation)return;
  controller=new AbortController();
  const response=await fetch(snapshot?'/snapshot-frame':'/live-frame',{method:'POST',headers:{'Content-Type':'image/png','X-Live-Probe':'1',...(previousBoundary?{'X-Screen-Prior':JSON.stringify(previousBoundary),'X-Screen-Polarity':JSON.stringify(previousPolarity)}:{})},body:blob,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(snapshot?5000:2000)])});
  const observation=await response.json();if(gen!==generation)return;
  if(!response.ok)throw new Error(`${observation.error}${observation.detail?': '+observation.detail:''}`);
  if(snapshot){
   snapshotInFlight=false;
   if(observation.status==='found'){snapshotImage.src='data:image/png;base64,'+observation.image;await snapshotImage.decode();if(gen!==generation)return;snapshotImage.hidden=false;snapshotDownload.href=snapshotImage.src;snapshotDownload.hidden=false;snapshotStatus.textContent=`Снимок: вход ${canvas.width}×${canvas.height} → экран ${snapshotImage.naturalWidth}×${snapshotImage.naturalHeight}. Без увеличения исходной детализации.`;}
   else{snapshotStatus.textContent='Экран не найден';gate.observe(null,performance.now());hide('Экран не найден');}
   if(gen===generation)frameCallback=video.requestVideoFrameCallback(()=>{frameCallback=null;void processFrame(gen);});return;
  }
  processed++;lastLatency=performance.now()-captured;lastProcessing=observation.processingMs;
  if(observation.status==='found'&&observation.candidates.length>1)nestedSelections++;
  diagnostic.width=canvas.width;diagnostic.height=canvas.height;const dc=diagnostic.getContext('2d');dc.drawImage(canvas,0,0);const palette=getComputedStyle(diagnostic);dc.lineWidth=Math.max(3,canvas.width/320);dc.font=`bold ${Math.max(20,canvas.width/48)}px system-ui`;
  const drawContour=(c,color,label)=>{dc.strokeStyle=color;dc.fillStyle=color;dc.beginPath();c.forEach((p,j)=>j?dc.lineTo(p.x*canvas.width,p.y*canvas.height):dc.moveTo(p.x*canvas.width,p.y*canvas.height));dc.closePath();dc.stroke();if(label)dc.fillText(label,c[0].x*canvas.width+10,c[0].y*canvas.height+40);};
  for(const [i,c] of observation.candidates.entries())drawContour(c,palette.getPropertyValue('--ui-warning').trim(),String(i+1));
  if(observation.status==='found')drawContour(observation.corners,palette.getPropertyValue('--ui-accent').trim(),null);
  diagnostic.hidden=false;candidateCount.textContent=`Кандидатов: ${observation.candidates.length}. Жёлтым — все контуры; зелёным — выбранная граница изображения.`;
  const d=observation.diagnostics;
  if(d)document.querySelector('#search-diagnostics').textContent=`Контуров ${d.contours}; отсеяно: форма ${d.rejected.shape}, площадь ${d.rejected.area}, край кадра ${d.rejected.border}, пропорции ${d.rejected.aspect}, дубли ${d.rejected.duplicate}.\nКрупные отклонённые:\n${JSON.stringify(d.largeRejected,null,2)}`;
  if(document.querySelector('#freeze-ambiguity').checked&&observation.status==='not-found'&&observation.reason==='ambiguous-candidates'){const count=observation.candidates.length;release();diagnostic.hidden=false;candidateCount.textContent=`Пауза: кандидатов ${count}. Это зафиксированный кадр, не live-видео.`;status.textContent='Камера остановлена на неоднозначном кадре';summary();return;}
  const fresh=lastLatency<=1000;
  // Keep the search identity through refusals, never a displayed image. The server
  // must verify all four sides on each fresh frame or acquire a new framed pair.
  if(fresh&&observation.status==='found'){previousBoundary=observation.corners;previousPolarity=observation.diagnostics.polarity;}
  const confirmed=gate.observe(fresh&&observation.status==='found'?observation.corners:null,captured);
  if(confirmed&&gate.visible(performance.now())){
   result.src='data:image/png;base64,'+observation.image;await result.decode();if(gen!==generation)return;
   if(gate.visible(performance.now())){result.hidden=false;placeholder.hidden=true;status.textContent=observation.diagnostics.tracking==='tracked'?'Экран подтверждён · сопровождение границы':'Экран подтверждён · новая граница';displayed++;outputSize=` · вход: ${observation.inputWidth}×${observation.inputHeight} → выход: ${result.naturalWidth}×${result.naturalHeight}`;}
   else hide('Экран не найден: кадр устарел');
  }else{hide('Экран не найден');if(observation.status==='found'&&fresh){unstable++;status.textContent='Подтверждаем границы экрана…';}else{refused++;status.textContent=fresh?(observation.reason==='ambiguous-candidates'?'Экран не найден: несколько похожих областей':observation.reason==='display-boundary-unverified'?'Экран не найден: граница изображения не отделена от рамки':'Экран не найден: границы экрана не определены'):'Экран не найден: кадр устарел';}}
  summary();
 }catch(error){if(gen!==generation)return;if(snapshot)snapshotStatus.textContent='Не удалось снять кадр: '+error.message;release();status.textContent='Обработка остановлена: '+error.message;return;}
 if(gen===generation)frameCallback=video.requestVideoFrameCallback(()=>{frameCallback=null;void processFrame(gen);});
}
start.onclick=async()=>{
 previousBoundary=null;
 release();const gen=generation;start.disabled=true;camera.disabled=true;stop.disabled=false;status.textContent='Подключаем камеру…';
 try{
  if(!video.requestVideoFrameCallback)throw new Error('Браузер не поддерживает захват свежих видеокадров');
  let next;
  if(synthetic){const scene=document.createElement('canvas');scene.width=1920;scene.height=1080;const ctx=scene.getContext('2d');let tick=0;const draw=()=>{ctx.fillStyle='#202020';ctx.fillRect(0,0,1920,1080);ctx.fillStyle='#777';ctx.fillRect(282,207,1356,786);ctx.fillStyle='#203080';ctx.fillRect(300,225,1320,750);ctx.fillStyle='#eee';for(let y=280;y<940;y+=90)for(let x=360;x<1580;x+=90){ctx.beginPath();ctx.arc(x,y,30,0,Math.PI*2);ctx.fill();}ctx.fillStyle='red';ctx.fillRect(420+(tick++%30),330,80,80);};draw();syntheticTimer=setInterval(draw,100);next=scene.captureStream(10);}
  else next=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:1920},height:{ideal:1080},...(camera.value?{deviceId:{exact:camera.value}}:{})}});
  if(gen!==generation||document.hidden){next.getTracks().forEach(t=>t.stop());if(gen===generation)release();return;}
  stream=next;video.srcObject=stream;await video.play();if(gen!==generation)return;
  stream.getVideoTracks()[0].addEventListener('ended',()=>{if(gen===generation){release();status.textContent='Поток камеры завершён';}},{once:true});
  const selected=camera.value;const devices=synthetic?[]:await navigator.mediaDevices.enumerateDevices();if(gen!==generation)return;
  camera.replaceChildren(new Option('По умолчанию',''),...devices.filter(d=>d.kind==='videoinput').map((d,i)=>new Option(d.label||'Камера '+(i+1),d.deviceId)));camera.value=selected;
  processed=displayed=refused=unstable=nestedSelections=0;outputSize='';started=performance.now();
  timer=setInterval(()=>{capture.disabled=!gate.visible(performance.now())||snapshotRequested||snapshotInFlight;if(!gate.visible(performance.now()))hide('Экран не найден');summary();},100);
  frameCallback=video.requestVideoFrameCallback(()=>{frameCallback=null;void processFrame(gen);});
 }catch(error){if(gen!==generation)return;release();status.textContent='Камера недоступна: '+error.name+' — '+error.message;}
};
capture.onclick=()=>{snapshotImage.hidden=true;snapshotImage.removeAttribute('src');snapshotDownload.hidden=true;snapshotDownload.removeAttribute('href');if(!gate.visible(performance.now())){snapshotStatus.textContent='Экран не найден';return;}snapshotRequested=true;capture.disabled=true;snapshotStatus.textContent='Снимаем свежий кадр…';};
stop.onclick=()=>{release();status.textContent='Камера выключена';};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(stream||start.disabled)){release();status.textContent='Камера остановлена: вкладка скрыта';}});
addEventListener('pagehide',release);
