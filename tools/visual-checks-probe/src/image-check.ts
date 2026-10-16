import sharp from 'sharp';
import type cvTypes from '@techstark/opencv-js';
import {createRequire} from 'node:module';
const cvModule=createRequire(import.meta.url)('@techstark/opencv-js') as Promise<typeof cvTypes>;
import {pixelRegion,type Region,type Box} from './region.js';
export interface ImageObservation{score:number;box:Box}
export async function compareImage(imagePath:string,referencePath:string,region:Region):Promise<ImageObservation>{
 const metadata=await sharp(imagePath).metadata();
 if(!metadata.width||!metadata.height)throw new Error('Invalid image dimensions');
 const crop=pixelRegion(region,metadata.width,metadata.height);
 const [image,reference]=await Promise.all([
  sharp(imagePath).extract({left:crop.x,top:crop.y,width:crop.width,height:crop.height}).greyscale().raw().toBuffer({resolveWithObject:true}),
  sharp(referencePath).greyscale().raw().toBuffer({resolveWithObject:true})
 ]);
 if(reference.info.width>crop.width||reference.info.height>crop.height)throw new Error('Reference exceeds region');
 const first=reference.data[0];if(reference.data.every(value=>value===first))throw new Error('Uniform reference has undefined correlation');
 const cv=await cvModule;
 const source=cv.matFromArray(image.info.height,image.info.width,cv.CV_8UC1,image.data);
 let target:InstanceType<typeof cv.Mat>|undefined,result:InstanceType<typeof cv.Mat>|undefined,mask:InstanceType<typeof cv.Mat>|undefined;
 try{
  target=cv.matFromArray(reference.info.height,reference.info.width,cv.CV_8UC1,reference.data);result=new cv.Mat();
  cv.matchTemplate(source,target,result,cv.TM_CCOEFF_NORMED);
  mask=new cv.Mat();const match=cv.minMaxLoc(result,mask);
  if(!Number.isFinite(match.maxVal))throw new Error('Invalid correlation score');
  return{score:match.maxVal,box:{x:crop.x+match.maxLoc.x,y:crop.y+match.maxLoc.y,width:reference.info.width,height:reference.info.height}};
 }finally{mask?.delete();result?.delete();target?.delete();source.delete();}
}
