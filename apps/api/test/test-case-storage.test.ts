import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { openDatabase } from '../src/storage/database.js';
import { createTestCaseRepository, TestCaseConflictError, TestCaseNotFoundError } from '../src/test-cases/repository.js';
const input = { id: '00000000-0000-4000-8000-000000000001', title: 'Кейс', description: '', group: '', steps: [] };
test('persists drafts, detects stale edits and retries creation without duplication', async () => {
 const dataDir=await mkdtemp(join(tmpdir(),'case-storage-'));
 try {
 let db=await openDatabase({dataDir});
 let repo=createTestCaseRepository(db.sqlite,{now:()=>100});
 const first=repo.create(input);
 expect(first).toMatchObject({version:1,status:'draft',createdAt:100});
 expect(repo.create(input)).toEqual(first);
 expect(repo.list()).toHaveLength(1);
 expect(()=>repo.create({...input,title:'Other'})).toThrow(TestCaseConflictError);
 expect(repo.update(input.id,{title:'Обновлён',description:'',group:'Группа',steps:[],version:1}).version).toBe(2);
 expect(()=>repo.update(input.id,{title:'Старый',description:'',group:'',steps:[],version:1})).toThrow(TestCaseConflictError);
 expect(()=>repo.update('00000000-0000-4000-8000-000000000002',{title:'Нет',description:'',group:'',steps:[],version:1})).toThrow(TestCaseNotFoundError);
 db.close(); db=await openDatabase({dataDir}); repo=createTestCaseRepository(db.sqlite,{now:()=>200});
 expect(repo.read(input.id)).toMatchObject({title:'Обновлён',version:2,group:'Группа'});
 db.sqlite.prepare('UPDATE test_cases SET steps_json = ?').run('invalid');
 expect(()=>repo.list()).toThrow(); db.close();
 } finally { await rm(dataDir,{recursive:true,force:true}); }
});
test('upgrades v6 without changing owner or TV and rejects a malformed v7 table',async()=>{
 const {default:Database}=await import('better-sqlite3');const {schemaMigrations}=await import('../src/storage/migrations.js');
 const dataDir=await mkdtemp(join(tmpdir(),'case-upgrade-'));
 try {
 const old=new Database(join(dataDir,'app.sqlite'));
 for(const migration of schemaMigrations.filter(m=>m.version<=6)){migration.up(old);old.prepare('INSERT INTO migration_version VALUES (?, ?)').run(migration.version,1);}
 old.prepare('INSERT INTO owner (id,username,password_hash,display_name) VALUES (1,?,?,?)').run('qa','synthetic-hash','QA');
 old.prepare('INSERT INTO tv_devices (tv_id,platform,host,identity_json,encrypted_credential_json) VALUES (?,?,?,?,?)').run('synthetic','webos','tv.example.test','{}','{}');
 old.prepare('INSERT INTO tv_default VALUES (1,?)').run('synthetic');old.close();
 const db=await openDatabase({dataDir});
 expect(db.sqlite.prepare('SELECT username,display_name FROM owner').get()).toEqual({username:'qa',display_name:'QA'});
 expect(db.sqlite.prepare('SELECT tv_id FROM tv_devices').get()).toEqual({tv_id:'synthetic'});
 expect(db.sqlite.prepare('SELECT count(*) AS n FROM test_cases').get()).toEqual({n:0});
 db.sqlite.exec('DROP TABLE test_cases;CREATE TABLE test_cases (id TEXT)');db.close();
 await expect(openDatabase({dataDir})).rejects.toMatchObject({code:'STORAGE_SCHEMA_INVALID'});
 } finally {await rm(dataDir,{recursive:true,force:true});}
});
