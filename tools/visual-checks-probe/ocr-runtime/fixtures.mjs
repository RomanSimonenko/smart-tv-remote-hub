import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../package.json',import.meta.url));
const sharp=require('sharp'); const {openSync}=require('fontkit');
const font=openSync(fileURLToPath(new URL('../fixtures/fonts/NotoSans.ttf',import.meta.url)));
const output=process.argv[2];if(!output)throw new Error('Output directory required');await mkdir(output,{recursive:true});
async function textImage(text){const size=40,scale=size/font.unitsPerEm;let x=0;const run=font.layout(text);const paths=run.glyphs.map((g,i)=>{const p=run.positions[i];const path=`<path transform="translate(${x+p.xOffset*scale} ${size-p.yOffset*scale}) scale(${scale} ${-scale})" d="${g.path.toSVG()}" fill="#f2f5f8"/>`;x+=p.xAdvance*scale;return path;});return Buffer.from(`<svg width="${Math.ceil(x)+4}" height="60">${paths.join('')}</svg>`);}
const cases={both:['Мое кино','Мои подписки','Settings'],one:['Мое кино','Settings'],none:['Каталог','Settings'],blank:[],unrelated:['Мое','кино','Мои подписки']};
for(const [id,texts]of Object.entries(cases)){const layers=[];for(const [i,text]of texts.entries())layers.push({input:await textImage(text),left:id==='unrelated'&&i===1?600:80,top:60+i*120});await sharp({create:{width:1280,height:720,channels:3,background:'#11161d'}}).composite(layers).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toFile(`${output}/${id}.jpg`);}
await writeFile(`${output}/corrupt.jpg`,'synthetic invalid JPEG');
