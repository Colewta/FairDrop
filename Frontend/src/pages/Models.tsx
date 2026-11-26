import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../services/api';
import { useResource } from '../services/platformApi';
import type { CandidateResult, ModelCard as ModelCardType } from '../types/platform';
import { formatModelName } from '../types/model';
import LearningMetricsPanel from '../Components/Metrics/LearningMetricsPanel';
import { usePublishWorkflow } from '../services/workflow';
import { FairnessSummary } from '../Components/Platform/FairnessVisuals';
import MetricGrid from '../Components/Metrics/MetricGrid';
import { downloadJson } from '../services/downloads';
import FeatureImportanceChart from '../Components/Charts/FeatureImportanceChart';
import { Empty, ErrorNotice, FairnessIndicator, Loading } from '../Components/Platform/Common';
import { date, percent } from '../services/format';
import { FeatureImpactChart } from '../Components/Platform/FeatureImpactChart';
import BiasMitigationPanel from '../Components/Platform/BiasMitigationPanel';
import { DemoLauncher } from '../Components/Platform/DemoLauncher';
import DataCleaningNotice from '../Components/Platform/DataCleaningNotice';
import WorkspaceTabs from '../Components/Platform/WorkspaceTabs';

const variantNames: Record<string, string> = { baseline: 'Original', reweighing: 'Reponderação', resampling: 'Reamostragem', lfr: 'Representação LFR', adversarial: 'Adversário', constraints: 'Restrições', regularization: 'Regularização de fairness' };

export function ModelList() {
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useResource<ModelCardType[]>(`/models?limit=20&offset=${page * 20}`);
  return <section className="page-stack"><div className="page-heading"><div><span className="section-kicker">Modelos salvos</span><h1>Análises salvas</h1><p>Abra um resultado para consultar métricas, comparar grupos ou testar uma técnica de mitigação.</p></div><Link className="primary-button" to="/datasets/new">Nova análise</Link></div>
    <ErrorNotice message={error} onRetry={reload} />{loading && <Loading />}{data?.length === 0 && <Empty>Não há modelos nesta página. Importe uma base histórica para treinar um modelo.</Empty>}
    <div className="table-scroll"><table className="data-table"><caption className="sr-only">Análises salvas</caption><thead><tr><th>Análise</th><th>Algoritmo</th><th>Resultado</th><th>Recall no teste</th><th>Equidade</th><th>Treinamento</th></tr></thead><tbody>{data?.map(model=><tr key={model.id}><th scope="row"><Link to={`/models/${model.id}`}>{model.name}</Link><small>{model.is_demo?'Exemplo com dados fictícios':model.dataset_name}</small></th><td>{formatModelName(model.algorithm)}</td><td>{model.positive_class}</td><td>{percent(model.metrics.recall)}</td><td>{model.fairness.comparisons.length} pares avaliados</td><td>{date(model.created_at)}</td></tr>)}</tbody></table></div>
    <div className="pagination"><button disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1}</span><button disabled={!data || data.length < 20} onClick={() => setPage(page + 1)}>Próxima</button></div>
  </section>;
}

function ModelComparisonTable({ candidates, technical }: { candidates: CandidateResult[]; technical: boolean }) {
  return <article className="summary-card"><h3>Comparação dos modelos</h3><p>Cada linha mostra uma forma de fazer a previsão. Todas usam as mesmas divisões do histórico: uma parte para aprender, outra para comparar e escolher, e outra para avaliar a opção escolhida. Por isso, os números da tabela ajudam a comparar as opções na mesma condição.</p><div className="table-scroll"><table className="data-table"><thead><tr><th>Modelo</th><th>Casos de risco identificados</th><th>ROC-AUC</th><th>PR-AUC</th><th>Índice de equidade</th><th>Pontuação de escolha</th></tr></thead><tbody>
    {candidates.map((candidate, i) => <tr key={`${candidate.algorithm}:${candidate.variant}`}><td>{formatModelName(candidate.algorithm)} · {variantNames[candidate.variant] ?? candidate.variant}{i === 0 && <span className="model-badge">Selecionado</span>}</td><td>{percent(candidate.validation.recall)}</td><td>{candidate.validation.roc_auc?.toFixed(3) ?? 'N/A'}</td><td>{candidate.validation.pr_auc?.toFixed(3) ?? 'N/A'}</td><td>{candidate.fairness.score?.toFixed(3) ?? 'Não avaliada'}</td><td>{candidate.score.toFixed(3)}</td></tr>)}</tbody></table></div>
    <details><summary>Como ler a comparação</summary><p><strong>Casos de risco identificados (recall):</strong> entre os registros em que a situação aconteceu, quantos receberam aviso. <strong>ROC-AUC:</strong> indica se os casos em que a situação aconteceu tendem a aparecer antes dos demais na ordem de risco. Vai de 0 a 1; 1 é a melhor ordenação nesta avaliação. <strong>PR-AUC:</strong> resume quanto os alertas se confirmam ao tentar encontrar mais casos. É útil quando a situação acompanhada é pouco frequente. As explicações completas estão em <Link to="?section=performance">Entender os acertos e erros</Link>.</p><p><strong>Índice de equidade:</strong> resumo das diferenças entre grupos, de 0 a 1. Um valor maior indica diferenças menores nas medidas calculadas, considerando o pior par de grupos. Ele não conta a porcentagem de alunos tratados com justiça. <strong>Pontuação de escolha:</strong> é a nota que a aplicação usa para escolher uma opção, conforme a prioridade definida. Algumas medidas contam mais que outras nessa nota. Se uma delas não pode ser calculada, a nota usa as demais. Ela não representa a chance de evasão nem a taxa de acertos.</p><p>“Selecionado” identifica a versão salva. A escolha segue a comparação ou a sua decisão de usar a versão com mitigação. Compare também os casos sem aviso e os falsos alertas de cada grupo. Quando usada, a validação cruzada repete o aprendizado em divisões menores para conferir quanto os resultados variam.</p></details>
    {technical && <details><summary>Pesos efetivos e validação cruzada</summary>{candidates.map(candidate => <div key={`${candidate.algorithm}:${candidate.variant}`}><h4>{formatModelName(candidate.algorithm)} · {variantNames[candidate.variant] ?? candidate.variant}</h4><pre className="code-panel">{JSON.stringify({ weights: candidate.effective_weights, components: candidate.score_components, cross_validation: candidate.cross_validation }, null, 2)}</pre></div>)}</details>}
  </article>;
}

export function ModelDetail({ technical }: { technical: boolean }) {
  const { id } = useParams();
  const { data: model, error, loading } = useResource<ModelCardType>(`/models/${id}`);
  const [actionError, setActionError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  usePublishWorkflow(model ? { kind:params.get('section')==='mitigation'?'mitigation':'result',datasetId:model.dataset_id,modelId:model.id,hasExperiment:model.mitigation.method!=='none' } : null);
  async function remove() {
    if (!window.confirm('Excluir o modelo salvo? Previsões já registradas serão mantidas para auditoria.')) return;
    try { await api.delete(`/models/${id}`); navigate('/models'); } catch (err) { setActionError(getApiErrorMessage(err)); }
  }
  return <section className="page-stack analysis-workspace"><ErrorNotice message={error ?? actionError} />{loading && <Loading />}{model && <>
    <div className="page-heading"><div><div className="breadcrumbs"><Link to="/models">Análises</Link><span aria-hidden="true">/</span><span>{model.is_demo ? 'Exemplo com dados fictícios' : 'Resultado salvo'}</span></div><h1>{model.name}</h1><p>{date(model.created_at)} · {formatModelName(model.algorithm)} · versão {model.version}</p></div><div className="button-row"><Link className="quiet-button" to={`/datasets/${model.dataset_id}?from_model=${model.id}`}>Rever configuração</Link>{model.prediction_available!==false&&<Link className="primary-button" to={`/predictions/new?model=${model.id}`}>Avaliar alunos atuais</Link>}</div></div>
    <dl className="analysis-context" aria-label="Contexto da análise"><div><dt>Base de dados</dt><dd>{model.dataset_name}</dd></div><div><dt>Resultado acompanhado</dt><dd>{model.positive_class}<small>Coluna: {model.target}</small></dd></div><div><dt>Grupos de equidade</dt><dd>{model.sensitive_features.join(', ') || 'Não definidos'}</dd></div><div><dt>Modelo utilizado</dt><dd>{formatModelName(model.algorithm)}<small>{model.mitigation.selected ? 'Com mitigação aplicada' : 'Modelo sem mitigação aplicada'}</small></dd></div></dl>
    {model.metrics.accuracy === 1 && <p className="notice" role="note"><strong>Confira este resultado antes de usar o modelo.</strong> A avaliação apresentou 100% de acurácia. Verifique se alguma informação já revela a situação do aluno, como a data de trancamento. Confirme o resultado com dados de outro período antes de usar as previsões.</p>}
    <WorkspaceTabs tabs={[
      { id: 'overview', label: 'Visão geral', content: <>
        <div className="section-heading"><div><h2>Resumo da análise</h2><p>Resultados calculados nos registros separados para teste.</p></div><span className="status-pill">Concluída</span></div>
        <div className="overview-analytics"><section><h3>Desempenho no teste</h3><MetricGrid metrics={model.metrics} technical={technical} compact/><p className="muted">{model.split.test} registros separados para teste · {model.sensitive_features.length} {model.sensitive_features.length===1?'atributo':'atributos'} de equidade.</p></section><FairnessSummary report={model.fairness} technical={technical}/></div>
        <DataCleaningNotice report={model.cleaning_report} />
        {model.prediction_available===false&&<p className="notice">Novas avaliações indisponíveis: {model.prediction_unavailable_reason}</p>}{model.fairness.status === 'unavailable' && <p className="notice"><strong>Equidade ainda não avaliada.</strong> {model.sensitive_features.length ? 'Não há grupos com dados suficientes para esta comparação. Veja os motivos na aba Equidade.' : 'Nenhum grupo foi definido neste treinamento. Na aba Mitigação, você pode escolher uma coluna da base e conferir quais experimentos são possíveis.'}</p>}
        <div className="overview-actions"><Link to="?section=performance"><span className="section-kicker">01 · Avaliação</span><h3>Conferir os acertos e erros</h3><p>Desempenho e comparação dos métodos.</p><span className="card-action">Abrir desempenho →</span></Link><Link to="?section=fairness"><span className="section-kicker">02 · Grupos</span><h3>Comparar os grupos</h3><p>Taxas de alerta e erros em cada grupo.</p><span className="card-action">Abrir equidade →</span></Link><Link to="?section=mitigation"><span className="section-kicker">03 · Experimentos</span><h3>Testar a mitigação</h3><p>Aplique uma técnica e compare antes e depois.</p><span className="card-action">Preparar experimento →</span></Link></div>
        {model.is_demo && <DemoLauncher compact modelId={model.id} />}
        <article className="summary-card"><h3>Antes de usar as previsões</h3><p>As porcentagens são estimativas do histórico. Confira os casos com o aluno e os erros entre grupos; nenhum resultado desta análise garante o que acontecerá com uma pessoa.</p><details><summary>Avisos e limites desta análise ({model.warnings.length + model.limitations.length})</summary><ul>{[...model.warnings.filter(warning => !model.cleaning_report?.issues.some(issue => warning.startsWith(issue.message))), ...model.limitations].map((warning, i) => <li key={i}>{warning}</li>)}</ul></details></article>
      </> },
      { id: 'performance', label: 'Desempenho', content: <>
        <LearningMetricsPanel metrics={model.metrics} threshold={model.threshold} outcome={model.positive_class} technical={technical} />
        <details className="summary-card"><summary>Comparar os modelos avaliados</summary><ModelComparisonTable candidates={model.comparison} technical={technical} /></details>
        {technical&&<details className="summary-card"><summary>Importância nativa do algoritmo</summary><p>Esta importância é própria do algoritmo e difere de SHAP. Nenhuma delas comprova causalidade.</p><FeatureImportanceChart importances={model.feature_importance}/></details>}
      </> },
      { id: 'fairness', label: 'Equidade', content: <FairnessIndicator report={model.fairness} technical={technical} outcome={model.positive_class} /> },
      { id: 'interpretation', label: 'Interpretação', content: <><div className="section-heading"><div><h2>O que pesou nas previsões</h2><p>As contribuições explicam o cálculo do modelo, sem comprovar a causa da situação do aluno.</p></div></div><FeatureImpactChart explanation={model.explanation} /><article className="next-action"><h3>Conferir a explicação de um aluno</h3><p>Ao avaliar uma base atual, você pode abrir cada aluno para ver as informações que aumentaram ou reduziram sua estimativa.</p>{model.prediction_available!==false&&<Link className="primary-button" to={`/predictions/new?model=${model.id}`}>Avaliar alunos atuais</Link>}</article></> },
      { id: 'mitigation', label: 'Mitigação', content: <BiasMitigationPanel key={model.id} model={model} /> },
      { id: 'configuration', label: 'Ficha da análise', content: <>
        <article className="summary-card"><div className="section-heading"><h3>Ficha do modelo</h3><Link to={`/datasets/${model.dataset_id}?from_model=${model.id}`}>Rever configuração →</Link></div><dl className="metric-definitions"><div><dt>Base</dt><dd>{model.dataset_name}</dd></div><div><dt>Resultado</dt><dd>{model.target} · {model.positive_class}</dd></div><div><dt>Identificador</dt><dd>{model.identifier_column ?? 'Não definido'}</dd></div><div><dt>Colunas usadas para comparar grupos</dt><dd>{model.sensitive_features.join(', ') || 'Nenhuma'}</dd></div><div><dt>Informações usadas</dt><dd>{model.features.join(', ')}</dd></div><div><dt>Informações excluídas</dt><dd>{model.excluded_features.join(', ')}</dd></div><div><dt>Faixas de risco</dt><dd>Baixo: abaixo de {percent(model.risk_thresholds.low)}. Alto: a partir de {percent(model.risk_thresholds.medium)}.</dd></div><div><dt>Divisão dos registros</dt><dd>Treino: {model.split.train} · Validação: {model.split.validation} · Teste: {model.split.test}</dd></div></dl></article>
        <details className="summary-card"><summary>Configuração e registro técnico</summary><p>{model.training_metadata?.random_state!==undefined?`Seed registrada: ${model.training_metadata.random_state}`:'Seed e versões não foram registradas nesta análise antiga.'}</p><pre className="code-panel">{JSON.stringify({ model_id: model.id, training_metadata: model.training_metadata, config: model.config, schema: model.feature_schema, split: model.split, failed_algorithms: model.failed_algorithms }, null, 2)}</pre></details>
        <article className="summary-card"><h3>Exportar ficha e resultados</h3><p className="muted">JSON com parâmetros, métricas agregadas, pares de grupos e metadados disponíveis. Não inclui linhas de alunos.</p><button onClick={()=>downloadJson({id:model.id,name:model.name,created_at:model.created_at,version:model.version,dataset:{id:model.dataset_id,name:model.dataset_name},algorithm:model.algorithm,target:model.target,positive_class:model.positive_class,features:model.features,excluded_features:model.excluded_features,sensitive_features:model.sensitive_features,feature_schema:model.feature_schema,config:model.config,metrics:model.metrics,fairness:model.fairness,comparison:model.comparison,split:model.split,training_metadata:model.training_metadata??{},mitigation:model.mitigation,warnings:model.warnings,limitations:model.limitations},`fairdrop-analise-${model.id}.json`)}>Baixar ficha da análise</button></article>
        <details className="summary-card"><summary>Excluir esta análise</summary><p>As avaliações já registradas serão preservadas. Novas avaliações não poderão usar este modelo.</p><button className="danger-button" onClick={() => void remove()}>Excluir modelo</button></details>
      </> },
    ]} />
  </>}</section>;
}
