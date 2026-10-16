import {IconCircleCheck} from '@tabler/icons-react';
import type {ReactNode} from 'react';
export function CaseReadiness({status,children}:{status:'draft'|'ready';children?:ReactNode}){return <span className="case-readiness" data-status={status}>{status==='ready'&&!children&&<IconCircleCheck aria-hidden="true"/>}{children??(status==='ready'?'Готов к запуску':'Черновик')}</span>;}
