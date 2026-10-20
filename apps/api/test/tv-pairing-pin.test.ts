import {expect,test} from 'vitest';
import {harness,drain,pairing,snapshot,succeed} from './support/tv-harness.js';
async function waiting(saved=false){const h=harness(saved);h.service.start(saved?{action:'repair'}:{action:'pair',host:'192.168.1.10'},'owner');await drain();const a=h.adapters[0]!;const request=await a.enteredPair.promise;const pending=request.requestPin!({expiresAt:1_030_000});return {...h,a,pending};}
test('PIN challenge publishes deadline and only its owner consumes the leading-zero code',async()=>{
 const h=await waiting();const op=(await h.service.status()).operation!;expect(op.challenge).toEqual({type:'pin',expiresAt:1030000});
 expect(()=>h.service.submitPin(op.id,'0123','other')).toThrow();
 h.service.submitPin(op.id,'0123','owner');expect(await h.pending).toBe('0123');
 expect(()=>h.service.submitPin(op.id,'0123','owner')).toThrow();
 h.a.pairResult.resolve(pairing);await h.a.enteredRead.promise;h.a.readResult.resolve(snapshot);await drain();expect(h.writes).toHaveLength(1);expect((await h.service.status()).operation!.challenge).toBeUndefined();await h.service.close();
});
test.each(['cancel','expire','revoke','close'] as const)('%s cancels PIN and never saves a late grant',async action=>{
 const h=await waiting();const rejected=expect(h.pending).rejects.toBeDefined();const op=(await h.service.status()).operation!;
 if(action==='cancel')h.service.cancel(op.id);if(action==='expire')h.scheduler.advance(30000);if(action==='revoke')void h.service.cancelOwnedPower('owner');if(action==='close')void h.service.close();
 await rejected;h.a.pairResult.resolve(pairing);h.a.readResult.resolve(snapshot);await drain();expect(h.writes).toHaveLength(0);expect((await h.service.status()).operation?.challenge).toBeUndefined();await h.service.close();
});
test('revoked repair retains saved credentials and does not cancel another owner',async()=>{
 const h=await waiting(true);await h.service.cancelOwnedPower('other');expect((await h.service.status()).operation?.challenge).toBeDefined();
 const rejected=expect(h.pending).rejects.toBeDefined();void h.service.cancelOwnedPower('owner');await rejected;h.a.pairResult.resolve(pairing);await drain();expect(h.repository.load()).not.toBeNull();expect(h.writes).toHaveLength(0);await h.service.close();
});

test('cancellation after PIN submission rejects a late in-flight grant before persistence',async()=>{
 const h=await waiting();const op=(await h.service.status()).operation!;
 h.service.submitPin(op.id,'0123','owner');expect(await h.pending).toBe('0123');
 h.service.cancel(op.id);h.a.pairResult.resolve(pairing);h.a.readResult.resolve(snapshot);await drain();
 expect(h.writes).toHaveLength(0);expect((await h.service.status()).operation?.status).toBe('cancelled');await h.service.close();
});
