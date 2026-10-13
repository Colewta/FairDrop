import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, getApiErrorMessage } from '../services/api';
import { predictBatch, useResource } from '../services/platformApi';
import type { ModelCard, PredictionBatch, PredictionPage, StudentDetail } from '../types/platform';
import { Empty, ErrorNotice, Loading, MetricCard, RiskBadge, StudentRiskTable } from '../Components/Platform/Common';
import { date, percent } from '../services/format';
import { DemoLauncher, DownloadExample } from '../Components/Platform/DemoLauncher';
import RiskDistribution from '../Components/Platform/RiskDistribution';
import StudentExplanation from '../Components/Platform/StudentExplanation';
import TutorReviewPanel from '../Components/Platform/TutorReviewPanel';
import FilePicker from '../Components/Platform/FilePicker';

function RiskSummary({ batch }: { batch: PredictionBatch }) {
  return <div className="metric-grid four"><MetricCard label="Alunos avaliados" value={batch.total.toLocaleString('pt-BR')} /><MetricCard label="Alto risco" value={batch.summary.high} detail="Casos para revisar primeiro" /><MetricCard label="Médio risco" value={batch.summary.medium} /><MetricCard label="Baixo risco" value={batch.summary.low} /></div>;
}
export function InstitutionalDashboard() {
  const { data, error, loading } = useResource<{ latest_batch: PredictionBatch | null; message: string }>('/dashboard');
  const batch = data?.latest_batch;
  return <section className="page-stack"><div className="page-heading"><div><span className="section-kicker">Acompanhamento educacional</span><h1>Acompanhamento dos alunos</h1><p>Consulte as avaliações, revise os casos e acompanhe as diferenças entre grupos de alunos.</p></div><Link className="primary-button" to="/predictions/new">Avaliar alunos atuais</Link></div><ErrorNotice message={error} />{loading && <Loading />}
    <div className="start-paths"><DemoLauncher /><article className="resource-card own-data"><span className="section-kicker">Dados da instituição</span><h2>Analisar uma base de alunos</h2><ol><li>Importe o histórico e confira os registros.</li><li>Escolha o resultado que deseja acompanhar.</li><li>Avalie o modelo e aplique-o aos alunos atuais.</li></ol><Link className="primary-button" to="/datasets/new">Importar minha base</Link><DownloadExample kind="historical">Baixar exemplo de arquivo</DownloadExample></article></div>
    {batch && <><RiskSummary batch={batch} /><div className="dashboard-grid two-columns"><RiskDistribution batch={batch} /><article className="summary-card"><span className="section-kicker">Última avaliação</span><h2>{batch.name}</h2><p>{date(batch.created_at)}</p><p>Risco médio estimado: <strong>{percent(batch.average_risk)}</strong></p><p>{data?.message}</p><Link className="primary-button" to={`/predictions/${batch.id}`}>Ver alunos desta avaliação</Link><Link to={`/models/${batch.model_id}`}>Consultar a análise do modelo</Link></article></div></>}
  </section>;
}

export function PredictionList() {
  const [page, setPage] = useState(0);
  const { data, error, loading } = useResource<PredictionBatch[]>(`/predictions?limit=20&offset=${page * 20}`);
  return <section className="page-stack"><div className="page-heading"><div><span className="section-kicker">Monitoramento</span><h1>Avaliações de alunos</h1></div><Link className="primary-button" to="/predictions/new">Nova avaliação</Link></div><ErrorNotice message={error} />{loading && <Loading />}{data?.length === 0 && <Empty>Nenhuma avaliação nesta página.</Empty>}<div className="resource-grid">{data?.map(batch => <Link className="resource-card" key={batch.id} to={`/predictions/${batch.id}`}><h3>{batch.name}</h3><p>{batch.total} alunos · {batch.summary.high} na faixa de alto risco</p><small>{date(batch.created_at)}</small></Link>)}</div><div className="pagination"><button disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1}</span><button disabled={!data || data.length < 20} onClick={() => setPage(page + 1)}>Próxima</button></div></section>;
}

export function NewPrediction() {
  const [params] = useSearchParams();
  const [model, setModel] = useState(params.get('model') ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const models = useResource<ModelCard[]>('/models?limit=100');
  const selected = models.data?.find(item => item.id === model);
  const navigate = useNavigate();
  async function submit(event: FormEvent) { event.preventDefault(); if (!file) return; setBusy(true); setError(null);
    try { const batch = await predictBatch(file, model); navigate(`/predictions/${batch.id}`); } catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); } }
  return <section className="page-stack"><div className="page-heading"><div><span className="section-kicker">Nova avaliação</span><h1>Avaliar alunos atuais</h1><p>Selecione um modelo e envie os dados atuais dos alunos. A coluna com o resultado final não é necessária.</p></div></div><form className="upload-card" onSubmit={submit}><label className="field-group">Modelo salvo<select required value={model} onChange={e => setModel(e.target.value)}><option value="">Selecionar modelo</option>{models.data?.map(item => <option value={item.id} key={item.id}>{item.name} · {date(item.created_at)}</option>)}</select></label>{models.data?.length === 0 && <p>Primeiro <Link to="/datasets/new">envie um histórico e treine um modelo</Link>.</p>}
    {selected && <p>O arquivo precisa ter estas colunas: {selected.features.join(', ')}. Identificador: {selected.identifier_column ?? 'não definido'}. Colunas extras são aceitas.</p>}
    {selected?.is_demo && <div className="notice"><p>Este modelo usa dados fictícios. Para conhecê-lo, abra a avaliação de exemplo:</p><DemoLauncher compact modelId={selected.id} /></div>}
    <FilePicker file={file} onChange={setFile} disabled={busy} /><DownloadExample kind="current">Baixar exemplo de base atual</DownloadExample><ErrorNotice message={error ?? models.error} /><button className="primary-button" disabled={busy || !file || !model}>{busy ? 'Estimando riscos…' : 'Gerar avaliação'}</button></form></section>;
}

export function PredictionDetail({ technical }: { technical: boolean }) {
  const { id } = useParams();
  const batch = useResource<PredictionBatch>(`/predictions/${id}`);
  const [page, setPage] = useState(1);
  const [params] = useSearchParams();
  const [risk, setRisk] = useState(params.get('risk') ?? '');
  const [groupColumn, setGroupColumn] = useState('');
  const [groupValue, setGroupValue] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const students = useResource<PredictionPage>(`/predictions/${id}/students?page=${page}&q=${encodeURIComponent(search)}${risk ? `&risk=${risk}` : ''}${groupColumn && groupValue ? `&group_column=${encodeURIComponent(groupColumn)}&group_value=${encodeURIComponent(groupValue)}` : ''}`);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  async function remove() { if (!window.confirm('Excluir esta avaliação e as previsões dos alunos que fazem parte dela?')) return;
    try { await api.delete(`/predictions/${id}`); navigate('/predictions'); } catch (err) { setError(getApiErrorMessage(err)); } }
  return <section className="page-stack"><ErrorNotice message={error ?? batch.error ?? students.error} />{batch.loading && <Loading />}{batch.data && <><div className="page-heading"><div><span className="section-kicker">Avaliação de alunos</span><h1>{batch.data.name}</h1><p>{date(batch.data.created_at)}</p></div><div className="button-row"><Link to={`/models/${batch.data.model_id}`}>Análise do modelo</Link><button onClick={() => void remove()}>Excluir avaliação</button></div></div><RiskSummary batch={batch.data} />{batch.data.warnings.map(w => <p className="notice" key={w}>{w}</p>)}<article className="summary-card"><div className="filter-row"><label className="field-group">Faixa de risco<select value={risk} onChange={e => { setRisk(e.target.value); setPage(1); }}><option value="">Todas</option><option value="high">Alto</option><option value="medium">Médio</option><option value="low">Baixo</option></select></label>{batch.data.group_filters && Object.keys(batch.data.group_filters).length > 0 && <><label className="field-group">Filtrar por curso ou turma<select value={groupColumn} onChange={e => { setGroupColumn(e.target.value); setGroupValue(''); setPage(1); }}><option value="">Todos</option>{Object.keys(batch.data.group_filters).map(column => <option key={column}>{column}</option>)}</select></label>{groupColumn && <label className="field-group">Grupo<select value={groupValue} onChange={e => { setGroupValue(e.target.value); setPage(1); }}><option value="">Todos</option>{batch.data.group_filters[groupColumn]?.map(value => <option key={value}>{value}</option>)}</select></label>}</>}<form className="search-form" onSubmit={e => { e.preventDefault(); setSearch(query); setPage(1); }}><label className="field-group">Identificador<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar aluno" /></label><button type="submit">Buscar</button></form></div>{students.loading && <Loading />}{students.data && <><StudentRiskTable students={students.data.items} />{!students.data.items.length && <Empty>Nenhum aluno encontrado com estes filtros.</Empty>}<div className="pagination"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><span>{students.data.total} alunos · página {page}</span><button disabled={page * 25 >= students.data.total} onClick={() => setPage(page + 1)}>Próxima</button></div></>}</article>{technical && <details className="summary-card"><summary>Detalhes da avaliação</summary><pre className="code-panel">{JSON.stringify(batch.data.audit, null, 2)}</pre></details>}</>}</section>;
}

export function StudentPage({ technical }: { technical: boolean }) {
  const { id } = useParams();
  const { data, error, loading } = useResource<StudentDetail>(`/students/${id}`);
  return <section className="page-stack"><ErrorNotice message={error} />{loading && <Loading />}{data && <><div className="page-heading"><div><span className="section-kicker">Acompanhamento individual</span><h1>Aluno {data.prediction.student_id}</h1><p>Confira a estimativa de risco, as informações que a influenciaram e os registros de acompanhamento deste aluno.</p></div><Link to={`/predictions/${data.prediction.batch_id}`}>Voltar à avaliação</Link></div><div className="metric-grid four"><MetricCard label="Risco estimado" value={percent(data.prediction.risk_probability)} /><article className="metric-card"><span>Faixa de risco</span><RiskBadge level={data.prediction.risk_level} /></article><MetricCard label="Avaliação" value={date(data.prediction.created_at)} /><MetricCard label="Avaliações no histórico" value={data.history_total} /></div>
    <div className="dashboard-grid two-columns student-analysis-grid"><StudentExplanation key={data.prediction.id} studentId={data.prediction.id} explanation={data.explanation} technical={technical} /><div className="student-side">
    <article className="chart-card"><h3>Histórico de risco</h3><p>O gráfico reúne até 100 avaliações. Ao comparar as datas, confira se o modelo e os dados usados são os mesmos.</p><ResponsiveContainer width="100%" height={270}><LineChart data={[...data.history].reverse().map(item => ({ ...item, label: new Date(item.created_at).toLocaleDateString('pt-BR'), probability: item.risk_probability * 100 }))}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis domain={[0, 100]} unit="%" /><Tooltip formatter={value => `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} /><Line dot={{ r: 5 }} isAnimationActive={false} dataKey="probability" name="Risco estimado" stroke="#587b69" /></LineChart></ResponsiveContainer></article><TutorReviewPanel key={data.prediction.id} studentId={data.prediction.id} /></div></div>
    <details className="summary-card"><summary>Informações utilizadas nesta previsão</summary><dl className="metric-definitions">{Object.entries(data.used_information).map(([column, value]) => <div key={column}><dt>{column}</dt><dd>{value === null ? 'Não informado' : String(value)}</dd></div>)}</dl><h4>Colunas que o modelo não utilizou</h4><p>{data.ignored_columns.join(', ') || 'Nenhuma coluna adicional nesta base.'}</p><p>A identificação permite localizar o aluno. As outras colunas desta lista não foram usadas para estimar o risco.</p></details>
    <Link to={`/models/${data.prediction.model_id}`}>Consultar diferenças entre grupos e opções de mitigação</Link>
  </>}</section>;
}
