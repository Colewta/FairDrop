import DropoutChart from '../Components/Charts/DropoutChart';
import FeatureImportanceChart from '../Components/Charts/FeatureImportanceChart';
import DatasetSummary from '../Components/Dashboard/DatasetSummary';
import InsightsPanel from '../Components/Dashboard/InsightsPanel';
import ModelComparison from '../Components/Dashboard/ModelComparison';
import FairnessSection from '../Components/Fairness/FairnessSection';
import MetricGrid from '../Components/Metrics/MetricGrid';
import type { TrainingResult } from '../types/model';

type DashboardProps = {
  result: TrainingResult | null;
};

export default function Dashboard({ result }: DashboardProps) {
  if (!result) {
    return (
      <section className="empty-dashboard" aria-label="Dashboard aguardando dados">
        <div>
          <span className="section-kicker">Dashboard</span>
          <h2>Nenhuma análise disponível</h2>
          <p>
            Importe uma base e inicie o treinamento para consultar os resultados de desempenho
            e as diferenças entre grupos.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-shell" id="dashboard" aria-label="Resultados da análise">
      <div className="dashboard-heading">
        <div>
          <span className="section-kicker">Resultados</span>
          <h2>Desempenho e equidade dos modelos</h2>
        </div>
        <span className="model-badge">{result.modelo_nome}</span>
      </div>

      <ModelComparison result={result} />
      <MetricGrid metrics={result.metricas} />

      <div className="dashboard-grid two-columns">
        <DropoutChart confusionMatrix={result.metricas.confusion_matrix} />
        <DatasetSummary dataset={result.dataset} preprocessing={result.preprocessamento} />
      </div>

      <div className="dashboard-grid two-columns wide-left">
        <FairnessSection fairness={result.fairness} groups={result.preprocessamento.sensitive_binarizado} />
        <InsightsPanel result={result} />
      </div>

      <FeatureImportanceChart importances={result.feature_importance} />
    </section>
  );
}
