import {readFile,writeFile,mkdir,copyFile,realpath,stat} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute,extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';import {parseArgs} from 'node:util';import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';import sharp from 'sharp';import {z} from 'zod';
import {compareImage} from './image-check.js';import {recognizeText} from './ocr.js';import {evaluateText} from './text-check.js';
const localPath=z.string().min(1).refine(path=>!isAbsolute(path)&&!path.split(/[\\/]/).includes('..')&&!path.includes(':'),'Use a relative path inside the dataset');
const region=z.strictObject({x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().positive().max(1),height:z.number().positive().max(1)}).refine(r=>r.x+r.width<=1&&r.y+r.height<=1,'Invalid region');
const base={id:z.string().min(1).max(100),image:localPath,region,quality:z.enum(['clear','degraded']),expectedMatch:z.boolean()};
const caseSchema=z.discriminatedUnion('kind',[
 z.strictObject({...base,kind:z.literal('text'),language:z.enum(['rus','eng','rus+eng']),expected:z.string().min(1).max(2000),operator:z.enum(['equals','contains','notContains'])}),
 z.strictObject({...base,kind:z.literal('image'),reference:localPath,threshold:z.number().min(-1).max(1)})
]);
const manifestSchema=z.strictObject({version:z.literal(1),parameters:z.record(z.string(),z.unknown()).optional(),cases:z.array(caseSchema).min(1).max(100)});
type ProbeCase=z.infer<typeof caseSchema>;
const escape=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
async function datasetPath(root:string,path:string):Promise<string>{
 const full=await realpath(resolve(root,path)),rel=relative(root,full);
 if(rel.startsWith('..')||isAbsolute(rel))throw new Error('Use a relative path inside the dataset');
 return full;
}
export async function runProbe(manifestPath:string,outputDir:string,signal:AbortSignal=new AbortController().signal):Promise<void>{
 signal.throwIfAborted();
 if((await stat(manifestPath)).size>1024*1024)throw new Error('Manifest exceeds 1 MiB');
 const manifest=manifestSchema.parse(JSON.parse(await readFile(manifestPath,'utf8')));
 const root=await realpath(dirname(resolve(manifestPath)));
 const inputs=await Promise.all(manifest.cases.map(async item=>({item,image:await datasetPath(root,item.image),reference:item.kind==='image'?await datasetPath(root,item.reference):null})));
 signal.throwIfAborted();
 // Exclusive creation prevents accidental overwrite or mixing runs.
 await mkdir(outputDir);
 const observations:Array<Record<string,unknown>>=[];const sections:string[]=[];
 for(const [index,{item,image,reference}] of inputs.entries()){
  signal.throwIfAborted();
  const started=performance.now();let result:Record<string,unknown>;
  const original=`original-${index}${extname(image).toLowerCase()}`;
  if(!['.png','.jpg','.jpeg','.webp'].includes(extname(original)))throw new Error('Unsupported evidence image format');
  await copyFile(image,join(outputDir,original));
  const metadata=await sharp(image,{limitInputPixels:16_000_000}).metadata();
  if(!metadata.width||!metadata.height)throw new Error('Invalid image dimensions');
  let boxes:Array<{x:number;y:number;width:number;height:number}>=[];
  try{
   if(item.kind==='text'){
    const observation=await recognizeText(image,item.region,item.language,AbortSignal.any([signal,AbortSignal.timeout(30000)]));
    result={...evaluateText(observation,item.expected,item.operator),observation};boxes=observation.words.map(word=>word.box);
   }else{
    const observation=await compareImage(image,reference!,item.region);
    result={status:observation.score>=item.threshold?'matched':'not-matched',reason:'Correlation compared with the explicit experimental threshold; frame quality is not validated.',observation};
    if(observation.score>=item.threshold)boxes=[observation.box];
    const refFile=`reference-${index}${extname(reference!).toLowerCase()}`;
    await copyFile(reference!,join(outputDir,refFile));result.referenceEvidence=refFile;
   }
  }catch(error){signal.throwIfAborted();result={status:'error',reason:error instanceof Error?error.message.replaceAll(root,'<dataset>'):String(error)};}
  const entry={check:item,original,sha256:createHash('sha256').update(await readFile(image)).digest('hex'),durationMs:Math.round(performance.now()-started),...result};
  observations.push(entry);
  const overlay=boxes.map(box=>`<span class="found" style="left:${box.x/metadata.width!*100}%;top:${box.y/metadata.height!*100}%;width:${box.width/metadata.width!*100}%;height:${box.height/metadata.height!*100}%"></span>`).join('');
  sections.push(`<section><h2>${escape(item.id)} · ${escape(result.status)}</h2><p>Ожидание: ${escape(expectedLabel(item))} · ${entry.durationMs} мс · ${escape(item.quality)}</p><figure><img src="${escape(original)}" alt="Исходный синтетический кадр"><span class="region" style="left:${item.region.x*100}%;top:${item.region.y*100}%;width:${item.region.width*100}%;height:${item.region.height*100}%"></span>${overlay}</figure><p>Пунктир — область поиска. Зелёные рамки — распознанные слова или найденный эталон.</p><pre>${escape(JSON.stringify(result,null,2))}</pre></section>`);
 }
 signal.throwIfAborted();
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 const modelHashes:Record<string,string>={};
 // Record the exact packaged models, rather than only their package versions.
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
 for(const language of ['rus','eng']){const path=join(dirname(require.resolve(`@tesseract.js-data/${language}`)),'4.0.0',`${language}.traineddata.gz`);modelHashes[language]=createHash('sha256').update(await readFile(path)).digest('hex');}
 const report={schemaVersion:1,scope:'Synthetic experiment only; not a TV test run',runtime:{node:process.version,platform:process.platform,arch:process.arch},dependencies:pkg.dependencies,modelHashes,parameters:manifest.parameters??{},observations};
 await writeFile(join(outputDir,'report.json'),JSON.stringify(report,null,2)+'\n');
 await writeFile(join(outputDir,'index.html'),`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Проверки экрана — эксперимент</title><style>body{background:#11161d;color:#f2f5f8;font:14px/20px system-ui;margin:32px auto;padding:0 24px;max-width:960px}h1{font-size:32px;line-height:40px}h2{font-size:20px;line-height:28px}section{background:#1a222c;border:1px solid #3a4859;border-radius:12px;padding:20px;margin:20px 0}p{color:#a8b4c3}figure{position:relative;margin:0;max-width:640px}img{display:block;width:100%}.region,.found{position:absolute;box-sizing:border-box;pointer-events:none}.region{border:2px dashed #73adfa}.found{border:2px solid #79e493}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#222d39;padding:12px;border-radius:8px}</style><h1>Проверки экрана</h1><p>Локальный эксперимент на синтетических кадрах. Результаты не подтверждают качество на камере ТВ.</p><p>Область поиска обозначена пунктиром. Исходные изображения сохранены без разметки.</p>${sections.join('')}</html>`);
}
function expectedLabel(item:ProbeCase):string{return item.kind==='text'?`${item.operator}: ${item.expected}`:`Эталон, порог ${item.threshold}`;}
export async function main(args:string[],log:(message:string)=>void=console.error):Promise<number>{
 const controller=new AbortController();let interrupted: 'SIGINT'|'SIGTERM'|undefined;
 const interrupt=(name:'SIGINT'|'SIGTERM')=>{interrupted=name;controller.abort(new Error(`Probe cancelled (${name})`));};
 const onInt=()=>interrupt('SIGINT'),onTerm=()=>interrupt('SIGTERM');
 process.on('SIGINT',onInt);process.on('SIGTERM',onTerm);
 try{
  const {values}=parseArgs({args,options:{manifest:{type:'string'},output:{type:'string'}},strict:true});
  if(!values.manifest||!values.output)throw new Error('Provide --manifest <file> --output <new directory>');
  await runProbe(values.manifest,values.output,controller.signal);return 0;
 }catch(error){log(error instanceof Error?error.message:String(error));return interrupted==='SIGINT'?130:interrupted==='SIGTERM'?143:1;}
 finally{process.off('SIGINT',onInt);process.off('SIGTERM',onTerm);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await main(process.argv.slice(2));
