"""Reponderação AIF360 ajustada dentro de cada fold, sem alterar dados de teste."""
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, ClassifierMixin, clone

from app.schemas.dataset import DatasetError
from app.services.numeric import parse_numeric
from app.services.mitigation_methods import METHODS, MitigatedClassifier, training_groups


class ReweighedClassifier(ClassifierMixin, BaseEstimator):
    def __init__(self, estimator, features, sensitive_features):
        self.estimator = estimator
        self.features = features
        self.sensitive_features = sensitive_features

    def fit(self, X, y):
        from aif360.algorithms.preprocessing import Reweighing
        from aif360.datasets import BinaryLabelDataset
        _, _, self.audit_ = training_groups(X, self.sensitive_features, y, "reweighing")
        if not self.sensitive_features:
            raise DatasetError("MITIGATION_GROUP_REQUIRED", "Confirme ao menos um grupo para comparar a mitigação.")
        groups = pd.DataFrame(index=X.index)
        for column in self.sensitive_features:
            series = X[column]
            if series.isna().any():
                raise DatasetError("MITIGATION_MISSING_GROUP", f"{column}: preencha ou revise os grupos ausentes antes da reponderação.")
            numeric = parse_numeric(series)
            if series.nunique() > 12 and numeric.notna().all():
                groups[column] = np.where(numeric <= numeric.median(), "até mediana", "acima da mediana")
            elif series.nunique() <= 12:
                groups[column] = series.astype(str)
            else:
                raise DatasetError("MITIGATION_TOO_MANY_GROUPS", f"{column}: defina até 12 grupos antes da mitigação.")
        codes, _ = pd.factorize(pd.MultiIndex.from_frame(groups))
        counts = pd.crosstab(codes, np.asarray(y)).reindex(columns=[0, 1], fill_value=0)
        if len(counts) < 2 or len(counts) > 32 or (counts < 5).any().any():
            raise DatasetError("MITIGATION_SMALL_GROUPS", "Cada grupo precisa de pelo menos 5 exemplos de cada resultado no treino de cada divisão; revise a amostra e os grupos.")
        # A API sklearn importa FairAdapt/R mesmo sem utilizá-lo em instalações
        # antigas. A API clássica do AIF360 evita esse extra. Para vários grupos,
        # preservamos somente os pesos do grupo focal de cada chamada; isso aplica
        # a mesma fórmula N(grupo)*N(classe)/(N*N(grupo,classe)) a cada célula.
        weights = np.empty(len(X), dtype=float)
        for code in counts.index:
            mask = codes == code
            data = BinaryLabelDataset(df=pd.DataFrame({"group": mask.astype(int), "label": np.asarray(y)}),
                                      label_names=["label"], protected_attribute_names=["group"])
            weighted = Reweighing(unprivileged_groups=[{"group": 0}], privileged_groups=[{"group": 1}]).fit_transform(data)
            weights[mask] = weighted.instance_weights[mask]
        if not np.isfinite(weights).all() or (weights <= 0).any():
            raise DatasetError("MITIGATION_INVALID_WEIGHTS", "Não foi possível obter pesos válidos para estes grupos.")
        self.weight_summary_ = {"min": float(weights.min()), "max": float(weights.max()),
                                "mean": float(weights.mean()), "effective_samples": float(weights.sum() ** 2 / np.square(weights).sum()),
                                "training_samples": float(len(X)), "groups": float(len(counts))}
        self.estimator_ = clone(self.estimator)
        self.estimator_.fit(X[self.features], y, model__sample_weight=weights)
        self.classes_ = self.estimator_.classes_
        return self

    def predict_proba(self, X):
        return self.estimator_.predict_proba(X[self.features])

    def predict(self, X):
        return self.estimator_.predict(X[self.features])


def core_pipeline(model):
    if hasattr(model, "calibrated_classifiers_"):
        model = model.calibrated_classifiers_[0].estimator
    return model.estimator_ if isinstance(model, (ReweighedClassifier, MitigatedClassifier)) else model


def weight_summary(model):
    if hasattr(model, "calibrated_classifiers_"):
        model = model.calibrated_classifiers_[0].estimator
    return getattr(model, "weight_summary_", {})


def experiment_audit(model):
    if hasattr(model, "calibrated_classifiers_"):
        model = model.calibrated_classifiers_[0].estimator
    return getattr(model, "audit_", {})


def mitigation_report(config, results, fitted, evaluator, test_frame, test_y, failed):
    from importlib.metadata import version
    from app.schemas.platform import MitigationReport
    from app.services.model_evaluator import evaluate_model
    if config.mitigation == "none":
        return MitigationReport()
    features = config.mitigation_features or config.sensitive_features[:1]
    method = config.mitigation
    name, stage, implementation = METHODS[method]
    parameters = {"strength": None if method == "reweighing" else config.mitigation_strength, "constraint": config.fairness_constraint,
                  "prefer_mitigated": config.prefer_mitigated, "seed": 42, "threshold": config.threshold,
                  "group_usage": "somente no treino; não exigido na inferência",
                  "comparison": "mesmos registros e features; seleção na validação; teste reservado",
                  "source_model": "A referência é treinada novamente neste experimento; não é uma cópia das métricas antigas.",
                  "class_balance": config.balance_classes,
                  "source_model_id": config.source_model_id,
                  "versions": {package: version(package) for package in ("numpy", "scikit-learn", "aif360", "fairlearn")}}
    if method == "adversarial":
        parameters.update(adversary_weight=10 * config.mitigation_strength, epochs=300, batch_size=512, learning_rate=.02,
                          gradient="remoção da projeção no gradiente adversário e inversão ponderada")
    if method == "regularization":
        parameters.update(penalty="média das diferenças quadráticas entre probabilidades médias de grupos e média global, condicional em y para EO", l2=.001, maxiter=300)
    warnings = [message for key, message in failed.items() if key.endswith(f":{method}")]
    if config.calibrate:
        warnings.append("A calibração faz ajustes em divisões menores do histórico. Os detalhes registrados aqui mostram a primeira dessas divisões; cada uma aprende seus próprios ajustes.")
    if method == "lfr":
        warnings.append("Para criar a nova representação das informações, o LFR usa até 2.000 exemplos do aprendizado e forma 4 pontos de comparação, chamados protótipos. A busca tem um limite de duração e pode não encontrar a melhor solução. Ainda podem restar pistas indiretas sobre o grupo.")
    if method in {"regularization", "adversarial"}:
        warnings.append("Esta técnica usa uma implementação experimental feita no FairDrop. Ela não é a implementação do AIF360 nem uma reprodução exata dos artigos. Confira os resultados e as limitações antes de usar a previsão.")
    if method == "constraints":
        warnings.append("A busca GridSearch testa um número limitado de opções. Ela pode não alcançar a diferença desejada entre os grupos. Confira também os resultados com novos dados e sempre que mudar a marca que gera um alerta.")
    paired = [item for item in results if item.variant == method and (item.algorithm, "baseline") in fitted]
    if not paired:
        return MitigationReport(method=method, stage=stage, implementation=implementation, parameters=parameters,
                                status="unavailable", features=features, warnings=warnings,
                                message=f"Não foi possível concluir o teste de {name.lower()} com estes dados e ajustes. A versão sem a técnica foi salva. Veja os motivos abaixo antes de tentar de novo.")
    # A variante é escolhida pela validação. O teste serve somente à auditoria final.
    chosen = paired[0]
    before, before_prediction = evaluate_model(fitted[(chosen.algorithm, "baseline")], test_frame, test_y, config.threshold)
    after_model = fitted[(chosen.algorithm, method)]
    after, after_prediction = evaluate_model(after_model, test_frame, test_y, config.threshold)
    before_fairness = evaluator.evaluate(test_frame, test_y, before_prediction)
    after_fairness = evaluator.evaluate(test_frame, test_y, after_prediction)
    selected = results[0].variant == method
    return MitigationReport(method=method, stage=stage, implementation=implementation, parameters=parameters,
        audit={**experiment_audit(after_model), "saved_algorithm": results[0].algorithm, "saved_variant": results[0].variant}, status="evaluated", selected=selected, features=features,
        algorithm=chosen.algorithm, before_metrics=before, after_metrics=after, before_fairness=before_fairness,
        after_fairness=after_fairness, weight_summary=weight_summary(after_model), warnings=warnings,
        message=("A versão com a técnica aplicada foi salva porque você marcou a opção de usá-la. Entre as opções com ajuste, foi escolhida a de maior pontuação na comparação." if config.prefer_mitigated else
                 "A versão com a técnica aplicada teve a maior pontuação na comparação e foi salva para uso. Confira abaixo quais medidas melhoraram e quais pioraram.") if selected else
                "O teste terminou, mas a versão sem o ajuste teve a maior pontuação na comparação e foi a escolhida para uso. Os resultados da versão ajustada continuam no relatório para você conferir.")
