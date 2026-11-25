import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FairnessReport } from '../../types/platform';
import { decimal, fairnessMetrics } from '../../services/metricEducation';
import { percent } from '../../services/format';
import MetricExplorer from '../Metrics/MetricExplorer';

const labels: Record<string, string> = {
  unavailable: 'Avaliação indisponível', low_signal: 'As diferenças calculadas ficaram nas faixas de menor atenção',
  attention: 'Confira as diferenças e os dados disponíveis', relevant_disparity: 'Há diferenças grandes entre os grupos',
};

export function FairnessIndicator({ report, technical }: { report: FairnessReport; technical: boolean }) {
  const [selected, setSelected] = useState('0');
  const id = useId();
  const comparison = report.comparisons[Number(selected)] ?? report.comparisons[0];
  return <article className="summary-card" id="entender-equidade">
    <span className="section-kicker">Equidade · etapa 2</span>
    <h3>Equidade entre grupos</h3>
    <p><strong>Fairness</strong> é o nome usado para estudar a equidade nas previsões. A pergunta aqui é: o sistema acerta e erra de maneira parecida entre os grupos? Por exemplo, pode acertar bastante no total e deixar passar mais casos de alunos do noturno. Esses alunos podem ficar sem atenção se a escola olhar só os alertas.</p>
    <div className="metric-reading"><strong>{labels[report.status] ?? report.status}</strong><p>Este aviso considera os números abaixo e a quantidade de dados disponível. Ele indica o que merece ser conferido; não explica sozinho por que a diferença existe.</p></div>
    {report.warnings.length > 0 && <details open={technical}><summary>Limitações dos dados ({report.warnings.length})</summary><ul>{report.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
    {comparison ? <>
      <label className="field-group" htmlFor={id}>Grupos de comparação
        <select id={id} value={String(report.comparisons.indexOf(comparison))} onChange={e => setSelected(e.target.value)}>
          {report.comparisons.map((item, index) => <option key={`${item.feature}:${item.group}:${item.reference}`} value={index}>{item.feature}: {item.group} × {item.reference}</option>)}
        </select>
      </label>
      <p>Grupo analisado: <strong>{comparison.group}</strong> ({comparison.group_count} registros). Referência: <strong>{comparison.reference}</strong> ({comparison.reference_count} registros). Chamamos o segundo grupo de referência porque ele é o ponto de partida da conta. Se compararmos noturno com diurno, por exemplo, as medidas dirão quanto o noturno difere do diurno. Isso não torna um grupo melhor que o outro.</p>
      <div className="table-scroll"><table className="data-table"><caption>Resultados por grupo</caption><thead><tr><th>Medida</th><th>{comparison.group}</th><th>{comparison.reference} (referência)</th></tr></thead><tbody>
        <tr><th>Receberam alerta, entre todos do grupo</th><td>{percent(comparison.group_rates?.alert_rate)}</td><td>{percent(comparison.reference_rates?.alert_rate)}</td></tr>
        <tr><th>Casos reais encontrados, entre quem teve o resultado de risco</th><td>{percent(comparison.group_rates?.recall)}</td><td>{percent(comparison.reference_rates?.recall)}</td></tr>
        <tr><th>Falsos alertas, entre quem não teve o resultado de risco</th><td>{percent(comparison.group_rates?.false_positive_rate)}</td><td>{percent(comparison.reference_rates?.false_positive_rate)}</td></tr>
      </tbody></table></div>
    </> : <p className="notice">Não há pares de grupos com dados suficientes para esta análise. A planilha precisa ter uma coluna que identifique os grupos, como turno ou gênero, e exemplos suficientes de cada um. Confira os grupos em “Preparar um experimento”, na parte de mitigação. As explicações abaixo continuam disponíveis, mas ainda não há números para comparar.</p>}
    <MetricExplorer metrics={fairnessMetrics(comparison)} label="Medida de equidade" />
    <details><summary>Critérios e limites da avaliação</summary>
      <p>O FairDrop usa marcas de atenção para destacar os números. Nas medidas em pontos percentuais, diferenças acima de 10 pedem atenção; acima de 20 são destacadas como grandes. Dez pontos percentuais são, por exemplo, a distância entre 30% e 40%. Para DI, as faixas de atenção são 0,80–1,25 e 0,65–1,50. São escolhas da aplicação para orientar a leitura, não regras que determinam o que é justo.</p>
      <p>O aviso também pode aparecer por haver poucos exemplos ou por o grupo de referência ter sido escolhido automaticamente. Confira os erros: dois grupos podem ter taxas iguais porque o sistema erra muito com ambos.</p>
      <p>Índice geral de equidade: <strong>{decimal(report.score)}</strong>. É um resumo interno: mostra o menor índice entre as comparações disponíveis. Um valor de 0,8 não significa “80% de justiça”. Para decidir o que precisa melhorar, leia cada medida e veja os erros dos grupos.</p>
      <p>{report.semantics}</p>
    </details>
    <p>Esses números mostram onde há diferenças. Na etapa seguinte, você pode testar ajustes e conferir se elas diminuem. Também vale revisar a planilha e a forma de oferecer apoio aos alunos. <Link to="?section=mitigation">Consultar opções de mitigação</Link></p>
    <p className="method-sources">Referências: <a href="https://aif360.readthedocs.io/en/stable/modules/generated/aif360.metrics.ClassificationMetric.html" target="_blank" rel="noreferrer">AIF360 — métricas</a> · <a href="https://fairlearn.org/main/user_guide/assessment/common_fairness_metrics.html" target="_blank" rel="noreferrer">Fairlearn — interpretação e limites</a>.</p>
  </article>;
}
