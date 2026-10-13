import type { ModelMetrics } from '../../types/model';
import type { Metrics } from '../../types/platform';
import { learningMetrics, testCounts } from '../../services/metricEducation';
import { percent } from '../../services/format';
import MetricExplorer from './MetricExplorer';

export default function LearningMetricsPanel({ metrics, threshold, outcome }: {
  metrics: ModelMetrics & Partial<Metrics>; threshold?: number; outcome?: string;
}) {
  const counts = testCounts(metrics);
  return <article className="summary-card" id="entender-desempenho">
    <span className="section-kicker">Desempenho · etapa 1</span>
    <h3>Desempenho do modelo</h3>
    <p>O aprendizado de máquina (ML) usa registros históricos para reconhecer padrões. Aqui, as previsões são comparadas com resultados conhecidos em dados separados do treino.</p>
    {outcome && <p>Nesta análise, chamamos de <strong>resultado de risco</strong> a situação <strong>{outcome}</strong>. “Alerta” é a previsão de que esse resultado pode ocorrer; “caso real” é um registro em que ele já foi observado.</p>}
    {counts && <div className="outcome-counts" aria-label="Acertos e erros em registros"><p><strong>{counts.tp}</strong> casos de risco com alerta</p><p><strong>{counts.fn}</strong> casos de risco sem alerta</p><p><strong>{counts.fp}</strong> falsos alertas</p><p><strong>{counts.tn}</strong> registros sem o resultado e sem alerta</p></div>}
    <MetricExplorer metrics={learningMetrics(metrics)} label="Medida de desempenho" />
    <details><summary>Probabilidades e critérios de avaliação</summary>
      <p><strong>Probabilidade:</strong> é uma estimativa, não certeza. Se previsões de 70% estiverem bem ajustadas, esperamos aproximadamente 70 ocorrências a cada 100 registros semelhantes ao longo de várias avaliações; não sabemos antecipadamente quais serão.</p>
      <p><strong>Limite de alerta (limiar):</strong> transforma a probabilidade em “alerta” ou “sem alerta”. {threshold !== undefined && <>Neste modelo, a avaliação usa alerta a partir de <strong>{percent(threshold)}</strong>. </>}Baixar esse limite aumenta ou mantém o número de alertas: pode encontrar mais casos e também gerar mais falsos alertas. As faixas baixo, médio e alto organizam a revisão e podem ter outros limites.</p>
      <p><strong>Treino, validação e teste:</strong> uma parte dos dados ensina os padrões; outra ajuda a escolher o modelo; a última verifica o resultado da escolha em exemplos separados. A pontuação de escolha usa a validação, enquanto os números desta ficha usam o teste.</p>
      <p><strong>Amostra:</strong> poucos registros tornam os resultados mais instáveis. Um bom resultado no histórico não garante o mesmo desempenho em outra turma ou período. É preciso conferir os resultados posteriores.</p>
      <p><strong>Calibração:</strong> verifica se as probabilidades combinam com as frequências observadas. Na curva do modo técnico, cada ponto reúne previsões parecidas: abaixo da linha ideal, o modelo estimou risco maior que o observado; acima, menor. A linha ideal não certifica equidade entre grupos.</p>
    </details>
    <p className="method-sources">Referência: <a href="https://scikit-learn.org/stable/modules/model_evaluation.html" target="_blank" rel="noreferrer">scikit-learn — avaliação de modelos</a>.</p>
  </article>;
}
