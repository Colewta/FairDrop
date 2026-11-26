from typing import Literal
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.schemas.platform import (DatasetRecord, ModelCard, PredictionBatch, PredictionPage,
                                  StudentDetail, TrainingConfig, TrainingRun, MitigationRequest, ScenarioRequest, TutorReview, DatasetRename)
from app.schemas.dataset import DatasetError
from app.services.dataset_profiler import DatasetProfiler
from app.services.dataset_reader import read_upload
from app.services.model_registry import ArtifactStore, ModelRegistry
from app.services.platform_training import execute_training_run, train_and_save
from app.services.prediction import RiskPredictor
from app.services.repository import Repository, get_repository, new_id, now, resources
from app.services.dataset_catalog import upload_digest, protected_csv
from app.services.dataset_usage import dataset_lock
import pandas as pd
from app.services.numeric import parse_numeric
from app.services.mitigation_methods import METHODS

router = APIRouter(tags=["platform"])


def save_dataset(repository: Repository, file: UploadFile, name: str | None = None) -> DatasetRecord:
    if name is not None and not name.strip():
        raise DatasetError("INVALID_DATASET_NAME", "Informe um nome para a base ou deixe o campo vazio.")
    display_name = DatasetRename(name=name).name if name is not None else file.filename or "Base"
    digest = upload_digest(file)
    frame = read_upload(file)
    record = DatasetRecord(id=new_id(), name=display_name, original_name=file.filename, sha256=digest,
                           created_at=now(), profile=DatasetProfiler().profile(frame))
    ArtifactStore(repository).save("datasets", record.id, "dataset.joblib", frame)
    repository.put("datasets", record.model_dump(mode="json"))
    return record


@router.post("/datasets", response_model=DatasetRecord, status_code=201)
def upload_dataset(file: UploadFile = File(...), name: str | None = Form(None, min_length=1, max_length=160), repository: Repository = Depends(get_repository)):
    return save_dataset(repository, file, name)


@router.get("/datasets", response_model=list[DatasetRecord])
def list_datasets(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0), repository: Repository = Depends(get_repository)):
    return repository.list("datasets", limit, offset)


@router.get("/dataset-catalog")
def dataset_catalog(q: str = Query("", max_length=200), sort: Literal["name", "created_at", "rows", "columns"] = "created_at",
                    direction: Literal["asc", "desc"] = "desc", source: Literal["all", "real", "demo"] = "all",
                    limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0), repository: Repository = Depends(get_repository)):
    return repository.dataset_catalog(q.strip(), sort, direction == "desc", source, limit, offset)


@router.post("/datasets/check-duplicate")
def check_duplicate(file: UploadFile = File(...), repository: Repository = Depends(get_repository)):
    matches = repository.dataset_duplicates(upload_digest(file))
    return {"matches": [{"id": row["id"], "name": row["name"], "created_at": row["created_at"]} for row in matches],
            "scope": "Arquivos com bytes idênticos e hash registrado nesta instalação; nomes iguais não indicam duplicidade."}


@router.patch("/datasets/{identifier}", response_model=DatasetRecord)
def rename_dataset(identifier: str, request: DatasetRename, repository: Repository = Depends(get_repository)):
    record = repository.get("datasets", identifier)
    record["original_name"] = record.get("original_name") or record["name"]
    record["name"] = request.name
    repository.put("datasets", record)
    return record


@router.get("/datasets/{identifier}/dependencies")
def dataset_dependencies(identifier: str, repository: Repository = Depends(get_repository)):
    repository.get("datasets", identifier)
    return repository.dataset_dependencies(identifier)


@router.get("/datasets/{identifier}", response_model=DatasetRecord)
def get_dataset(identifier: str, target: str | None = None, repository: Repository = Depends(get_repository)):
    record = repository.get("datasets", identifier)
    if target is not None:
        frame = ArtifactStore(repository).load("datasets", record["id"], "dataset.joblib")
        record["profile"] = DatasetProfiler().profile(frame, target).model_dump(mode="json")
    return record


@router.get("/datasets/{identifier}/values")
def column_values(identifier: str, column: str, repository: Repository = Depends(get_repository)):
    record = repository.get("datasets", identifier)
    frame = ArtifactStore(repository).load("datasets", record["id"], "dataset.joblib")
    from app.schemas.dataset import DatasetError
    if column not in frame.columns or column in record["profile"]["potential_ids"]:
        raise DatasetError("INVALID_COLUMN", "Selecione uma coluna de resultado ou grupos, sem identificadores.")
    values = frame[column].dropna().astype(str).value_counts()
    if len(values) > 30:
        numeric = parse_numeric(frame[column]).dropna()
        if len(numeric) == frame[column].notna().sum():
            return {"values": [], "numeric": {"min": float(numeric.min()), "max": float(numeric.max()), "suggested_cut": float(numeric.median())},
                    "message": "Esta coluna contém números. Escolha uma faixa de atenção para transformar sua pergunta em duas situações."}
        raise DatasetError("TOO_MANY_CLASSES", "Mais de 30 valores distintos; defina categorias antes de treinar.")
    return {"values": [{"value": str(value), "count": int(count)} for value, count in values.items()]}


@router.get("/datasets/{identifier}/preview")
def dataset_preview(identifier: str, offset: int = Query(0, ge=0), limit: int = Query(5, ge=1, le=100), repository: Repository = Depends(get_repository)):
    record = repository.get("datasets", identifier)
    frame = ArtifactStore(repository).load("datasets", record["id"], "dataset.joblib")
    masked = record["profile"]["potential_ids"]
    rows = [{column: "••••" if column in masked else None if pd.isna(value) else str(value)
             for column, value in row.items()} for row in frame.iloc[offset:offset + limit].to_dict(orient="records")]
    return {"columns": list(frame.columns), "rows": rows, "masked_columns": masked, "total": len(frame), "offset": offset, "limit": limit}


@router.get("/datasets/{identifier}/export")
def export_dataset(identifier: str, repository: Repository = Depends(get_repository)):
    record = repository.get("datasets", identifier)
    frame = ArtifactStore(repository).load("datasets", record["id"], "dataset.joblib")
    return StreamingResponse(protected_csv(frame, record["profile"]["potential_ids"]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="fairdrop-base-{record["id"]}.csv"'})


@router.delete("/datasets/{identifier}", status_code=204)
def delete_dataset(identifier: str, repository: Repository = Depends(get_repository)):
    with dataset_lock:
        record = repository.get("datasets", identifier)
        dependencies = repository.dataset_dependencies(identifier)
        if dependencies["models"] or dependencies["active_runs"]:
            raise DatasetError("DATASET_IN_USE", f"A base está vinculada a {dependencies['models']} análises salvas e {dependencies['active_runs']} execuções ativas. Preserve a base para manter os experimentos reproduzíveis.", 409)
        ArtifactStore(repository).path("datasets", record["id"], "dataset.joblib").unlink(missing_ok=True)
        repository.remove("datasets", identifier)


@router.post("/train-automl", response_model=ModelCard)
def train_automl(config: TrainingConfig, repository: Repository = Depends(get_repository)):
    return train_and_save(repository, config)


@router.post("/training-runs", response_model=TrainingRun, status_code=202)
def start_training(config: TrainingConfig, tasks: BackgroundTasks, repository: Repository = Depends(get_repository)):
    with dataset_lock:
        repository.get("datasets", config.dataset_id)
        run = TrainingRun(id=new_id(), status="queued", created_at=now())
        repository.put("training_runs", {**run.model_dump(), "config": config.model_dump(mode="json")})
    tasks.add_task(execute_training_run, repository, run.id, config)
    return run


@router.get("/training-runs/{identifier}", response_model=TrainingRun)
def get_training(identifier: str, repository: Repository = Depends(get_repository)):
    return repository.get("training_runs", identifier)


@router.get("/models", response_model=list[ModelCard])
def list_models(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0), repository: Repository = Depends(get_repository)):
    return repository.list("models", limit, offset)


@router.get("/models/{identifier}", response_model=ModelCard)
def get_model(identifier: str, repository: Repository = Depends(get_repository)):
    from app.services.model_registry import unsafe_model_features
    record = repository.get("models", identifier)
    exists = ArtifactStore(repository).path("models", record["id"], "model.joblib").is_file()
    unsafe = unsafe_model_features(ModelCard.model_validate(record))
    return {**record, "prediction_available": exists and not unsafe,
            "prediction_unavailable_reason": "Arquivo do modelo indisponível." if not exists else
                "Há atributos posteriores ao resultado sem revisão. Treine uma nova análise antes de avaliar alunos." if unsafe else None}


@router.delete("/models/{identifier}", status_code=204)
def delete_model(identifier: str, repository: Repository = Depends(get_repository)):
    ModelRegistry(repository).delete(identifier)


@router.post("/predict", response_model=PredictionBatch, status_code=201)
def predict(file: UploadFile = File(...), model_id: str = Form(...), repository: Repository = Depends(get_repository)):
    return RiskPredictor(repository).predict(model_id, read_upload(file), file.filename or "Alunos atuais")


@router.get("/predictions", response_model=list[PredictionBatch])
def list_batches(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0), repository: Repository = Depends(get_repository)):
    return repository.list("prediction_batches", limit, offset)


@router.get("/predictions/{identifier}", response_model=PredictionBatch)
def get_batch(identifier: str, repository: Repository = Depends(get_repository)):
    return repository.get("prediction_batches", identifier)


@router.get("/predictions/{identifier}/students", response_model=PredictionPage)
def list_students(identifier: str, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
                  risk: str | None = Query(None, pattern="^(low|medium|high)$"), q: str = Query("", max_length=200),
                  group_column: str | None = Query(None, max_length=200), group_value: str | None = Query(None, max_length=500),
                  sort: Literal["risk_desc", "risk_asc", "identifier"] = "risk_desc", repository: Repository = Depends(get_repository)):
    total, items = repository.prediction_page(identifier, page, page_size, risk, q, group_column, group_value, sort)
    return PredictionPage(total=total, items=items, page=page, page_size=page_size)


@router.delete("/predictions/{identifier}", status_code=204)
def delete_batch(identifier: str, repository: Repository = Depends(get_repository)):
    repository.delete_batch(identifier)


@router.get("/students/{identifier}", response_model=StudentDetail)
def get_student(identifier: str, repository: Repository = Depends(get_repository)):
    return RiskPredictor(repository).explain_student(identifier)


@router.get("/models/{identifier}/mitigation-options")
def mitigation_options(identifier: str, constraint: str = "demographic_parity", repository: Repository = Depends(get_repository)):
    from app.services.mitigation_options import experiment_options
    if constraint not in {"demographic_parity", "equalized_odds"}:
        raise DatasetError("INVALID_CONSTRAINT", "Escolha paridade de alertas ou equilíbrio dos erros.")
    return experiment_options(repository, ModelCard.model_validate(repository.get("models", identifier)), constraint)


@router.post("/models/{identifier}/mitigate", response_model=TrainingRun, status_code=202)
def mitigate_model(identifier: str, request: MitigationRequest, tasks: BackgroundTasks, repository: Repository = Depends(get_repository)):
    card = ModelCard.model_validate(repository.get("models", identifier))
    from app.services.mitigation_options import experiment_options
    if request.method == "none":
        raise DatasetError("INVALID_MITIGATION", "Escolha uma técnica de mitigação.")
    options = experiment_options(repository, card, request.constraint)
    group = next((g for g in options["groups"] if g["column"] == request.feature), None)
    if group is None:
        raise DatasetError("INVALID_MITIGATION_GROUP", "Escolha um grupo disponível na base, sem identificadores ou informações posteriores ao resultado.")
    eligibility = group["eligibility"][request.method]
    if not eligibility["available"]:
        raise DatasetError("MITIGATION_UNAVAILABLE", eligibility["reason"])
    repository.get("datasets", card.dataset_id)
    algorithms = ["logistic"] if request.method in {"regularization", "adversarial", "constraints"} else card.config.algorithms
    protected = set(card.sensitive_features) | {request.feature} | {g["column"] for g in options["groups"] if g["suggested"]}
    prediction_features = [f for f in card.features if f not in protected]
    if not prediction_features:
        raise DatasetError("NO_FEATURES", "Não restaram informações de previsão após separar os grupos. Revise os atributos da base antes do experimento.")
    config = card.config.model_copy(update={"mitigation": request.method, "mitigation_features": [request.feature],
        "sensitive_features": list(dict.fromkeys([*card.sensitive_features, request.feature])),
        "prediction_features": prediction_features, "allow_sensitive_features": False,
        "balance_classes": False, "algorithms": algorithms, "mitigation_strength": request.strength,
        "fairness_constraint": request.constraint, "prefer_mitigated": request.apply,
        "source_model_id": card.id,
        "strategy": request.strategy, "name": f"{METHODS[request.method][0]} · {card.name}"[:160]})
    return start_training(config, tasks, repository)


@router.post("/students/{identifier}/scenario")
def simulate_student(identifier: str, request: ScenarioRequest, repository: Repository = Depends(get_repository)):
    return RiskPredictor(repository).scenario(identifier, request.feature, request.value)


@router.get("/students/{identifier}/review", response_model=TutorReview)
def read_review(identifier: str, repository: Repository = Depends(get_repository)):
    row = repository.student(identifier)
    try:
        return repository.get("tutor_reviews", row["id"])
    except DatasetError as exc:
        if exc.code != "NOT_FOUND":
            raise
        return TutorReview()


@router.put("/students/{identifier}/review", response_model=TutorReview)
def save_review(identifier: str, review: TutorReview, repository: Repository = Depends(get_repository)):
    row = repository.student(identifier)
    review.updated_at = now()
    repository.put("tutor_reviews", {"id": row["id"], **review.model_dump(mode="json")})
    return review


@router.get("/dashboard")
def dashboard(repository: Repository = Depends(get_repository)):
    batches = repository.list("prediction_batches", 1)
    datasets, models = resources["datasets"], resources["models"]
    return {"latest_batch": batches[0] if batches else None,
            "counts": {"datasets": repository.count("datasets"), "models": repository.count("models"),
                       "prediction_batches": repository.count("prediction_batches"),
                       "mitigation_experiments": repository.count("models", models.c.payload["mitigation"]["method"].as_string().not_in(["none", ""])),
                       "demo_datasets": repository.count("datasets", datasets.c.payload["is_demo"].as_boolean() == True),
                       "demo_models": repository.count("models", models.c.payload["is_demo"].as_boolean() == True)},
            "recent_datasets": repository.dataset_catalog("", "created_at", True, "all", 4, 0)["items"],
            "recent_models": repository.list("models", 4),
            "message": "Resumo do lote mais recente; cada envio representa uma fotografia dos alunos."}
