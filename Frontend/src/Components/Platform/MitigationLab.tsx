import { useState } from 'react';
import type { MitigationMethod, MitigationOptions, ModelCard, TrainingConfig, TrainingRun } from '../../types/platform';
import { api, getApiErrorMessage } from '../../services/api';
import { useResource } from '../../services/platformApi';
import { useSessionDraft } from '../../services/useSessionDraft';
import MitigationComparison from './MitigationComparison';
import { ErrorNotice, Loading } from './Common';
import { GroupErrorTable } from './GroupErrorTable';
import TrainingProgress from './TrainingProgress';
import TaskProgress from './TaskProgress';
import MitigationGuide from './MitigationGuide';
import MitigationReading from './MitigationReading';

const descriptions: Record<MitigationMethod, { how: string; limit: string }> = {
  reweighing: { how: 'Faz alguns exemplos contarem mais e outros menos quando o sistema aprende. A ideia é reduzir diferenças ligadas ao grupo do aluno. As notas, faltas e situações registradas continuam as mesmas.', limit: 'Cada grupo precisa ter exemplos com e sem a situação acompanhada. Um dos métodos de previsão, chamado KNN, não aceita esse ajuste.' },
  resampling: { how: 'Muda quais exemplos o sistema usa para aprender: alguns registros são repetidos e outros ficam de fora. O sorteio considera o grupo e o resultado, mantendo o total de exemplos.', limit: 'As cópias são usadas só no aprendizado. Repetir muito os mesmos exemplos pode fazer o sistema decorar o histórico e errar com outros alunos.' },
  lfr: { how: 'Cria uma nova forma de representar as informações da planilha. Procura manter o que ajuda na previsão e reduzir as pistas sobre o grupo ao qual o aluno pertence.', limit: 'Esta técnica, chamada LFR, compara dois grupos. Ao transformar as informações, pode perder detalhes úteis; outras pistas sobre o grupo também podem continuar presentes.' },
  adversarial: { how: 'Coloca dois sistemas para aprender juntos: um tenta prever a situação do aluno; o outro tenta descobrir o grupo a partir dessa previsão. O primeiro é ajustado para dificultar a tarefa do segundo.', limit: 'É uma versão experimental feita no FairDrop, com regressão logística como método de previsão. Pode funcionar mal em algumas bases. Veja se os erros diminuíram, além de comparar os grupos.' },
  constraints: { how: 'Compara opções de previsão tentando atender ao objetivo que você escolheu: aproximar a frequência dos alertas ou os erros entre grupos.', limit: 'Usa a busca GridSearch, do Fairlearn, com regressão logística. Como testa um número limitado de opções, pode não alcançar o objetivo, principalmente com novos alunos.' },
  regularization: { how: 'Durante o aprendizado, dá um custo extra às diferenças entre as probabilidades médias dos grupos. Assim, o sistema tenta reduzir essas diferenças enquanto aprende a prever o resultado.', limit: 'É uma versão experimental feita no FairDrop com regressão logística. Médias parecidas ainda podem esconder diferenças nos alertas; confira os erros de cada grupo.' },
};
export default function MitigationLab({ model }: { model: ModelCard }) {
  const [feature, setFeature] = useSessionDraft(`mitigation:${model.id}:feature`, model.sensitive_features[0] ?? '');
  const [method, setMethod] = useSessionDraft<MitigationMethod>(`mitigation:${model.id}:method`, model.mitigation.method in descriptions ? model.mitigation.method as MitigationMethod : 'reweighing');
  const [strength, setStrength] = useSessionDraft(`mitigation:${model.id}:strength`, .5);
  const [constraint, setConstraint] = useSessionDraft<'demographic_parity' | 'equalized_odds'>(`mitigation:${model.id}:constraint`, 'demographic_parity');
  const [apply, setApply] = useSessionDraft(`mitigation:${model.id}:apply`, false);
  const [strategy, setStrategy] = useSessionDraft<TrainingConfig['strategy']>(`mitigation:${model.id}:strategy`, 'best_balanced');
  const [runId, setRunId] = useSessionDraft<string | null>(`mitigation:${model.id}:runId`, null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const options = useResource<MitigationOptions>(`/models/${model.id}/mitigation-options?constraint=${constraint}`);
  const group = options.data?.groups.find(g => g.column === feature);
  const eligibility = group?.eligibility[method];
  const [autoNavigate, setAutoNavigate] = useState(false);
  const [runStatus, setRunStatus] = useState<TrainingRun['status']>('queued');
  const report = model.mitigation;
  async function compare() {
    setBusy(true); setError(null);
    try { const result = await api.post<TrainingRun>(`/models/${model.id}/mitigate`, { feature, method, strength, constraint, apply, strategy }); setAutoNavigate(true); setRunStatus('queued'); setRunId(result.data.id); }
    catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); }
  }
  function download() {
    const blob = new Blob([JSON.stringify({ model_id: model.id, name: model.name, dataset: model.dataset_name, target: model.target, positive_class: model.positive_class, split: model.split, config: model.config, experiment: report, candidates: model.comparison, warnings: model.warnings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `fairdrop-experimento-${model.id}.json`; a.click(); URL.revokeObjectURL(url);
  }
  return <article className="summary-card mitigation-panel" id="mitigacao-modelo">
    <span className="section-kicker">Mitigação · experimentos</span><h3>Mitigação de vieses</h3>
    <p>Escolha os grupos e uma técnica para comparar o resultado antes e depois. Cada experimento salva uma nova análise; a atual é preservada.</p>
    <p>O resultado acompanhado é <strong>{model.positive_class}</strong>. Compare tanto os falsos alertas quanto os casos que passaram sem aviso. Um ajuste pode melhorar uma dessas medidas e piorar outra.</p>
    {report.method !== 'none' && <section className="mitigation-result" aria-label="Resultado da mitigação"><h4>Resultado do experimento</h4><p><strong>{report.implementation ?? report.method}</strong></p><p>{report.message}</p>
      <details><summary>Entender as mudanças na avaliação</summary><MitigationReading report={report} /></details>
      <MitigationComparison model={model}/>
      <details><summary>Erros por grupo antes e depois</summary><h4>Antes</h4>{report.before_fairness&&<GroupErrorTable report={report.before_fairness}/>}<h4>Depois</h4>{report.after_fairness&&<GroupErrorTable report={report.after_fairness}/>}</details>
      {report.warnings.map(warning => <p className="notice" key={warning}>{warning}</p>)}
      <details><summary>Registro dos ajustes no treino</summary><p>Estes são os detalhes de como o teste foi feito. A reamostragem muda os exemplos usados para aprender; a reponderação muda quanto cada um conta; LFR transforma as informações; as outras técnicas mudam a forma de aprender. A sua planilha original não é editada.</p><pre className="code-panel">{JSON.stringify({ implementation: report.implementation, parameters: report.parameters, audit: report.audit, weights: report.weight_summary }, null, 2)}</pre></details>
      <button type="button" onClick={download}>Baixar registro do experimento</button>
    </section>}
    <details className="experiment-setup" open={report.method==='none'||!!runId}><summary><h4>Preparar um experimento</h4></summary><section className="mitigation-workbench"><ErrorNotice message={options.error} />{options.loading && <Loading />}
      <label className="field-group">Comparar quais grupos?<select value={feature} onChange={e => setFeature(e.target.value)} disabled={!!runId || busy}><option value="">Escolher coluna da base</option>{options.data?.groups.map(g => <option key={g.column} value={g.column}>{g.column}{g.suggested ? ' · atributo sugerido' : ''}</option>)}</select></label>
      <details className="context-help"><summary>Como escolher os grupos?</summary><p>Escolha uma coluna que separe os alunos em grupos que façam sentido para a pergunta. Por exemplo, “turno” permite comparar diurno e noturno. Só é possível investigar diferenças por raça ou gênero se essas informações estiverem na base. Neste teste, a coluna escolhida serve para comparar e ajustar o aprendizado, mas não entra como pista para prever o resultado.</p></details>
      {group?.audit.cells_before && <details><summary>Ver quantos exemplos de cada grupo serão usados para aprender</summary><div className="table-scroll"><table className="data-table"><thead><tr><th>Grupo</th><th>Demais resultados</th><th>{model.positive_class}</th></tr></thead><tbody>{group.audit.cells_before.map(c => <tr key={c.group}><th>{c.group}</th><td>{c.negative}</td><td>{c.positive}</td></tr>)}</tbody></table></div></details>}
      <div className="mitigation-selector"><div className="technique-options">{[['pre','Pré-processamento'],['in','Durante o treinamento']].map(([stage,label])=><fieldset key={stage}><legend>{label}</legend>{options.data?.methods.filter(item=>stage==='pre'?item.stage==='pre':item.stage!=='pre').map(item=>{
        const allowed=group?.eligibility[item.id];
        return <label className={`technique-option ${method===item.id?'selected':''}`} key={item.id}><input type="radio" name={`method-${model.id}`} aria-label={item.name} value={item.id} checked={method===item.id} disabled={busy||!!runId} onChange={()=>{setMethod(item.id);if(['reweighing','resampling','lfr'].includes(item.id))setConstraint('demographic_parity');}}/><span><strong>{item.name}</strong><small>{allowed?.available?'Disponível':allowed?.reason??'Escolha os grupos para conferir os requisitos.'}</small></span></label>;
      })}</fieldset>)}</div><section className="technique-context" aria-label="Técnica selecionada"><h4>{options.data?.methods.find(item=>item.id===method)?.name??'Técnica selecionada'}</h4>{['adversarial','regularization'].includes(method)&&<p className="notice">Implementação experimental do FairDrop</p>}<p>{descriptions[method].how}</p><p className="muted">{descriptions[method].limit}</p><small>{options.data?.methods.find(item=>item.id===method)?.implementation}</small><p className={eligibility?.available?'positive-text':'critical-text'}>{eligibility?.available?'Os grupos selecionados atendem aos requisitos.':eligibility?.reason??'Selecione os grupos para verificar a compatibilidade.'}</p></section></div>
      <div className="field-grid">{['adversarial', 'constraints', 'regularization'].includes(method) && <label className="field-group">Objetivo entre os grupos<select value={constraint} onChange={e => setConstraint(e.target.value as typeof constraint)} disabled={busy || !!runId}><option value="demographic_parity">Aproximar a proporção de alertas — paridade demográfica</option><option value="equalized_odds">Aproximar os acertos e falsos alertas — equalized odds</option></select></label>}
        {method !== 'reweighing' && <label className="field-group">Intensidade da técnica: {strength.toFixed(2)}<input type="range" min="0" max="1" step="0.1" value={strength} disabled={busy || !!runId} onChange={e => setStrength(Number(e.target.value))} /><small>De 0 a 1: valores maiores aumentam a força do ajuste. Isso não garante menos erros.</small></label>}
        <label className="field-group">Prioridade na comparação<select value={strategy} onChange={e => setStrategy(e.target.value as TrainingConfig['strategy'])} disabled={busy || !!runId}><option value="best_balanced">Equilibrar desempenho e equidade</option><option value="best_fairness">Priorizar menores diferenças entre grupos</option><option value="best_predictive">Priorizar identificação dos casos</option></select></label>
      </div>
      <p className="metric-reading">{strategy === 'best_predictive' ? 'A escolha dará preferência a encontrar e ordenar os casos de risco. As diferenças entre grupos continuam sendo mostradas, mas não participam da pontuação de escolha.' : strategy === 'best_fairness' ? 'A escolha dará mais importância a reduzir as diferenças entre grupos. Confira também os erros: deixar de emitir alertas para todos pode aproximar os grupos e, ainda assim, deixar alunos sem identificação.' : 'A escolha levará em conta tanto a capacidade de encontrar os casos quanto as diferenças entre grupos e os erros das probabilidades. Compare os números antes e depois para ver o que melhorou e o que piorou.'}</p>
      {constraint === 'equalized_odds' && <p>Para comparar os erros, cada grupo precisa ter exemplos com e sem a situação acompanhada. As técnicas tentam fazer esse ajuste de formas diferentes: o adversário recebe o resultado apenas enquanto aprende; a regularização compara as probabilidades médias separadamente para cada resultado. Por isso, confira os acertos e falsos alertas na tabela, mesmo com esse objetivo selecionado.</p>}
      <label className="checkbox-label"><input type="checkbox" checked={apply} disabled={busy || !!runId} onChange={e => setApply(e.target.checked)} />Usar a versão com a técnica aplicada, se o treinamento funcionar</label>
      <p>{apply ? 'Ao marcar esta opção, você escolhe usar a versão com o ajuste, mesmo que a versão sem ele tenha uma pontuação maior. A aplicação usará a melhor opção ajustada na comparação. Veja no relatório se as diferenças entre grupos de fato diminuíram.' : 'Sem marcar esta opção, deixe o FairDrop escolher a versão com a maior pontuação na comparação. Ele pode manter a versão sem ajuste se ela se sair melhor. Você verá o resultado das duas no relatório.'} O modelo atual será preservado.</p>
      <details className="context-help"><summary>Condições da comparação e cuidados com o experimento</summary>      <p>O FairDrop retira, das duas versões, o ajuste automático que dava mais importância ao resultado menos frequente. Isso ajuda a comparar o efeito da técnica escolhida. Adversário, restrições e regularização usam um método de previsão chamado regressão logística; por isso, a versão sem ajuste também é aprendida de novo com esse método.</p>
      <p>Ao terminar seus testes, confira a técnica escolhida com dados de outra turma ou período. Experimentar muitas opções no mesmo histórico ajuda a escolher uma, mas não mostra como ela vai funcionar com dados que você ainda não examinou.</p>
      </details>
      {eligibility && !eligibility.available && feature && <p className="notice" role="status">{eligibility?.reason}</p>}
      <div className="experiment-actions"><ErrorNotice message={error} /><button className="primary-button" disabled={busy || !!runId || options.loading || !eligibility?.available} onClick={() => void compare()}>{busy ? 'Iniciando experimento…' : method === 'reweighing' ? 'Comparar com reponderação' : 'Executar experimento'}</button></div>
      {busy && <TaskProgress label="Progresso do experimento" value={0} stage="Conferindo se a técnica pode ser aplicada aos grupos escolhidos."/>}
      {options.data && <details className="context-help"><summary>Como os requisitos são verificados</summary><p>{options.data.note}</p></details>}{runId && <><TrainingProgress id={runId} autoNavigate={autoNavigate} experiment onStatus={run => setRunStatus(run.status)} />{(runStatus === 'completed' || runStatus === 'failed') && <button onClick={() => { setRunId(null); setAutoNavigate(false); }}>Preparar outro experimento</button>}</>}
    </section></details>
    <details><summary>Outras ações para revisar os vieses</summary><MitigationGuide /></details>
    <p className="method-sources">Documentação: <a href="https://aif360.readthedocs.io/en/stable/modules/algorithms.html" target="_blank" rel="noreferrer">AIF360</a> · <a href="https://fairlearn.org/v0.13/api_reference/generated/fairlearn.reductions.GridSearch.html" target="_blank" rel="noreferrer">Fairlearn GridSearch</a> · <a href="https://arxiv.org/abs/1801.07593" target="_blank" rel="noreferrer">Aprendizado adversarial</a></p>
  </article>;
}
