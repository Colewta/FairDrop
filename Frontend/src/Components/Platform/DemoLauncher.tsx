import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../services/api';
import type { PredictionBatch } from '../../types/platform';
import { ErrorNotice } from './Common';

export function DemoLauncher({ compact = false, modelId, secondary = false }: { compact?: boolean; modelId?: string; secondary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  async function run() { setBusy(true); setError(null);
    try { const response = await api.post<PredictionBatch>(`/demo/predict${modelId ? `?model_id=${modelId}` : ''}`); navigate(`/predictions/${response.data.id}`); }
    catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); } }
  return <div className={compact ? 'demo-compact' : 'demo-launcher'}>{!compact && <><span className="section-kicker">Exemplo de uso</span><h2>Conhecer a aplicação</h2><p>Explore uma avaliação de 30 alunos fictícios antes de enviar seu histórico.</p></>}<button type="button" className={secondary?'quiet-button':'primary-button'} onClick={() => void run()} disabled={busy}>{busy ? 'Abrindo avaliação…' : 'Abrir avaliação de exemplo'}</button><ErrorNotice message={error} /><small>Os dados deste exemplo são fictícios.</small></div>;
}

export function DownloadExample({ kind, children }: { kind: 'historical' | 'current'; children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  async function download() { try {
    const response = await api.get<Blob>(`/demo/files/${kind}`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = kind === 'historical' ? 'exemplo_historico.csv' : 'exemplo_alunos_atuais.csv'; anchor.click(); URL.revokeObjectURL(url);
  } catch (err) { setError(getApiErrorMessage(err)); } }
  return <><button type="button" onClick={() => void download()}>{children}</button><ErrorNotice message={error} /></>;
}
