import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../services/api';
import { startTraining, uploadDataset, useResource } from '../services/platformApi';
import type { DatasetRecord, TrainingConfig } from '../types/platform';
import { DatasetHealthCard, Empty, ErrorNotice, Loading, MetricCard } from '../Components/Platform/Common';
import { date } from '../services/format';
import FilePicker from '../Components/Platform/FilePicker';
import DatasetWizard from '../Components/Platform/DatasetWizard';
import TrainingProgress from '../Components/Platform/TrainingProgress';
import { DownloadExample } from '../Components/Platform/DemoLauncher';

export function DatasetList() {
  const [page, setPage] = useState(0);
  const { data, error, loading } = useResource<DatasetRecord[]>(`/datasets?limit=20&offset=${page * 20}`);
  return <section className="page-stack"><div className="page-heading"><div><span className="section-kicker">Dados históricos</span><h1>Bases de alunos</h1><p>Históricos importados para treinar e avaliar os modelos.</p></div><Link className="primary-button" to="/datasets/new">Nova base</Link></div>
    <ErrorNotice message={error} />{loading && <Loading />}
    {data?.length === 0 && <Empty>Não há bases nesta página. Importe um histórico de alunos para iniciar uma análise.</Empty>}
    <div className="resource-grid">{data?.map(item => <Link className="resource-card" to={`/datasets/${item.id}`} key={item.id}><span className="section-kicker">Base histórica</span><h3>{item.name}</h3><p>{item.profile.rows.toLocaleString('pt-BR')} registros · {item.profile.columns} colunas</p><small>{date(item.created_at)}</small></Link>)}</div>
    <div className="pagination"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1}</span><button disabled={!data || data.length < 20} onClick={() => setPage(page + 1)}>Próxima</button></div>
  </section>;
}

export function NewDataset() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!file) return;
    setBusy(true); setError(null);
    try { const record = await uploadDataset(file); navigate(`/datasets/${record.id}`); }
    catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); }
  }
  return <section className="page-stack"><div className="page-heading"><div><span className="section-kicker">Importação de dados</span><h1>Importar base histórica</h1><p>Envie um arquivo com os dados dos alunos e o resultado já conhecido. Você poderá conferir a leitura antes de treinar o modelo.</p></div></div>
    <form className="upload-card" onSubmit={submit}><FilePicker file={file} onChange={setFile} disabled={busy} />
      <p>A base histórica precisa incluir o que aconteceu com cada aluno, como a situação final da matrícula.</p><DownloadExample kind="historical">Baixar uma base de exemplo</DownloadExample><ErrorNotice message={error} /><button className="primary-button" disabled={!file || busy}>{busy ? 'Importando arquivo…' : 'Importar arquivo'}</button></form>
  </section>;
}

export function DatasetDetail({ technical }: { technical: boolean }) {
  const { id } = useParams();
  const { data, error, loading } = useResource<DatasetRecord>(`/datasets/${id}`);
  return <><ErrorNotice message={error} />{loading && <Loading />}{data && (technical ? <DatasetSetup key={data.id} record={data} technical /> : <DatasetWizard key={data.id} record={data} />)}</>;
}

function DatasetSetup({ record, technical }: { record: DatasetRecord; technical: boolean }) {
  const [target, setTarget] = useState(record.profile.selected_target ?? '');
  const [positive, setPositive] = useState('');
  const [cutoffChoice, setCutoff] = useState<number | null>(null);
  const [operator, setOperator] = useState<'ge' | 'le'>('ge');
  const [sensitive, setSensitive] = useState(record.profile.fairness_features);
  const [identifier, setIdentifier] = useState(record.profile.potential_ids[0] ?? '');
  const [name, setName] = useState(`Risco · ${record.name}`);
  const [strategy, setStrategy] = useState<TrainingConfig['strategy']>('best_balanced');
  const [calibrate, setCalibrate] = useState(false);
  const [cv, setCv] = useState(0);
  const [threshold, setThreshold] = useState(0.5);
  const [low, setLow] = useState(0.3);
  const [medium, setMedium] = useState(0.7);
  const [selectedFeatures, setSelectedFeatures] = useState<string[] | null>(null);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [allowSensitive, setAllowSensitive] = useState(false);
  const [references, setReferences] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [columnPage, setColumnPage] = useState(0);
  const navigate = useNavigate();
  const refreshed = useResource<DatasetRecord>(target ? `/datasets/${record.id}?target=${encodeURIComponent(target)}` : null);
  const values = useResource<{ values: { value: string; count: number }[]; numeric?: { min: number; max: number; suggested_cut: number } }>(target ? `/datasets/${record.id}/values?column=${encodeURIComponent(target)}` : null);
  const cutoff = cutoffChoice ?? values.data?.numeric?.suggested_cut ?? 0;
  const riskClass = values.data?.numeric ? `${target} ${operator === 'ge' ? '≥' : '≤'} ${cutoff}` : positive;
  const profile = refreshed.data?.profile ?? record.profile;
  const columns = record.profile.column_profiles;
  const features = (selectedFeatures ?? profile.prediction_features).filter(column => column !== target && column !== identifier && (allowSensitive || !sensitive.includes(column)));
  function changeTarget(value: string) { setTarget(value); setPositive(''); setCutoff(null); setSelectedFeatures(null); setReviewed([]); setSensitive(sensitive.filter(c => c !== value)); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const run = await startTraining({ dataset_id: record.id, name, target, positive_class: riskClass,
        ...(values.data?.numeric ? { target_rule: { operator, value: cutoff } } : {}),
        identifier_column: identifier || null, sensitive_features: sensitive.filter(c => c !== target),
        prediction_features: features, reviewed_leakage: reviewed, allow_sensitive_features: allowSensitive,
        reference_groups: Object.fromEntries(Object.entries(references).filter(([, value]) => value.trim())),
        strategy, calibrate, cv_folds: cv, threshold, low_risk_max: low, medium_risk_max: medium, balance_classes: true });
      setRunId(run.id);
    } catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); }
  }
  async function remove() { if (!window.confirm('Excluir esta base armazenada? Modelos já treinados serão preservados.')) return;
    try { await api.delete(`/datasets/${record.id}`); navigate('/datasets'); } catch (err) { setError(getApiErrorMessage(err)); } }
  return <section className="page-stack"><div className="page-heading"><div><span className="section-kicker">Configuração da análise</span><h1>{record.name}</h1><p>Confira o resultado, os grupos de comparação e as informações que serão usadas no treinamento.</p></div><button className="quiet-button" onClick={() => void remove()}>Excluir base</button></div>
    <div className="metric-grid four"><MetricCard label="Registros" value={profile.rows.toLocaleString('pt-BR')} /><MetricCard label="Colunas" value={profile.columns} /><MetricCard label="Valores ausentes" value={`${profile.missing_cells_percentage.toFixed(1)}%`} /><MetricCard label="Duplicatas" value={profile.duplicates} /></div>
    <div className="dashboard-grid two-columns"><form className="upload-card" onSubmit={submit}><h2>Resultado e dados do modelo</h2>
      {record.profile.selected_target && <p>Identificamos <strong>{record.profile.selected_target}</strong> como possível resultado. Confirme ou altere abaixo.</p>}
      <label className="field-group">Resultado a prever<select required value={target} onChange={e => changeTarget(e.target.value)}><option value="">Selecionar coluna</option>{columns.map(c => <option key={c.name}>{c.name}</option>)}</select></label>
      {values.data?.numeric ? <div className="field-grid"><label className="field-group">Regra da classe de risco<select value={operator} onChange={e => setOperator(e.target.value as 'ge' | 'le')}><option value="ge">Maior ou igual a</option><option value="le">Menor ou igual a</option></select></label><label className="field-group">Valor de referência<input type="number" step="any" required value={cutoff} onChange={e => setCutoff(Number(e.target.value))} /></label></div> : <label className="field-group">Qual resultado representa risco?<select required value={positive} onChange={e => setPositive(e.target.value)} disabled={values.loading}><option value="">Confirmar classe de risco</option>{values.data?.values.map(v => <option value={v.value} key={v.value}>{v.value} ({v.count} registros)</option>)}</select></label>}<ErrorNotice message={values.error ?? refreshed.error} />
      <label className="field-group">Identificador dos alunos<select value={identifier} onChange={e => setIdentifier(e.target.value)}><option value="">Sem identificador</option>{columns.filter(c => c.name !== target).map(c => <option key={c.name}>{c.name}</option>)}</select></label>
      <fieldset className="check-fieldset"><legend>Avaliar diferenças entre grupos</legend><p>Selecione as colunas que definem os grupos a comparar na avaliação de equidade.</p>
        {columns.filter(c => c.name !== target && c.name !== identifier && !c.tags.includes('IDENTIFIER')).map(c => <label className="checkbox-label" key={c.name}><input type="checkbox" checked={sensitive.includes(c.name)} onChange={e => setSensitive(e.target.checked ? [...sensitive, c.name] : sensitive.filter(s => s !== c.name))} />{c.name}{c.tags.includes('SENSITIVE') ? ' · sugerida' : ''}</label>)}</fieldset>
      <label className="field-group">Nome do modelo<input value={name} maxLength={160} onChange={e => setName(e.target.value)} required /></label>
      <label className="field-group">Prioridade<select value={strategy} onChange={e => setStrategy(e.target.value as TrainingConfig['strategy'])}><option value="best_balanced">Equilíbrio entre desempenho e equidade</option><option value="best_predictive">Capacidade de identificar risco</option><option value="best_fairness">Menores diferenças entre grupos</option></select></label>
      {technical && <details open><summary>Configurações técnicas</summary><div className="field-grid">
        <label className="field-group">Limiar de classificação<input type="number" min="0.01" max="0.99" step="0.01" value={threshold} onChange={e => setThreshold(Number(e.target.value))} /></label>
        <label className="field-group">Validação cruzada<select value={cv} onChange={e => setCv(Number(e.target.value))}><option value={0}>Desativada</option><option value={3}>3 divisões</option><option value={5}>5 divisões</option></select></label>
        <label className="field-group">Início de risco médio<input type="number" min="0.01" max="0.98" step="0.01" value={low} onChange={e => setLow(Number(e.target.value))} /></label>
        <label className="field-group">Início de risco alto<input type="number" min={low + 0.01} max="0.99" step="0.01" value={medium} onChange={e => setMedium(Number(e.target.value))} /></label></div>
        <label className="checkbox-label"><input type="checkbox" checked={calibrate} onChange={e => setCalibrate(e.target.checked)} />Calibração sigmoide dentro do treino</label>
        <label className="checkbox-label"><input type="checkbox" checked={allowSensitive} onChange={e => setAllowSensitive(e.target.checked)} />Permitir selecionar atributos sensíveis para previsão</label>
        {sensitive.map(column => <label className="field-group" key={column}>Referência para {column} (vazio = mais frequente no treino)<input value={references[column] ?? ''} onChange={e => setReferences({ ...references, [column]: e.target.value })} /></label>)}
        <fieldset className="check-fieldset"><legend>Informações utilizadas na previsão</legend>{columns.filter(c => c.name !== target && c.name !== identifier && !c.tags.includes('IDENTIFIER') && !c.tags.includes('IGNORE')).map(c => {
          const high = profile.leakage_alerts.some(a => a.column === c.name && a.risk === 'HIGH');
          const blocked = high && !reviewed.includes(c.name);
          return <div key={c.name}><label className="checkbox-label"><input type="checkbox" disabled={blocked || (!allowSensitive && (sensitive.includes(c.name) || c.tags.includes('SENSITIVE')))} checked={features.includes(c.name)} onChange={e => setSelectedFeatures(e.target.checked ? [...features, c.name] : features.filter(f => f !== c.name))} />{c.name}</label>{high && <label className="checkbox-label critical-text"><input type="checkbox" checked={reviewed.includes(c.name)} onChange={e => { setReviewed(e.target.checked ? [...reviewed, c.name] : reviewed.filter(f => f !== c.name)); setSelectedFeatures(features.filter(f => f !== c.name)); }} />Revisei e confirmei disponibilidade antes do evento</label>}</div>;
        })}</fieldset>
      </details>}
      <p>{features.length} variáveis propostas para previsão. Os quatro algoritmos serão comparados automaticamente.</p>
      <ErrorNotice message={error} /><button className="primary-button" disabled={busy || !!runId || !riskClass || values.loading || !!values.error || refreshed.loading || !features.length}>{busy ? 'Iniciando…' : 'Confirmar e treinar modelos'}</button>
    </form><DatasetHealthCard profile={profile} /></div>
    {runId && <TrainingProgress key={runId} id={runId} />}
    <article className="summary-card"><h3>Descrição das colunas</h3><div className="table-scroll"><table className="data-table"><thead><tr><th>Coluna</th><th>Tipo</th><th>Papéis sugeridos</th><th>Ausentes</th>{technical && <th>Confiança da sugestão</th>}</tr></thead><tbody>{profile.column_profiles.slice(columnPage * 25, (columnPage + 1) * 25).map(c => <tr key={c.name}><td>{c.name}</td><td>{c.dtype}</td><td>{c.tags.join(', ')}</td><td>{c.missing_percentage.toFixed(1)}%</td>{technical && <td>{Math.round(c.confidence * 100)}% · {c.reasons.join(' ')}</td>}</tr>)}</tbody></table></div><div className="pagination"><button disabled={columnPage === 0} onClick={() => setColumnPage(columnPage - 1)}>Anterior</button><span>Colunas {columnPage * 25 + 1}–{Math.min((columnPage + 1) * 25, columns.length)}</span><button disabled={(columnPage + 1) * 25 >= columns.length} onClick={() => setColumnPage(columnPage + 1)}>Próxima</button></div></article>
  </section>;
}
