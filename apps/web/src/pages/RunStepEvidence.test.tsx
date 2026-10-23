import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,test} from 'vitest';
import {RunStepEvidence} from './RunStepEvidence.js';
afterEach(cleanup);
test('report distinguishes hold duration from the pause after the action',()=>{
 const id=crypto.randomUUID(),action={id,action:'RIGHT' as const,holdForMs:1000,pauseAfterMs:500};
 render(<RunStepEvidence runId={id} step={{id,kind:'when',text:'Synthetic hold',actions:[action]}} index={0} items={[{id,stepId:id,ordinal:1,phase:'saved',action,capturedAt:0}]} status="needs_review" selectedId={id} onSelect={()=>{}}/>);
 expect(screen.getByText(/удерживать 1000 мс/)).toBeTruthy();
 expect(screen.getByText(/пауза 500 мс/)).toBeTruthy();
});
