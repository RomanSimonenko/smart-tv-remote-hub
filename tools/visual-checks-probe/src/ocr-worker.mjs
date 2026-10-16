// A disposable process contains Tesseract initialization as well as recognition.
// Its parent can release every worker even if upstream initialization stalls.
import {createWorker,PSM} from 'tesseract.js';
import {join} from 'node:path';
const [dir,language]=process.argv.slice(2);
let worker;
try{
 worker=await createWorker(language,1,{langPath:dir,cacheMethod:'none',gzip:true,errorHandler:error=>{process.send?.({error:String(error).replaceAll(dir,'<temporary>')});process.exitCode=1;}});
 await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
 const {data}=await worker.recognize(join(dir,'frame.png'),{}, {text:true,blocks:true});
 const words=(data.blocks??[]).flatMap(block=>block.paragraphs.flatMap(paragraph=>paragraph.lines.flatMap(line=>line.words.map(word=>({text:word.text,confidence:word.confidence,box:{x:word.bbox.x0,y:word.bbox.y0,width:word.bbox.x1-word.bbox.x0,height:word.bbox.y1-word.bbox.y0}})))));
 process.send?.({observation:{text:data.text,confidence:data.confidence,words}});
}catch(error){process.send?.({error:String(error).replaceAll(dir,'<temporary>')});process.exitCode=1;}
finally{if(worker)await worker.terminate();process.disconnect?.();}
