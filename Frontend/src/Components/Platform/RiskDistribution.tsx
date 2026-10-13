import { Link } from 'react-router-dom';
import type { PredictionBatch } from '../../types/platform';

const levels = [{ key: 'low', label: 'Baixo', color: '#587b69' }, { key: 'medium', label: 'Médio', color: '#b59351' }, { key: 'high', label: 'Alto', color: '#ae6960' }] as const;

export default function RiskDistribution({ batch }: { batch: PredictionBatch }) {
  return <article className="chart-card"><h3>Faixas de risco da última avaliação</h3><p>Abra uma faixa para consultar os alunos que precisam de revisão.</p><div className="risk-distribution">
    {levels.map(level => <Link key={level.key} to={`/predictions/${batch.id}?risk=${level.key}`} aria-label={`${level.label}: ${batch.summary[level.key]} alunos`}>
      <div className="risk-distribution-label"><span>{level.label}</span><strong>{batch.summary[level.key]} {batch.summary[level.key] === 1 ? 'aluno' : 'alunos'} · {Math.round(batch.summary[level.key] / batch.total * 100)}%</strong></div>
      <div className="risk-distribution-track"><span style={{ width: `${batch.summary[level.key] / batch.total * 100}%`, background: level.color }} /></div>
    </Link>)}
  </div></article>;
}
