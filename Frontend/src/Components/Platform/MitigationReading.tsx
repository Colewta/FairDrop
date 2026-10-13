import type { MitigationReport } from '../../types/platform';
import { decimal, finite, points, testCounts } from '../../services/metricEducation';

function change(before: number | null | undefined, after: number | null | undefined) {
  if (!finite(before) || !finite(after)) return 'não pode ser comparada por falta de dados';
  const delta = after - before;
  return Math.abs(delta) < 1e-8 ? 'ficou igual' : `${delta > 0 ? 'aumentou' : 'diminuiu'} ${points(Math.abs(delta))}`;
}

export default function MitigationReading({ report }: { report: MitigationReport }) {
  const before = report.before_metrics;
  const after = report.after_metrics;
  if (!before || !after) return null;
  const beforeCounts = testCounts(before);
  const afterCounts = testCounts(after);
  return <div className="metric-reading">
    <h4>Mudanças na avaliação</h4>
    {beforeCounts && afterCounts && <p>Casos de risco que ficaram sem alerta: <strong>{beforeCounts.fn} antes → {afterCounts.fn} após reponderação</strong>. Falsos alertas: <strong>{beforeCounts.fp} antes → {afterCounts.fp} após reponderação</strong>. São registros históricos; uma mudança não demonstra efeito de uma intervenção na vida dos alunos.</p>}
    <p>A detecção dos casos reais {change(before.recall, after.recall)}; a precisão dos alertas {beforeCounts?.alerts === 0 || afterCounts?.alerts === 0 ? 'não pode ser comparada porque uma versão não emitiu alertas' : change(before.precision, after.precision)}.</p>
    {report.after_fairness?.comparisons.map(afterPair => {
      const beforePair = report.before_fairness?.comparisons.find(item => item.feature === afterPair.feature && item.group === afterPair.group && item.reference === afterPair.reference);
      const beforeDi = beforePair?.metrics.disparate_impact;
      const afterDi = afterPair.metrics.disparate_impact;
      return <div key={`${afterPair.feature}:${afterPair.group}:${afterPair.reference}`}><h4>{afterPair.feature}: {afterPair.group} × {afterPair.reference}</h4>
        {finite(beforeDi) && finite(afterDi) ? <p>A razão entre taxas de alerta (DI) passou de <strong>{decimal(beforeDi)}</strong> para <strong>{decimal(afterDi)}</strong>. {Math.abs(Math.abs(afterDi - 1) - Math.abs(beforeDi - 1)) < 1e-8 ? 'A distância de 1 ficou igual.' : Math.abs(afterDi - 1) < Math.abs(beforeDi - 1) ? 'Ficou mais próxima de 1: as taxas de alerta ficaram proporcionalmente mais parecidas.' : 'Ficou mais distante de 1: as taxas de alerta ficaram proporcionalmente menos parecidas.'} Isso não informa, sozinho, quem recebeu mais apoio ou se os erros diminuíram.</p> : <p>A mudança de DI não pode ser avaliada: falta uma razão calculável antes ou depois.</p>}
        <p>A diferença absoluta na detecção dos casos reais {change(
          finite(beforePair?.metrics.equal_opportunity_difference) ? Math.abs(beforePair!.metrics.equal_opportunity_difference!) : null,
          finite(afterPair.metrics.equal_opportunity_difference) ? Math.abs(afterPair.metrics.equal_opportunity_difference!) : null,
        )}. Confira também os falsos alertas de cada grupo na tabela abaixo.</p>
      </div>;
    })}
    {!report.after_fairness?.comparisons.length && <p>Não há comparações entre grupos suficientes para concluir se as diferenças diminuíram.</p>}
    <p><strong>Versão selecionada:</strong> {report.selected ? 'a versão reponderada foi escolhida pelo critério de validação.' : 'a versão reponderada não foi escolhida pelo critério de validação; a versão salva é a original.'} A escolha combina as medidas conforme a prioridade configurada; não significa que todas melhoraram. As colunas “após reponderação” descrevem essa variante, mesmo quando ela não foi escolhida.</p>
  </div>;
}
