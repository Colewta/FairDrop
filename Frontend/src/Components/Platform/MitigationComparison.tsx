import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ModelCard } from '../../types/platform';
import { decimal, finite, learningMetrics } from '../../services/metricEducation';
import { metricChange } from '../../services/metricChanges';
import { percent } from '../../services/format';
import ConfusionMatrix from '../Metrics/ConfusionMatrix';

const measures = [
  ['recall','Casos de risco identificados','rate'], ['precision','Precisão dos alertas','rate'], ['accuracy','Acertos','rate'],
  ['f1','F1-score','rate'], ['specificity','Especificidade','rate'], ['balanced_accuracy','Acurácia balanceada','rate'],
  ['roc_auc','ROC-AUC','index'], ['pr_auc','Precisão média (AP)','index'], ['brier_score','Erro dos escores · Brier','loss'],
] as const;
const fairnessMeasures=[['disparate_impact','Razão de alertas · DI','ratio'],['statistical_parity_difference','Diferença de alertas · SPD','difference'],['equal_opportunity_difference','Diferença de detecção · EOD','difference'],['average_odds_difference','Média das diferenças · AOD','difference']] as const;

export default function MitigationComparison({ model }: { model: ModelCard }) {
  const r=model.mitigation, before=r.before_metrics, after=r.after_metrics;
  if (!before || !after) return <p className="notice">O experimento não registrou as duas avaliações necessárias para comparar antes e depois.</p>;
  const beforeLessons=learningMetrics(before), afterLessons=learningMetrics(after);
  const display=(key:string, side:'before'|'after')=>(side==='before'?beforeLessons:afterLessons).find(m=>m.key===key)?.value ?? 'Indisponível';
  const performance=measures.map(([key,label,kind])=>({key,label,before:display(key,'before'),after:display(key,'after'),change:metricChange(display(key,'before')==='Indisponível'?null:before[key],display(key,'after')==='Indisponível'?null:after[key],kind)}));
  const pairMap=new Map([...(r.before_fairness?.comparisons??[]),...(r.after_fairness?.comparisons??[])].map(p=>[JSON.stringify([p.feature,p.group,p.reference]),p]));
  const chart=measures.slice(0,4).map(([key,label])=>({label,before:display(key,'before')==='Indisponível'?null:before[key],after:display(key,'after')==='Indisponível'?null:after[key]}));
  return <section className="experiment-comparison" aria-label="Comparação antes e depois"><h4>Desempenho antes e depois</h4>
    <p className="muted">Referência sem ajuste e versão mitigada deste experimento · algoritmo: {r.algorithm??'Não registrado'}. O protocolo atual usa as mesmas divisões de dados para as duas versões. A referência pode diferir do algoritmo da análise de origem.</p>
    <div className="table-scroll"><table className="data-table comparison-table"><caption>Resultados no teste · valores maiores não significam melhoria em todas as medidas</caption><thead><tr><th>Métrica</th><th>Antes</th><th>Após mitigação</th><th>Variação</th><th>Leitura</th></tr></thead><tbody>{performance.map(row=><tr key={row.key}><th scope="row">{row.label}</th><td>{row.before}</td><td>{row.after}</td><td>{row.change.delta}</td><td>{row.change.reading}</td></tr>)}</tbody></table></div>
    <details><summary>Comparação visual e matrizes de confusão</summary><ResponsiveContainer width="100%" height={250}><BarChart data={chart} layout="vertical"><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" domain={[0,1]} tickFormatter={v=>`${Math.round(v*100)}%`}/><YAxis type="category" dataKey="label" width={115} tick={{fontSize:11}}/><Tooltip formatter={v=>percent(v==null?null:Number(v))}/><Legend/><Bar dataKey="before" name="Referência sem ajuste" fill="var(--chart-secondary)" isAnimationActive={false}/><Bar dataKey="after" name="Versão mitigada" fill="var(--chart-primary)" isAnimationActive={false}/></BarChart></ResponsiveContainer><div className="analytics-split"><ConfusionMatrix metrics={before} outcome={model.positive_class} title="Antes · matriz de confusão"/><ConfusionMatrix metrics={after} outcome={model.positive_class} title="Depois · matriz de confusão"/></div></details>
    <h4>Equidade antes e depois</h4>{pairMap.size?[...pairMap.values()].map(pair=>{
      const match=(p:typeof pair)=>p.feature===pair.feature&&p.group===pair.group&&p.reference===pair.reference;
      const a=r.before_fairness?.comparisons.find(match),b=r.after_fairness?.comparisons.find(match);
      return <div key={JSON.stringify([pair.feature,pair.group,pair.reference])}><h5>{pair.feature}: {pair.group} × {pair.reference} (referência)</h5>{(!a||!b)&&<p className="notice">Este par está ausente em uma das avaliações; a variação fica indisponível.</p>}{a&&b&&(a.group_count!==b.group_count||a.reference_count!==b.reference_count)&&<p className="notice">Os tamanhos dos grupos diferem entre as avaliações. A comparação exige revisão da amostra.</p>}
        <div className="table-scroll"><table className="data-table comparison-table"><thead><tr><th>Medida</th><th>Antes</th><th>Depois</th><th>Variação</th><th>Distância da referência</th></tr></thead><tbody>{fairnessMeasures.map(([key,label,kind])=>{
          const change=metricChange(a?.metrics[key],b?.metrics[key],kind);
          return <tr key={key}><th scope="row">{label}</th><td>{decimal(a?.metrics[key])}</td><td>{decimal(b?.metrics[key])}</td><td>{change.delta}</td><td>{change.reading}</td></tr>;
        })}</tbody></table></div><p className="muted">Amostras antes/depois: {a?.group_count??'—'}/{b?.group_count??'—'} no grupo e {a?.reference_count??'—'}/{b?.reference_count??'—'} na referência. {finite(a?.metrics.average_odds_difference)&&finite(b?.metrics.average_odds_difference)&&'A média AOD pode ocultar diferenças de sinais opostos.'}</p></div>;
    }):<p className="notice">Não há pares registrados para comparar equidade. Isso não equivale a ausência de disparidades.</p>}
    <p className="context-note">Versão salva: <strong>{r.selected?'mitigada':'referência sem ajuste'}</strong>. Aproximar uma métrica de 0 ou 1 não garante menos erros nem elimina todos os vieses. Compare as consequências de falsos alertas e casos sem alerta. Após testar várias técnicas no mesmo histórico, valide a escolhida em outro período.</p>
  </section>;
}
