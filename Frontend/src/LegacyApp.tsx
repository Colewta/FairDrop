import { useState } from 'react';
import './App.css';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import { analyzeDataset, getApiErrorMessage, trainModel } from './services/api';
import type { AnalyzeResult, TrainingFormData, TrainingResult } from './types/model';

function LegacyApp() {
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [result, setResult] = useState<TrainingResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze(file: File) {
    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const response = await analyzeDataset(file);
      setAnalysis(response);
    }
    catch (requestError) {
      setAnalysis(null);
      setError(getApiErrorMessage(requestError));
      throw requestError;
    }
    finally {
      setIsAnalyzing(false);
    }
  }

  async function handleTrain(formData: TrainingFormData) {
    setIsTraining(true);
    setError(null);

    try {
      const response = await trainModel(formData);
      setResult(response);

      window.setTimeout(() => {
        document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
    catch (requestError) {
      setError(getApiErrorMessage(requestError));
    }
    finally {
      setIsTraining(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="hero-copy">
          <span className="product-mark">FairDrop</span>
          <h1>Análise de desempenho e equidade</h1>
          <p>
            Importe o histórico, confira o resultado e os grupos de comparação. Depois, avalie os acertos,
            os erros e as diferenças entre os modelos treinados.
          </p>
        </div>
        <div className="hero-panel" aria-hidden="true">
          <span className="hero-panel-label">Etapas da análise</span>
          <strong>Dos registros à avaliação do modelo</strong>
          <p>Confira os dados, defina a pergunta da análise e compare os resultados de desempenho e equidade.</p>
        </div>
      </header>

      <Home
        analysis={analysis}
        onAnalyze={handleAnalyze}
        onTrain={handleTrain}
        isAnalyzing={isAnalyzing}
        isTraining={isTraining}
        error={error}
        result={result}
      />
      <Dashboard result={result} />
    </main>
  );
}

export default LegacyApp;
