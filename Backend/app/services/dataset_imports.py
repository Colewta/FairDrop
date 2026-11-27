"""Importação acompanhável, mantendo o mesmo leitor e diagnóstico da API síncrona."""
import logging

from fastapi import UploadFile

from app.core.config import MAX_UPLOAD_BYTES
from app.schemas.dataset import DatasetError
from app.schemas.platform import DatasetImportRun, DatasetRecord, DatasetRename
from app.services.dataset_catalog import upload_digest
from app.services.dataset_profiler import DatasetProfiler
from app.services.dataset_reader import read_upload
from app.services.model_registry import ArtifactStore
from app.services.progress import ProgressCallback, report_progress
from app.services.repository import Repository, new_id, now

logger = logging.getLogger(__name__)


def save_dataset(repository: Repository, file: UploadFile, name: str | None = None,
                 progress: ProgressCallback | None = None) -> DatasetRecord:
    if name is not None and not name.strip():
        raise DatasetError("INVALID_DATASET_NAME", "Informe um nome para a base ou deixe o campo vazio.")
    display_name = DatasetRename(name=name).name if name is not None else file.filename or "Base"
    report_progress(progress, 0, "Conferindo o conteúdo recebido.")
    digest = upload_digest(file)
    report_progress(progress, 10, "Lendo as linhas e organizando as colunas do arquivo.")
    frame = read_upload(file)
    report_progress(progress, 55, "Verificando os tipos de dados, campos vazios e possíveis problemas.")
    profile = DatasetProfiler().profile(frame)
    record = DatasetRecord(id=new_id(), name=display_name, original_name=file.filename, sha256=digest,
                           created_at=now(), profile=profile)
    report_progress(progress, 90, "Salvando a base e o relatório da leitura.")
    ArtifactStore(repository).save("datasets", record.id, "dataset.joblib", frame)
    repository.put("datasets", record.model_dump(mode="json"))
    return record


def stage_import(repository: Repository, file: UploadFile, name: str | None) -> DatasetImportRun:
    # O UploadFile é fechado ao terminar a requisição. Guardar uma cópia limitada
    # permite processá-lo depois de devolver o ID ao navegador.
    if name is not None:
        DatasetRename(name=name)
    run = DatasetImportRun(id=new_id(), status="queued", created_at=now())
    path = ArtifactStore(repository).path("dataset_imports", run.id, "upload.bin")
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        size = 0
        with path.open("wb") as target:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise DatasetError("FILE_TOO_LARGE", "O arquivo excede o limite de importação.", 413)
                target.write(chunk)
        repository.put("dataset_imports", {**run.model_dump(), "filename": file.filename, "name": name})
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return run


def execute_import(repository: Repository, identifier: str) -> None:
    run = repository.get("dataset_imports", identifier)
    path = ArtifactStore(repository).path("dataset_imports", identifier, "upload.bin")
    run["status"] = "running"

    def update(percent: int, stage: str) -> None:
        run.update(progress=percent, stage=stage)
        repository.put("dataset_imports", run)

    try:
        with path.open("rb") as stream:
            record = save_dataset(repository, UploadFile(stream, filename=run["filename"]), run["name"], update)
        run.update(status="completed", progress=100, stage="Leitura concluída. A base está salva.", dataset_id=record.id)
    except Exception as exc:
        logger.error("Importação falhou: import_id=%s exception_type=%s", identifier, type(exc).__name__)
        run.update(status="failed", error=str(exc) if isinstance(exc, DatasetError) else
                   "Não foi possível ler o arquivo. Confira o formato e tente importar novamente.")
    finally:
        path.unlink(missing_ok=True)
    repository.put("dataset_imports", run)
