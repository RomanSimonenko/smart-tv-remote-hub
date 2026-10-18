import type {Corners,Point} from './screen.js';
interface Pixels{data:Uint8Array;width:number;height:number}
function sidePolarity(a:Point,b:Point,pixels:Pixels){
 const vx=b.x-a.x,vy=b.y-a.y,length=Math.hypot(vx,vy),nx=-vy/length,ny=vx/length;
 const differences:number[]=[];
 const sample=(x:number,y:number)=>pixels.data[Math.max(0,Math.min(pixels.height-1,Math.round(y)))*pixels.width+Math.max(0,Math.min(pixels.width-1,Math.round(x)))]!;
 for(let i=0;i<40;i++){const t=.1+.8*i/39,x=a.x+vx*t,y=a.y+vy*t;differences.push(sample(x-nx*2,y-ny*2)-sample(x+nx*2,y+ny*2));}
 differences.sort((a,b)=>a-b);const median=differences[20]!;return Math.abs(median)<8?0:Math.sign(median);
}
export function boundaryPolarity(c:Corners,pixels:Pixels):number[]{return c.map((a,i)=>sidePolarity(a,c[(i+1)%4]!,pixels));}
// Local line search at detection resolution. Each side must be supported by fresh
// edge pixels; no previous image or unverified old coordinates are emitted.
export function followBoundary(prior:Corners,pixels:Pixels,mode:'near'|'inside'='near',appearance?:{gray:Pixels;polarity:number[]}):Corners|null{
 const lines:Array<{p:Point;v:Point}>=[];
 const shortSide=Math.min(...prior.map((p,i)=>Math.hypot(p.x-prior[(i+1)%4]!.x,p.y-prior[(i+1)%4]!.y)));
 const offsets=mode==='inside'?Array.from({length:Math.max(0,Math.floor(shortSide*.07)-1)},(_,i)=>i+2):[0,-1,1,-2,2,-3,3,-4,4,-5,5,-6,6];
 for(let i=0;i<4;i++){
  const a=prior[i]!,b=prior[(i+1)%4]!,vx=b.x-a.x,vy=b.y-a.y,length=Math.hypot(vx,vy);
  if(length<10)return null;
  const nx=-vy/length,ny=vx/length;
  let chosen:number|null=null;
  for(const offset of offsets){let supported=0;
   for(let j=0;j<80;j++){
    const t=.06+.88*j/79,x=a.x+vx*t+nx*offset,y=a.y+vy*t+ny*offset;
    let hit=false;
    for(const delta of [-.6,0,.6]){
     const px=Math.round(x+nx*delta),py=Math.round(y+ny*delta);
     if(px>=0&&py>=0&&px<pixels.width&&py<pixels.height&&pixels.data[py*pixels.width+px])hit=true;
    }
    if(hit)supported++;
   }
   if(supported/80>=.75){
    const shiftedA={x:a.x+nx*offset,y:a.y+ny*offset},shiftedB={x:b.x+nx*offset,y:b.y+ny*offset};
    const expected=appearance?.polarity[i];
    if(expected&&sidePolarity(shiftedA,shiftedB,appearance!.gray)!==expected)continue;
    chosen=offset;break;
   }
  }
  if(chosen===null)return null;
  lines.push({p:{x:a.x+nx*chosen,y:a.y+ny*chosen},v:{x:vx,y:vy}});
 }
 const corners:Point[]=[];
 for(let i=0;i<4;i++){
  const a=lines[(i+3)%4]!,b=lines[i]!,cross=a.v.x*b.v.y-a.v.y*b.v.x;
  if(Math.abs(cross)<1)return null;
  const dx=b.p.x-a.p.x,dy=b.p.y-a.p.y,t=(dx*b.v.y-dy*b.v.x)/cross;
  const p={x:a.p.x+t*a.v.x,y:a.p.y+t*a.v.y};
  if(p.x<3||p.y<3||p.x>=pixels.width-3||p.y>=pixels.height-3)return null;
  corners.push(p);
 }
 return corners as Corners;
}
