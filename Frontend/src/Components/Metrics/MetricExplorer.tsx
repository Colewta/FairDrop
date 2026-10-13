import { useId, useState } from 'react';
import type { MetricExplanation } from '../../services/metricEducation';

export default function MetricExplorer({ metrics, label }: { metrics: MetricExplanation[]; label: string }) {
  const [selected, setSelected] = useState(metrics[0].key);
  const id = useId();
  const metric = metrics.find(item => item.key === selected) ?? metrics[0];
  return <div className="metric-explorer">
    <label className="field-group" htmlFor={id}>{label}
      <select id={id} value={metric.key} onChange={e => setSelected(e.target.value)}>
        {metrics.map(item => <option key={item.key} value={item.key}>{item.title} — {item.technical}</option>)}
      </select>
    </label>
    <div className="metric-lesson" aria-live="polite" aria-atomic="true">
      <div className="metric-lesson-heading"><div><h4>{metric.title}</h4><span>{metric.technical}</span></div><strong>{metric.value}</strong></div>
      <p>{metric.meaning}</p>
      <div className="metric-reading"><strong>Nesta avaliação</strong><p>{metric.reading}</p></div>
      <h4>Relevância para o acompanhamento</h4><p>{metric.importance}</p>
      <h4>Na revisão dos alunos</h4><p>{metric.action}</p>
      <details><summary>Exemplo e detalhes do cálculo</summary><p>{metric.limit}</p><p><strong>Cálculo:</strong> {metric.calculation}</p></details>
    </div>
  </div>;
}
