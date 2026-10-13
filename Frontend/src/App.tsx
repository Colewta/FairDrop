import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import './App.css';
import './Platform.css';
import { Loading } from './Components/Platform/Common';

const LegacyApp = lazy(() => import('./LegacyApp'));
const Dashboard = lazy(() => import('./pages/Predictions').then(m => ({ default: m.InstitutionalDashboard })));
const DatasetList = lazy(() => import('./pages/Datasets').then(m => ({ default: m.DatasetList })));
const NewDataset = lazy(() => import('./pages/Datasets').then(m => ({ default: m.NewDataset })));
const DatasetDetail = lazy(() => import('./pages/Datasets').then(m => ({ default: m.DatasetDetail })));
const ModelList = lazy(() => import('./pages/Models').then(m => ({ default: m.ModelList })));
const ModelDetail = lazy(() => import('./pages/Models').then(m => ({ default: m.ModelDetail })));
const PredictionList = lazy(() => import('./pages/Predictions').then(m => ({ default: m.PredictionList })));
const NewPrediction = lazy(() => import('./pages/Predictions').then(m => ({ default: m.NewPrediction })));
const PredictionDetail = lazy(() => import('./pages/Predictions').then(m => ({ default: m.PredictionDetail })));
const StudentPage = lazy(() => import('./pages/Predictions').then(m => ({ default: m.StudentPage })));

export default function App() {
  const [technical, setTechnical] = useState(false);
  return <BrowserRouter><div className="platform-shell"><header className="platform-nav"><Link className="platform-brand" to="/"><span>FD</span>FairDrop</Link><nav aria-label="Navegação principal"><NavLink to="/" end>Visão geral</NavLink><NavLink to="/datasets">Bases</NavLink><NavLink to="/models">Modelos</NavLink><NavLink to="/predictions">Alunos e riscos</NavLink></nav><button aria-pressed={technical} onClick={() => setTechnical(!technical)}>{technical ? 'Modo técnico' : 'Modo simples'}</button></header>
    <main className="platform-content">
      <Suspense fallback={<Loading />}><Routes><Route path="/" element={<Dashboard />} /><Route path="/dashboard" element={<Dashboard />} /><Route path="/datasets" element={<DatasetList />} /><Route path="/datasets/new" element={<NewDataset />} /><Route path="/datasets/:id" element={<DatasetDetail technical={technical} />} /><Route path="/models" element={<ModelList />} /><Route path="/models/:id" element={<ModelDetail technical={technical} />} /><Route path="/predictions" element={<PredictionList />} /><Route path="/predictions/new" element={<NewPrediction />} /><Route path="/predictions/:id" element={<PredictionDetail technical={technical} />} /><Route path="/students/:id" element={<StudentPage technical={technical} />} /><Route path="/legacy" element={<LegacyApp />} /><Route path="*" element={<p>Página não encontrada. <Link to="/">Voltar ao início</Link></p>} /></Routes></Suspense>
      <footer className="platform-footer">FairDrop · Acompanhamento educacional e análise de equidade. As previsões devem ser revisadas pelo tutor.</footer>
    </main></div></BrowserRouter>;
}
