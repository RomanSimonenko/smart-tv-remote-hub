import sharp from 'sharp';
import type {Corners} from './screen.js';

export interface ScreenFixture {id:string; image:Buffer; expected:'found'|'not-found'; corners?:Corners}

/** Independent SVG geometry supplies ground truth; no detector or warp helpers. */
export async function screenFixtures():Promise<ScreenFixture[]> {
  const rectangle='<rect x="100" y="100" width="440" height="250" fill="#ddd"/>';
  const straight:Corners=[{x:100,y:100},{x:540,y:100},{x:540,y:350},{x:100,y:350}];
  const definitions:Array<{id:string;content:string;expected:'found'|'not-found';corners?:Corners;blur?:number;noise?:boolean}>= [
    {id:'straight',content:rectangle,expected:'found',corners:straight},
    {id:'perspective',content:'<polygon points="100,80 540,120 500,370 140,330" fill="#ddd"/><circle cx="170" cy="145" r="20" fill="red"/><circle cx="465" cy="300" r="20" fill="blue"/>',expected:'found',corners:[{x:100,y:80},{x:540,y:120},{x:500,y:370},{x:140,y:330}]},
    {id:'rotated',content:'<polygon points="140,70 560,150 510,395 90,315" fill="#ddd"/>',expected:'found',corners:[{x:140,y:70},{x:560,y:150},{x:510,y:395},{x:90,y:315}]},
    {id:'blur',content:rectangle,expected:'found',corners:straight,blur:2},
    {id:'seeded-noise',content:rectangle,expected:'found',corners:straight,noise:true},
    {id:'absent',content:'',expected:'not-found'},
    {id:'low-contrast',content:'<rect x="100" y="100" width="440" height="250" fill="#242424"/>',expected:'not-found'},
    {id:'clipped',content:'<rect x="-20" y="100" width="440" height="250" fill="#ddd"/>',expected:'not-found'},
    {id:'occluded',content:rectangle+'<rect x="280" y="70" width="70" height="320" fill="#202020"/>',expected:'not-found'},
    {id:'tiny',content:'<rect x="100" y="100" width="80" height="45" fill="#ddd"/>',expected:'not-found'},
    {id:'portrait',content:'<rect x="200" y="50" width="200" height="380" fill="#ddd"/>',expected:'not-found'},
    {id:'two-screens',content:'<rect x="20" y="100" width="280" height="160" fill="#ddd"/><rect x="340" y="220" width="280" height="160" fill="#ddd"/>',expected:'not-found'},
    // Same outline as a TV: demonstrates the semantic limit of geometry alone.
    {id:'window-lookalike',content:rectangle,expected:'not-found'},
  ];
  return Promise.all(definitions.map(async d=>{
    let pipeline=sharp(Buffer.from(`<svg width="640" height="480"><rect width="640" height="480" fill="#202020"/>${d.content}</svg>`));
    if(d.blur) pipeline=pipeline.blur(d.blur);
    let image=await pipeline.png().toBuffer();
    if(d.noise) {
      const {data,info}=await sharp(image).removeAlpha().raw().toBuffer({resolveWithObject:true});
      let seed=12345;
      for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=Math.max(0,Math.min(255,data[i]!+(seed%17)-8));}
      image=await sharp(data,{raw:{width:info.width,height:info.height,channels:3}}).png().toBuffer();
    }
    return {id:d.id,image,expected:d.expected,...(d.corners?{corners:d.corners}:{})};
  }));
}
