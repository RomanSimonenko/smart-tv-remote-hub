import {expect, test} from 'vitest';
import sharp from 'sharp';
import {detectScreen,detectLiveScreen} from './screen.js';

async function frame(content: string, background = '#202020') {
  return sharp(Buffer.from(`<svg width="640" height="480"><rect width="640" height="480" fill="${background}"/>${content}</svg>`)).png().toBuffer();
}

test('live finds a fully visible screen filling nearly the entire camera frame',async()=>{
 const source=await sharp(Buffer.from('<svg width="640" height="360"><rect width="640" height="360" fill="#202020"/><rect x="16" y="10" width="608" height="340" fill="white"/></svg>')).png().toBuffer();
 const result=await detectLiveScreen(source);
 expect(result.status).toBe('found');
 if(result.status!=='found')throw new Error(result.reason);
 for(const [i,expected] of [[16,10],[624,10],[624,350],[16,350]].entries()){
  expect(Math.hypot(result.corners[i]!.x-expected[0]!,result.corners[i]!.y-expected[1]!)).toBeLessThan(4);
 }
 // Static experiments retain their original acceptance envelope.
 expect((await detectScreen(source)).status).toBe('not-found');
});

test.each([-10,1])('live refuses a large screen clipped or touching the camera border at x=%i',async x=>{
 const source=await sharp(Buffer.from(`<svg width="640" height="360"><rect width="640" height="360" fill="#202020"/><rect x="${x}" y="10" width="623" height="340" fill="white"/></svg>`)).png().toBuffer();
 expect((await detectLiveScreen(source)).status).toBe('not-found');
});

test('live multi-scale search keeps competing displays ambiguous',async()=>{
 const r=await detectLiveScreen(await frame('<rect x="20" y="100" width="280" height="160" fill="white"/><rect x="340" y="220" width="280" height="160" fill="white"/>'));
 expect(r.status).toBe('not-found');if(r.status==='not-found')expect(r.reason).toBe('ambiguous-candidates');
 expect(r.diagnostics.detectionWidth).toBe(640);
});

test('higher live preview resolution preserves selected boundary and baseline output',async()=>{
 const source=await frame('<rect x="100" y="100" width="440" height="250" fill="white"/>');
 const baseline=await detectLiveScreen(source),higher=await detectLiveScreen(source,{previewWidth:960});
 expect(baseline.status).toBe('found');expect(higher.status).toBe('found');
 if(baseline.status!=='found'||higher.status!=='found')throw new Error('Missing boundary');
 expect(higher.corners).toEqual(baseline.corners);
 expect((await sharp(baseline.rectified).metadata()).width).toBe(640);
 const size=await sharp(higher.rectified).metadata();expect([size.width,size.height]).toEqual([960,540]);
});

test('live trims only the rendered edge while keeping tracking coordinates unchanged',async()=>{
 const source=await frame('<rect x="100" y="100" width="440" height="250" fill="white"/>');
 const staticResult=await detectScreen(source,{previewWidth:960});
 const live=await detectLiveScreen(source,{previewWidth:960});
 if(staticResult.status!=='found'||live.status!=='found')throw new Error('Missing boundary');
 expect(live.corners).toEqual(staticResult.corners);
 const rendered=await sharp(live.rectified).raw().toBuffer({resolveWithObject:true});
 expect([rendered.info.width,rendered.info.height]).toEqual([960,540]);
 // The detected raster edge straddles the dark surroundings. A 0.3% inward
 // viewport trim must sample the white screen rather than that boundary pixel.
 expect(rendered.data[(270*960)*3]).toBeGreaterThan(240);
});

test('diagnostics account for every contour and identify a large non-quadrilateral',async()=>{
 const result=await detectScreen(await frame('<polygon points="100,100 540,100 540,350 320,270 100,350" fill="white"/>'));
 expect(result.status).toBe('not-found');
 const d=result.diagnostics;
 expect(Object.values(d.rejected).reduce((a,b)=>a+b,0)+d.accepted).toBe(d.contours);
 expect(d.largeRejected.some(c=>c.reason==='shape'&&c.vertices!==4)).toBe(true);
 const empty=await detectScreen(await frame(''));
 expect(empty.diagnostics.contours).toBe(0);
});

test('finds screen corners and crops out the surrounding room', async () => {
  const result = await detectScreen(await frame('<rect x="100" y="100" width="440" height="250" fill="#dddddd"/>'));
  expect(result.status).toBe('found');
  if (result.status !== 'found') throw new Error(result.reason);
  for (const [i, expected] of [[100,100],[540,100],[540,350],[100,350]].entries()) {
    expect(Math.hypot(result.corners[i]!.x-expected[0]!,result.corners[i]!.y-expected[1]!)).toBeLessThan(4);
  }
  const {info, data} = await sharp(result.rectified).raw().toBuffer({resolveWithObject:true});
  expect(info.width).toBe(640); expect(info.height).toBe(360);
  expect(data[(180*640+320)*3]).toBeGreaterThan(210);
});

test('corrects perspective without mirroring or rotating the screen', async () => {
  const image = await frame('<polygon points="100,80 540,120 500,370 140,330" fill="#dddddd"/><circle cx="170" cy="145" r="20" fill="red"/><circle cx="465" cy="300" r="20" fill="blue"/>');
  const result = await detectScreen(image);
  expect(result.status).toBe('found');
  if (result.status !== 'found') throw new Error(result.reason);
  const {data,info} = await sharp(result.rectified).raw().toBuffer({resolveWithObject:true});
  const red:number[] = [], blue:number[] = [];
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
    const i=(y*info.width+x)*3;
    if(data[i]!>200 && data[i+1]!<40 && data[i+2]!<40) red.push(x,y);
    if(data[i+2]!>200 && data[i]!<40) blue.push(x,y);
  }
  expect(red.length).toBeGreaterThan(100); expect(blue.length).toBeGreaterThan(100);
  expect(red.filter((_,i)=>i%2===0).every(x=>x<320)).toBe(true);
  expect(red.filter((_,i)=>i%2===1).every(y=>y<180)).toBe(true);
  expect(blue.filter((_,i)=>i%2===0).every(x=>x>320)).toBe(true);
  expect(blue.filter((_,i)=>i%2===1).every(y=>y>180)).toBe(true);
});

test.each([
  ['absent',''],
  ['low contrast','<rect x="100" y="100" width="440" height="250" fill="#242424"/>'],
  ['clipped','<rect x="-20" y="100" width="440" height="250" fill="white"/>'],
  ['tiny','<rect x="100" y="100" width="80" height="45" fill="white"/>'],
  ['portrait','<rect x="200" y="50" width="200" height="380" fill="white"/>'],
  ['ambiguous','<rect x="20" y="100" width="280" height="160" fill="white"/><rect x="340" y="220" width="280" height="160" fill="white"/>'],
])('refuses %s instead of guessing', async (_,content) => {
  const result=await detectScreen(await frame(content));
  expect(result.status).toBe('not-found');
  if(result.status !== 'not-found') throw new Error('Unexpected detection');
  expect(result.message).toBe('Экран не найден');
  expect(result.reason).toBe(content.includes('340')?'ambiguous-candidates':'no-qualified-candidate');
  expect('rectified' in result).toBe(false);
});

test('malformed image stays an explicit error, not a screen absence', async () => {
  await expect(detectScreen(Buffer.from('not an image'))).rejects.toThrow();
});

test('projective centre maps to image centre rather than a bounding-box crop',async()=>{
  // In this trapezoid, projective halfway is y=234, not arithmetic halfway y=220.
  const image=await frame('<polygon points="100,80 540,80 500,360 140,360" fill="#ddd"/><circle cx="320" cy="234" r="8" fill="red"/>');
  const result=await detectScreen(image);
  expect(result.status).toBe('found');
  if(result.status!=='found') throw new Error(result.reason);
  const {data,info}=await sharp(result.rectified).raw().toBuffer({resolveWithObject:true});
  let xSum=0,ySum=0,count=0;
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
    const i=(y*info.width+x)*3;
    if(data[i]!>200 && data[i+1]!<40 && data[i+2]!<40){xSum+=x;ySum+=y;count++;}
  }
  expect(count).toBeGreaterThan(100);
  expect(Math.abs(xSum/count-319.5)).toBeLessThan(3);
  expect(Math.abs(ySum/count-179.5)).toBeLessThan(3);
});

test('source-resolution output retains more than preview detail without enlarging',async()=>{
  const image=await sharp(Buffer.from('<svg width="1920" height="1080"><rect width="1920" height="1080" fill="#202020"/><rect x="300" y="225" width="1320" height="750" fill="#ddd"/></svg>')).png().toBuffer();
  const result=await detectScreen(image,{output:'source'});
  expect(result.status).toBe('found');if(result.status!=='found')throw new Error(result.reason);
  const size=await sharp(result.rectified).metadata();
  expect(size.width).toBeGreaterThan(1200);expect(size.width).toBeLessThanOrEqual(1325);
  expect(size.height).toBeGreaterThan(675);expect(size.height).toBeLessThanOrEqual(750);
});

test.each([640,800,960] as const)('detection at %i retains native-resolution crop',async detectionSide=>{
 const image=await sharp(Buffer.from('<svg width="1920" height="1080"><rect width="1920" height="1080" fill="#202020"/><rect x="300" y="225" width="1320" height="750" fill="#ddd"/></svg>')).png().toBuffer();
 const result=await detectScreen(image,{output:'source',detectionSide});
 expect(result.diagnostics.detectionWidth).toBe(detectionSide);
 expect(result.status).toBe('found');if(result.status!=='found')throw new Error(result.reason);
 const size=await sharp(result.rectified).metadata();
 expect(size.width).toBeGreaterThan(1200);
 expect(Math.abs(result.corners[0].x-300)).toBeLessThan(6);
 expect(Math.abs(result.corners[0].y-225)).toBeLessThan(6);
});
