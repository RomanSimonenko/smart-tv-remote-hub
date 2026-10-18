import {test,expect} from 'vitest';
import {followBoundary,boundaryPolarity} from './screen-lines.js';
import type {Corners} from './screen.js';
const corners:Corners=[{x:30,y:20},{x:170,y:20},{x:170,y:110},{x:30,y:110}];
function edges(dx=0){const data=new Uint8Array(200*140);for(let x=30;x<=170;x++){if(x%17<14){data[20*200+x+dx]=255;data[110*200+x+dx]=255;}}for(let y=20;y<=110;y++){if(y%17<14){data[y*200+30+dx]=255;data[y*200+170+dx]=255;}}return{data,width:200,height:140};}
test('reconstructs independently supported sides despite contour gaps',()=>{
 const found=followBoundary(corners,edges());expect(found).not.toBeNull();
 found!.forEach((p,i)=>expect(Math.hypot(p.x-corners[i]!.x,p.y-corners[i]!.y)).toBeLessThan(2));
});
test('follows movement using current pixels rather than retaining old corners',()=>{
 const found=followBoundary(corners,edges(3));expect(found).not.toBeNull();
 expect(found![0].x).toBeGreaterThan(31);
});
test('refuses missing or clipped sides and does not return a stale boundary',()=>{
 expect(followBoundary(corners,{data:new Uint8Array(200*140),width:200,height:140})).toBeNull();
 const e=edges();for(let x=0;x<200;x++)e.data.fill(0,110*200+x,110*200+x+1);
 expect(followBoundary(corners,e)).toBeNull();
});

test('does not jump from the inner edge onto a nearby opposite bezel edge',()=>{
 const gray={data:new Uint8Array(200*140),width:200,height:140};
 for(let y=16;y<=114;y++)for(let x=26;x<=174;x++)gray.data[y*200+x]=220;
 for(let y=20;y<=110;y++)for(let x=30;x<=170;x++)gray.data[y*200+x]=20;
 const onlyOuter={data:new Uint8Array(200*140),width:200,height:140};
 for(let x=26;x<=174;x++){onlyOuter.data[16*200+x]=255;onlyOuter.data[114*200+x]=255;}
 for(let y=16;y<=114;y++){onlyOuter.data[y*200+26]=255;onlyOuter.data[y*200+174]=255;}
 const polarity=boundaryPolarity(corners,gray);expect(polarity).toEqual([1,1,1,1]);
 expect(followBoundary(corners,onlyOuter)).not.toBeNull();
 expect(followBoundary(corners,onlyOuter,'near',{gray,polarity})).toBeNull();
});
