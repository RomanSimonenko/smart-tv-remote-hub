import {createServer,type Server} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {detectScreen,detectLiveScreen} from './screen.js';
import type {Corners} from './screen.js';

/** Disposable loopback-only probe. Frames stay in memory; no runner or TV access. */
export async function startLiveProbe(port=0,options:{evidenceDirectory?:string;livePreviewWidth?:640|960}={}):Promise<{server:Server;url:string}>{
 const livePreviewWidth=options.livePreviewWidth??960;
 let origin='';let busy=false;
 let savedFailure=false;
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'");
  const send=(code:number,value:unknown)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(req.headers.host!==new URL(origin).host){send(403,{error:'HOST_REJECTED'});return;}
  if(req.method==='GET'){
   const assets:Record<string,[URL,string]>={
    '/':[new URL('../src/live.html',import.meta.url),'text/html; charset=utf-8'],
    '/synthetic':[new URL('../src/live.html',import.meta.url),'text/html; charset=utf-8'],
    '/client.mjs':[new URL('../src/live-client.mjs',import.meta.url),'text/javascript'],
    '/live-state.js':[new URL('../../../packages/contracts/dist/src/camera-gate.js',import.meta.url),'text/javascript'],
    '/tokens.css':[new URL('../../../apps/web/src/styles/tokens.css',import.meta.url),'text/css'],
   };
   const asset=assets[req.url??''];if(!asset){send(404,{error:'NOT_FOUND'});return;}
   try{let data=await readFile(asset[0]);if(req.url==='/'||req.url==='/synthetic'){
    let html=data.toString().replace('name="live-preview-width" content="640"',`name="live-preview-width" content="${livePreviewWidth}"`).replace('Live-превью 640×360.',`Live-превью ${livePreviewWidth===960?'960×540':'640×360'}.`);
    if(options.evidenceDirectory)html=html.replace('Кадры обрабатываются только на этом компьютере и не записываются.','Кадры обрабатываются только на этом компьютере. Включена приватная запись одного кадра с отказом для исследования.');
    data=Buffer.from(html);
   }res.writeHead(200,{'Content-Type':asset[1]});res.end(data);}catch{send(500,{error:'PROBE_ASSET_UNAVAILABLE'});}
   return;
  }
  if(req.method!=='POST'||!['/frame','/live-frame','/snapshot-frame'].includes(req.url??'')){send(404,{error:'NOT_FOUND'});return;}
  if(req.headers.origin!==origin || req.headers['x-live-probe']!=='1'){send(403,{error:'ORIGIN_REJECTED'});return;}
  if(req.headers['content-type']!=='image/png'){send(415,{error:'PNG_REQUIRED'});return;}
  if(busy){send(429,{error:'FRAME_PROCESSING_BUSY'});return;}
  const limit=8*1024*1024;
  if(Number(req.headers['content-length'])>limit){send(413,{error:'FRAME_TOO_LARGE'});req.resume();return;}
  busy=true;
  try{
   const parts:Buffer[]=[];let bytes=0;
   for await(const part of req){bytes+=part.length;if(bytes>limit){send(413,{error:'FRAME_TOO_LARGE'});req.resume();return;}parts.push(part);}
   const frame=Buffer.concat(parts);
   const metadata=await sharp(frame,{limitInputPixels:1920*1920}).metadata();
   if(metadata.format!=='png'||!metadata.width||!metadata.height)throw new Error('INVALID_PNG');
   const snapshot=req.url==='/snapshot-frame';
   const live=req.url==='/live-frame'||snapshot;let previous:Corners|undefined;let previousPolarity:number[]|undefined;
   if(snapshot&&!req.headers['x-screen-prior'])throw new Error('CONFIRMED_BOUNDARY_REQUIRED');
   if(live&&req.headers['x-screen-prior']){
    const points:unknown=JSON.parse(String(req.headers['x-screen-prior']));
    if(!Array.isArray(points)||points.length!==4||!points.every(p=>p&&typeof p.x==='number'&&typeof p.y==='number'&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1))throw new Error('INVALID_PRIOR_BOUNDARY');
    previous=points.map(p=>({x:p.x*metadata.width!,y:p.y*metadata.height!})) as Corners;
    if(req.headers['x-screen-polarity']){
     const values:unknown=JSON.parse(String(req.headers['x-screen-polarity']));
     if(!Array.isArray(values)||values.length!==4||!values.every(v=>v===-1||v===0||v===1))throw new Error('INVALID_PRIOR_POLARITY');
     previousPolarity=values;
    }
   }
   const started=performance.now(),result=live?await detectLiveScreen(frame,{previewWidth:livePreviewWidth,...(snapshot?{output:'source' as const}:{}),...(previous?{previous}:{}),...(previousPolarity?{previousPolarity}:{})}):await detectScreen(frame,{output:'source'});
   if(res.destroyed)return;
   const ms=Math.round(performance.now()-started);
   const diagnostics={diagnostics:result.diagnostics,candidates:result.candidates.map(c=>c.map(p=>({x:p.x/metadata.width!,y:p.y/metadata.height!}))),inputWidth:metadata.width,inputHeight:metadata.height};
   // Explicit local research capture only: at most one refused source frame per run.
   if(options.evidenceDirectory&&!savedFailure&&result.status==='not-found'){
    await mkdir(options.evidenceDirectory,{recursive:true,mode:0o700});
    await writeFile(resolve(options.evidenceDirectory,'failure.png'),frame,{flag:'wx',mode:0o600});
    await writeFile(resolve(options.evidenceDirectory,'failure.json'),JSON.stringify({reason:result.reason,...diagnostics},null,2),{flag:'wx',mode:0o600});
    savedFailure=true;
   }
   if(result.status==='found')send(200,{status:'found',corners:result.corners.map(p=>({x:p.x/metadata.width!,y:p.y/metadata.height!})),image:result.rectified.toString('base64'),processingMs:ms,...diagnostics});
   else send(200,{status:result.status,reason:result.reason,processingMs:ms,...diagnostics});
  }catch(error){if(!res.destroyed)send(422,{error:'FRAME_PROCESSING_FAILED',detail:error instanceof Error?error.message:'Unknown processing error'});}
  finally{busy=false;}
 });
 server.requestTimeout=5000;server.setTimeout(5000,socket=>socket.destroy());
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
 const address=server.address();if(!address||typeof address==='string')throw new Error('LOOPBACK_ADDRESS_UNAVAILABLE');
 origin=`http://127.0.0.1:${address.port}`;
 return {server,url:origin};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const {server,url}=await startLiveProbe();console.log(`Live experiment: ${url}`);
 const close=()=>{server.close();server.closeAllConnections();};process.once('SIGINT',close);process.once('SIGTERM',close);
}
