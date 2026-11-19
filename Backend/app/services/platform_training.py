import logging
from threading import Semaphore

from app.core.config import MODEL_VERSION
from app.schemas.dataset import DatasetError
from app.schemas.platform import ModelCard, TrainingConfig
from app.services.automl import AutoMLService
from app.services.explainability import SHAPExplainer
from app.services.model_registry import ArtifactStore, ModelRegistry
from app.services.repository import Repository, new_id, now

logger = logging.getLogger(__name__)
training_slots = Semaphore(1)


def train_and_save(repository: Repository, config: TrainingConfig) -> ModelCard:
    dataset = repository.get("datasets", config.dataset_id)
    df = ArtifactStore(repository).load("datasets", dataset["id"], "dataset.joblib")
    with training_slots:
        output = AutoMLService().train(df, config)
        explanation = SHAPExplainer().explain(output.model, output.background, output.background, global_mode=True)
        card = ModelCard(id=new_id(), institution_id=repository.institution_id, version=MODEL_VERSION,
            name=config.name, created_at=now(), dataset_id=dataset["id"], dataset_name=dataset["name"],
            target=config.target, positive_class=config.positive_class, classes=output.classes,
            features=output.features, feature_schema=output.feature_schema, excluded_features=output.excluded,
            sensitive_features=config.sensitive_features, identifier_column=config.identifier_column,
            algorithm=output.algorithm, threshold=config.threshold,
            risk_thresholds={"low": config.low_risk_max, "medium": config.medium_risk_max}, config=config,
            metrics=output.metrics, fairness=output.fairness, comparison=output.comparison,
            failed_algorithms=output.failed, feature_importance=output.feature_importance,
            explanation=explanation, split=output.split, warnings=output.warnings, mitigation=output.mitigation,
            cleaning_report=output.cleaning_report,
            limitations=["Probabilidade estimada a partir de dados históricos; não é certeza nem diagnóstico.",
                         "A explicação SHAP mostra o que pesou na conta. Ela não mostra, por si só, por que o aluno teve aquela situação.",
                         "As comparações dependem dos grupos escolhidos e da quantidade de exemplos. Estar dentro das faixas de atenção não prova que o tratamento foi justo.",
                         "O histórico foi separado por sorteio entre alunos. Antes de usar a análise no atendimento, confira os resultados com dados de outro período.",
                         "Esta instalação reúne os dados de uma instituição. Confira cada caso antes de decidir um encaminhamento para o aluno."])
        ModelRegistry(repository).save(card, output.model, output.background, output.context)
    logger.info("Treinamento concluído: model_id=%s algorithm=%s", card.id, card.algorithm)
    return card


def execute_training_run(repository: Repository, run_id: str, config: TrainingConfig) -> None:
    run = repository.get("training_runs", run_id)
    run["status"] = "running"
    repository.put("training_runs", run)
    try:
        card = train_and_save(repository, config)
        run.update(status="completed", model_id=card.id)
    except Exception as exc:
        logger.error("Treinamento falhou: run_id=%s exception_type=%s", run_id, type(exc).__name__)
        run.update(status="failed", error=str(exc) if isinstance(exc, DatasetError) else "O treinamento falhou. Revise a base e a configuração.")
    repository.put("training_runs", run)
