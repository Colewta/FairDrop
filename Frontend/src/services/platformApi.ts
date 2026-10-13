import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from './api';
import type { DatasetRecord, PredictionBatch, TrainingConfig, TrainingRun } from '../types/platform';

export function useResource<T>(path: string | null) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({ key: '', data: null, error: null });
  const key = `${path}:${revision}`;
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api.get<T>(path, { signal: controller.signal }).then(response => {
      setState({ key, data: response.data, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ key, data: null, error: getApiErrorMessage(error) });
    });
    return () => controller.abort();
  }, [path, key]);
  return { data: state.key === key ? state.data : null, error: state.key === key ? state.error : null,
    loading: Boolean(path && state.key !== key), reload: () => setRevision(value => value + 1) };
}

export async function uploadDataset(file: File) {
  const form = new FormData(); form.append('file', file);
  return (await api.post<DatasetRecord>('/datasets', form)).data;
}
export async function startTraining(config: TrainingConfig) {
  return (await api.post<TrainingRun>('/training-runs', config)).data;
}
export async function predictBatch(file: File, modelId: string) {
  const form = new FormData(); form.append('file', file); form.append('model_id', modelId);
  return (await api.post<PredictionBatch>('/predict', form, { timeout: 600000 })).data;
}
