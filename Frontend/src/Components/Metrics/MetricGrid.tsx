import type { ModelMetrics } from '../../types/model';
import type { Metrics } from '../../types/platform';
import { learningMetrics } from '../../services/metricEducation';

export default function MetricGrid({ metrics, technical = false, compact = false }: { metrics: ModelMetrics & Partial<Metrics>; technical?: boolean; compact?: boolean }) {
  const lessons = learningMetrics(metrics).filter(m => m.key !== 'brier_score');
  return <div className="analytic-metrics" aria-label="Indicadores de desempenho">{(compact ? lessons.slice(0, 4) : lessons).map(m =>
    <div className="analytic-metric" key={m.key} data-metric={m.key}><span>{technical ? m.technical : m.title}</span><strong>{m.value}</strong>
      <details><summary aria-label={`Entender ${m.technical}`}>Entender</summary><p>{m.meaning}</p><p>{m.reading}</p><p>{m.importance}</p><p>{m.limit}</p>{technical && <p>{m.calculation}</p>}</details>
    </div>)}</div>;
}
