import json

import numpy as np
import pandas as pd

from app.core.config import PREDICTION_CHUNK_SIZE
from app.schemas.dataset import DatasetError
from app.schemas.platform import Explanation, PredictionBatch, StudentDetail, StudentPrediction
from app.services.explainability import SHAPExplainer
from app.services.model_registry import ModelRegistry
from app.services.repository import Repository, new_id, now
from app.services.semantic_analyzer import normalize_name
from app.services.explanation_context import CONTEXT_VERSION, build_context, enrich_explanation, scenario_allowed
from app.services.data_cleaning import add_issue, clean_feature_values, clean_identifiers, clean_table, cleaning_messages, finish_report, report_for
from app.services.leakage_detector import LeakageDetector


def risk_level(probability: float, low: float, medium: float) -> str:
    return "low" if probability < low else "medium" if probability < medium else "high"


class RiskPredictor:
    def __init__(self, repository: Repository):
        self.repository = repository

    def predict(self, model_id: str, frame: pd.DataFrame, name: str) -> PredictionBatch:
        card, artifact = ModelRegistry(self.repository).load(model_id)
        # Pipelines antigos não são corrigidos ao atualizar o detector. Evitar
        # novas avaliações com metadados pós-evento que nunca foram revisados.
        schema = pd.DataFrame(columns=list(dict.fromkeys([*card.features, card.target])))
        unsafe = [alert.column for alert in LeakageDetector().detect(schema, card.target, [])
                  if alert.risk == "HIGH" and alert.column not in card.config.reviewed_leakage]
        if unsafe:
            raise DatasetError("UNSAFE_SAVED_MODEL", "Este modelo foi treinado com informações que podem revelar o resultado: "
                               + ", ".join(unsafe) + ". Treine um novo modelo com a proteção atual antes de avaliar alunos.")
        missing = set(card.features) - set(frame.columns)
        if missing:
            raise DatasetError("MISSING_FEATURES", "A base atual não contém as colunas utilizadas no treinamento: " + ", ".join(sorted(missing)))
        frame = clean_feature_values(clean_table(frame), card.feature_schema)
        frame = clean_identifiers(frame, card.identifier_column)
        if frame.empty:
            raise DatasetError("NO_USABLE_ROWS", "Não restaram registros utilizáveis para avaliar.")
        batch_id = new_id()
        timestamp = now()
        if card.identifier_column and card.identifier_column in frame.columns:
            missing_ids = frame[card.identifier_column].isna()
            add_issue(frame, "GENERATED_IDENTIFIERS", "generated", "Registros sem matrícula receberam identificação exclusiva desta avaliação; não serão ligados a outros períodos.", missing_ids, card.identifier_column)
            ids = [str(value) if pd.notna(value) else f"{batch_id}:{i + 1}" for i, value in enumerate(frame[card.identifier_column])]
        else:
            ids = [f"{batch_id}:{i + 1}" for i in range(len(frame))]
            add_issue(frame, "GENERATED_IDENTIFIERS", "generated", "Identificador ausente: foram criados IDs exclusivos deste lote; não é possível ligar estes registros a outros períodos.", frame.index.isin(frame.index))
        finish_report(frame)
        warnings = cleaning_messages(frame)
        cleaning_report = report_for(frame)
        frame.attrs = {}
        if card.target in frame.columns:
            warnings.append("A coluna de resultado foi ignorada na previsão.")
        probabilities = np.concatenate([artifact["pipeline"].predict_proba(frame.iloc[start:start + PREDICTION_CHUNK_SIZE][card.features])[:, 1]
                                        for start in range(0, len(frame), PREDICTION_CHUNK_SIZE)])
        if not np.isfinite(probabilities).all():
            raise DatasetError("INVALID_PROBABILITIES", "O modelo retornou probabilidades inválidas.")
        summary = {"low": 0, "medium": 0, "high": 0}
        levels = [risk_level(float(p), card.risk_thresholds["low"], card.risk_thresholds["medium"]) for p in probabilities]
        summary = {level: levels.count(level) for level in summary}
        group_columns = [column for column in frame.columns
                         if normalize_name(column) in {"curso", "course", "course_name", "nome_curso", "turma", "classe", "class", "cohort", "classroom"}
                         and column not in {card.target, card.identifier_column}]
        group_filters = {column: sorted(frame[column].dropna().astype(str).unique().tolist())
                         for column in group_columns if frame[column].nunique() <= 200}
        group_columns = list(group_filters)

        def rows():
            for start in range(0, len(frame), PREDICTION_CHUNK_SIZE):
                records = json.loads(frame.iloc[start:start + PREDICTION_CHUNK_SIZE][card.features].to_json(orient="records", date_format="iso"))
                groups = frame.iloc[start:start + PREDICTION_CHUNK_SIZE][group_columns].to_dict(orient="records")
                for offset, features in enumerate(records):
                    index = start + offset
                    probability = float(probabilities[index])
                    item = StudentPrediction(id=new_id(), student_id=ids[index], batch_id=batch_id, model_id=card.id,
                                             created_at=timestamp, risk_probability=probability, risk_level=levels[index],
                                             prediction=int(probability >= card.threshold),
                                             groups={key: str(value) for key, value in groups[offset].items() if pd.notna(value)})
                    yield {"id": item.id, "institution_id": self.repository.institution_id, "batch_id": batch_id,
                           "student_id": item.student_id, "created_at": timestamp, "probability": probability,
                           "risk_level": levels[index], "payload": item.model_dump(mode="json"), "features": features, "explanation": None}
        batch = PredictionBatch(id=batch_id, model_id=card.id, name=name, created_at=timestamp, total=len(frame),
            summary=summary, average_risk=float(probabilities.mean()), warnings=warnings, group_filters=group_filters,
            cleaning_report=cleaning_report,
            audit={"model_id": card.id, "version": card.version, "algorithm": card.algorithm, "created_at": timestamp,
                   "features": card.features, "threshold": card.threshold, "risk_thresholds": card.risk_thresholds,
                   "positive_class": card.positive_class,
                   "ignored_columns": [column for column in frame.columns if column not in card.features]})
        self.repository.save_batch(batch.model_dump(mode="json"), rows())
        return batch

    def explain_student(self, identifier: str) -> StudentDetail:
        row = self.repository.student(identifier)
        payload = row["payload"]
        explanation = Explanation.model_validate(row["explanation"]) if row["explanation"] else None
        if explanation is None or explanation.context_version < CONTEXT_VERSION:
            try:
                card, artifact = ModelRegistry(self.repository).load(payload["model_id"])
                if explanation is None:
                    explanation = SHAPExplainer().explain(artifact["pipeline"], artifact["background"], pd.DataFrame([row["features"]]))
                context = artifact.get("context") or build_context(artifact["background"])
                explanation = enrich_explanation(explanation, context)
                for factor in explanation.factors:
                    if factor.feature in card.sensitive_features:
                        factor.scenario_allowed = False
            except DatasetError:
                explanation = Explanation(status="unavailable", message="O modelo não está mais disponível; a previsão e sua auditoria foram preservadas.")
            payload["top_factors"] = [f.model_dump() for f in explanation.factors[:5]]
            payload["explanation_status"] = explanation.status
            self.repository.save_explanation(identifier, explanation.model_dump(mode="json"), payload)
        total, history = self.repository.history(row["student_id"])
        batch = self.repository.get("prediction_batches", payload["batch_id"])
        return StudentDetail(prediction=StudentPrediction.model_validate(payload), explanation=explanation,
                             history=[StudentPrediction.model_validate(p) for p in history], history_total=total,
                             used_information=row["features"], ignored_columns=batch["audit"].get("ignored_columns", []))

    def scenario(self, identifier: str, feature: str, value: float) -> dict:
        row = self.repository.student(identifier)
        card, artifact = ModelRegistry(self.repository).load(row["payload"]["model_id"])
        context = artifact.get("context") or build_context(artifact["background"])
        spec = context["columns"].get(feature, {})
        if feature not in card.features or feature in card.sensitive_features or not scenario_allowed(feature) or spec.get("kind") != "numeric":
            raise DatasetError("SCENARIO_NOT_ALLOWED", "Simulações estão disponíveis apenas para indicadores numéricos de frequência, desempenho e participação; atributos sensíveis não podem ser alterados.")
        if not spec["min"] <= value <= spec["max"]:
            raise DatasetError("SCENARIO_OUT_OF_RANGE", f"Use um valor dentro da faixa histórica: {spec['min']:.4g} a {spec['max']:.4g}.")
        simulated = {**row["features"], feature: value}
        probability = float(artifact["pipeline"].predict_proba(pd.DataFrame([simulated]))[0, 1])
        original = row["payload"]["risk_probability"]
        return {"feature": feature, "original_value": row["features"][feature], "simulated_value": value,
                "original_probability": original, "simulated_probability": probability, "difference": probability - original,
                "message": "Simulação do modelo mantendo as demais informações fixas. Não estima o efeito real de uma intervenção, pode criar combinações pouco plausíveis e não altera o registro do aluno."}
