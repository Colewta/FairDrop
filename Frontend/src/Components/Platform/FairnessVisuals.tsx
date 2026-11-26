import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FairnessReport } from '../../types/platform';
import type { FairnessComparison } from '../../services/metricEducation';
import { decimal, fairnessMetrics, finite } from '../../services/metricEducation';
import { percent } from '../../services/format';

export function FairnessSummary({ report, technical = false }: { report: FairnessReport; technical?: boolean }) {
  const pair = report.comparisons[0];
  const status=report.status==='relevant_disparity'?'Há diferenças relevantes pelos critérios internos.':report.status==='attention'?'Há diferenças ou limitações a conferir.':'Sem diferenças grandes nas medidas disponíveis; confira também a cobertura.';
  return <section className="fairness-summary" aria-label="Resumo de equidade"><h3>Equidade entre grupos</h3>{pair ? <><p className={report.status==='relevant_disparity'?'notice':'muted'}>{report.comparisons.length} {report.comparisons.length===1?'par avaliado':'pares avaliados'}. {status}</p><p className="muted">{pair.feature}: {pair.group} × {pair.reference} (referência). Primeiro par disponível; confira os demais na aba Equidade.</p><FairnessMetrics pair={pair} technical={technical}/></> : <p className="notice">Equidade indisponível. {report.warnings[0] ?? 'Nenhum par com dados suficientes foi registrado. Confira os atributos e os grupos na aba Equidade.'}</p>}<p className="muted">Diferenças observadas orientam a investigação. Não certificam justiça nem comprovam discriminação causal.</p></section>;
}

export function FairnessMetrics({ pair, technical = false }: { pair?: FairnessComparison; technical?: boolean }) {
  return <div className="fairness-metrics">{fairnessMetrics(pair).filter(m=>m.key !== 'fairness_score').map(m=><div className="analytic-metric" data-metric={m.key} key={m.key}><span>{technical?m.technical:m.title}</span>{!technical&&<small>{m.technical}</small>}<strong>{m.value}</strong><small>{m.key === 'disparate_impact' ? 'Razão · referência: 1' : 'Diferença · referência: 0'}</small><details><summary>Entender a medida</summary><p>{m.meaning}</p><p>{m.reading}</p><p>{m.limit}</p></details></div>)}</div>;
}

export function GroupRateChart({ pair }: { pair: FairnessComparison }) {
  const data = [{ label: 'Receberam alerta', key: 'alert_rate' },{ label:'Casos identificados',key:'recall' },{label:'Falsos alertas',key:'false_positive_rate'},{label:'Casos sem alerta',key:'false_negative_rate'}].map(item=>({
    label:item.label,group:finite(pair.group_rates[item.key])?pair.group_rates[item.key]:null,reference:finite(pair.reference_rates[item.key])?pair.reference_rates[item.key]:null,
  }));
  return <section className="chart-card"><h3>Alertas e erros por grupo</h3><ResponsiveContainer width="100%" height={240}><BarChart data={data} layout="vertical" margin={{right:16}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" domain={[0,1]} tickFormatter={v=>`${Math.round(v*100)}%`}/><YAxis dataKey="label" type="category" width={115} tick={{fontSize:11}}/><Tooltip formatter={v=>percent(v==null?null:Number(v))}/><Legend/><Bar dataKey="group" name={pair.group} fill="var(--chart-primary)" isAnimationActive={false}/><Bar dataKey="reference" name={`${pair.reference} · referência`} fill="var(--chart-secondary)" isAnimationActive={false}/></BarChart></ResponsiveContainer><p className="muted">A escala é a mesma (0–100%). Uma taxa indisponível não é desenhada como zero. Cada erro usa sua própria quantidade de casos reais como denominador.</p></section>;
}

export function FairnessDifferenceChart({ pair }: { pair: FairnessComparison }) {
  const values=[['SPD','statistical_parity_difference'],['EOD','equal_opportunity_difference'],['AOD','average_odds_difference']].map(([label,key])=>({label,value:finite(pair.metrics[key])?pair.metrics[key]:null}));
  const extent=Math.min(1,Math.max(.1,...values.map(v=>finite(v.value)?Math.abs(v.value):0))*1.2);
  const di=pair.metrics.disparate_impact, max=finite(di)?Math.max(2,di*1.15):2;
  return <div className="fairness-chart-grid"><section className="chart-card"><h3>Diferenças em relação à referência</h3><ResponsiveContainer width="100%" height={190}><BarChart data={values} layout="vertical"><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" domain={[-extent,extent]} tickFormatter={v=>`${Math.round(v*100)} p.p.`}/><YAxis dataKey="label" type="category" width={40}/><ReferenceLine x={0} stroke="var(--text-main)"/><Tooltip formatter={v=>`${decimal(Number(v)*100,1)} p.p.`}/><Bar dataKey="value" name="Grupo − referência" fill="var(--chart-secondary)" isAnimationActive={false}/></BarChart></ResponsiveContainer><p className="muted">Escala simétrica em torno de zero, com extremos de {decimal(extent*100,1)} p.p. Zero indica ausência de diferença nesta medida. A média AOD pode esconder diferenças que se cancelam.</p></section>
    <section className="chart-card"><h3>Razão entre taxas de alerta · DI</h3>{finite(di)?<><svg className="ratio-chart" viewBox="0 0 360 105" role="img" aria-label={`Disparate Impact ${decimal(di)}. Referência: 1. Escala de 0 a ${decimal(max,1)}.`}><line x1="20" y1="50" x2="340" y2="50" stroke="var(--line-strong)"/><line x1={20+320/max} y1="20" x2={20+320/max} y2="70" stroke="var(--text-muted)" strokeDasharray="4 4"/><circle cx={20+320*di/max} cy="50" r="7" fill="var(--chart-primary)"/><text x="20" y="94">0</text><text x={20+320/max} y="15" textAnchor="middle">1 · referência</text><text x="340" y="94" textAnchor="end">{decimal(max,1)}</text></svg><p>DI: <strong>{decimal(di)}</strong></p></>:<p className="notice">Razão indisponível; confira se a referência recebeu algum alerta.</p>}<p className="muted">DI é uma razão, em escala própria. Valores acima de 1 indicam mais alertas proporcionalmente no grupo analisado; abaixo de 1, menos.</p></section></div>;
}
