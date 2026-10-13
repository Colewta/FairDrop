export type ModelType = 'logistic' | 'rf' | 'knn' | 'xgboost';

export type TrainingFormData = {
  file: File;
  target: string;
  sensitive: string;
  modelType?: ModelType | '';
};

export type ModelOption = {
  value: ModelType;
  label: string;
  description: string;
};

export type ModelMetrics = {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number | null;
  confusion_matrix: number[][];
};

export type FairnessMetrics = {
  statistical_parity_difference: number | null;
  disparate_impact: number | null;
  equal_opportunity_difference: number | null;
  average_odds_difference: number | null;
  fairness_score?: number | null;
};

export type DatasetSummary = {
  total_linhas: number;
  total_colunas: number;
  linhas_apos_limpeza: number;
  linhas_finais: number;
  treino: number;
  teste: number;
  features_originais: number;
  features_modelo: number;
};

export type PreprocessingSummary = {
  target_binarizado: Record<string, number>;
  target_classe_positiva?: string | null;
  target_estrategia?: string | null;
  sensitive_binarizado?: Record<string, number> | null;
  sensitive_grupo_privilegiado?: string | null;
  sensitive_estrategia?: string | null;
  linhas_descartadas_target_nulo: number;
  linhas_descartadas_target_invalido: number;
  linhas_descartadas_sensitive_nulo: number;
  valores_ausentes_preenchidos: number;
  distribuicao_target: Record<string, number>;
};

export type DatasetColumnProfile = {
  coluna: string;
  tipo_inferido: string;
  valores_ausentes: number;
  taxa_ausentes: number;
  valores_unicos: number;
  valores_exemplo: string[];
};

export type DatasetRecommendation = {
  coluna: string;
  score: number;
  motivos: string[];
  valores_exemplo: string[];
  quantidade_unicos: number;
  taxa_ausentes: number;
};

export type DatasetAnalysis = {
  resumo: {
    registros_encontrados: number;
    colunas_encontradas: number;
    linhas_vazias_removidas: number;
    colunas_vazias_removidas: number;
    colunas_renomeadas: number;
    linhas_duplicadas: number;
    celulas_ausentes: number;
    colunas_com_ausentes: number;
    colunas_numericas: number;
    colunas_nao_numericas: number;
  };
  recomendacoes: {
    target_recomendado: DatasetRecommendation | null;
    sensitive_recomendado: DatasetRecommendation | null;
    top_targets: DatasetRecommendation[];
    top_sensitive: DatasetRecommendation[];
    mensagens: string[];
  };
  colunas: DatasetColumnProfile[];
};

export type AnalyzeResult = {
  arquivo: string;
  modelos_disponiveis: Record<string, string>;
  analise_dataset: DatasetAnalysis;
};

export type TrainedModelSummary = {
  nome: string;
  metricas: ModelMetrics;
  fairness: FairnessMetrics;
  feature_importance: Record<string, number>;
};

export type ComparativeWinner = {
  tipo: string;
  nome: string;
  valor: number;
} | null;

export type ComparativeSummary = {
  melhor_acuracia: ComparativeWinner;
  melhor_fairness: ComparativeWinner;
  melhor_equilibrio: ComparativeWinner;
  modelos_com_falha: Record<string, { nome: string; erro: string }>;
  insights: string[];
};

export type TrainingResult = {
  modelo: string;
  modelo_nome: string;
  modelo_solicitado?: string | null;
  modelo_principal: {
    tipo: string;
    nome: string;
    criterio: string;
  };
  metricas: ModelMetrics;
  fairness: FairnessMetrics;
  feature_importance: Record<string, number>;
  modelos: Record<string, TrainedModelSummary>;
  comparativo_modelos: ComparativeSummary;
  dataset: DatasetSummary;
  analise_dataset: DatasetAnalysis;
  preprocessamento: PreprocessingSummary;
};

export const MODEL_OPTIONS: ModelOption[] = [
  {
    value: 'rf',
    label: 'Random Forest',
    description: 'Bom equilíbrio para dados tabulares e importância de variáveis.'
  },
  {
    value: 'logistic',
    label: 'Regressão Logística',
    description: 'Modelo interpretável para linha de base acadêmica.'
  },
  {
    value: 'knn',
    label: 'KNN',
    description: 'Compara estudantes por proximidade entre características.'
  },
  {
    value: 'xgboost',
    label: 'XGBoost',
    description: 'Modelo robusto para capturar relações não lineares.'
  }
];

export function formatModelName(model: string) {
  const names: Record<string, string> = {
    logistic: 'Regressão Logística',
    rf: 'Random Forest',
    knn: 'KNN',
    xgboost: 'XGBoost',
    xgb: 'XGBoost',
  };

  return names[model] ?? model;
}
