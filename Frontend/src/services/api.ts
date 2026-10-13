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
      return detail.map((item) => item.msg ?? JSON.stringify(item)).join(' ');
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

      return JSON.stringify(detail);
    }

    if (error.code === 'ECONNABORTED') {
      return 'A análise demorou mais que o esperado. Verifique o backend e tente novamente.';
    }

    if (!error.response) {
      return 'Não foi possível conectar ao backend. Confirme se a API FastAPI está rodando em localhost:8000.';
    }
  }

  return 'Não foi possível concluir a análise. Revise o arquivo e os parâmetros selecionados.';
}
