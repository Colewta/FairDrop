import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './App.css';
import './Platform.css';
import { Loading } from './Components/Platform/Common';
import AppShell from './Components/Platform/AppShell';
import { usePreference } from './services/useSessionDraft';
import WorkflowProvider from './Components/Platform/WorkflowProvider';
import './Workspace.css';

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
  const [technical, setTechnical] = usePreference('technical-mode', false);
  return <BrowserRouter basename={import.meta.env.BASE_URL}><WorkflowProvider><AppShell technical={technical} onMode={() => setTechnical(!technical)}>
      <Suspense fallback={<Loading />}><Routes><Route path="/" element={<Dashboard />} /><Route path="/dashboard" element={<Dashboard />} /><Route path="/datasets" element={<DatasetList />} /><Route path="/datasets/new" element={<NewDataset />} /><Route path="/datasets/:id" element={<DatasetDetail technical={technical} />} /><Route path="/models" element={<ModelList />} /><Route path="/models/:id" element={<ModelDetail technical={technical} />} /><Route path="/predictions" element={<PredictionList />} /><Route path="/predictions/new" element={<NewPrediction />} /><Route path="/predictions/:id" element={<PredictionDetail technical={technical} />} /><Route path="/students/:id" element={<StudentPage technical={technical} />} /><Route path="/legacy" element={<LegacyApp />} /><Route path="*" element={<p>Página não encontrada. <Link to="/">Voltar ao início</Link></p>} /></Routes></Suspense>
    </AppShell></WorkflowProvider></BrowserRouter>;
}
