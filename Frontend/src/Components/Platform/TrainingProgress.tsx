import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../services/api';
import type { TrainingRun } from '../../types/platform';
import { ErrorNotice } from './Common';
import TaskProgress from './TaskProgress';

export default function TrainingProgress({ id, autoNavigate = true, onStatus, experiment = false }: { id: string; autoNavigate?: boolean; onStatus?: (run: TrainingRun) => void; experiment?: boolean }) {
  const [run, setRun] = useState<TrainingRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const container = useRef<HTMLElement>(null);
  const callback = useRef(onStatus);
  useEffect(() => { callback.current = onStatus; }, [onStatus]);
  useEffect(() => {
    if (autoNavigate) container.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [id, autoNavigate]);
  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const result = (await api.get<TrainingRun>(`/training-runs/${id}`, { signal: controller.signal, timeout: 15000 })).data;
        if (disposed) return;
        setRun(result);
        setError(null);
        callback.current?.(result);
        if (result.status === 'completed' && result.model_id) { if (autoNavigate) navigate(`/models/${result.model_id}`); return; }
        if (result.status === 'failed') return;
      } catch (err) { if (!disposed) setError(getApiErrorMessage(err)); }
      if (!disposed) timer = window.setTimeout(() => void poll(), 1000);
    };
    void poll();
    return () => { disposed = true; controller.abort(); window.clearTimeout(timer); };
  }, [id, navigate, autoNavigate]);
  const label = experiment ? 'Progresso do experimento' : 'Progresso da análise';
  if (run?.status === 'completed') return <article className="summary-card training-progress"><span className="section-kicker">{experiment ? 'Experimento concluído' : 'Análise concluída'}</span><h2>Seu resultado está salvo</h2><TaskProgress label={label} value={100} stage={run.stage ?? 'Tudo pronto. O resultado está salvo.'}/><Link className="primary-button" to={`/models/${run.model_id}`}>Abrir resultado</Link></article>;
  const failed = run?.status === 'failed';
  return <article ref={container} className="summary-card training-progress"><span className="section-kicker">{failed ? 'Treinamento interrompido' : experiment ? 'Experimento em andamento' : 'Treinamento em andamento'}</span><h2>{failed ? 'Não foi possível concluir' : experiment ? 'Comparando o resultado da mitigação' : 'Analisando os dados'}</h2><p>{run?.error ?? (experiment ? 'Estamos treinando as versões com e sem a técnica escolhida para comparar os resultados.' : 'Estamos aprendendo com o histórico e comparando os modelos. Ao terminar, os resultados serão abertos aqui.')}</p><TaskProgress label={label} value={run?.progress ?? null} stage={failed ? 'Execução interrompida. A porcentagem mostra até onde foi possível avançar.' : run?.stage ?? 'Consultando o andamento do treinamento.'} failed={failed}/><ErrorNotice message={error} /><Link to="/models">Consultar modelos salvos</Link></article>;
}
