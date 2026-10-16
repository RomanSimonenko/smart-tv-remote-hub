import {test,expect} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateFixtures} from './fixtures.js';
test('fixtures_are_repeatable',async()=>{
 const a=await mkdtemp(join(tmpdir(),'visual-a-')),b=await mkdtemp(join(tmpdir(),'visual-b-'));
 try{await generateFixtures(a);await generateFixtures(b);
 const manifest=JSON.parse(await readFile(join(a,'manifest.json'),'utf8'));
 expect(manifest.cases.length).toBeGreaterThanOrEqual(12);
 expect(manifest.cases.find((c:{id:string})=>c.id==='russian-clear').expected).toBe('Программа передач');
 for(const file of ['manifest.json','russian-clear.png','blurred.png','focus-reference.png'])expect(await readFile(join(a,file))).toEqual(await readFile(join(b,file)));
 }finally{await rm(a,{recursive:true});await rm(b,{recursive:true});}
},30000);
