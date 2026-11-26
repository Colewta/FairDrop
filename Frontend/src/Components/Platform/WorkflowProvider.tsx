import { useState } from 'react';
import type { ReactNode } from 'react';
import { WorkflowContext } from '../../services/workflow';
import type { Workflow } from '../../services/workflow';

export default function WorkflowProvider({ children }: { children: ReactNode }) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  return <WorkflowContext.Provider value={{ workflow, setWorkflow }}>{children}</WorkflowContext.Provider>;
}
