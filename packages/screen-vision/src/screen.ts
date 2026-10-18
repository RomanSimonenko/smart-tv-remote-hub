import sharp from 'sharp';
import {createRequire} from 'node:module';
import type cvTypes from '@techstark/opencv-js';
import {removeBezelOutlines,bezelParameters} from './screen-bezel.js';
import {followBoundary,boundaryPolarity} from './screen-lines.js';

const cvModule = createRequire(import.meta.url)('@techstark/opencv-js') as Promise<typeof cvTypes>;
export interface Point {x:number; y:number}
export type Corners = [Point,Point,Point,Point];
type Rejection='shape'|'area'|'border'|'aspect'|'duplicate';
export interface ScreenDiagnostics {
 tracking?:'acquired'|'tracked';polarity?:number[];
 detectionWidth:number;detectionHeight:number;
 contours:number;accepted:number;rejected:Record<Rejection,number>;
 largeRejected:Array<{reason:Rejection;vertices:number;areaFraction:number;bounds:{x:number;y:number;width:number;height:number}}>;
}
export type ScreenResult = {diagnostics:ScreenDiagnostics} & (
  | {status:'found'; corners:Corners; candidates:Corners[]; rectified:Buffer}
  | {status:'not-found'; message:'Экран не найден'; reason:'no-qualified-candidate'|'ambiguous-candidates'|'display-boundary-unverified'; candidates:Corners[]});

// Experimental envelope, not calibrated confidence or a production quality gate.
export const screenAlgorithm='canny-convex-quadrilateral-bezel-v3';
export const screenParameters = Object.freeze({
  maxInputPixels:16_000_000, maxDetectionSide:960,
  cannyLow:60, cannyHigh:140, polygonEpsilon:0.02,
  minAreaFraction:0.08, maxAreaFraction:0.85,
  minAspect:1.3, maxAspect:2.3, minOppositeEdgeRatio:0.5,
  borderMargin:3, duplicateCornerDistancePx:3,
  outputWidth:640, outputHeight:360,
  liveOutputInset:0.003,
  bezel:bezelParameters,
});

const distance = (a:Point,b:Point) => Math.hypot(a.x-b.x,a.y-b.y);
function orderCorners(points:Point[]):Corners {
  const center = {x:points.reduce((n,p)=>n+p.x,0)/4,y:points.reduce((n,p)=>n+p.y,0)/4};
  points.sort((a,b)=>Math.atan2(a.y-center.y,a.x-center.x)-Math.atan2(b.y-center.y,b.x-center.x));
  // Start at top-left, preserving the contour's cyclic order.
  const start = points.reduce((best,p,i)=>p.x+p.y<points[best]!.x+points[best]!.y?i:best,0);
  return [...points.slice(start),...points.slice(0,start)] as Corners;
}

/** Geometry-only hypothesis. Never use a found result as proof of TV identity. */
export async function detectScreen(image:Buffer,options:{output?:'preview'|'source';previewWidth?:640|960;requireBezelEvidence?:boolean;detectionSide?:640|800|960;live?:boolean;previous?:Corners;previousPolarity?:number[]}={}):Promise<ScreenResult> {
  const p=screenParameters;
  const decoded = await sharp(image,{limitInputPixels:p.maxInputPixels}).rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
  const {width,height}=decoded.info;
  const small = await sharp(decoded.data,{raw:{width,height,channels:3}})
    .resize({width:options.detectionSide??p.maxDetectionSide,height:options.detectionSide??p.maxDetectionSide,fit:'inside',withoutEnlargement:true})
    .greyscale().raw().toBuffer({resolveWithObject:true});
  const cv=await cvModule;
  const resources:Array<{delete():void}>=[];
  const own=<T extends {delete():void}>(value:T):T=>{resources.push(value);return value;};
  try {
    const gray=own(cv.matFromArray(small.info.height,small.info.width,cv.CV_8UC1,small.data));
    const edges=own(new cv.Mat()), contours=own(new cv.MatVector()), hierarchy=own(new cv.Mat());
    cv.Canny(gray,edges,p.cannyLow,p.cannyHigh);
    cv.findContours(edges,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    const diagnostics:ScreenDiagnostics={detectionWidth:gray.cols,detectionHeight:gray.rows,contours:contours.size(),accepted:0,rejected:{shape:0,area:0,border:0,aspect:0,duplicate:0},largeRejected:[]};
    const candidates:Corners[]=[];
    for(let i=0;i<contours.size();i++) {
      const contour=contours.get(i), poly=new cv.Mat();
      try {
        cv.approxPolyDP(contour,poly,cv.arcLength(contour,true)*p.polygonEpsilon,true);
        if(options.live&&(poly.rows!==4||!cv.isContourConvex(poly))){
          const hull=new cv.Mat();
          try{cv.convexHull(contour,hull);cv.approxPolyDP(hull,poly,cv.arcLength(hull,true)*p.polygonEpsilon,true);}finally{hull.delete();}
        }
        const area=Math.abs(cv.contourArea(poly))/(gray.cols*gray.rows);
        const reject=(reason:Rejection)=>{
          diagnostics.rejected[reason]++;
          const bounds=cv.boundingRect(contour);
          if(bounds.width*bounds.height/(gray.cols*gray.rows)>=p.minAreaFraction && diagnostics.largeRejected.length<12)
            diagnostics.largeRejected.push({reason,vertices:poly.rows,areaFraction:area,bounds:{x:bounds.x/gray.cols,y:bounds.y/gray.rows,width:bounds.width/gray.cols,height:bounds.height/gray.rows}});
        };
        if(poly.rows!==4 || !cv.isContourConvex(poly)){reject('shape');continue;}
        if(area<p.minAreaFraction || area>p.maxAreaFraction){reject('area');continue;}
        const corners=orderCorners(Array.from({length:4},(_,j)=>({x:poly.data32S[j*2]!,y:poly.data32S[j*2+1]!})));
        if(options.live&&!followBoundary(corners,{data:edges.data,width:gray.cols,height:gray.rows})){reject('shape');continue;}
        if(corners.some(c=>c.x<p.borderMargin || c.y<p.borderMargin || c.x>=gray.cols-p.borderMargin || c.y>=gray.rows-p.borderMargin)){reject('border');continue;}
        const [tl,tr,br,bl]=corners;
        const top=distance(tl,tr), bottom=distance(bl,br), left=distance(tl,bl), right=distance(tr,br);
        const aspect=(top+bottom)/(left+right);
        if(aspect<p.minAspect || aspect>p.maxAspect || Math.min(top,bottom)/Math.max(top,bottom)<p.minOppositeEdgeRatio || Math.min(left,right)/Math.max(left,right)<p.minOppositeEdgeRatio){reject('aspect');continue;}
        // Canny produces two contours for the same edge; merge only near-identical corners.
        // Duplicate Canny edges differ by raster pixels, not by a fraction of the frame.
        // A frame-relative tolerance also erased the separate edge of thin TV bezels.
        if(candidates.some(other=>corners.every((c,j)=>distance(c,other[j]!)<p.duplicateCornerDistancePx))){reject('duplicate');continue;}
        candidates.push(corners);
        diagnostics.accepted++;
      } finally {poly.delete();contour.delete();}
    }
    const fullSize=(c:Corners)=>c.map(v=>({x:v.x*width/gray.cols,y:v.y*height/gray.rows})) as Corners;
    const pixels={data:gray.data,width:gray.cols,height:gray.rows};
    if(options.live)for(const c of [...candidates]){
      const inner=followBoundary(c,{data:edges.data,width:gray.cols,height:gray.rows},'inside');
      if(inner&&removeBezelOutlines([c,inner],pixels).length===1&&!candidates.some(other=>inner.every((v,i)=>distance(v,other[i]!)<p.duplicateCornerDistancePx)))candidates.push(inner);
    }
    const fullCandidates=candidates.map(fullSize);
    const prior=options.previous?.map(v=>({x:v.x*gray.cols/width,y:v.y*gray.rows/height})) as Corners|undefined;
    const tracked=options.live&&prior?followBoundary(prior,{data:edges.data,width:gray.cols,height:gray.rows},'near',options.previousPolarity?{gray:pixels,polarity:options.previousPolarity}:undefined):null;
    const reduced=removeBezelOutlines(candidates,pixels);
    const refinedTracked=tracked&&reduced.length===1&&removeBezelOutlines([tracked,reduced[0]!],pixels)[0]===reduced[0]?reduced[0]!:tracked;
    // Once a display has been identified, losing it must not promote a lone
    // enclosing bezel. Reacquire elsewhere only with fresh paired evidence.
    const displays=options.live&&prior?(refinedTracked?[refinedTracked]:candidates.length>reduced.length?reduced:[]):reduced;
    if(displays.length!==1) return {status:'not-found',message:'Экран не найден',reason:displays.length?'ambiguous-candidates':'no-qualified-candidate',candidates:fullCandidates,diagnostics};
    // Live framed-TV experiment: a lone quadrilateral cannot establish which side of
    // the bezel it represents. Require the existing material/geometry check to remove
    // its enclosing outline before emitting a crop. Static geometry probes stay opt-in.
    if(options.requireBezelEvidence && displays.length===candidates.length) return {status:'not-found',message:'Экран не найден',reason:'display-boundary-unverified',candidates:fullCandidates,diagnostics};
    const corners=fullSize(displays[0]!);
    if(options.live){diagnostics.tracking=tracked?'tracked':'acquired';diagnostics.polarity=boundaryPolarity(displays[0]!,pixels);}
    const [tl,tr,br,bl]=corners;
    // Bound both axes by measured source edges; do not manufacture detail by upscaling.
    const nativeWidth=Math.max(16,Math.floor(Math.min(Math.max(distance(tl,tr),distance(bl,br)),Math.max(distance(tl,bl),distance(tr,br))*16/9)));
    const outputWidth=options.output==='source'?nativeWidth:options.previewWidth??p.outputWidth;
    const outputHeight=Math.max(9,Math.floor(outputWidth*9/16));
    const source=own(cv.matFromArray(height,width,cv.CV_8UC3,decoded.data));
    const from=own(cv.matFromArray(4,1,cv.CV_32FC2,corners.flatMap(c=>[c.x,c.y])));
    // Map the measured boundary just outside the viewport, trimming in rectified
    // screen coordinates without feeding the inset back into tracking or adding
    // a second resize/interpolation pass. Static output keeps its original view.
    const inset=options.live?p.liveOutputInset:0;
    const dx=(outputWidth-1)*inset/(1-2*inset),dy=(outputHeight-1)*inset/(1-2*inset);
    const right=outputWidth-1+dx,bottom=outputHeight-1+dy;
    const to=own(cv.matFromArray(4,1,cv.CV_32FC2,[-dx,-dy,right,-dy,right,bottom,-dx,bottom]));
    const transform=own(cv.getPerspectiveTransform(from,to)), target=own(new cv.Mat());
    cv.warpPerspective(source,target,transform,new cv.Size(outputWidth,outputHeight),cv.INTER_LINEAR,cv.BORDER_CONSTANT);
    const rectified=await sharp(Buffer.from(target.data),{raw:{width:outputWidth,height:outputHeight,channels:3}}).png().toBuffer();
    return {status:'found',corners,candidates:fullCandidates,rectified,diagnostics};
  } finally {for(const resource of resources.reverse()) resource.delete();}
}

/** Live acquisition retries missing geometry at finer scales, never ambiguity. */
export async function detectLiveScreen(image:Buffer,options:{previous?:Corners;previousPolarity?:number[];previewWidth?:640|960;output?:'preview'|'source'}={}):Promise<ScreenResult>{
 let result:ScreenResult|undefined;
 for(const detectionSide of [640,800,960] as const){
  result=await detectScreen(image,{...options,live:true,detectionSide});
  if(result.status==='found'||result.reason!=='no-qualified-candidate')return result;
 }
 return result!;
}
