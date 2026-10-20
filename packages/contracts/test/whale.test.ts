import {expect,test} from 'vitest';
import * as c from '../src/index.js';
test('Whale platform is accepted by device contracts',()=>expect(c.addTvRequestSchema.safeParse({id:'00000000-0000-4000-8000-000000000001',platform:'whale',host:'192.168.1.5'}).success).toBe(true));
test('PIN preserves leading zero and rejects non ASCII, numeric and extra inputs',()=>{
 const schema=(c as any).submitTvPinSchema; expect(schema).toBeDefined();
 expect(schema.parse({pin:'0123'})).toEqual({pin:'0123'});
 for(const pin of [1234,' 1234','123','12345','１２３４','']) expect(schema.safeParse({pin}).success).toBe(false);
 expect(schema.safeParse({pin:'1234',key:'secret'}).success).toBe(false);
});
test('PIN challenge is restricted to a live operation deadline',()=>{
 const op={id:'op',action:'pair',status:'running',startedAt:100,deadlineAt:1000,challenge:{type:'pin',expiresAt:900}};
 expect(c.tvOperationSchema.safeParse(op).success).toBe(true);
 expect(c.tvOperationSchema.safeParse({...op,status:'failed'}).success).toBe(false);
 expect(c.tvOperationSchema.safeParse({...op,challenge:{type:'pin',expiresAt:1001}}).success).toBe(false);
});
