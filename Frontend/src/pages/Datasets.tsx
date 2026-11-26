import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../services/api';
import { uploadDataset, useResource } from '../services/platformApi';
import type { DatasetRecord, ModelCard } from '../types/platform';
import { ErrorNotice, Loading } from '../Components/Platform/Common';
import { date } from '../services/format';
import DatasetCatalog from '../Components/Platform/DatasetCatalog';
import Dialog from '../Components/Platform/Dialog';
import { usePublishWorkflow } from '../services/workflow';
import FilePicker from '../Components/Platform/FilePicker';
import DatasetWizard from '../Components/Platform/DatasetWizard';
import { useMemoryFile, useSessionDraft } from '../services/useSessionDraft';
import { DownloadExample } from '../Components/Platform/DemoLauncher';

export function DatasetList() { return <DatasetCatalog />; }

export function NewDataset() {
  const [file, setFile] = useMemoryFile('dataset-upload');
  const [name, setName] = useSessionDraft('dataset-upload-name', '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<{ id: string; name: string; created_at: string }[] | null>(null);
  const navigate = useNavigate();
  usePublishWorkflow({ kind: 'import' });
  async function importFile() {
    if (!file) return;
    setBusy(true); setError(null); setDuplicates(null);
    try { const record = await uploadDataset(file, name); setFile(null); setName(''); navigate(`/datasets/${record.id}`); }
    catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!file || busy) return;
    setBusy(true); setError(null);
    try {
      const form = new FormData(); form.append('file', file);
      const response = await api.post<{ matches: { id: string; name: string; created_at: string }[] }>('/datasets/check-duplicate', form);
      if (response.data.matches.length) { setDuplicates(response.data.matches); return; }
      await importFile();
    } catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); }
  }
  return <section className="page-stack"><div className="page-heading"><div><h1>Importar base histórica</h1><p>Envie o histórico com os resultados conhecidos. Você poderá conferir a leitura antes de treinar.</p></div></div>
    <form className="upload-card import-layout" onSubmit={submit}><FilePicker file={file} onChange={next=>{setFile(next);setDuplicates(null);setError(null);}} disabled={busy} />
      <label className="field-group">Nome da base (opcional)<input value={name} maxLength={160} onChange={e=>setName(e.target.value)} placeholder="Ex.: Graduação · ingresso 2024" disabled={busy}/><small>O nome original do arquivo também será preservado.</small></label>
      <div className="button-row"><button className="primary-button" disabled={!file || busy}>{busy ? 'Conferindo arquivo…' : 'Importar arquivo'}</button><DownloadExample kind="historical">Baixar uma base de exemplo</DownloadExample></div><ErrorNotice message={error}/>
      <p className="muted">Arquivos idênticos são comparados pelo conteúdo. Importações antigas sem hash podem não ser reconhecidas.</p>
    </form>
    {duplicates&&<Dialog title="Este arquivo já foi importado" onClose={()=>setDuplicates(null)}><p>O conteúdo é idêntico ao de uma base abaixo. Você pode usá-la ou guardar uma nova versão separada.</p><ul className="duplicate-list">{duplicates.map(item=><li key={item.id}><Link to={`/datasets/${item.id}`} onClick={()=>{setFile(null);setName('');}}>{item.name}</Link><small>{date(item.created_at)}</small></li>)}</ul><div className="dialog-actions"><button className="primary-button" onClick={()=>void importFile()} disabled={busy}>Importar como nova versão</button><button onClick={()=>setDuplicates(null)}>Cancelar</button></div></Dialog>}
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
