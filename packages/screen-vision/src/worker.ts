import {parentPort} from 'node:worker_threads';
import sharp from 'sharp';
import {detectLiveScreen,type Corners} from './screen.js';
parentPort!.on('message',async({image,prior,snapshot=false}:{image:Uint8Array;snapshot?:boolean;prior?:{corners:Corners;polarity:number[]}})=>{
 const side=snapshot?1920:1280;
 const bytes=Buffer.from(image);let meta:Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
 try{
  meta=await sharp(bytes,{limitInputPixels:side*side}).metadata();
  if(meta.format!=='png'||!meta.width||!meta.height||meta.width>side||meta.height>side)throw new Error('Invalid frame');
 }catch{parentPort!.postMessage({error:'INVALID_CAMERA_FRAME'});return;}
 try{
  const result=await detectLiveScreen(bytes,{previewWidth:960,...(snapshot?{output:'source' as const}:{}),...(prior?{previous:prior.corners.map(p=>({x:p.x*meta.width!,y:p.y*meta.height!})) as Corners,previousPolarity:prior.polarity}:{})});
  parentPort!.postMessage(result.status==='found'?{status:'found',image:(snapshot?await sharp(result.rectified).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toBuffer():result.rectified).toString('base64'),prior:{corners:result.corners.map(p=>({x:p.x/meta.width!,y:p.y/meta.height!})),polarity:result.diagnostics.polarity}}:{status:'not-found'});
 }catch{parentPort!.postMessage({error:'CAMERA_PROCESSING_FAILED'});}
});
