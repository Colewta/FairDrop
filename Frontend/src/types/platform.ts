import type { ModelMetrics, ModelType } from './model';

export interface ColumnProfile {
  name: string; dtype: string; missing_percentage: number; unique_values: number;
  cardinality_ratio: number; min: number | null; max: number | null; mean: number | null;
  role_suggestion: string; tags: string[]; confidence: number; reasons: string[];
}
export interface DatasetProfile {
  import_info: Record<string, string | number>; import_warnings: string[];
  rows: number; columns: number; duplicates: number; missing_cells_percentage: number;
  column_profiles: ColumnProfile[]; selected_target: string | null; target_source: string;
  target_candidates: { column: string; confidence: number; reason: string }[];
  potential_targets: string[]; potential_ids: string[]; potential_sensitive_features: string[];
  prediction_features: string[]; fairness_features: string[]; excluded_features: string[];
  leakage_alerts: { column: string; risk: string; reason: string }[];
  health: { issues: { severity: string; code: string; message: string; column: string | null }[]; checks: string[] };
}
export interface DatasetRecord { id: string; name: string; created_at: string; profile: DatasetProfile; is_demo: boolean }
export interface Metrics extends ModelMetrics {
  pr_auc: number | null; specificity: number; balanced_accuracy: number; brier_score: number;
  calibration_curve: { predicted: number; observed: number }[];
}
export interface FairnessReport {
  status: string; score: number | null; warnings: string[]; semantics: string;
  comparisons: { feature: string; group: string; reference: string; group_count: number; reference_count: number;
    group_rates: Record<string, number | null>; reference_rates: Record<string, number | null>;
    metrics: Record<string, number | null>; status: string; explanation: string }[];
}
export interface CandidateResult {
  variant: 'baseline' | 'reweighing';
  algorithm: string; validation: Metrics; fairness: FairnessReport; score: number;
  score_components: Record<string, number>; effective_weights: Record<string, number>;
  cross_validation: Record<string, { mean: number; std: number }>;
}
export interface Factor {
  feature: string; value: string | number | null; impact: number; direction: 'increase' | 'decrease';
  interpretation: string; historical_context: string; tutor_actions: string[]; bias_caution: string;
  scenario_allowed: boolean; reference_min: number | null; reference_max: number | null;
}
export interface Explanation {
  reference_rows: number | null;
  status: 'available' | 'unavailable' | 'pending'; method: string; base_value: number | null;
  probability: number | null; factors: Factor[]; global_importance: Record<string, number>; message: string;
}
export interface TrainingConfig {
  mitigation?: 'none' | 'reweighing'; mitigation_features?: string[];
  target_rule?: { operator: 'ge' | 'le'; value: number };
  dataset_id: string; target: string; positive_class: string; name: string;
  sensitive_features: string[]; identifier_column: string | null; reference_groups?: Record<string, string>;
  prediction_features?: string[]; reviewed_leakage?: string[]; allow_sensitive_features?: boolean;
  strategy: 'best_predictive' | 'best_fairness' | 'best_balanced';
  algorithms?: ModelType[]; threshold: number; low_risk_max: number; medium_risk_max: number;
  calibrate: boolean; cv_folds: number; balance_classes: boolean; selection_weights?: Record<string, number>;
}
export interface MitigationReport {
  method: string; status: string; selected: boolean; features: string[]; algorithm: string | null; message: string;
  before_metrics: Metrics | null; after_metrics: Metrics | null; before_fairness: FairnessReport | null; after_fairness: FairnessReport | null;
  weight_summary: Record<string, number>; warnings: string[];
}
export interface ModelCard {
  mitigation: MitigationReport;
  is_demo: boolean;
  id: string; institution_id: string; version: string; name: string; created_at: string;
  dataset_id: string; dataset_name: string; target: string; positive_class: string; classes: string[];
  features: string[]; excluded_features: string[]; sensitive_features: string[]; identifier_column: string | null;
  algorithm: string; threshold: number; risk_thresholds: { low: number; medium: number }; config: TrainingConfig;
  feature_schema: Record<string, string>; metrics: Metrics; fairness: FairnessReport; comparison: CandidateResult[];
  failed_algorithms: Record<string, string>; feature_importance: Record<string, number>; explanation: Explanation;
  split: Record<string, number>; warnings: string[]; limitations: string[];
}
export interface TrainingRun { id: string; status: 'queued' | 'running' | 'completed' | 'failed'; created_at: string; model_id: string | null; error: string | null }
export interface StudentPrediction {
  groups: Record<string, string>;
  id: string; student_id: string; batch_id: string; model_id: string; created_at: string;
  risk_probability: number; risk_level: 'low' | 'medium' | 'high'; prediction: number;
  top_factors: Factor[]; explanation_status: string;
}
export interface PredictionBatch {
  group_filters: Record<string, string[]>;
  id: string; model_id: string; name: string; created_at: string; total: number;
  summary: Record<'low' | 'medium' | 'high', number>; average_risk: number; warnings: string[];
  audit: Record<string, string | number | string[] | Record<string, number>>;
}
export interface PredictionPage { total: number; items: StudentPrediction[]; page: number; page_size: number }
export interface StudentDetail { prediction: StudentPrediction; explanation: Explanation; history: StudentPrediction[]; history_total: number; used_information: Record<string, string | number | boolean | null>; ignored_columns: string[] }
export interface TutorReview { checked_actions: string[]; note: string; conclusion: 'pending' | 'support' | 'data_issue' | 'disagree' | 'monitor'; updated_at: string | null }
export interface ScenarioResult { original_probability: number; simulated_probability: number; difference: number; message: string }
