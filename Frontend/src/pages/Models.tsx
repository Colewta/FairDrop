import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, getApiErrorMessage } from '../services/api';
import { useResource } from '../services/platformApi';
import type { CandidateResult, ModelCard as ModelCardType } from '../types/platform';
import { formatModelName } from '../types/model';
import LearningMetricsPanel from '../Components/Metrics/LearningMetricsPanel';
import { learningMetrics } from '../services/metricEducation';
import FeatureImportanceChart from '../Components/Charts/FeatureImportanceChart';
import { Empty, ErrorNotice, FairnessIndicator, Loading, MetricCard } from '../Components/Platform/Common';
import { date, percent } from '../services/format';
import { FeatureImpactChart } from '../Components/Platform/FeatureImpactChart';
import BiasMitigationPanel from '../Components/Platform/BiasMitigationPanel';
import { DemoLauncher } from '../Components/Platform/DemoLauncher';

export function ModelList() {
  const [page, setPage] = useState(0);
  const { data, error, loading } = useResource<ModelCardType[]>(`/models?limit=20&offset=${page * 20}`);
  return <section className="page-stack"><div className="page-heading"><div><span className="section-kicker">Modelos salvos</span><h1>Modelos de análise</h1><p>Consulte os modelos salvos, seus resultados de avaliação e as opções de mitigação.</p></div><Link className="primary-button" to="/datasets">Treinar modelo</Link></div>
    <ErrorNotice message={error} />{loading && <Loading />}{data?.length === 0 && <Empty>Não há modelos nesta página. Importe uma base histórica para treinar um modelo.</Empty>}
    <div className="resource-grid">{data?.map(model => <Link className="resource-card" key={model.id} to={`/models/${model.id}`}><span className="section-kicker">{model.is_demo ? 'Exemplo com dados fictícios' : 'Modelo da instituição'}</span><h3>{model.name}</h3><p>Resultado: {model.target} · Resultado acompanhado: {model.positive_class}</p><p>Casos de risco encontrados: {percent(model.metrics.recall)}</p><small>{date(model.created_at)}</small><p className="card-action">{model.is_demo ? 'Ver modelo de exemplo' : 'Abrir análise'}</p></Link>)}</div>
    <div className="pagination"><button disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1}</span><button disabled={!data || data.length < 20} onClick={() => setPage(page + 1)}>Próxima</button></div>
  </section>;
}

function ModelComparisonTable({ candidates, technical }: { candidates: CandidateResult[]; technical: boolean }) {
  return <article className="summary-card"><h3>Comparação dos modelos</h3><p>Os modelos usam os mesmos grupos de treino, validação e teste. A escolha é feita na validação; o teste confere o resultado do modelo escolhido.</p><div className="table-scroll"><table className="data-table"><thead><tr><th>Modelo</th><th>Casos de risco identificados</th><th>ROC-AUC</th><th>PR-AUC</th><th>Índice de equidade</th><th>Pontuação de escolha</th></tr></thead><tbody>
    {candidates.map((candidate, i) => <tr key={`${candidate.algorithm}:${candidate.variant}`}><td>{formatModelName(candidate.algorithm)} · {candidate.variant === 'reweighing' ? 'Reponderado' : 'Original'}{i === 0 && <span className="model-badge">Recomendado</span>}</td><td>{percent(candidate.validation.recall)}</td><td>{candidate.validation.roc_auc?.toFixed(3) ?? 'N/A'}</td><td>{candidate.validation.pr_auc?.toFixed(3) ?? 'N/A'}</td><td>{candidate.fairness.score?.toFixed(3) ?? 'Não avaliada'}</td><td>{candidate.score.toFixed(3)}</td></tr>)}</tbody></table></div>
    <details><summary>Como ler a comparação</summary><p><strong>Casos de risco identificados (recall):</strong> quanto dos casos reais o modelo encontrou. <strong>ROC-AUC:</strong> capacidade de colocar casos de risco à frente dos demais. <strong>PR-AUC:</strong> precisão média ao tentar encontrar mais casos, especialmente útil quando são poucos. As explicações completas estão em <a href="#entender-desempenho">Entender os acertos e erros</a>.</p><p><strong>Índice de equidade:</strong> resumo das distâncias entre grupos, de 0 a 1, usando o pior par avaliado. Não é uma porcentagem de justiça. <strong>Pontuação de escolha:</strong> média ponderada de medidas da validação, conforme a prioridade escolhida. Quando uma medida não está disponível, seu peso é redistribuído entre as demais disponíveis. Não é chance de evasão nem taxa de acertos.</p><p>“Recomendado” identifica a maior pontuação nesse critério, não uma garantia de melhor atendimento. Compare casos perdidos, falsos alertas e diferenças entre grupos. Validação cruzada significa repetir o treino em divisões internas para observar a variação do desempenho.</p></details>
    {technical && <details><summary>Pesos efetivos e validação cruzada</summary>{candidates.map(candidate => <div key={`${candidate.algorithm}:${candidate.variant}`}><h4>{formatModelName(candidate.algorithm)} · {candidate.variant === 'reweighing' ? 'Reponderado' : 'Original'}</h4><pre className="code-panel">{JSON.stringify({ weights: candidate.effective_weights, components: candidate.score_components, cross_validation: candidate.cross_validation }, null, 2)}</pre></div>)}</details>}
  </article>;
}

export function ModelDetail({ technical }: { technical: boolean }) {
  const { id } = useParams();
  const { data: model, error, loading } = useResource<ModelCardType>(`/models/${id}`);
  const [actionError, setActionError] = useState<string | null>(null);
  const navigate = useNavigate();
  const lessons = model ? learningMetrics(model.metrics) : [];
  async function remove() {
    if (!window.confirm('Excluir o modelo salvo? Previsões já registradas serão mantidas para auditoria.')) return;
    try { await api.delete(`/models/${id}`); navigate('/models'); } catch (err) { setActionError(getApiErrorMessage(err)); }
  }
  return <section className="page-stack"><ErrorNotice message={error ?? actionError} />{loading && <Loading />}{model && <>
    <div className="page-heading"><div><span className="section-kicker">Modelo salvo{technical ? ` · ${formatModelName(model.algorithm)}` : ''}</span><h1>{model.name}</h1><p>Treinado em {date(model.created_at)} · versão {model.version}</p></div><div className="button-row"><Link className="primary-button" to={`/predictions/new?model=${model.id}`}>Avaliar alunos atuais</Link><button className="quiet-button" onClick={() => void remove()}>Excluir modelo</button></div></div>
    <nav className="analysis-path" aria-label="Caminho para entender a análise"><a href="#entender-desempenho">1. Desempenho</a><a href="#entender-equidade">2. Equidade</a><a href="#mitigacao-modelo">3. Mitigação</a></nav>
    <div className="metric-grid four"><MetricCard label="Casos de risco identificados" value={lessons[0].value} detail={lessons[0].reading} /><MetricCard label="Precisão dos alertas" value={lessons[1].value} detail={lessons[1].reading} /><MetricCard label="Acertos na avaliação" value={lessons[2].value} detail="Leia este número junto com os casos sem alerta e os falsos alertas." /><MetricCard label="Registros no teste" value={model.split.test} detail="Registros separados do treino para avaliar o modelo." /></div>
    <LearningMetricsPanel metrics={model.metrics} threshold={model.threshold} outcome={model.positive_class} />
    <FairnessIndicator report={model.fairness} technical={technical} />
    <article className="summary-card"><h3>Ficha do modelo</h3><details><summary>Dados utilizados e faixas de risco</summary><dl className="metric-definitions"><div><dt>Base</dt><dd>{model.dataset_name}</dd></div><div><dt>Resultado</dt><dd>{model.target}</dd></div><div><dt>Classe de risco</dt><dd>{model.positive_class}</dd></div><div><dt>Identificador</dt><dd>{model.identifier_column ?? 'Não definido'}</dd></div><div><dt>Atributos para equidade</dt><dd>{model.sensitive_features.join(', ') || 'Nenhum'}</dd></div><div><dt>Informações usadas</dt><dd>{model.features.join(', ')}</dd></div><div><dt>Informações excluídas</dt><dd>{model.excluded_features.join(', ')}</dd></div><div><dt>Faixas operacionais</dt><dd>Baixo: abaixo de {percent(model.risk_thresholds.low)}. Alto: a partir de {percent(model.risk_thresholds.medium)}.</dd></div></dl><p>As faixas ajudam a organizar a revisão. A estimativa continua sujeita a erros em qualquer faixa.</p></details></article>
    {model.is_demo ? <DemoLauncher compact modelId={model.id} /> : <article className="next-action"><h3>Avaliar os alunos atuais</h3><p>Use este modelo com uma base atual que contenha as mesmas informações. Depois, abra os alunos para conferir as previsões e os fatores associados.</p><Link className="primary-button" to={`/predictions/new?model=${model.id}`}>Enviar base atual</Link></article>}
    {technical ? <ModelComparisonTable candidates={model.comparison} technical /> : <details className="summary-card"><summary>Comparar os modelos avaliados</summary><ModelComparisonTable candidates={model.comparison} technical={false} /></details>}
    <BiasMitigationPanel key={model.id} model={model} />
    <FeatureImpactChart explanation={model.explanation} />
    {technical && <><div className="dashboard-grid two-columns"><article className="chart-card"><h3>Calibração no teste</h3><p>Cada ponto reúne previsões semelhantes. Abaixo da linha ideal, o risco estimado foi maior que a frequência observada; acima, foi menor. Brier score: {model.metrics.brier_score.toFixed(4)} (menor indica menos erro das probabilidades).</p><ResponsiveContainer width="100%" height={250}><LineChart data={model.metrics.calibration_curve}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="predicted" type="number" domain={[0, 1]} tickFormatter={value => percent(Number(value))} /><YAxis domain={[0, 1]} tickFormatter={value => percent(Number(value))} /><Tooltip formatter={(value) => percent(Number(value))} labelFormatter={value => `Previsão média: ${percent(Number(value))}`} /><Line dataKey="observed" stroke="#587b69" name="Frequência observada" /><Line dataKey="predicted" stroke="#b0bcba" strokeDasharray="4 4" name="Ideal" /></LineChart></ResponsiveContainer></article><article className="summary-card"><h3>Matriz de confusão</h3><p>É a contagem de acertos e erros: as linhas mostram o resultado conhecido e as colunas mostram a previsão. Fora da diagonal ficam os falsos alertas e os casos não detectados.</p><table className="data-table"><thead><tr><th>Real / previsto</th><th>Demais classes</th><th>Classe de risco</th></tr></thead><tbody>{model.metrics.confusion_matrix.map((row, i) => <tr key={i}><th>{i ? 'Classe de risco' : 'Demais classes'}</th>{row.map((n, j) => <td key={j}>{n}</td>)}</tr>)}</tbody></table><p>Especificidade: {lessons.find(item => item.key === 'specificity')?.value} · Acurácia balanceada: {lessons.find(item => item.key === 'balanced_accuracy')?.value}</p></article></div>
      <article className="summary-card"><h3>Importância nativa do algoritmo</h3><p>Coeficientes ou importância interna do algoritmo. Esta medida difere de SHAP.</p><FeatureImportanceChart importances={model.feature_importance} /></article>
      <details className="summary-card"><summary>Configuração e registro técnico</summary><pre className="code-panel">{JSON.stringify({ model_id: model.id, config: model.config, schema: model.feature_schema, split: model.split, failed_algorithms: model.failed_algorithms }, null, 2)}</pre></details></>}
    <article className="summary-card"><h3>Cuidados ao usar este modelo</h3><ul>{[...model.warnings, ...model.limitations].map((warning, i) => <li key={i}>{warning}</li>)}</ul></article>
  </>}</section>;
}
