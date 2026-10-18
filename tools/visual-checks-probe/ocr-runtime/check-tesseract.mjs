import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createOcrRecognizer} from '../../../apps/api/dist/src/ocr/recognizer.js';
import {matchTextConditions} from '../../../packages/contracts/dist/src/index.js';
const directory=process.argv[2];if(!directory)throw new Error('Provide synthetic fixture directory');
const expected={both:[true,true,true],one:[true,false,true],none:[false,false,true],blank:[false,false,false],unrelated:[false,true,false]};
const recognizer=createOcrRecognizer();
try{for(const [name,found]of Object.entries(expected)){
 const observation=await recognizer.recognize(await readFile(join(directory,`${name}.jpg`)),new AbortController().signal);
 const result=matchTextConditions(['Мое кино','Мои подписки','Settings'],observation.blocks).map(item=>item.found);
 console.log(JSON.stringify({name,blocks:observation.blocks,result,expected:found}));if(JSON.stringify(result)!==JSON.stringify(found))process.exitCode=1;
}
try{await recognizer.recognize(await readFile(join(directory,'corrupt.jpg')),new AbortController().signal);throw new Error('Invalid image accepted');}catch(error){if(error.message==='Invalid image accepted')throw error;console.log(JSON.stringify({name:'corrupt',status:'error'}));}
}finally{await recognizer.close();}
