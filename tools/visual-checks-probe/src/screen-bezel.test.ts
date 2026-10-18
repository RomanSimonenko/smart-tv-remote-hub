import {expect,test} from 'vitest';
import sharp from 'sharp';
import {detectScreen} from './screen.js';

function dots(x:number,y:number,cols:number,rows:number,step:number,radius:number){
 return Array.from({length:cols*rows},(_,i)=>`<circle cx="${x+(i%cols)*step}" cy="${y+Math.floor(i/cols)*step}" r="${radius}" fill="#eee"/>`).join('');
}
async function image(content:string){return sharp(Buffer.from(`<svg width="640" height="480"><rect width="640" height="480" fill="#202020"/>${content}</svg>`)).png().toBuffer();}
const outer='<rect x="80" y="80" width="480" height="280" fill="#777"/>';
const inner='<rect x="98" y="98" width="444" height="244" fill="#203080"/>';
const content=dots(128,128,13,6,30,11);

test('preserves a thin bezel as a distinct boundary across changing screen content',async()=>{
 for(const fill of ['#203080','#205020','#501020']){
  const result=await detectScreen(await image(outer+`<rect x="86" y="86" width="468" height="268" fill="${fill}"/>`+content));
  expect(result.status).toBe('found');if(result.status!=='found')throw new Error(result.reason);
  expect(result.candidates).toHaveLength(2);
  for(const [i,p] of [[86,86],[554,86],[554,354],[86,354]].entries())expect(Math.hypot(result.corners[i]!.x-p[0]!,result.corners[i]!.y-p[1]!)).toBeLessThan(3);
 }
});

test('does not hide ambiguity by merging thin nested featureless surfaces',async()=>{
 const result=await detectScreen(await image(outer+'<rect x="86" y="86" width="468" height="268" fill="#203080"/>'));
 expect(result.candidates).toHaveLength(2);
 expect(result.status).toBe('not-found');
});

test('selects the active display inside a narrow uniform bezel, retaining both diagnostics',async()=>{
 const result=await detectScreen(await image(outer+inner+content));
 expect(result.status).toBe('found');if(result.status!=='found')throw new Error(result.reason);
 expect(result.candidates).toHaveLength(2);
 for(const [i,p] of [[98,98],[542,98],[542,342],[98,342]].entries()){
  expect(Math.hypot(result.corners[i]!.x-p[0]!,result.corners[i]!.y-p[1]!)).toBeLessThan(4);
 }
});

test('live acquires the inner display and follows fresh edges through movement and loss',async()=>{
 const first=await detectScreen(await image(outer+inner+content),{live:true});
 expect(first.status).toBe('found');if(first.status!=='found')throw new Error(first.reason);
 expect(first.corners[0].x).toBeGreaterThan(94);
 let previous=first.corners;
 for(const dx of [2,4,6]){
  const moved=await detectScreen(await image(`<g transform="translate(${dx} 0)">${outer+inner+content}</g>`),{live:true,previous});
  expect(moved.status).toBe('found');if(moved.status!=='found')throw new Error(moved.reason);
  expect(Math.abs(moved.corners[0].x-(98+dx))).toBeLessThan(4);
  previous=moved.corners;
 }
 const lost=await detectScreen(await image(''),{live:true,previous});expect(lost.status).toBe('not-found');expect(lost).not.toHaveProperty('rectified');
 for(let i=0;i<3;i++){
  const onlyOuter=await detectScreen(await image(outer),{live:true,previous,previousPolarity:first.diagnostics.polarity!});
  expect(onlyOuter.status).toBe('not-found');expect(onlyOuter).not.toHaveProperty('rectified');
 }
 const recovered=await detectScreen(await image(outer+inner+content),{live:true,previous,previousPolarity:first.diagnostics.polarity!});expect(recovered.status).toBe('found');
});

test('live upgrades an initial outer outline when the inner display becomes verifiable',async()=>{
 const initial=await detectScreen(await image(outer),{live:true});
 expect(initial.status).toBe('found');if(initial.status!=='found')throw new Error(initial.reason);
 const refined=await detectScreen(await image(outer+inner+content),{live:true,previous:initial.corners,previousPolarity:initial.diagnostics.polarity!});
 expect(refined.status).toBe('found');if(refined.status!=='found')throw new Error(refined.reason);
 expect(refined.corners[0].x).toBeGreaterThan(94);
});

test('does not select an interface card deep inside another screen',async()=>{
 const result=await detectScreen(await image(outer+'<rect x="190" y="135" width="250" height="150" fill="#eee"/>'));
 expect(result.status).toBe('not-found');
 if(result.status==='not-found')expect(result.reason).toBe('ambiguous-candidates');
});

test('does not merge close nested rectangles when the intervening strip is textured',async()=>{
 const strip=dots(112,89,19,1,24,5)+dots(112,351,19,1,24,5)+dots(89,112,1,10,24,5)+dots(551,112,1,10,24,5);
 const result=await detectScreen(await image(outer+inner+content+strip));
 expect(result.status).toBe('not-found');
 if(result.status==='not-found')expect(result.reason).toBe('ambiguous-candidates');
});

test('uniform nested surfaces remain inconclusive instead of assuming the inner one is a display',async()=>{
 const result=await detectScreen(await image(outer+inner));
 expect(result.status).toBe('not-found');
});

test('keeps two separate framed displays ambiguous',async()=>{
 const display=(x:number,y:number)=>`<rect x="${x}" y="${y}" width="280" height="180" fill="#777"/><rect x="${x+12}" y="${y+12}" width="256" height="156" fill="#203080"/>${dots(x+35,y+35,7,4,30,10)}`;
 const result=await detectScreen(await image(display(20,70)+display(340,240)));
 expect(result.status).toBe('not-found');if(result.status==='not-found')expect(result.reason).toBe('ambiguous-candidates');
});

test('selects the display inside a slanted bezel without forcing axis-aligned bounds',async()=>{
 const result=await detectScreen(await image('<polygon points="80,70 560,90 540,370 100,350" fill="#777"/><polygon points="96,86 543,105 524,353 114,335" fill="#203080"/>'+dots(145,140,12,5,30,11)));
 expect(result.status).toBe('found');if(result.status!=='found')throw new Error(result.reason);
 for(const [i,p] of [[96,86],[543,105],[524,353],[114,335]].entries())expect(Math.hypot(result.corners[i]!.x-p[0]!,result.corners[i]!.y-p[1]!)).toBeLessThan(4);
});
