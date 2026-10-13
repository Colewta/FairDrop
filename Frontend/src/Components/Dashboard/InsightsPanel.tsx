import type { FairnessMetrics, TrainingResult } from '../../types/model';
import { learningMetrics } from '../../services/metricEducation';

type InsightsPanelProps = {
  result: TrainingResult;
};

type Insight = {
  title: string;
  text: string;
  tone: 'good' | 'warning' | 'danger' | 'neutral';
};

function getFairnessAlerts(fairness: FairnessMetrics) {
  const alerts: string[] = [];

  if (fairness.statistical_parity_difference !== null && Math.abs(fairness.statistical_parity_difference) > 0.2) {
    alerts.push('As taxas de alerta diferem em mais de 20 pontos percentuais. Confira também os erros por grupo e a qualidade dos registros.');
  }

  if (fairness.equal_opportunity_difference !== null && Math.abs(fairness.equal_opportunity_difference) > 0.2) {
    alerts.push('A detecção dos casos reais difere entre grupos. Um deles pode ter mais necessidades sem identificação; isso não demonstra a causa da diferença.');
  }

  if (fairness.average_odds_difference !== null && Math.abs(fairness.average_odds_difference) > 0.2) {
    alerts.push('A média das diferenças de detecção e falsos alertas pede investigação. Confira os dois componentes separadamente.');
  }

  if (fairness.disparate_impact !== null && (fairness.disparate_impact < 0.8 || fairness.disparate_impact > 1.25)) {
    alerts.push('A razão entre taxas de alerta saiu da faixa operacional de 0,80 a 1,25. Esse corte pede revisão e não é um limite universal de justiça.');
  }

  return alerts;
}

function buildInsights(result: TrainingResult): Insight[] {
  const insights: Insight[] = [];
  const { metricas, fairness, feature_importance, comparativo_modelos } = result;
  const fairnessAlerts = getFairnessAlerts(fairness);

  if (
    comparativo_modelos.melhor_acuracia
    && comparativo_modelos.melhor_fairness
    && comparativo_modelos.melhor_acuracia.tipo !== comparativo_modelos.melhor_fairness.tipo
  ) {
    insights.push({
      title: 'Acertos e diferenças entre grupos',
      text: `${comparativo_modelos.melhor_acuracia.nome} teve a maior acurácia, enquanto ${comparativo_modelos.melhor_fairness.nome} teve o melhor fairness score.`,
      tone: 'warning',
    });
  } else if (comparativo_modelos.melhor_equilibrio) {
    insights.push({
      title: 'Melhor equilíbrio geral',
      text: `${comparativo_modelos.melhor_equilibrio.nome} obteve a maior pontuação de equilíbrio entre desempenho e o índice de equidade nesta base. Isso não garante melhora de todas as medidas.`,
      tone: 'good',
    });
  }

  insights.push({ title: 'Casos encontrados e casos sem alerta', text: learningMetrics(metricas)[0].reading, tone: 'neutral' });

  if (fairnessAlerts.length > 0) {
    insights.push({
      title: 'Diferenças entre grupos pedem investigação',
      text: fairnessAlerts[0],
      tone: 'danger',
    });
  } else {
    insights.push({
      title: 'Leitura das medidas disponíveis',
      text: 'Não foram sinalizadas diferenças acima dos cortes usados neste resumo. Verifique quais métricas puderam ser calculadas e o tamanho dos grupos; isso não comprova ausência de viés.',
      tone: 'neutral',
    });
  }

  const topFeature = Object.entries(feature_importance).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];

  if (topFeature) {
    insights.push({
      title: 'Variável dominante',
      text: `${topFeature[0]} aparece como a variável mais influente do modelo principal exibido no painel.`,
      tone: 'neutral',
    });
  }

  return insights;
}

export default function InsightsPanel({ result }: InsightsPanelProps) {
  const insights = buildInsights(result);

  return (
    <article className="summary-card insight-card">
      <div className="card-heading">
        <span className="section-kicker">Resultados da análise</span>
        <h3>Pontos para revisão</h3>
      </div>

      <div className="insight-list">
        {insights.map((insight) => (
          <div className={`insight-item tone-${insight.tone}`} key={insight.title}>
            <strong>{insight.title}</strong>
            <p>{insight.text}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
