import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../services/api';
import type { TrainingRun } from '../../types/platform';
import { ErrorNotice } from './Common';

export default function TrainingProgress({ id, autoNavigate = true, onStatus }: { id: string; autoNavigate?: boolean; onStatus?: (run: TrainingRun) => void }) {
  const [run, setRun] = useState<TrainingRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const callback = useRef(onStatus);
  useEffect(() => { callback.current = onStatus; }, [onStatus]);
  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const result = (await api.get<TrainingRun>(`/training-runs/${id}`)).data;
        if (disposed) return;
        setRun(result);
        callback.current?.(result);
        if (result.status === 'completed' && result.model_id) { if (autoNavigate) navigate(`/models/${result.model_id}`); return; }
        if (result.status === 'failed') return;
      } catch (err) { if (!disposed) setError(getApiErrorMessage(err)); }
      if (!disposed) timer = window.setTimeout(() => void poll(), 2500);
    };
    void poll();
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [id, navigate, autoNavigate]);
  if (run?.status === 'completed') return <article className="summary-card completed-run" role="status"><div><span className="section-kicker">Análise concluída</span><h2>Seu resultado está salvo</h2><p>Você pode conferir o resultado ou ajustar a configuração para executar uma nova análise.</p></div><Link className="primary-button" to={`/models/${run.model_id}`}>Abrir resultado</Link></article>;
  return <article className="summary-card training-progress" role="status"><span className="section-kicker">{run?.status === 'failed' ? 'Treinamento interrompido' : 'Treinamento em andamento'}</span><h2>{run?.status === 'failed' ? 'Não foi possível concluir' : 'Analisando os dados'}</h2><p>{run?.error ?? 'O FairDrop está aprendendo com o histórico e comparando as opções. Quando terminar, abrirá a página com os acertos, os erros e as comparações entre grupos. Em um teste de mitigação, você também verá o resultado antes e depois do ajuste.'}</p>{run?.status !== 'failed' && <div className="progress-pulse" aria-label="Treinamento em andamento" />}<ErrorNotice message={error} /><Link to="/models">Consultar modelos salvos</Link></article>;
}
