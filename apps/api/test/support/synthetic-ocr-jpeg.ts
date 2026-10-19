import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
/** Public synthetic typography only; no camera frames or real test scenarios. */
export async function syntheticOcrJpeg(lines:string[]):Promise<Buffer>{
 const require=createRequire(new URL('../../../../tools/visual-checks-probe/package.json',import.meta.url));
 const sharp=require('sharp');const fontkit=require('fontkit');
 const font=fontkit.openSync(fileURLToPath(new URL('../../../../tools/visual-checks-probe/fixtures/fonts/NotoSans.ttf',import.meta.url)));
 const scale=40/font.unitsPerEm;const paths:string[]=[];
 for(const [index,line]of lines.entries()){
  let x=80;const run=font.layout(line);
  run.glyphs.forEach((glyph:{path:{toSVG():string}},i:number)=>{const p=run.positions[i];paths.push(`<path transform="translate(${x+p.xOffset*scale} ${100+index*100-p.yOffset*scale}) scale(${scale} ${-scale})" d="${glyph.path.toSVG()}" fill="#f2f5f8"/>`);x+=p.xAdvance*scale;});
 }
 return sharp(Buffer.from(`<svg width="1280" height="720"><rect width="1280" height="720" fill="#11161d"/>${paths.join('')}</svg>`)).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toBuffer();
}
