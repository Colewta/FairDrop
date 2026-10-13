import { useMemo, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import type { AnalyzeResult, DatasetRecommendation, TrainingFormData } from '../../types/model';
import { MODEL_OPTIONS } from '../../types/model';

type UploadDataProps = {
  analysis: AnalyzeResult | null;
  onAnalyze: (file: File) => Promise<void>;
  onTrain: (data: TrainingFormData) => Promise<void>;
  isAnalyzing: boolean;
  isTraining: boolean;
  error: string | null;
};

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function renderRecommendation(candidato: DatasetRecommendation | null, label: string) {
  if (!candidato) {
    return (
      <div className="recommendation-card muted">
        <span>{label}</span>
        <strong>Não identificado automaticamente</strong>
        <p>Revise as colunas do CSV e escolha manualmente a melhor opção.</p>
      </div>
    );
  }

  return (
    <div className="recommendation-card">
      <span>{label}</span>
      <strong>{candidato.coluna}</strong>
      <p>{candidato.motivos[0] ?? 'Candidato sugerido pelo backend.'}</p>
    </div>
  );
}

export default function UploadData({
  analysis,
  onAnalyze,
  onTrain,
  isAnalyzing,
  isTraining,
  error,
}: UploadDataProps) {
  const [file, setFile] = useState<File | null>(null);
  const [targetChoice, setTarget] = useState<string | null>(null);
  const [sensitiveChoice, setSensitive] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const columns = useMemo(
    () => analysis?.analise_dataset.colunas.map((item) => item.coluna) ?? [],
    [analysis],
  );

  const target = analysis ? (targetChoice ?? analysis.analise_dataset.recomendacoes.target_recomendado?.coluna ?? '') : '';
  const sensitive = analysis ? (sensitiveChoice ?? analysis.analise_dataset.recomendacoes.sensitive_recomendado?.coluna ?? '') : '';

  const canSubmit = useMemo(
    () => Boolean(file && analysis && target && sensitive && target !== sensitive && !isAnalyzing && !isTraining),
    [analysis, file, isAnalyzing, isTraining, sensitive, target],
  );

  async function applyFile(selectedFile: File | undefined) {
    setLocalError(null);

    if (!selectedFile) {
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setLocalError('Selecione um arquivo CSV válido.');
      return;
    }

    setFile(selectedFile);
    setTarget(null);
    setSensitive(null);

    try {
      await onAnalyze(selectedFile);
    }
    catch {
      return;
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void applyFile(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void applyFile(event.dataTransfer.files?.[0]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setLocalError('Selecione o arquivo CSV para iniciar a análise.');
      return;
    }

    if (!analysis) {
      setLocalError('Aguarde a leitura do arquivo antes de continuar.');
      return;
    }

    if (!target || !sensitive) {
      setLocalError('Escolha a coluna do resultado e o atributo para comparar grupos antes de treinar.');
      return;
    }

    if (target === sensitive) {
      setLocalError('O resultado e o atributo de comparação precisam estar em colunas diferentes.');
      return;
    }

    void onTrain({ file, target, sensitive, modelType: '' });
  }

  const resumo = analysis?.analise_dataset.resumo;
  const recomendacoes = analysis?.analise_dataset.recomendacoes;
  const invalidRecords =
    (resumo?.linhas_vazias_removidas ?? 0)
    + (resumo?.linhas_duplicadas ?? 0)
    + (resumo?.colunas_vazias_removidas ?? 0);

  return (
    <form className="upload-card" onSubmit={handleSubmit}>
      <div className="form-heading">
        <span className="section-kicker">Entrada de dados</span>
        <h2>Importar e configurar a análise</h2>
      </div>

      <label
        className="file-dropzone"
        htmlFor="csvFile"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input id="csvFile" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
        <span className="file-dropzone-title">{file ? file.name : 'Selecionar arquivo CSV'}</span>
        <span className="file-dropzone-meta">
          {file ? `${formatFileSize(file.size)} · ${isAnalyzing ? 'lendo arquivo…' : 'arquivo selecionado'}` : 'Arraste o arquivo para esta área'}
        </span>
      </label>

      {analysis ? (
        <div className="analysis-overview">
          <div className="summary-grid compact">
            <div>
              <span>Registros</span>
              <strong>{resumo?.registros_encontrados ?? 0}</strong>
            </div>
            <div>
              <span>Colunas</span>
              <strong>{resumo?.colunas_encontradas ?? 0}</strong>
            </div>
            <div>
              <span>Ausências</span>
              <strong>{resumo?.celulas_ausentes ?? 0}</strong>
            </div>
            <div>
              <span>Alertas iniciais</span>
              <strong>{invalidRecords}</strong>
            </div>
          </div>

          <div className="recommendation-grid">
            {renderRecommendation(recomendacoes?.target_recomendado ?? null, 'Target recomendado')}
            {renderRecommendation(recomendacoes?.sensitive_recomendado ?? null, 'Sensitive recomendado')}
          </div>

          {recomendacoes?.mensagens?.length ? (
            <div className="analysis-note-list">
              {recomendacoes.mensagens.map((mensagem) => (
                <p key={mensagem}>{mensagem}</p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="field-grid">
        <label className="field-group" htmlFor="targetColumn">
          <span>Target do problema</span>
          <select
            id="targetColumn"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            disabled={!analysis || isAnalyzing}
          >
            <option value="">Selecionar target</option>
            {columns.map((column) => (
              <option value={column} key={column}>
                {column}
              </option>
            ))}
          </select>
        </label>

        <label className="field-group" htmlFor="sensitiveColumn">
          <span>Atributo sensitive</span>
          <select
            id="sensitiveColumn"
            value={sensitive}
            onChange={(event) => setSensitive(event.target.value)}
            disabled={!analysis || isAnalyzing}
          >
            <option value="">Selecionar atributo</option>
            {columns.map((column) => (
              <option value={column} key={column}>
                {column}
              </option>
            ))}
          </select>
        </label>
      </div>

      {analysis ? (
        <div className="candidate-grid">
          <div className="candidate-card">
            <span>Outros targets sugeridos</span>
            <div className="column-preview">
              {(recomendacoes?.top_targets ?? []).map((item) => (
                <button
                  className={target === item.coluna ? 'tag-button is-active' : 'tag-button'}
                  type="button"
                  key={`target-${item.coluna}`}
                  onClick={() => setTarget(item.coluna)}
                >
                  {item.coluna}
                </button>
              ))}
            </div>
          </div>

          <div className="candidate-card">
            <span>Outros sensitive sugeridos</span>
            <div className="column-preview">
              {(recomendacoes?.top_sensitive ?? []).map((item) => (
                <button
                  className={sensitive === item.coluna ? 'tag-button is-active' : 'tag-button'}
                  type="button"
                  key={`sensitive-${item.coluna}`}
                  onClick={() => setSensitive(item.coluna)}
                >
                  {item.coluna}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <fieldset className="model-selector auto-model-selector">
        <legend>Modelos treinados automaticamente</legend>
        <div className="model-options">
          {MODEL_OPTIONS.map((option) => (
            <div className="model-option is-selected static" key={option.value}>
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </div>
          ))}
        </div>
        <p className="selector-helper">
          A análise compara os quatro modelos e apresenta o recomendado junto com os resultados de avaliação.
        </p>
      </fieldset>

      {columns.length > 0 ? (
        <div className="column-preview" aria-label="Colunas detectadas no CSV">
          {columns.slice(0, 10).map((column) => (
            <span key={column}>{column}</span>
          ))}
          {columns.length > 10 ? <span>+{columns.length - 10}</span> : null}
        </div>
      ) : null}

      {analysis && target && sensitive && target !== sensitive ? (
        <div className="selection-summary">
          <span>Configuração atual</span>
          <strong>{target}</strong>
          <em>resultado</em>
          <strong>{sensitive}</strong>
          <em>comparação entre grupos</em>
        </div>
      ) : null}

      {localError || error ? <p className="form-error">{localError ?? error}</p> : null}

      <button className="primary-button" type="submit" disabled={!canSubmit}>
        {isAnalyzing ? 'Lendo arquivo…' : isTraining ? 'Treinando modelos…' : 'Executar análise comparativa'}
      </button>

      {analysis && resumo ? (
        <div className="footer-hint">
          <span>Resumo do arquivo</span>
          <strong>
            {resumo.registros_encontrados} registros, {resumo.colunas_encontradas} colunas e {formatPercent(
              resumo.colunas_com_ausentes / Math.max(resumo.colunas_encontradas, 1),
            )}{' '}
            das colunas com valores ausentes.
          </strong>
        </div>
      ) : null}
    </form>
  );
}
