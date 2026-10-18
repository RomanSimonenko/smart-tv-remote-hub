// Disposable local OCR: models are packaged dependencies, never fetched at runtime.
import {createWorker,PSM} from 'tesseract.js';
let worker;
try{
 const chunks=[];let bytes=0;
 for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>5*1024*1024)throw new Error('Input too large');chunks.push(chunk);}
 worker=await createWorker('rus+eng',1,{langPath:process.argv[2],cacheMethod:'none',gzip:true,logger:()=>{},errorHandler:()=>{process.exitCode=1;}});
 await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
 const {data}=await worker.recognize(Buffer.concat(chunks),{}, {text:true,blocks:true});
 const blocks=(data.blocks??[]).flatMap(block=>block.paragraphs.flatMap(paragraph=>paragraph.lines.map(line=>({text:line.text.trim()})))).filter(block=>block.text);
 process.stdout.write(JSON.stringify({blocks,engine:'tesseract.js-7.0.0',model:'rus+eng-4.0.0-data-1.0.0'}));
}catch{process.exitCode=1;}
finally{if(worker)await worker.terminate();}
