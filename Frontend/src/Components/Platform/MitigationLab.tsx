import { useState } from 'react';
import type { MitigationMethod, MitigationOptions, ModelCard, TrainingConfig, TrainingRun } from '../../types/platform';
import { api, getApiErrorMessage } from '../../services/api';
import { useResource } from '../../services/platformApi';
import { percent } from '../../services/format';
import { ErrorNotice, Loading } from './Common';
import { GroupErrorTable } from './GroupErrorTable';
import TrainingProgress from './TrainingProgress';
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
const fairnessLabels: Record<string, string> = { disparate_impact: 'Razão entre taxas de alerta (DI)', statistical_parity_difference: 'Diferença nas taxas de alerta (SPD)', equal_opportunity_difference: 'Diferença na detecção dos casos reais (EOD)', average_odds_difference: 'Média das diferenças de detecção e falsos alertas (AOD)' };
const metric = (value: number | null | undefined) => value == null ? 'Indisponível' : value.toFixed(3);

export default function MitigationLab({ model }: { model: ModelCard }) {
  const [feature, setFeature] = useState(model.sensitive_features[0] ?? '');
  const [method, setMethod] = useState<MitigationMethod>(model.mitigation.method in descriptions ? model.mitigation.method as MitigationMethod : 'reweighing');
  const [strength, setStrength] = useState(.5);
  const [constraint, setConstraint] = useState<'demographic_parity' | 'equalized_odds'>('demographic_parity');
  const [apply, setApply] = useState(false);
  const [strategy, setStrategy] = useState<TrainingConfig['strategy']>('best_balanced');
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const options = useResource<MitigationOptions>(`/models/${model.id}/mitigation-options?constraint=${constraint}`);
  const group = options.data?.groups.find(g => g.column === feature);
  const eligibility = group?.eligibility[method];
  const report = model.mitigation;
  async function compare() {
    setBusy(true); setError(null);
    try { const result = await api.post<TrainingRun>(`/models/${model.id}/mitigate`, { feature, method, strength, constraint, apply, strategy }); setRunId(result.data.id); }
    catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); }
  }
  function download() {
    const blob = new Blob([JSON.stringify({ model_id: model.id, name: model.name, dataset: model.dataset_name, target: model.target, positive_class: model.positive_class, split: model.split, config: model.config, experiment: report, candidates: model.comparison, warnings: model.warnings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `fairdrop-experimento-${model.id}.json`; a.click(); URL.revokeObjectURL(url);
  }
  return <article className="summary-card mitigation-panel" id="mitigacao-modelo">
    <span className="section-kicker">Mitigação · experimentos</span><h3>Mitigação de vieses</h3>
    <p>Aqui você pode testar maneiras de reduzir diferenças nos alertas e nos erros entre grupos. Esses ajustes são chamados de mitigação de vieses. Você verá o resultado antes e depois da técnica, em uma nova análise; a que está aberta continua salva.</p>
    <p>O resultado acompanhado é <strong>{model.positive_class}</strong>. O alerta indica que vale conferir a situação do aluno. Um falso alerta é um aviso para quem não teve esse resultado no histórico. Um caso perdido é aquele em que a situação aconteceu, mas o sistema não emitiu aviso. Os dois tipos de erro importam.</p>
    {report.method !== 'none' && <section className="mitigation-result" aria-label="Resultado da mitigação"><h4>Resultado do experimento</h4><p><strong>{report.implementation ?? report.method}</strong></p><p>{report.message}</p>
      <MitigationReading report={report} />
      {report.before_metrics && report.after_metrics && <><p>Para comparar, o FairDrop ensinou duas versões com os mesmos dados e o mesmo método de previsão ({report.algorithm}): uma sem o ajuste e outra com ele. As duas foram avaliadas em exemplos separados do aprendizado. A análise salva usa {model.algorithm}, {report.selected ? 'com a técnica aplicada' : 'sem a técnica aplicada'}.</p>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Indicador no teste</th><th>Antes</th><th>Após mitigação</th></tr></thead><tbody>
          <tr><th>Casos de risco identificados</th><td>{percent(report.before_metrics.recall)}</td><td>{percent(report.after_metrics.recall)}</td></tr>
          <tr><th>Precisão dos alertas</th><td>{percent(report.before_metrics.precision)}</td><td>{percent(report.after_metrics.precision)}</td></tr>
          <tr><th>Acertos</th><td>{percent(report.before_metrics.accuracy)}</td><td>{percent(report.after_metrics.accuracy)}</td></tr>
          <tr><th>Erro das probabilidades — Brier (menor é melhor)</th><td>{metric(report.before_metrics.brier_score)}</td><td>{metric(report.after_metrics.brier_score)}</td></tr>
        </tbody></table></div>
        {report.after_fairness?.comparisons.map(after => {
          const before = report.before_fairness?.comparisons.find(b => b.feature === after.feature && b.group === after.group && b.reference === after.reference);
          return <div key={`${after.feature}:${after.group}`}><h4>{after.feature}: {after.group} × {after.reference}</h4><div className="table-scroll"><table className="data-table"><thead><tr><th>Medida de equidade</th><th>Antes</th><th>Depois</th></tr></thead><tbody>{Object.entries(fairnessLabels).map(([key, label]) => <tr key={key}><th>{label}</th><td>{metric(before?.metrics[key])}</td><td>{metric(after.metrics[key])}</td></tr>)}</tbody></table></div></div>;
        })}
        <p>Como ler: DI igual a 1 significa a mesma proporção de alertas nos dois grupos. Nas outras três medidas, o ponto de comparação é 0, que indica diferenças iguais a zero naquela medida. Um número pode melhorar enquanto outro piora. “Indisponível” quer dizer que faltou informação para fazer a conta.</p>
        <details><summary>Erros por grupo antes e depois</summary><h4>Antes</h4>{report.before_fairness && <GroupErrorTable report={report.before_fairness} />}<h4>Depois</h4>{report.after_fairness && <GroupErrorTable report={report.after_fairness} />}</details></>}
      {report.warnings.map(warning => <p className="notice" key={warning}>{warning}</p>)}
      <details><summary>Registro dos ajustes no treino</summary><p>Estes são os detalhes de como o teste foi feito. A reamostragem muda os exemplos usados para aprender; a reponderação muda quanto cada um conta; LFR transforma as informações; as outras técnicas mudam a forma de aprender. A sua planilha original não é editada.</p><pre className="code-panel">{JSON.stringify({ implementation: report.implementation, parameters: report.parameters, audit: report.audit, weights: report.weight_summary }, null, 2)}</pre></details>
      <button type="button" onClick={download}>Baixar registro do experimento</button>
    </section>}
    <section className="mitigation-workbench"><h4>Preparar um experimento</h4><ErrorNotice message={options.error} />{options.loading && <Loading />}
      <label className="field-group">Comparar quais grupos?<select value={feature} onChange={e => setFeature(e.target.value)} disabled={!!runId || busy}><option value="">Escolher coluna da base</option>{options.data?.groups.map(g => <option key={g.column} value={g.column}>{g.column}{g.suggested ? ' · atributo sugerido' : ''}</option>)}</select></label>
      <p>Escolha uma coluna que separe os alunos em grupos que façam sentido para a pergunta. Por exemplo, “turno” permite comparar diurno e noturno. Só é possível investigar diferenças por raça ou gênero se essas informações estiverem na base. Neste teste, a coluna escolhida serve para comparar e ajustar o aprendizado, mas não entra como pista para prever o resultado.</p>
      {group?.audit.cells_before && <details><summary>Ver quantos exemplos de cada grupo serão usados para aprender</summary><div className="table-scroll"><table className="data-table"><thead><tr><th>Grupo</th><th>Demais resultados</th><th>{model.positive_class}</th></tr></thead><tbody>{group.audit.cells_before.map(c => <tr key={c.group}><th>{c.group}</th><td>{c.negative}</td><td>{c.positive}</td></tr>)}</tbody></table></div></details>}
      <fieldset className="mitigation-methods"><legend>Qual técnica deseja testar?</legend>{options.data?.methods.map(item => {
        const allowed = group?.eligibility[item.id];
        return <label className={`mitigation-method ${method === item.id ? 'selected' : ''}`} key={item.id}>
          <span className="section-kicker">{item.stage === 'pre' ? 'Preparação dos dados' : 'Durante o treinamento'}</span>
          <span><input type="radio" aria-label={item.name} name={`method-${model.id}`} value={item.id} checked={method === item.id} disabled={!allowed?.available || busy || !!runId} onChange={() => { setMethod(item.id); if (['reweighing', 'resampling', 'lfr'].includes(item.id)) setConstraint('demographic_parity'); }} /> <strong>{item.name}</strong></span>
          <span>{descriptions[item.id].how}</span><small>{descriptions[item.id].limit}</small><small>{item.implementation}</small>
          <span className={allowed?.available ? 'positive-text' : 'critical-text'}>{allowed?.available ? 'Pode ser usada com estes grupos' : allowed?.reason ?? 'Escolha uma coluna acima para saber se esta técnica pode ser usada.'}</span>
        </label>;
      })}</fieldset>
      <div className="field-grid">{['adversarial', 'constraints', 'regularization'].includes(method) && <label className="field-group">Objetivo entre os grupos<select value={constraint} onChange={e => setConstraint(e.target.value as typeof constraint)} disabled={busy || !!runId}><option value="demographic_parity">Aproximar a proporção de alertas — paridade demográfica</option><option value="equalized_odds">Aproximar os acertos e falsos alertas — equalized odds</option></select></label>}
        {method !== 'reweighing' && <label className="field-group">Intensidade da técnica: {strength.toFixed(2)}<input type="range" min="0" max="1" step="0.1" value={strength} disabled={busy || !!runId} onChange={e => setStrength(Number(e.target.value))} /><small>Esta régua controla a força do ajuste, de 0 a 1. Comece com um valor intermediário e confira o resultado antes de aumentar. Um ajuste mais forte também pode aumentar os erros. Na reamostragem, valores maiores mudam mais a composição dos exemplos.</small></label>}
        <label className="field-group">Prioridade na comparação<select value={strategy} onChange={e => setStrategy(e.target.value as TrainingConfig['strategy'])} disabled={busy || !!runId}><option value="best_balanced">Equilibrar desempenho e equidade</option><option value="best_fairness">Priorizar menores diferenças entre grupos</option><option value="best_predictive">Priorizar identificação dos casos</option></select></label>
      </div>
      <p className="metric-reading">{strategy === 'best_predictive' ? 'A escolha dará preferência a encontrar e ordenar os casos de risco. As diferenças entre grupos continuam sendo mostradas, mas não participam da pontuação de escolha.' : strategy === 'best_fairness' ? 'A escolha dará mais importância a reduzir as diferenças entre grupos. Confira também os erros: deixar de emitir alertas para todos pode aproximar os grupos e, ainda assim, deixar alunos sem identificação.' : 'A escolha levará em conta tanto a capacidade de encontrar os casos quanto as diferenças entre grupos e os erros das probabilidades. Compare os números antes e depois para ver o que melhorou e o que piorou.'}</p>
      {constraint === 'equalized_odds' && <p>Para comparar os erros, cada grupo precisa ter exemplos com e sem a situação acompanhada. As técnicas tentam fazer esse ajuste de formas diferentes: o adversário recebe o resultado apenas enquanto aprende; a regularização compara as probabilidades médias separadamente para cada resultado. Por isso, confira os acertos e falsos alertas na tabela, mesmo com esse objetivo selecionado.</p>}
      <label className="checkbox-label"><input type="checkbox" checked={apply} disabled={busy || !!runId} onChange={e => setApply(e.target.checked)} />Usar a versão com a técnica aplicada, se o treinamento funcionar</label>
      <p>{apply ? 'Ao marcar esta opção, você escolhe usar a versão com o ajuste, mesmo que a versão sem ele tenha uma pontuação maior. A aplicação usará a melhor opção ajustada na comparação. Veja no relatório se as diferenças entre grupos de fato diminuíram.' : 'Sem marcar esta opção, deixe o FairDrop escolher a versão com a maior pontuação na comparação. Ele pode manter a versão sem ajuste se ela se sair melhor. Você verá o resultado das duas no relatório.'} O modelo atual será preservado.</p>
      <p>O FairDrop retira, das duas versões, o ajuste automático que dava mais importância ao resultado menos frequente. Isso ajuda a comparar o efeito da técnica escolhida. Adversário, restrições e regularização usam um método de previsão chamado regressão logística; por isso, a versão sem ajuste também é aprendida de novo com esse método.</p>
      <p>Ao terminar seus testes, confira a técnica escolhida com dados de outra turma ou período. Experimentar muitas opções no mesmo histórico ajuda a escolher uma, mas não mostra como ela vai funcionar com dados que você ainda não examinou.</p>
      {!eligibility?.available && feature && <p className="notice" role="status">{eligibility?.reason}</p>}
      <ErrorNotice message={error} /><button className="primary-button" disabled={busy || !!runId || options.loading || !eligibility?.available} onClick={() => void compare()}>{busy ? 'Iniciando experimento…' : method === 'reweighing' ? 'Comparar com reponderação' : 'Executar experimento'}</button>
      {options.data && <small>{options.data.note}</small>}{runId && <TrainingProgress id={runId} />}
    </section>
    <details><summary>Outras ações para revisar os vieses</summary><MitigationGuide /></details>
    <p className="method-sources">Documentação: <a href="https://aif360.readthedocs.io/en/stable/modules/algorithms.html" target="_blank" rel="noreferrer">AIF360</a> · <a href="https://fairlearn.org/v0.13/api_reference/generated/fairlearn.reductions.GridSearch.html" target="_blank" rel="noreferrer">Fairlearn GridSearch</a> · <a href="https://arxiv.org/abs/1801.07593" target="_blank" rel="noreferrer">Aprendizado adversarial</a></p>
  </article>;
}
