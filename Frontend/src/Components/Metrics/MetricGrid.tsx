import type { ModelMetrics } from '../../types/model';
import { learningMetrics } from '../../services/metricEducation';

type MetricGridProps = {
  metrics: ModelMetrics;
};

export default function MetricGrid({ metrics }: MetricGridProps) {
  return (
    <div className="metric-grid">
      {learningMetrics(metrics).slice(0, 5).map(metric => <article className="metric-card tone-neutral" key={metric.key}>
        <div><span>{metric.technical}</span><strong>{metric.value}</strong></div><p>{metric.title}</p>
        <details><summary>Entender este resultado</summary><p>{metric.meaning}</p><p>{metric.reading}</p><p>{metric.importance}</p><p>{metric.limit}</p></details>
      </article>)}
    </div>
  );
}
