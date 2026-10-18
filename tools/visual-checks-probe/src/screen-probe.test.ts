import {expect,test} from 'vitest';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {runScreenExperiment,main} from './screen-probe.js';

test('synthetic report exposes failures and preserves reviewable evidence', async () => {
  const dir=await mkdtemp(join(tmpdir(),'screen-probe-'));
  try {
    const output=join(dir,'report');
    await runScreenExperiment({outputDir:output,synthetic:true});
    const report=JSON.parse(await readFile(join(output,'report.json'),'utf8'));
    expect(report.scope).toBe('synthetic');
    expect(report.observations.length).toBeGreaterThanOrEqual(12);
    const straight=report.observations.find((o:{id:string})=>o.id==='straight');
    expect(straight.status).toBe('found');
    expect(straight.maxCornerErrorPx).toBeLessThan(4);
    expect(await sharp(join(output,straight.rectified)).metadata()).toMatchObject({width:640,height:360});
    expect(report.observations.find((o:{id:string})=>o.id==='two-screens').reason).toBe('ambiguous-candidates');
    for(const id of ['perspective','rotated','blur','seeded-noise']) {
      const observation=report.observations.find((o:{id:string})=>o.id===id);
      expect(observation.verdict,id).toBe('correct');
      expect(observation.maxCornerErrorPx,id).toBeLessThan(5);
    }
    // This is an evaluation, not a claim that geometry can recognize TV identity.
    expect(report.observations.find((o:{id:string})=>o.id==='window-lookalike').verdict).toBe('false-positive');
    expect(report.summary.falsePositives).toBeGreaterThanOrEqual(1);
    expect(await readFile(join(output,'index.html'),'utf8')).toContain('source-0.png');
    expect(JSON.stringify(report)).not.toContain(dir);
    expect((await stat(output)).mode & 0o777).toBe(0o700);
    await expect(runScreenExperiment({outputDir:output,synthetic:true})).rejects.toThrow();
  } finally {await rm(dir,{recursive:true,force:true});}
},30000);

test('real input is copied byte-for-byte and is not labelled as validated', async () => {
  const dir=await mkdtemp(join(tmpdir(),'screen-private-'));
  try {
    const image=await sharp({create:{width:100,height:100,channels:3,background:'black'}}).png().toBuffer();
    const input=join(dir,'private-original.png'); await writeFile(input,image);
    const output=join(dir,'out');
    await runScreenExperiment({outputDir:output,images:[input]});
    const report=JSON.parse(await readFile(join(output,'report.json'),'utf8'));
    expect(report.scope).toBe('real-unlabelled');
    expect(report.observations[0].verdict).toBe('unlabelled');
    expect(await readFile(join(output,'source-0.png'))).toEqual(image);
    expect(JSON.stringify(report)).not.toContain('private-original');
    expect((await stat(join(output,'source-0.png'))).mode & 0o777).toBe(0o600);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('cancellation never leaves a completed report',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'screen-cancel-'));
  try {
    const output=join(dir,'out');
    const running=main(['--synthetic','--output',output],()=>{});
    process.emit('SIGINT');
    expect(await running).toBe(130);
    await expect(stat(output)).rejects.toThrow();
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('CLI requires an explicit input mode and returns failure on invalid images', async () => {
  const dir=await mkdtemp(join(tmpdir(),'screen-cli-'));
  try {
    expect(await main(['--output',join(dir,'missing')],()=>{})).toBe(1);
    const input=join(dir,'broken.png');await writeFile(input,'broken');
    const messages:string[]=[];
    expect(await main(['--image',input,'--output',join(dir,'broken')],s=>messages.push(s))).toBe(1);
    expect(messages.join('')).not.toContain(dir);
    await expect(stat(join(dir,'broken'))).rejects.toThrow();
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('CLI redacts private paths in equals-form options on I/O failure',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'screen-equals-'));
  try {
    const messages:string[]=[];
    expect(await main([`--image=${join(dir,'missing.png')}`,`--output=${join(dir,'out')}`],s=>messages.push(s))).toBe(1);
    expect(messages.join('')).toContain('ENOENT');
    expect(messages.join('')).not.toContain(dir);
    expect(messages.join('')).not.toContain('missing.png');
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('failure after creating output removes incomplete artifacts and preserves input',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'screen-cleanup-'));
  try {
    const input=join(dir,'frame.gif'),output=join(dir,'out');
    const image=await sharp({create:{width:100,height:100,channels:3,background:'black'}}).gif().toBuffer();
    await writeFile(input,image);
    await expect(runScreenExperiment({outputDir:output,images:[input]})).rejects.toThrow('Only PNG, JPEG and WebP');
    await expect(stat(output)).rejects.toThrow();
    expect(await readFile(input)).toEqual(image);
  } finally {await rm(dir,{recursive:true,force:true});}
});
