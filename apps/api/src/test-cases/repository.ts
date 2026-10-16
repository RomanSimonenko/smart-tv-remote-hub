import type Database from 'better-sqlite3';
import { createTestCaseSchema, updateTestCaseSchema, testCaseSchema, type CreateTestCase, type UpdateTestCase, type TestCase } from '@remote-webos-tv/contracts';
export class TestCaseConflictError extends Error {}
export class TestCaseNotFoundError extends Error {}
export class TestCaseValidationError extends Error {}
export interface TestCaseRepository {
 list(): TestCase[]; read(id: string): TestCase | undefined;
 create(input: CreateTestCase): TestCase; update(id: string, input: UpdateTestCase): TestCase;
}
export function createTestCaseRepository(sqlite: Database.Database, { now = Date.now }: { now?: () => number } = {}): TestCaseRepository {
 const select = 'SELECT id, title, description, group_name AS "group", steps_json, version, created_at AS createdAt, updated_at AS updatedAt, status FROM test_cases';
 const decode = (value: unknown): TestCase => {
  const row = value as Record<string, unknown>;
  const { steps_json, ...rest } = row;
  return testCaseSchema.parse({ ...rest, steps: JSON.parse(steps_json as string) });
 };
 const read = (id: string) => { const row=sqlite.prepare(`${select} WHERE id = ?`).get(id); return row ? decode(row) : undefined; };
 return {
  read,
  list: () => sqlite.prepare(`${select} ORDER BY updated_at DESC, id ASC`).all().map(decode),
  create(input) {
   const {id,...draft}=createTestCaseSchema.parse(input);
   return sqlite.transaction(()=> {
    const previous=read(id);
    if(previous) {
     const {id: _id,version,createdAt:_created,updatedAt:_updated,status:_status,...saved}=previous;
     const {status:requestedStatus,...requested}=draft;
     if(version===1 && _status===(requestedStatus??'draft') && JSON.stringify(saved)===JSON.stringify(requested)) return previous;
     throw new TestCaseConflictError('Test case already exists');
    }
    const time=now();
    sqlite.prepare('INSERT INTO test_cases (id,title,description,group_name,steps_json,version,created_at,updated_at,status) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)').run(id,draft.title,draft.description,draft.group,JSON.stringify(draft.steps),time,time,draft.status??'draft');
    return read(id)!;
   }).immediate();
  },
  update(id,input) {
   const value=updateTestCaseSchema.parse(input);
   return sqlite.transaction(()=> {
    const previous=read(id);if(!previous) throw new TestCaseNotFoundError('Test case not found');
    const status=value.status??previous.status;
    if(!updateTestCaseSchema.safeParse({...value,status}).success)throw new TestCaseValidationError('Готовый кейс должен содержать хотя бы один шаг');
    const result=sqlite.prepare('UPDATE test_cases SET title=?, description=?, group_name=?, steps_json=?, status=?, version=version+1, updated_at=? WHERE id=? AND version=?').run(value.title,value.description,value.group,JSON.stringify(value.steps),status,now(),id,value.version);
    if(result.changes!==1) throw new TestCaseConflictError('Version conflict');
    return read(id)!;
   }).immediate();
  },
 };
}
