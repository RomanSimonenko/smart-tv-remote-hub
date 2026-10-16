import {test,expect,beforeAll,afterAll} from 'vitest';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {generateFixtures} from './fixtures.js';import {runProbe,main} from './cli.js';
let dir:string;beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),'probe-cli-'));await generateFixtures(join(dir,'inputs'));},30000);afterAll(async()=>{await rm(dir,{recursive:true});});
async function imageManifest(){const all=JSON.parse(await readFile(join(dir,'inputs','manifest.json'),'utf8'));all.cases=all.cases.filter((c:{kind:string})=>c.kind==='image');const path=join(dir,'inputs','images.json');await writeFile(path,JSON.stringify(all));return path;}
test('invalid_input_has_nonzero_exit',async()=>{
 const bad=join(dir,'bad.json');await writeFile(bad,'{}');expect(await main(['--manifest',bad,'--output',join(dir,'bad-result')],()=>{})).toBe(1);
});
test('report_keeps_original_image',async()=>{
 const manifest=await imageManifest(),out=join(dir,'result');await runProbe(manifest,out);
 const report=JSON.parse(await readFile(join(out,'report.json'),'utf8'));
 expect(report.observations).toHaveLength(3);expect(report.observations[0].status).toBe('matched');
 expect(await readFile(join(out,'original-0.png'))).toEqual(await readFile(join(dir,'inputs','focus-selected.png')));
 const html=await readFile(join(out,'index.html'),'utf8');expect(html).toContain('original-0.png');expect(html).toContain('Область поиска');expect(html).not.toContain(dir);
 expect(JSON.stringify(report)).not.toContain(dir);
});
test('repeated_run_does_not_mix_results',async()=>{
 const manifest=await imageManifest(),out=join(dir,'repeat');await runProbe(manifest,out);const first=await readFile(join(out,'report.json'));
 await expect(runProbe(manifest,out)).rejects.toThrow();expect(await readFile(join(out,'report.json'))).toEqual(first);
});
test('path_escape_is_rejected',async()=>{
 const bad=join(dir,'inputs','escape.json');await writeFile(bad,JSON.stringify({version:1,cases:[{id:'bad',kind:'image',image:'../secret.png',reference:'focus-reference.png',region:{x:0,y:0,width:1,height:1},threshold:0.9,expectedMatch:true,quality:'clear'}]}));
 await expect(runProbe(bad,join(dir,'escape-result'))).rejects.toThrow('relative');
});
test('cli_signal_cancellation_waits_for_cleanup',async()=>{
 const manifest=await imageManifest();const out=join(dir,'cancelled');
 const running=main(['--manifest',manifest,'--output',out],()=>{});
 process.emit('SIGINT');
 expect(await running).toBe(130);
 await expect(readFile(join(out,'report.json'))).rejects.toThrow();
});
