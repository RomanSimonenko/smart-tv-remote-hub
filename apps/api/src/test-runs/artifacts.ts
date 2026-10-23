import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readdir,readFile,writeFile,rename,unlink,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {testCaseIdSchema,MAX_SNAPSHOT_BYTES,type TestRun} from '@remote-webos-tv/contracts';
export class ArtifactError extends Error {
 constructor(readonly code:'INVALID_SNAPSHOT'|'ARTIFACT_QUOTA_EXCEEDED'|'ARTIFACT_STORAGE_FAILED',options?:ErrorOptions){super(code,options);}
 readonly statusCode=503;
}
export function validateJpeg(data:Buffer){
 if(data.length<12||data.length>MAX_SNAPSHOT_BYTES||data.readUInt16BE(0)!==0xffd8||data.readUInt16BE(data.length-2)!==0xffd9)throw new ArtifactError('INVALID_SNAPSHOT');
 let offset=2;let dimensions=false,quantization=false,huffman=false,scans=0,entropy=0;
 while(offset<data.length){
  if(data[offset++]!==0xff)throw new ArtifactError('INVALID_SNAPSHOT');
  while(data[offset]===0xff)offset++;
  const marker=data[offset++];
  if(marker===0xd9){if(offset!==data.length||!dimensions||!scans||!entropy)throw new ArtifactError('INVALID_SNAPSHOT');return;}
  if(offset+2>data.length)throw new ArtifactError('INVALID_SNAPSHOT');
  const length=data.readUInt16BE(offset);if(length<2||offset+length>data.length)throw new ArtifactError('INVALID_SNAPSHOT');
  if(marker!==undefined&&[0xc0,0xc1,0xc2].includes(marker)){
   if(length<8||data[offset+2]!==8)throw new ArtifactError('INVALID_SNAPSHOT');
   const height=data.readUInt16BE(offset+3),width=data.readUInt16BE(offset+5);
   const components=data[offset+7]!;
   if(!height||!width||height>4096||width>4096||![1,3,4].includes(components)||length!==8+3*components)throw new ArtifactError('INVALID_SNAPSHOT');dimensions=true;
  }
  if(marker===0xdb){if(length<67)throw new ArtifactError('INVALID_SNAPSHOT');quantization=true;}
  if(marker===0xc4){if(length<19)throw new ArtifactError('INVALID_SNAPSHOT');huffman=true;}
  if(marker===0xda){
   const components=data[offset+2]!;
   if(!dimensions||!quantization||!huffman||!components||components>4||length!==6+2*components)throw new ArtifactError('INVALID_SNAPSHOT');
   scans++;offset+=length;
   while(offset<data.length){
    if(data[offset]!==0xff){entropy++;offset++;continue;}
    const next=data[offset+1];if(next===0x00){entropy++;offset+=2;continue;}
    if(next!==undefined&&next>=0xd0&&next<=0xd7){offset+=2;continue;}
    break;
   }
   continue;
  }
  offset+=length;
 }
 throw new ArtifactError('INVALID_SNAPSHOT');
}
export async function createArtifactStore({dataDir,maxBytes=1024**3}:{dataDir:string;maxBytes?:number}){
 const directory=join(dataDir,'run-artifacts');await mkdir(directory,{recursive:true,mode:0o700});
 if(!(await lstat(directory)).isDirectory())throw new ArtifactError('ARTIFACT_STORAGE_FAILED');
 const name=(runId:string,itemId:string)=>`${testCaseIdSchema.parse(runId)}_${testCaseIdSchema.parse(itemId)}.jpg`;
 let used=0;for(const file of await readdir(directory)){if(file.endsWith('.tmp'))await unlink(join(directory,file));else used+=(await lstat(join(directory,file))).size;}
 let serial=Promise.resolve();
 return {
  usage:()=>({bytes:used,quotaBytes:maxBytes}),
  async removeRun(runId:string){
   const prefix=`${testCaseIdSchema.parse(runId)}_`;
   const previous=serial;let release!:()=>void;serial=new Promise(resolve=>{release=resolve;});await previous;
   try{for(const file of await readdir(directory))if(file.startsWith(prefix)&&file.endsWith('.jpg')){
    const path=join(directory,file),size=(await lstat(path)).size;await unlink(path);used-=size;
   }}catch(cause){throw new ArtifactError('ARTIFACT_STORAGE_FAILED',{cause});}finally{release();}
  },
  async save(runId:string,itemId:string,data:Buffer){
   validateJpeg(data);const sha256=createHash('sha256').update(data).digest('hex');
   const previous=serial;let release!:()=>void;serial=new Promise(resolve=>{release=resolve;});await previous;
   const target=join(directory,name(runId,itemId));const temporary=join(directory,`${randomUUID()}.tmp`);
   try {
    try{const existing=await readFile(target);if(!existing.equals(data))throw new Error('ARTIFACT_CONFLICT');return {bytes:data.length,sha256};}catch(cause){if(!(cause instanceof Error&&'code'in cause&&cause.code==='ENOENT'))throw cause;}
    if(used+data.length>maxBytes)throw new ArtifactError('ARTIFACT_QUOTA_EXCEEDED');
    await writeFile(temporary,data,{flag:'wx',mode:0o600});await rename(temporary,target);used+=data.length;return {bytes:data.length,sha256};
   }catch(cause){
    try{await unlink(temporary);}catch(cleanup){if(!(cleanup instanceof Error&&'code'in cleanup&&cleanup.code==='ENOENT'))throw new ArtifactError('ARTIFACT_STORAGE_FAILED',{cause:new AggregateError([cause,cleanup])});}
    if(cause instanceof ArtifactError)throw cause;throw new ArtifactError('ARTIFACT_STORAGE_FAILED',{cause});
   }finally{release();}
  },
  read:(runId:string,itemId:string)=>readFile(join(directory,name(runId,itemId))),
  async recover(runs:TestRun[]){
   const committed=new Set(runs.flatMap(run=>run.items.filter(item=>item.phase==='saved').map(item=>name(run.id,item.id))));
   for(const file of await readdir(directory))if(!committed.has(file)){const path=join(directory,file);used-=(await lstat(path)).size;await unlink(path);}
   const missing=new Set<string>();
   for(const run of runs)for(const item of run.items)if(item.phase==='saved'){
    try{const data=await readFile(join(directory,name(run.id,item.id)));if(data.length!==item.bytes||createHash('sha256').update(data).digest('hex')!==item.sha256)missing.add(run.id);}catch(cause){if(cause instanceof Error&&'code'in cause&&cause.code==='ENOENT')missing.add(run.id);else throw cause;}
   }
   return missing;
  },
 };
}
export type ArtifactStore=Awaited<ReturnType<typeof createArtifactStore>>;
