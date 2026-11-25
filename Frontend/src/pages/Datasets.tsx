import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../services/api';
import { uploadDataset, useResource } from '../services/platformApi';
import type { DatasetRecord, ModelCard } from '../types/platform';
import { Empty, ErrorNotice, Loading } from '../Components/Platform/Common';
import { date } from '../services/format';
import FilePicker from '../Components/Platform/FilePicker';
import DatasetWizard from '../Components/Platform/DatasetWizard';
import { useMemoryFile } from '../services/useSessionDraft';
import { DownloadExample } from '../Components/Platform/DemoLauncher';

export function DatasetList() {
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useResource<DatasetRecord[]>(`/datasets?limit=20&offset=${page * 20}`);
  return <section className="page-stack"><div className="page-heading"><div><span className="section-kicker">Dados históricos</span><h1>Bases de alunos</h1><p>Abra uma base para configurar a análise ou importe um novo histórico.</p></div><Link className="primary-button" to="/datasets/new">Nova base</Link></div>
    <ErrorNotice message={error} onRetry={reload} />{loading && <Loading />}
    {data?.length === 0 && <Empty>Não há bases nesta página. Importe um histórico de alunos para iniciar uma análise.</Empty>}
    <div className="resource-grid">{data?.map(item => <Link className="resource-card" to={`/datasets/${item.id}`} key={item.id}><span className="section-kicker">Base histórica</span><h3>{item.name}</h3><p>{item.profile.rows.toLocaleString('pt-BR')} registros · {item.profile.columns} colunas</p><small>{date(item.created_at)}</small></Link>)}</div>
    <div className="pagination"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1}</span><button disabled={!data || data.length < 20} onClick={() => setPage(page + 1)}>Próxima</button></div>
  </section>;
}

export function NewDataset() {
  const [file, setFile] = useMemoryFile('dataset-upload');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!file) return;
    setBusy(true); setError(null);
    try { const record = await uploadDataset(file); setFile(null); navigate(`/datasets/${record.id}`); }
    catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); }
  }
  return <section className="page-stack"><div className="page-heading"><div><span className="section-kicker">Importação de dados</span><h1>Importar base histórica</h1><p>Envie o histórico com os dados dos alunos e seus resultados conhecidos. Você poderá conferir a leitura antes de configurar a análise.</p></div></div>
    <form className="upload-card" onSubmit={submit}><FilePicker file={file} onChange={setFile} disabled={busy} />
      <p>A base histórica precisa incluir o que aconteceu com cada aluno, como a situação final da matrícula.</p><DownloadExample kind="historical">Baixar uma base de exemplo</DownloadExample><ErrorNotice message={error} /><button className="primary-button" disabled={!file || busy}>{busy ? 'Importando arquivo…' : 'Importar arquivo'}</button></form>
  </section>;
}

export function DatasetDetail({ technical }: { technical: boolean }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const sourceId = params.get('from_model') ?? undefined;
  const { data, error, loading } = useResource<DatasetRecord>(`/datasets/${id}`);
  const source = useResource<ModelCard>(sourceId ? `/models/${sourceId}` : null);
  const [actionError, setActionError] = useState<string | null>(null);
  const navigate = useNavigate();
  async function remove() {
    if (!data || !window.confirm('Excluir esta base armazenada? Modelos já treinados serão preservados.')) return;
    try { await api.delete(`/datasets/${data.id}`); navigate('/datasets'); } catch (err) { setActionError(getApiErrorMessage(err)); }
  }
  const mismatch = source.data && source.data.dataset_id !== id;
  return <><ErrorNotice message={error ?? source.error ?? actionError ?? (mismatch ? 'Esta análise pertence a outra base. Abra a configuração pela ficha correta.' : null)} />{(loading || source.loading) && <Loading />}{data && !source.loading && (!sourceId || source.data) && !mismatch && <DatasetWizard key={`${data.id}:${sourceId ?? 'new'}`} record={data} technical={technical} initialConfig={source.data?.config} sourceModelId={sourceId} onDelete={() => void remove()} />}</>;
}
