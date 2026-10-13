import type { DatasetSummary as DatasetSummaryType, PreprocessingSummary } from '../../types/model';

type DatasetSummaryProps = {
  dataset: DatasetSummaryType;
  preprocessing: PreprocessingSummary;
};

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export default function DatasetSummary({ dataset, preprocessing }: DatasetSummaryProps) {
  const retentionRate = dataset.total_linhas > 0 ? dataset.linhas_finais / dataset.total_linhas : 0;
  const splitTotal = dataset.treino + dataset.teste;
  const trainRate = splitTotal > 0 ? dataset.treino / splitTotal : 0;

  return (
    <article className="summary-card">
      <div className="card-heading">
        <span className="section-kicker">Dataset</span>
        <h3>Amostra e preprocessamento</h3>
      </div>

      <div className="summary-grid">
        <div>
          <span>Total de linhas</span>
          <strong>{dataset.total_linhas}</strong>
        </div>
        <div>
          <span>Linhas finais</span>
          <strong>{dataset.linhas_finais}</strong>
        </div>
        <div>
          <span>Features originais</span>
          <strong>{dataset.features_originais}</strong>
        </div>
        <div>
          <span>Features do modelo</span>
          <strong>{dataset.features_modelo}</strong>
        </div>
      </div>

      <div className="progress-block">
        <div>
          <span>Retenção de registros</span>
          <strong>{formatPercent(retentionRate)}</strong>
        </div>
        <div className="progress-track">
          <span style={{ width: `${Math.min(retentionRate * 100, 100)}%` }} />
        </div>
      </div>

      <div className="progress-block">
        <div>
          <span>Divisão de treino</span>
          <strong>{formatPercent(trainRate)}</strong>
        </div>
        <div className="progress-track blue">
          <span style={{ width: `${Math.min(trainRate * 100, 100)}%` }} />
        </div>
      </div>

      <div className="mapping-list">
        <span>Leitura do preprocessamento</span>
        <div>
          <strong>Target positivo</strong>
          <em>{preprocessing.target_classe_positiva ?? 'N/A'}</em>
        </div>
        <div>
          <strong>Grupo privilegiado</strong>
          <em>{preprocessing.sensitive_grupo_privilegiado ?? 'N/A'}</em>
        </div>
        <div>
          <strong>Valores ausentes preenchidos</strong>
          <em>{preprocessing.valores_ausentes_preenchidos}</em>
        </div>
        <div>
          <strong>Descartados por target nulo</strong>
          <em>{preprocessing.linhas_descartadas_target_nulo + preprocessing.linhas_descartadas_target_invalido}</em>
        </div>
        <div>
          <strong>Descartados por sensitive nulo</strong>
          <em>{preprocessing.linhas_descartadas_sensitive_nulo}</em>
        </div>
      </div>
    </article>
  );
}
