import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../services/api';
import { uploadDataset, useResource } from '../services/platformApi';
import type { DatasetImportRun, DatasetRecord, ModelCard } from '../types/platform';
import { ErrorNotice, Loading } from '../Components/Platform/Common';
import { date } from '../services/format';
import DatasetCatalog from '../Components/Platform/DatasetCatalog';
import Dialog from '../Components/Platform/Dialog';
import { usePublishWorkflow } from '../services/workflow';
import FilePicker from '../Components/Platform/FilePicker';
import DatasetWizard from '../Components/Platform/DatasetWizard';
import { useMemoryFile, useSessionDraft } from '../services/useSessionDraft';
import { DownloadExample } from '../Components/Platform/DemoLauncher';
import TaskProgress from '../Components/Platform/TaskProgress';

export function DatasetList() { return <DatasetCatalog />; }

export function NewDataset() {
  const [file, setFile] = useMemoryFile('dataset-upload');
  const [name, setName] = useSessionDraft('dataset-upload-name', '');
  const [busy, setBusy] = useState(false);
  const [importId, setImportId] = useSessionDraft<string | null>('dataset-import-run', null);
  const [progress, setProgress] = useState<{ value: number; stage: string; failed?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<{ id: string; name: string; created_at: string }[] | null>(null);
  const navigate = useNavigate();
  const working = busy || !!importId;
  usePublishWorkflow({ kind: 'import' });
  useEffect(() => {
    if (!importId) return;
    let disposed = false;
    let timer: number | undefined;
    const controller = new AbortController();
    async function poll() {
      try {
        const run = (await api.get<DatasetImportRun>(`/dataset-imports/${importId}`, { signal: controller.signal, timeout: 15000 })).data;
        if (disposed) return;
        setError(null);
        setProgress({ value: 35 + Math.floor(run.progress * .65), stage: run.stage, failed: run.status === 'failed' });
        if (run.status === 'completed' && run.dataset_id) {
          setImportId(null); setFile(null); setName(''); navigate(`/datasets/${run.dataset_id}`); return;
        }
        if (run.status === 'failed') { setImportId(null); setError(run.error ?? 'Não foi possível ler o arquivo. Tente importar novamente.'); return; }
      } catch (err) {
        if (disposed) return;
        setError(getApiErrorMessage(err));
        // IDs apagados ou de outra instalação não devem prender o formulário.
        if (isMissingImport(err)) { setImportId(null); return; }
      }
      if (!disposed) timer = window.setTimeout(() => void poll(), 1000);
    }
    void poll();
    return () => { disposed = true; controller.abort(); window.clearTimeout(timer); };
  }, [importId, navigate, setImportId, setFile, setName]);
  async function importFile() {
    if (!file) return;
    setBusy(true); setError(null); setDuplicates(null);
    setProgress({ value: 15, stage: 'Enviando o arquivo para a leitura.' });
    try {
      const run = await uploadDataset(file, name, fraction => setProgress({ value: 15 + Math.floor(fraction * 20), stage: fraction < 1 ? 'Enviando o arquivo para a leitura.' : 'Arquivo enviado. Aguardando o início da leitura.' }));
      setImportId(run.id);
    }
    catch (err) { setError(getApiErrorMessage(err)); setProgress(current => current && { ...current, failed: true }); } finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!file || working) return;
    setBusy(true); setError(null);
    setProgress({ value: 0, stage: 'Enviando o arquivo para conferir se já foi importado.' });
    try {
      const form = new FormData(); form.append('file', file);
      const response = await api.post<{ matches: { id: string; name: string; created_at: string }[] }>('/datasets/check-duplicate', form, { onUploadProgress: event => {
        if (event.total) setProgress({ value: Math.min(15, Math.floor(15 * event.loaded / event.total)), stage: event.loaded < event.total ? 'Enviando o arquivo para conferir se já foi importado.' : 'Conferindo se este arquivo já está salvo.' });
      } });
      if (response.data.matches.length) { setDuplicates(response.data.matches); setProgress(null); return; }
      await importFile();
    } catch (err) { setError(getApiErrorMessage(err)); setProgress(current => current && { ...current, failed: true }); } finally { setBusy(false); }
  }
  return <section className="page-stack"><div className="page-heading"><div><h1>Importar base histórica</h1><p>Envie o histórico com os resultados conhecidos. Você poderá conferir a leitura antes de treinar.</p></div></div>
    <form className="upload-card import-layout" onSubmit={submit}><FilePicker file={file} onChange={next=>{setFile(next);setDuplicates(null);setError(null);setProgress(null);}} disabled={working} />
      <label className="field-group">Nome da base (opcional)<input value={name} maxLength={160} onChange={e=>setName(e.target.value)} placeholder="Ex.: Graduação · ingresso 2024" disabled={working}/><small>O nome original do arquivo também será preservado.</small></label>
      <div className="button-row"><button className="primary-button" disabled={!file || working}>{working ? 'Lendo arquivo…' : 'Importar arquivo'}</button><DownloadExample kind="historical">Baixar uma base de exemplo</DownloadExample></div>
      {(progress || importId) && <TaskProgress label="Progresso da importação" value={progress?.value ?? null} stage={progress?.stage ?? 'Consultando a leitura do arquivo.'} failed={progress?.failed}/>}
      <ErrorNotice message={error}/>
      <p className="muted">Arquivos idênticos são comparados pelo conteúdo. Importações antigas sem hash podem não ser reconhecidas.</p>
    </form>
    {duplicates&&<Dialog title="Este arquivo já foi importado" onClose={()=>setDuplicates(null)}><p>O conteúdo é idêntico ao de uma base abaixo. Você pode usá-la ou guardar uma nova versão separada.</p><ul className="duplicate-list">{duplicates.map(item=><li key={item.id}><Link to={`/datasets/${item.id}`} onClick={()=>{setFile(null);setName('');}}>{item.name}</Link><small>{date(item.created_at)}</small></li>)}</ul><div className="dialog-actions"><button className="primary-button" onClick={()=>void importFile()} disabled={busy}>Importar como nova versão</button><button onClick={()=>setDuplicates(null)}>Cancelar</button></div></Dialog>}
  </section>;
}

function isMissingImport(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'response' in error &&
    (error.response as { status?: number } | undefined)?.status === 404;
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
