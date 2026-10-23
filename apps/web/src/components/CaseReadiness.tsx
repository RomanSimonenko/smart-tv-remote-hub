import {useTranslation} from '../i18n.js';
import {IconCircleCheck} from '@tabler/icons-react';
import type {ReactNode} from 'react';
export function CaseReadiness({status,children}:{status:'draft'|'ready';children?:ReactNode}){ const {t}=useTranslation('cases');return <span className="case-readiness" data-status={status}>{status==='ready'&&!children&&<IconCircleCheck aria-hidden="true"/>}{children??(status==='ready'?t('ready'):t('draft'))}</span>;}
