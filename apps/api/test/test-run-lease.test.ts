import {expect,test} from 'vitest';
import {harness,succeed,drain} from './support/tv-harness.js';
test('run lease blocks manual commands and lifecycle changes until released',async()=>{
 const {service,adapters}=harness();const operation=service.start({action:'pair',host:'192.168.1.10'});await drain();
 expect(operation.status).toBe('running');
 // Harness pairing awaits explicit transport resolution; lease cannot bypass busy admission.
 expect(()=>service.acquireRunLease(Symbol('run'))).toThrow();await succeed(adapters[0]!);
 const token=Symbol('run');service.acquireRunLease(token);
 const command={id:'00000000-0000-4000-8000-000000000001',button:'RIGHT' as const};
 expect(service.remoteState()).toEqual({enabled:false,reason:'BUSY'});
 expect(()=>service.assertCanStart({action:'reconnect'})).toThrow();expect(()=>service.setMac(null)).toThrow();
 expect((await service.sendCommand(command,new AbortController().signal)).outcome).toBe('rejected');
 expect((await service.sendCommand(command,new AbortController().signal,token)).outcome).toBe('sent');
 service.releaseRunLease(token);expect(service.remoteState().enabled).toBe(true);await service.close();
});
