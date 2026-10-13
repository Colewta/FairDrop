import { useState } from 'react';
import { getApiErrorMessage, trainModel } from '../services/api';
import type { TrainingFormData, TrainingResult } from '../types/model';

export function usePrediction() {
  const [data, setData] = useState<TrainingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendFile = async (payload: TrainingFormData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await trainModel(payload);
      setData(response);
      return response;
    } catch (requestError) {
      const message = getApiErrorMessage(requestError);
      setError(message);
      throw requestError;
    } finally {
      setLoading(false);
    }
  };

  return { data, sendFile, loading, error };
}
