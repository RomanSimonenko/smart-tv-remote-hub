import type {Corners,Point} from './screen.js';

// Hypothesis envelope for this experiment, not calibrated material recognition.
export const bezelParameters=Object.freeze({
 minInnerAreaFraction:.78,maxEdgeGapFraction:.07,minEdgeGapPx:2,
 minParallelCosine:.995,maxStripSpread:45,minInteriorSpread:30,
});
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const mix=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
function area(c:Corners){return Math.abs(c.reduce((sum,p,i)=>{const q=c[(i+1)%4]!;return sum+p.x*q.y-p.y*q.x;},0))/2;}
function spread(values:number[]){values.sort((a,b)=>a-b);return values[Math.floor(values.length*.9)]!-values[Math.floor(values.length*.1)]!;}
function inside(p:Point,outer:Corners){
 const crosses=outer.map((a,i)=>{const b=outer[(i+1)%4]!;return(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);});
 return crosses.every(n=>n>0)||crosses.every(n=>n<0);
}

export function removeBezelOutlines(candidates:Corners[],pixels:{data:Uint8Array;width:number;height:number}):Corners[]{
 if(candidates.length<2)return candidates;
 const p=bezelParameters;
 const sample=(v:Point)=>pixels.data[Math.max(0,Math.min(pixels.height-1,Math.round(v.y)))*pixels.width+Math.max(0,Math.min(pixels.width-1,Math.round(v.x)))]!;
 function framed(outer:Corners,inner:Corners):boolean{
  const outerArea=area(outer),innerArea=area(inner);
  if(innerArea>=outerArea||innerArea/outerArea<p.minInnerAreaFraction||!inner.every(v=>inside(v,outer)))return false;
  const shortSide=Math.min(...outer.map((v,i)=>distance(v,outer[(i+1)%4]!)));
  for(let i=0;i<4;i++){
   const a=outer[i]!,b=outer[(i+1)%4]!,c=inner[i]!,d=inner[(i+1)%4]!;
   const ux=b.x-a.x,uy=b.y-a.y,vx=d.x-c.x,vy=d.y-c.y;
   if((ux*vx+uy*vy)/(Math.hypot(ux,uy)*Math.hypot(vx,vy))<p.minParallelCosine)return false;
   for(const v of [c,d]){
    const gap=Math.abs(ux*(v.y-a.y)-uy*(v.x-a.x))/Math.hypot(ux,uy);
    if(gap<p.minEdgeGapPx||gap>shortSide*p.maxEdgeGapFraction)return false;
   }
   // Probe the material between corresponding edges, avoiding edge antialiasing.
   const strip:number[]=[];
   for(let j=1;j<=15;j++)for(const depth of [.3,.5,.7]){
    const t=.1+.8*j/16;strip.push(sample(mix(mix(a,b,t),mix(c,d,t),depth)));
   }
   if(spread(strip)>p.maxStripSpread)return false;
  }
  // A featureless nested rectangle alone is not evidence of an active display.
  const interior:number[]=[];
  for(let y=1;y<=12;y++)for(let x=1;x<=20;x++){
   const t=.08+.84*x/21,u=.08+.84*y/13;
   interior.push(sample(mix(mix(inner[0],inner[1],t),mix(inner[3],inner[2],t),u)));
  }
  return spread(interior)>=p.minInteriorSpread;
 }
 return candidates.filter(outer=>!candidates.some(inner=>inner!==outer&&framed(outer,inner)));
}
