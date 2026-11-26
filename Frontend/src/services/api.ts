import axios from 'axios';
import type { AnalyzeResult, TrainingFormData, TrainingResult } from '../types/model';

export const API_BASE_URL = import.meta.env.VITE_API_URL
  ?? (import.meta.env.DEV ? 'http://localhost:8000' : '/api');

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
});

export async function analyzeDataset(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post<AnalyzeResult>('/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data;
}

export async function trainModel(payload: TrainingFormData) {
  const formData = new FormData();
  formData.append('file', payload.file);
  formData.append('target', payload.target);
  formData.append('sensitive', payload.sensitive);
  formData.append('model_type', payload.modelType ?? '');

  const response = await api.post<TrainingResult>('/train', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data;
}

export function getApiErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;

    if (Array.isArray(detail)) {
      const labels: Record<string,string> = { name:'nome', threshold:'limiar de alerta', low_risk_max:'início do risco médio', medium_risk_max:'início do risco alto', algorithms:'algoritmos', target:'resultado', positive_class:'classe positiva' };
      return detail.map(item => {
        const key=Array.isArray(item.loc)?String(item.loc[item.loc.length-1]):'';
        const prefix=labels[key]?`Revise o campo ${labels[key]}. `:'';
        const message=typeof item.msg==='string'?item.msg.replace(/^Value error, /,''):'';
        return prefix+(item.type==='missing'?'Preencha este campo.':/^[A-Z][a-z]+ (should|must)/.test(message)?'O valor informado não é aceito.':message||'Confira o valor informado.');
      }).join(' ');
    }

    if (typeof detail === 'string') {
      return detail;
    }

    if (detail && typeof detail === 'object') {
      if ('message' in detail && typeof detail.message === 'string') {
        return detail.message;
      }
      if ('mensagem' in detail && typeof detail.mensagem === 'string') {
        return detail.mensagem;
      }

      return 'Não foi possível concluir esta operação. Confira os dados e tente novamente.';
    }

    if (error.code === 'ECONNABORTED') {
      return 'Não recebemos uma resposta a tempo. Confira se o resultado já foi salvo antes de reenviar.';
    }

    if (!error.response) {
      return 'Não foi possível conectar ao serviço. Confira a conexão e tente novamente. Se estiver usando a instalação local, verifique se ela foi iniciada.';
    }
  }

  return 'Não foi possível concluir a análise. Revise o arquivo e os parâmetros selecionados.';
}
