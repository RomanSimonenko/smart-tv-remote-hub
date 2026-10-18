import {mkdir,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import sharp from 'sharp';
import {detectScreen,screenParameters,screenAlgorithm} from './screen.js';
import {screenFixtures,type ScreenFixture} from './screen-fixtures.js';

interface Options {outputDir:string; synthetic?:boolean; images?:string[]; signal?:AbortSignal}
export async function runScreenExperiment(options:Options):Promise<void> {
  options.signal?.throwIfAborted();
  if(Boolean(options.synthetic)===Boolean(options.images?.length)) throw new Error('Choose --synthetic OR one or more --image inputs');
  // Validate all inputs before creating an output directory. Never overwrite a run.
  const inputs:Array<Omit<ScreenFixture,'expected'> & {expected?:ScreenFixture['expected']}>=options.synthetic
    ? await screenFixtures()
    : await Promise.all(options.images!.map(async (path,i)=>{
      if((await stat(path)).size>32*1024*1024) throw new Error('Input exceeds 32 MiB');
      return {id:`frame-${i}`,image:await readFile(path)};
    }));
  for(const input of inputs) await sharp(input.image,{limitInputPixels:screenParameters.maxInputPixels}).metadata();
  options.signal?.throwIfAborted();
  await mkdir(options.outputDir,{mode:0o700});
  const write=(name:string,data:string|Buffer)=>writeFile(join(options.outputDir,name),data,{mode:0o600,flag:'wx'});
  const observations:Array<Record<string,unknown>>=[];
  const sections:string[]=[];
  try {
    for(const [i,input] of inputs.entries()) {
      options.signal?.throwIfAborted();
      const started=performance.now();
      const result=await detectScreen(input.image);
      const metadata=await sharp(input.image).metadata();
      const format=metadata.format;
      if(!format || !['png','jpeg','webp'].includes(format)) throw new Error('Only PNG, JPEG and WebP evidence is supported');
      const source=`source-${i}.${format==='jpeg'?'jpg':format}`;
      await write(source,input.image);
      // Overlay uses the same auto-oriented pixels as detection; original remains byte-identical.
      const oriented=await sharp(input.image).rotate().png().toBuffer({resolveWithObject:true});
      const paths=result.candidates.map(c=>`<polygon points="${c.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#00ff00" stroke-width="3"/>`).join('');
      const overlay=`overlay-${i}.png`;
      await write(overlay,await sharp(oriented.data).composite([{input:Buffer.from(`<svg width="${oriented.info.width}" height="${oriented.info.height}">${paths}</svg>`)}]).png().toBuffer());
      const rectified=result.status==='found'?`rectified-${i}.png`:undefined;
      if(rectified && result.status==='found') await write(rectified,result.rectified);
      const maxCornerErrorPx=input.corners && result.status==='found'
        ? Math.max(...input.corners.map((p,j)=>Math.hypot(p.x-result.corners[j]!.x,p.y-result.corners[j]!.y))) : undefined;
      const verdict=!input.expected?'unlabelled':result.status===input.expected?'correct':result.status==='found'?'false-positive':'false-negative';
      const {rectified:_buffer,...diagnostics}=result.status==='found'?result:{...result,rectified:undefined};
      observations.push({id:input.id,source,overlay,rectified,sha256:createHash('sha256').update(input.image).digest('hex'),durationMs:Math.round(performance.now()-started),expected:input.expected,expectedCorners:input.corners,maxCornerErrorPx,verdict,...diagnostics});
      sections.push(`<section><h2>${input.id}: ${result.status==='found'?'Кандидат найден':'Экран не найден'}</h2><p>${verdict}${result.status==='not-found'?` · ${result.reason}`:''}${maxCornerErrorPx!==undefined?` · ошибка углов: ${maxCornerErrorPx.toFixed(2)} px`:''}</p><a href="${source}">Исходник</a><p><img src="${overlay}" alt="Кандидаты экрана"/>${rectified?`<img src="${rectified}" alt="Исправленная перспектива"/>`:''}</p></section>`);
    }
    options.signal?.throwIfAborted();
    const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
    const report={schemaVersion:1,scope:options.synthetic?'synthetic':'real-unlabelled',algorithm:screenAlgorithm,parameters:screenParameters,runtime:{node:process.version,platform:process.platform,arch:process.arch},dependencies:{opencv:pkg.dependencies['@techstark/opencv-js'],sharp:pkg.dependencies.sharp},limitations:['Geometry does not prove TV identity. Windows/posters can be false positives.','640x360 output assumes landscape 16:9; physical aspect cannot be inferred from four corners.','Thresholds are experimental, not calibrated confidence. Severe perspective/occlusion may be refused.'],summary:{total:observations.length,correct:observations.filter(o=>o.verdict==='correct').length,falsePositives:observations.filter(o=>o.verdict==='false-positive').length,falseNegatives:observations.filter(o=>o.verdict==='false-negative').length},observations};
    await write('report.json',JSON.stringify(report,null,2)+'\n');
    await write('index.html',`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Поиск экрана — эксперимент</title><style>body{font:16px system-ui;max-width:1100px;margin:32px auto;padding:0 16px}section{border-top:1px solid #aaa;margin-top:32px}img{max-width:48%;height:auto;vertical-align:top;margin-right:1%}@media(max-width:700px){img{max-width:100%}}</style><h1>Поиск экрана — ${options.synthetic?'синтетическая оценка':'реальные кадры без разметки'}</h1><p>Геометрический кандидат не доказывает, что найден ТВ. Рабочий раннер не подключён. Выход: 640×360, предположение 16:9.</p><p>Верных решений: ${report.summary.correct}; ложных обнаружений: ${report.summary.falsePositives}; пропусков: ${report.summary.falseNegatives}.</p>${sections.join('\n')}</html>`);
    options.signal?.throwIfAborted();
  } catch(error) {
    // Only the exclusive directory created by this invocation is removed.
    await rm(options.outputDir,{recursive:true,force:true});
    throw error;
  }
}

export async function main(args:string[],log:(s:string)=>void=console.error):Promise<number> {
  const controller=new AbortController();
  const interrupt=()=>controller.abort();
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  try {
    const {values}=parseArgs({args,options:{synthetic:{type:'boolean'},image:{type:'string',multiple:true},output:{type:'string'}}});
    if(!values.output) throw new Error('Required: --output NEW_DIRECTORY');
    await runScreenExperiment({outputDir:values.output,signal:controller.signal,...(values.synthetic?{synthetic:true}:{}),...(values.image?{images:values.image}:{})});
    return 0;
  } catch(error) {
    if(controller.signal.aborted) {log('Screen experiment cancelled; incomplete output removed');return 130;}
    let message=error instanceof Error?error.message:String(error);
    const argumentValues=args.flatMap(a=>a.startsWith('--')?(a.includes('=')?[a.slice(a.indexOf('=')+1)]:[]):[a]).filter(Boolean);
    for(const value of argumentValues.sort((a,b)=>b.length-a.length)) {
      message=message.replaceAll(resolve(value),'<local-path>').replaceAll(value,'<argument>');
      const parent=dirname(resolve(value));if(parent!=='/') message=message.replaceAll(parent,'<local-dir>');
    }
    log(`Screen experiment failed: ${message}`);return 1;
  } finally {process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) process.exitCode=await main(process.argv.slice(2));
