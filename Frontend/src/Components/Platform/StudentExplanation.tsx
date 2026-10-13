import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Explanation, Factor, ScenarioResult } from '../../types/platform';
import { api, getApiErrorMessage } from '../../services/api';
import { percent } from '../../services/format';
import { ErrorNotice } from './Common';

function ScenarioForm({ studentId, factor }: { studentId: string; factor: Factor }) {
  const [value, setValue] = useState(String(factor.value ?? factor.reference_min ?? 0).replace(',', '.'));
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function simulate(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setResult(null);
    try { setResult((await api.post<ScenarioResult>(`/students/${studentId}/scenario`, { feature: factor.feature, value: Number(value) })).data); }
    catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); }
  }
  return <form className="scenario-form" onSubmit={simulate}><h4>Simular outro valor</h4><p>Altere o indicador para ver como o modelo responde. A simulação não prevê o efeito real de uma ação de apoio.</p><label className="field-group">Valor simulado para {factor.feature}<input type="number" step="any" required min={factor.reference_min ?? undefined} max={factor.reference_max ?? undefined} value={value} onChange={e => { setValue(e.target.value); setResult(null); }} /></label><small>Faixa histórica: {factor.reference_min} a {factor.reference_max}. As outras informações ficam fixas.</small><button className="primary-button" disabled={busy}>{busy ? 'Simulando…' : 'Simular cenário'}</button><ErrorNotice message={error} />{result && <div className="scenario-result" role="status"><strong>Previsão original: {percent(result.original_probability)} → cenário: {percent(result.simulated_probability)}</strong><p>Diferença: {(result.difference * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2, signDisplay: 'always' })} pontos percentuais.</p><p>{result.message}</p></div>}</form>;
}

export default function StudentExplanation({ studentId, explanation, technical }: { studentId: string; explanation: Explanation; technical: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return <article className="summary-card"><h3>Como o modelo chegou a esta previsão</h3><p>Referência do modelo: <strong>{percent(explanation.base_value)}</strong>. Estimativa para este aluno: <strong>{percent(explanation.probability)}</strong>. A estimativa parte da referência e considera a contribuição de cada informação. As contribuições se somam; cada uma não representa uma probabilidade separada.</p><p>{explanation.message}</p>{explanation.reference_rows && <p>SHAP usa uma amostra de {explanation.reference_rows} exemplos para esta aproximação. As comparações históricas abaixo usam a referência indicada em cada fator.</p>}<h4>Fatores que contribuíram para a previsão</h4>
    {explanation.status === 'available' && <ul className="factor-list contextual-factors">{explanation.factors.slice(0, technical ? 30 : 5).map(factor => <li key={factor.feature}><div className="factor-heading"><strong>{factor.feature}</strong><span className={factor.direction === 'increase' ? 'critical-text' : 'positive-text'}>{factor.direction === 'increase' ? '↑ +' : '↓ −'}{(Math.abs(factor.impact) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} p.p.</span></div><p>{factor.interpretation}</p><div className="factor-evidence"><strong>Comparação com o histórico</strong><p>{factor.historical_context}</p></div><details><summary>Pontos para conversar com o aluno</summary><ol>{factor.tutor_actions?.map(action => <li key={action}>{action}</li>)}</ol><p className="notice"><strong>Na revisão dos vieses:</strong> {factor.bias_caution}</p><p>Use estes pontos para orientar a conversa. O contexto do aluno precisa ser confirmado com ele.</p></details>{factor.scenario_allowed && <><button type="button" onClick={() => setExpanded(expanded === factor.feature ? null : factor.feature)}>{expanded === factor.feature ? 'Fechar simulação' : 'Simular outro valor'}</button>{expanded === factor.feature && <ScenarioForm key={factor.feature} studentId={studentId} factor={factor} />}</>}</li>)}</ul>}
    {!technical && explanation.factors.length > 5 && <p>Estão listadas as cinco maiores contribuições. As demais também entram no cálculo e aparecem no modo técnico.</p>}
    <details><summary>Sobre a explicação e seus limites</summary><p>SHAP compara o registro com exemplos de referência. As taxas históricas são descritivas e podem diferir do efeito individual: correlações, interações e amostragem influenciam os resultados. Não é possível concluir, só com estes dados, por que uma pessoa evadiu ou se uma ação fará seu risco cair.</p><a href="https://shap.readthedocs.io/en/latest/example_notebooks/overviews/Be%20careful%20when%20interpreting%20predictive%20models%20in%20search%20of%20causal%20insights.html" target="_blank" rel="noreferrer">Referência: limites causais de SHAP</a></details>
  </article>;
}
