import type { ModelCard } from '../../types/platform';
import MitigationLab from './MitigationLab';

export default function BiasMitigationPanel({ model }: { model: ModelCard }) {
  return <MitigationLab model={model} />;
}
