import logging
import json
from threading import Semaphore

from app.core.config import MODEL_VERSION, RANDOM_STATE
from importlib.metadata import version, PackageNotFoundError
from app.schemas.dataset import DatasetError
from app.schemas.platform import ModelCard, TrainingConfig
from app.services.automl import AutoMLService
from app.services.explainability import SHAPExplainer
from app.services.model_registry import ArtifactStore, ModelRegistry
from app.services.repository import Repository, new_id, now
from app.services.dataset_usage import using_dataset
from app.services.bias_mitigation import core_pipeline
from app.services.progress import ProgressCallback, report_progress

logger = logging.getLogger(__name__)
training_slots = Semaphore(1)


def training_metadata(model) -> dict:
    versions = {}
    for name in ("scikit-learn", "aif360", "fairlearn", "numpy", "pandas"):
        try:
            versions[name] = version(name)
        except PackageNotFoundError:
            versions[name] = None
    pipeline = core_pipeline(model)
    estimator = pipeline.named_steps["model"]
    parameters = {}
    for name, value in estimator.get_params(deep=False).items():
        try:
            parameters[name] = json.loads(json.dumps(value, allow_nan=False))
        except (TypeError, ValueError):
            continue
    return {"random_state": RANDOM_STATE, "split_method": "stratified_random_60_20_20", "versions": versions,
            "estimator_class": type(estimator).__name__, "model_parameters": parameters,
            "preprocessing_steps": {name: type(step).__name__ for name, step in pipeline.steps if name != "model"}}


def train_and_save(repository: Repository, config: TrainingConfig, run_id: str | None = None,
                   progress: ProgressCallback | None = None) -> ModelCard:
    with using_dataset(repository, config.dataset_id, run_id):
        return _train_and_save(repository, config, progress)


def _train_and_save(repository: Repository, config: TrainingConfig, progress: ProgressCallback | None = None) -> ModelCard:
    report_progress(progress, 1, "Carregando a base histórica salva.")
    dataset = repository.get("datasets", config.dataset_id)
    df = ArtifactStore(repository).load("datasets", dataset["id"], "dataset.joblib")
    report_progress(progress, 4, "Aguardando a vez de treinar. Outras análises podem estar em execução.")
    with training_slots:
        output = AutoMLService().train(df, config, progress)
        report_progress(progress, 88, "Calculando as explicações: quais informações pesaram nas previsões.")
        explanation = SHAPExplainer().explain(output.model, output.background, output.background, global_mode=True)
        card = ModelCard(id=new_id(), institution_id=repository.institution_id, version=MODEL_VERSION, is_demo=bool(dataset.get("is_demo")),
            training_metadata=training_metadata(output.model),
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
        report_progress(progress, 96, "Salvando o modelo, as métricas e as explicações.")
        ModelRegistry(repository).save(card, output.model, output.background, output.context)
    logger.info("Treinamento concluído: model_id=%s algorithm=%s", card.id, card.algorithm)
    return card


def execute_training_run(repository: Repository, run_id: str, config: TrainingConfig) -> None:
    run = repository.get("training_runs", run_id)
    run["status"] = "running"
    repository.put("training_runs", run)

    def update(percent: int, stage: str) -> None:
        run.update(progress=percent, stage=stage)
        repository.put("training_runs", run)

    try:
        card = train_and_save(repository, config, run_id, update)
        run.update(status="completed", model_id=card.id, progress=100, stage="Tudo pronto. O resultado está salvo.")
    except Exception as exc:
        logger.error("Treinamento falhou: run_id=%s exception_type=%s", run_id, type(exc).__name__)
        run.update(status="failed", error=str(exc) if isinstance(exc, DatasetError) else "O treinamento falhou. Revise a base e a configuração.")
    repository.put("training_runs", run)
