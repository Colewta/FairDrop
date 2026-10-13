import type { FairnessMetrics } from '../../types/model';
import { decimal, fairnessMetrics } from '../../services/metricEducation';
import MetricExplorer from '../Metrics/MetricExplorer';

type FairnessSectionProps = {
  fairness: FairnessMetrics;
  groups?: Record<string, number> | null;
};

export default function FairnessSection({ fairness, groups }: FairnessSectionProps) {
  const names = (code: number) => Object.entries(groups ?? {}).filter(([, value]) => value === code).map(([name]) => name).join(' / ');
  const comparison = {
    feature: '', group: names(0) || 'grupo analisado', reference: names(1) || 'grupo de referência',
    group_count: 0, reference_count: 0, group_rates: {}, reference_rates: {},
    metrics: { ...fairness, fairness_score: fairness.fairness_score ?? null }, status: '', explanation: '',
  };
  return <article className="chart-card fairness-card">
    <div className="card-heading"><span className="section-kicker">Fairness · equidade</span><h3>Diferenças entre grupos</h3></div>
    <p>Estas medidas investigam se a distribuição dos alertas e dos erros difere entre grupos. Aqui, um resultado positivo significa alerta para a situação de risco, não um benefício garantido.</p>
    <p>Grupo analisado: <strong>{comparison.group}</strong>. Referência: <strong>{comparison.reference}</strong>. Referência é o ponto de comparação, não uma afirmação de privilégio social.</p>
    <div className="fairness-score-banner"><span>Índice interno de equidade (0 a 1)</span><strong>{decimal(fairness.fairness_score)}</strong></div>
    <p>O índice resume as métricas disponíveis. Não representa uma porcentagem de justiça. Valores ausentes não comprovam ausência de diferenças.</p>
    <MetricExplorer metrics={fairnessMetrics(comparison)} label="Medida de equidade" />
    <p>Uma diferença indica onde investigar os dados, os erros e o acesso ao apoio. Calcular as métricas não altera a base nem elimina o viés.</p>
    <p className="method-sources">Definições: <a href="https://aif360.readthedocs.io/en/stable/modules/generated/aif360.metrics.ClassificationMetric.html" target="_blank" rel="noreferrer">AIF360 — métricas de equidade</a>.</p>
  </article>;
}
