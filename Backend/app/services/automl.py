import logging
from dataclasses import dataclass

import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split

from app.core.config import RANDOM_STATE
from app.schemas.dataset import ColumnRole, DatasetError
from app.schemas.platform import CandidateResult, TrainingConfig, MitigationReport
from app.services.dataset_profiler import DatasetProfiler
from app.services.fairness_evaluator import FairnessEvaluator
from app.services.model_evaluator import evaluate_model
from app.services.model_selector import ModelSelector
from app.services.models import criar_modelo, extrair_importancia
from app.services.preprocessing import build_pipeline
from app.services.numeric import parse_numeric
from app.services.bias_mitigation import ReweighedClassifier, core_pipeline, mitigation_report
from app.services.mitigation_methods import MitigatedClassifier, FairLogisticClassifier
from app.services.data_cleaning import add_issue, clean_feature_values, clean_identifiers, clean_table, cleaning_messages, finish_report, report_for

logger = logging.getLogger(__name__)


@dataclass
class TrainingOutput:
    model: object
    algorithm: str
    comparison: list[CandidateResult]
    failed: dict[str, str]
    features: list[str]
    feature_schema: dict[str, str]
    excluded: list[str]
    classes: list[str]
    metrics: object
    fairness: object
    feature_importance: dict[str, float]
    split: dict[str, int]
    background: pd.DataFrame
    warnings: list[str]
    mitigation: MitigationReport
    context: dict
    cleaning_report: dict


class AutoMLService:
    def train(self, df: pd.DataFrame, config: TrainingConfig) -> TrainingOutput:
        if config.target not in df.columns:
            raise DatasetError("TARGET_NOT_FOUND", "A coluna de resultado selecionada não existe na base.")
        required = config.sensitive_features + ([config.identifier_column] if config.identifier_column else [])
        if set(required) - set(df.columns):
            raise DatasetError("INVALID_COLUMNS", "Identificador ou atributo sensível não existe na base.")
        if config.mitigation in {"adversarial", "regularization"} and config.algorithms != ["logistic"]:
            raise DatasetError("MITIGATION_ALGORITHM", "Aprendizado adversarial e regularização usam o preditor logístico próprio. Selecione apenas regressão logística neste experimento.")
        working = clean_table(df)
        missing_target = working[config.target].isna()
        add_issue(working, "MISSING_TARGET", "removed", "Registros sem resultado conhecido foram removidos do treino; o resultado não é preenchido artificialmente.", missing_target, config.target)
        working = working.loc[~missing_target].copy()
        if config.target_rule:
            numeric = parse_numeric(working[config.target])
            add_issue(working, "INVALID_TARGET", "removed", "Resultados incompatíveis com a regra numérica foram removidos do treino.", numeric.isna(), config.target)
            working = working.loc[numeric.notna()].copy()
        working = clean_identifiers(working, config.identifier_column, config.target)
        finish_report(working)
        if config.target_rule:
            numeric = parse_numeric(working[config.target])
            mask = numeric >= config.target_rule.value if config.target_rule.operator == "ge" else numeric <= config.target_rule.value
            y_text = pd.Series("Demais valores", index=working.index).mask(mask, config.positive_class)
        else:
            y_text = working[config.target].astype(str)
        if y_text.nunique() < 2:
            raise DatasetError("TARGET_SINGLE_CLASS", "Após a limpeza, o resultado precisa ter registros de pelo menos duas situações diferentes.")
        if config.positive_class not in set(y_text):
            raise DatasetError("INVALID_POSITIVE_CLASS", "A classe de risco selecionada não existe na base.")
        y = (y_text == config.positive_class).astype(int)
        if len(working) < 30 or y.value_counts().min() < 8:
            raise DatasetError("INSUFFICIENT_DATA", f"Após a limpeza, restaram {len(working)} registros. São necessários pelo menos 30 registros e 8 exemplos de cada situação para treino, validação e teste.")
        trainval, test = train_test_split(working.index, test_size=0.2, stratify=y, random_state=RANDOM_STATE)
        train, validation = train_test_split(trainval, test_size=0.25, stratify=y.loc[trainval], random_state=RANDOM_STATE)
        # Inferências estatísticas que decidem features não consultam validação/teste.
        profile = DatasetProfiler().profile(working.loc[train], config.target)
        identifiers = set(profile.potential_ids) | ({config.identifier_column} if config.identifier_column else set())
        sensitive = set(profile.potential_sensitive_features) | set(config.sensitive_features)
        blocked = identifiers | {config.target}
        if not config.allow_sensitive_features:
            blocked |= sensitive
        high = {a.column for a in profile.leakage_alerts if a.risk == "HIGH"} - set(config.reviewed_leakage)
        blocked |= high
        unusable = {p.name for p in profile.column_profiles if ColumnRole.IGNORE in p.tags}
        features = list(dict.fromkeys(config.prediction_features)) if config.prediction_features is not None else [c for c in df.columns if c not in blocked | unusable]
        if set(features) - set(df.columns) or set(features) & blocked:
            raise DatasetError("UNSAFE_FEATURES", "A seleção contém coluna ausente, identificador, resultado, atributo sensível não autorizado ou leakage sem revisão.")
        for column in sorted(set(features) & unusable):
            add_issue(working, "UNUSABLE_COLUMN", "excluded", "Coluna vazia ou sem variação no treino foi excluída da previsão.", column=column, rows=[], count=1)
        features = [column for column in features if column not in unusable]
        if not features:
            raise DatasetError("NO_FEATURES", "Não restaram variáveis para previsão. Revise os papéis e alertas da base.")
        # Diagnóstico com schema do treino. O dado bruto segue para o pipeline,
        # que aprende tipos e imputação dentro de cada fold de calibração/CV.
        feature_schema = {item.name: item.dtype for item in profile.column_profiles if item.name in features}
        diagnosed = clean_feature_values(working, feature_schema)
        working.attrs["cleaning_report"] = diagnosed.attrs["cleaning_report"]
        # A localização já está resumida no relatório; não propagar o mapa
        # completo para cada fold, amostra SHAP e bloco de inferência.
        working.attrs.pop("source_rows", None)
        X_train, X_validation = working.loc[train, features], working.loc[validation, features]
        evaluator = FairnessEvaluator(config.sensitive_features, config.reference_groups).fit(working.loc[train])
        selector = ModelSelector(config.strategy, config.selection_weights)
        results = []
        fitted = {}
        failed = {}
        for algorithm in dict.fromkeys(config.algorithms):
            variants = ["baseline", config.mitigation] if config.mitigation != "none" else ["baseline"]
            for variant in variants:
                key = (algorithm, variant)
                try:
                    if variant in {"reweighing", "constraints"} and algorithm == "knn":
                        raise DatasetError("UNSUPPORTED_MITIGATION", "KNN não aceita pesos por registro; somente sua versão original foi avaliada.")
                    estimator = criar_modelo(algorithm, max(1, len(train) // 2), config.balance_classes)
                    if config.mitigation in {"adversarial", "regularization"}:
                        mode = "adversarial_baseline" if config.mitigation == "adversarial" else "baseline"
                        estimator = FairLogisticClassifier(mode=mode, constraint=config.fairness_constraint)
                    if algorithm == "xgboost" and config.balance_classes:
                        counts = y.loc[train].value_counts()
                        estimator.set_params(scale_pos_weight=float(counts[0] / counts[1]))
                    model = build_pipeline(estimator, scale=algorithm in {"logistic", "knn"})
                    training_frame = X_train
                    if variant == "reweighing":
                        model = ReweighedClassifier(model, features, config.mitigation_features or config.sensitive_features[:1])
                        training_frame = working.loc[train]
                    elif variant != "baseline":
                        model = MitigatedClassifier(model, features, config.mitigation_features or config.sensitive_features[:1],
                                                    variant, config.mitigation_strength, config.fairness_constraint)
                        training_frame = working.loc[train]
                    if config.calibrate:
                        model = CalibratedClassifierCV(model, method="sigmoid", cv=StratifiedKFold(3, shuffle=True, random_state=RANDOM_STATE))
                    cv = {}
                    if config.cv_folds:
                        if y.loc[train].value_counts().min() < max(config.cv_folds, 5 if config.calibrate else 2):
                            raise ValueError("Insufficient class count for nested calibration/CV")
                        scores = cross_validate(model, training_frame, y.loc[train], cv=StratifiedKFold(config.cv_folds, shuffle=True, random_state=RANDOM_STATE),
                                                scoring={"recall": "recall", "roc_auc": "roc_auc", "pr_auc": "average_precision"}, error_score="raise", n_jobs=1)
                        cv = {name[5:]: {"mean": float(value.mean()), "std": float(value.std())} for name, value in scores.items() if name.startswith("test_")}
                    model.fit(training_frame, y.loc[train])
                    metrics, prediction = evaluate_model(model, X_validation, y.loc[validation], config.threshold)
                    fairness = evaluator.evaluate(working.loc[validation], y.loc[validation], prediction)
                    score, components, weights = selector.score(metrics, fairness)
                    results.append(CandidateResult(algorithm=algorithm, variant=variant, validation=metrics, fairness=fairness, score=score,
                                                   score_components=components, effective_weights=weights, cross_validation=cv))
                    fitted[key] = model
                except Exception as exc:
                    logger.warning("Algoritmo %s/%s falhou: %s", algorithm, variant, type(exc).__name__)
                    failed[f"{algorithm}:{variant}"] = str(exc) if isinstance(exc, DatasetError) else "Treino incompatível com a base ou configuração; revise amostras, calibração e validação cruzada."
        if not results:
            raise DatasetError("ALL_MODELS_FAILED", "Nenhum algoritmo pôde ser treinado. Revise a quantidade de registros e as opções avançadas.")
        results.sort(key=lambda r: (-r.score, r.algorithm, r.variant))
        if config.prefer_mitigated:
            mitigated = [item for item in results if item.variant == config.mitigation]
            if mitigated:
                chosen = mitigated[0]
                results.remove(chosen)
                results.insert(0, chosen)
        algorithm = results[0].algorithm
        model = fitted[(algorithm, results[0].variant)]
        # Não reajustar após selecionar: mantém o modelo efetivamente avaliado e teste intacto.
        metrics, predictions = evaluate_model(model, working.loc[test, features], y.loc[test], config.threshold)
        fairness = evaluator.evaluate(working.loc[test], y.loc[test], predictions)
        core = core_pipeline(model)
        importance = {} if config.calibrate or results[0].variant == "lfr" else extrair_importancia(core.named_steps["model"], core.named_steps["columns"].get_feature_names_out())
        warnings = cleaning_messages(working)
        for alert in profile.leakage_alerts:
            if alert.risk == "HIGH" and alert.column not in features:
                warnings.append(f"Coluna excluída por risco de vazamento de informação: {alert.column}. {alert.reason}")
            elif alert.column in features:
                warnings.append(f"Revise a disponibilidade antes do evento: {alert.column}. {alert.reason}")
        if metrics.accuracy == 1.0:
            warnings.append("Todos os registros do teste foram classificados corretamente (100% de acurácia). Isso não garante previsões perfeitas em novos alunos. Antes de usar o modelo, verifique se alguma informação revela o resultado e valide em outro período.")
        if not config.sensitive_features:
            warnings.append("Fairness não avaliada: nenhum atributo sensível foi confirmado.")
        if y_text.nunique() > 2:
            warnings.append("Classificação binária: classe confirmada versus todas as demais.")
        if config.balance_classes and config.mitigation not in {"adversarial", "regularization"}:
            warnings.append("Pesos de classe ativados em Logistic Regression, Random Forest e XGBoost; KNN não suporta essa opção.")
        if any(r.fairness.score is None for r in results):
            warnings.append("Fairness indisponível na seleção: pesos dos critérios disponíveis foram renormalizados e estão registrados.")
        from app.services.explanation_context import build_context
        return TrainingOutput(model=model, algorithm=algorithm, comparison=results, failed=failed, features=features,
            feature_schema=core.named_steps["schema"].kinds_, excluded=[c for c in df.columns if c not in features],
            classes=sorted(y_text.unique()), metrics=metrics, fairness=fairness, feature_importance=importance,
            split={"train": len(train), "validation": len(validation), "test": len(test)},
            background=X_train.sample(min(len(X_train), 40), random_state=RANDOM_STATE), warnings=warnings,
            mitigation=mitigation_report(config, results, fitted, evaluator, working.loc[test], y.loc[test], failed),
            context=build_context(X_train, y.loc[train]), cleaning_report=report_for(working))
