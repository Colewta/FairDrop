import { useState } from 'react';
import type { ModelMetrics } from '../../types/model';
import { testCounts } from '../../services/metricEducation';
import { percent } from '../../services/format';

export default function ConfusionMatrix({ metrics, outcome = 'situação acompanhada', title = 'Matriz de confusão' }: { metrics: ModelMetrics; outcome?: string; title?: string }) {
  const [normalized, setNormalized] = useState(false);
  const c = testCounts(metrics);
  return <section className="confusion-section" aria-label={title}><div className="section-heading"><h3>{title}</h3><div className="segmented" role="group" aria-label={`Unidade · ${title}`}>
    <button aria-pressed={!normalized} onClick={() => setNormalized(false)}>Registros</button><button aria-pressed={normalized} onClick={() => setNormalized(true)}>% da classe real</button>
  </div></div>{c ? <><p className="muted">Linhas: resultado conhecido. Colunas: decisão do modelo. Resultado positivo: <strong>{outcome}</strong>.</p>
    <table className="confusion-grid"><caption className="sr-only">{title}: {normalized ? 'percentuais por classe real' : 'quantidade de registros'}</caption><thead><tr><th scope="col">Real / previsto</th><th scope="col">Sem alerta</th><th scope="col">Com alerta</th></tr></thead><tbody>
      {[{ label: 'Sem a situação', values: [c.tn, c.fp], total: c.negatives, names: ['Verdadeiro negativo', 'Falso positivo'], descriptions: ['Outra situação, sem alerta', 'Alerta para quem não teve o resultado'] },
        { label: outcome, values: [c.fn, c.tp], total: c.positives, names: ['Falso negativo', 'Verdadeiro positivo'], descriptions: ['Resultado ocorrido, sem alerta', 'Resultado ocorrido e identificado'] }].map((row, i) => <tr key={i}><th scope="row">{row.label}</th>{row.values.map((v, j) => <td className={i === j ? 'matrix-hit' : 'matrix-error'} key={j}><strong>{normalized ? row.total ? percent(v / row.total) : 'Indisponível' : v.toLocaleString('pt-BR')}</strong><span>{row.names[j]}</span><small>{row.descriptions[j]}{normalized && ` · ${v} registros`}</small></td>)}</tr>)}
    </tbody></table><p className="muted">Falsos alertas podem gerar contatos desnecessários. Casos sem alerta também precisam de canais de apoio.</p></> : <p className="notice">A matriz não foi registrada em um formato binário válido. Não há células calculáveis para exibir.</p>}</section>;
}
