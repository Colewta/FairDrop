import { useId, useState } from 'react';
import type { FairnessReport } from '../../types/platform';
import { decimal, fairnessMetrics } from '../../services/metricEducation';
import { percent } from '../../services/format';
import MetricExplorer from '../Metrics/MetricExplorer';

const labels: Record<string, string> = {
  unavailable: 'Avaliação indisponível', low_signal: 'Baixo sinal de disparidade',
  attention: 'Diferenças ou limitações exigem atenção', relevant_disparity: 'Disparidade relevante detectada',
};

export function FairnessIndicator({ report, technical }: { report: FairnessReport; technical: boolean }) {
  const [selected, setSelected] = useState('0');
  const id = useId();
  const comparison = report.comparisons[Number(selected)] ?? report.comparisons[0];
  return <article className="summary-card" id="entender-equidade">
    <span className="section-kicker">Equidade · etapa 2</span>
    <h3>Equidade entre grupos</h3>
    <p><strong>Fairness</strong> avalia diferenças no tratamento dos grupos. Compare quem recebe alertas, os falsos alertas e os casos que ficam sem identificação. Mesmo com bons acertos no total, os erros podem se concentrar em um grupo.</p>
    <div className="metric-reading"><strong>{labels[report.status] ?? report.status}</strong><p>A classificação considera as diferenças encontradas e as limitações dos dados. Use-a para orientar a revisão; a causa de uma diferença precisa ser investigada.</p></div>
    {report.warnings.length > 0 && <details open={technical}><summary>Limitações dos dados ({report.warnings.length})</summary><ul>{report.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
    {comparison ? <>
      <label className="field-group" htmlFor={id}>Grupos de comparação
        <select id={id} value={String(report.comparisons.indexOf(comparison))} onChange={e => setSelected(e.target.value)}>
          {report.comparisons.map((item, index) => <option key={`${item.feature}:${item.group}:${item.reference}`} value={index}>{item.feature}: {item.group} × {item.reference}</option>)}
        </select>
      </label>
      <p>Grupo analisado: <strong>{comparison.group}</strong> ({comparison.group_count} registros). Referência: <strong>{comparison.reference}</strong> ({comparison.reference_count} registros). “Referência” é apenas o ponto de comparação, não um grupo considerado melhor ou mais merecedor de apoio.</p>
      <div className="table-scroll"><table className="data-table"><caption>Resultados por grupo</caption><thead><tr><th>Medida</th><th>{comparison.group}</th><th>{comparison.reference} (referência)</th></tr></thead><tbody>
        <tr><th>Receberam alerta, entre todos do grupo</th><td>{percent(comparison.group_rates?.alert_rate)}</td><td>{percent(comparison.reference_rates?.alert_rate)}</td></tr>
        <tr><th>Casos reais encontrados, entre quem teve o resultado de risco</th><td>{percent(comparison.group_rates?.recall)}</td><td>{percent(comparison.reference_rates?.recall)}</td></tr>
        <tr><th>Falsos alertas, entre quem não teve o resultado de risco</th><td>{percent(comparison.group_rates?.false_positive_rate)}</td><td>{percent(comparison.reference_rates?.false_positive_rate)}</td></tr>
      </tbody></table></div>
    </> : <p className="notice">Não há pares de grupos com dados suficientes para esta análise. Confira se os atributos de grupo foram registrados e confirmados na base. Os conceitos abaixo continuam disponíveis, mas não há resultado para interpretar.</p>}
    <MetricExplorer metrics={fairnessMetrics(comparison)} label="Medida de equidade" />
    <details><summary>Critérios e limites da avaliação</summary>
      <p>O FairDrop pede atenção para diferenças absolutas acima de 10 pontos percentuais e marca diferenças relevantes acima de 20. Para DI, usa as faixas 0,80–1,25 e 0,65–1,50, respectivamente. Estes são critérios operacionais da aplicação, não limites universais de justiça.</p>
      <p>Também pode haver atenção por limitações da amostra ou por escolha automática da referência. Taxas iguais podem esconder erros iguais em nível alto. Nenhuma medida isolada comprova ou elimina viés.</p>
      <p>Índice geral de equidade: <strong>{decimal(report.score)}</strong>. É o menor fairness score entre os pares avaliados; não é uma porcentagem de justiça. Compare os indicadores separadamente e verifique quais puderam ser calculados.</p>
      <p>{report.semantics}</p>
    </details>
    <p>Os indicadores ajudam a localizar diferenças. A redução dos vieses exige revisar os dados, o modelo e as práticas de acompanhamento. <a href="#mitigacao-modelo">Consultar opções de mitigação</a></p>
    <p className="method-sources">Referências: <a href="https://aif360.readthedocs.io/en/stable/modules/generated/aif360.metrics.ClassificationMetric.html" target="_blank" rel="noreferrer">AIF360 — métricas</a> · <a href="https://fairlearn.org/main/user_guide/assessment/common_fairness_metrics.html" target="_blank" rel="noreferrer">Fairlearn — interpretação e limites</a>.</p>
  </article>;
}
