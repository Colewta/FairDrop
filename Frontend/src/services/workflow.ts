import { createContext, useContext, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useLocation } from 'react-router-dom';
import type { TrainingRun } from '../types/platform';

export type Workflow = { path: string; kind: 'import' | 'configure' | 'result' | 'mitigation'; datasetId?: string; modelId?: string; hasExperiment?: boolean; runStatus?: TrainingRun['status'] | null };
export const WorkflowContext = createContext<{ workflow: Workflow | null; setWorkflow: Dispatch<SetStateAction<Workflow | null>> }>({ workflow: null, setWorkflow: () => {} });
export function usePublishWorkflow(value: Omit<Workflow, 'path'> | null) {
  const { setWorkflow } = useContext(WorkflowContext);
  const { pathname } = useLocation();
  const serialized = JSON.stringify(value);
  useEffect(() => { if (serialized !== 'null') setWorkflow({ ...JSON.parse(serialized), path: pathname }); }, [serialized, pathname, setWorkflow]);
}
