import sharp from 'sharp';
import {openSync} from 'fontkit';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const fontfile=fileURLToPath(new URL('../fixtures/fonts/NotoSans.ttf',import.meta.url));
export async function generateFixtures(outputDir:string):Promise<void>{
 await mkdir(outputDir,{recursive:true});
 const width=640,height=360;
 const font=openSync(fontfile);
 if(!('layout' in font))throw new Error('Expected a single font');
 const textImage=async(text:string,size=32)=>{
  const run=font.layout(text),scale=size/font.unitsPerEm;let x=0;
  const paths=run.glyphs.map((glyph,index)=>{const pos=run.positions[index]!;const path=`<path transform="translate(${x+pos.xOffset*scale} ${size-pos.yOffset*scale}) scale(${scale} ${-scale})" d="${glyph.path.toSVG()}" fill="#f2f5f8"/>`;x+=pos.xAdvance*scale;return path;});
  return sharp(Buffer.from(`<svg width="${Math.ceil(x)+2}" height="${Math.ceil(size*1.4)}">${paths.join('')}</svg>`)).png().toBuffer();
 };
 const frame=async(text:string,size=32)=>sharp({create:{width,height,channels:3,background:'#11161d'}}).composite([{input:await textImage(text,size),left:40,top:80}]).png().toBuffer();
 const clear=await frame('Программа передач');
 const cases:Array<Record<string,unknown>>=[];
 const region={x:0.025,y:0.1,width:0.95,height:0.5};
 const save=async(id:string,image:Buffer,expected:string,quality:string,language='rus')=>{
  await writeFile(join(outputDir,`${id}.png`),image);
  cases.push({id,image:`${id}.png`,kind:'text',region,language,expected,operator:'contains',quality,expectedMatch:id!=='different-text'&&id!=='blank'});
 };
 await save('russian-clear',clear,'Программа передач','clear');
 await save('russian-short',await frame('Каталог'),'Каталог','clear');
 await save('english-clear',await frame('Settings'),'Settings','clear','eng');
 await save('different-text',await frame('Каталог'),'Программа передач','clear');
 await save('blank',await sharp({create:{width,height,channels:3,background:'#11161d'}}).png().toBuffer(),'Программа передач','clear');
 await save('small-text',await frame('Программа передач',12),'Программа передач','degraded');
 await save('blurred',await sharp(clear).blur(3).png().toBuffer(),'Программа передач','degraded');
 await save('darkened',await sharp(clear).linear(0.2).png().toBuffer(),'Программа передач','degraded');
 await save('glare',await sharp(clear).composite([{input:Buffer.from('<svg width="640" height="360"><rect x="140" y="50" width="220" height="100" fill="white" opacity="0.9"/></svg>')}]).png().toBuffer(),'Программа передач','degraded');
 const pixels=await sharp(clear).removeAlpha().raw().toBuffer(),warped=Buffer.alloc(width*height*3,20);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sy=y/(1-0.0006*y),sx=x*(1+0.0006*sy)-40;
  if(sx>=0&&sx<width&&sy>=0&&sy<height){const source=(Math.floor(sy)*width+Math.floor(sx))*3;pixels.copy(warped,(y*width+x)*3,source,source+3);}
 }
 await save('perspective',await sharp(warped,{raw:{width,height,channels:3}}).png().toBuffer(),'Программа передач','degraded');
 const card=async(selected:boolean)=>sharp({create:{width,height,channels:3,background:'#11161d'}}).composite([{input:Buffer.from(`<svg width="640" height="360"><rect x="40" y="220" width="240" height="90" rx="8" fill="#222d39" stroke="${selected?'#f2f5f8':'#3a4859'}" stroke-width="${selected?8:1}"/><circle cx="80" cy="265" r="18" fill="#79e493"/><path d="M120 250h130v10H120zm0 20h90v8h-90" fill="#a8b4c3"/></svg>`)}]).png().toBuffer();
 const selected=await card(true);
 await writeFile(join(outputDir,'focus-reference.png'),await sharp(selected).extract({left:35,top:215,width:250,height:100}).png().toBuffer());
 for(const [id,image,expectedMatch] of [['focus-selected',selected,true],['focus-unselected',await card(false),false],['focus-blurred',await sharp(selected).blur(2).png().toBuffer(),true]] as const){
  await writeFile(join(outputDir,`${id}.png`),image);
  cases.push({id,image:`${id}.png`,kind:'image',reference:'focus-reference.png',region:{x:0,y:0.5,width:0.6,height:0.5},threshold:0.95,expectedMatch,quality:id==='focus-blurred'?'degraded':'clear'});
 }
 await writeFile(join(outputDir,'manifest.json'),JSON.stringify({version:1,parameters:{width,height,font:'Noto Sans',fontSize:32,blurSigma:3,darkening:0.2,perspective:0.0006},cases},null,2)+'\n');
}
