from copy import deepcopy
from io import BytesIO

import pytest
from fastapi import UploadFile
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.dataset import DatasetError
from app.schemas.platform import TrainingConfig, TrainingRun
from app.services.automl import AutoMLService
from app.services.dataset_imports import stage_import
from app.services.model_registry import ArtifactStore, ModelRegistry
from app.services.repository import new_id, now
from test_training_pipeline import students  # noqa: F401


def observe(repository, monkeypatch, kind):
    events = []
    put = repository.put

    def record(resource, payload):
        put(resource, payload)
        if resource == kind:
            events.append(deepcopy(payload))
            if payload["status"] == "completed":
                target = "datasets" if kind == "dataset_imports" else "models"
                repository.get(target, payload["dataset_id" if target == "datasets" else "model_id"])

    monkeypatch.setattr(repository, "put", record)
    return events


def test_import_reports_real_stages_and_only_completes_after_save(students, isolated_storage, monkeypatch):
    events = observe(isolated_storage, monkeypatch, "dataset_imports")
    with TestClient(app) as client:
        content = students.to_csv(index=False).encode()
        response = client.post("/dataset-imports", files={"file": ("historico.csv", content)}, data={"name": "Turma"})
        assert response.status_code == 202
        run_id = response.json()["id"]
        result = client.get(f"/dataset-imports/{run_id}").json()
        assert result["status"] == "completed" and result["progress"] == 100
        record = client.get(f"/datasets/{result['dataset_id']}").json()
        assert record["name"] == "Turma" and record["profile"]["rows"] == len(students)
        assert [e["progress"] for e in events] == sorted(e["progress"] for e in events)
        assert all(e["progress"] < 100 for e in events if e["status"] != "completed")
        assert len({e["stage"] for e in events}) >= 4
        assert not ArtifactStore(isolated_storage).path("dataset_imports", run_id, "upload.bin").exists()
        # A API síncrona continua usando o mesmo leitor, sem mudar a leitura.
        original = client.post("/datasets", files={"file": ("historico.csv", content)}).json()
        assert original["profile"] == record["profile"] and original["sha256"] == record["sha256"]


def test_invalid_import_stops_without_100_and_removes_temporary_file(isolated_storage):
    with TestClient(app) as client:
        run = client.post("/dataset-imports", files={"file": ("quebrada.xlsx", b"arquivo invalido")}).json()
        result = client.get(f"/dataset-imports/{run['id']}").json()
        assert result["status"] == "failed" and result["progress"] < 100
        assert result["error"] and result["dataset_id"] is None
        assert isolated_storage.count("datasets") == 0
        assert not ArtifactStore(isolated_storage).path("dataset_imports", run["id"], "upload.bin").exists()


@pytest.mark.parametrize("mitigation", ["none", "reweighing"])
def test_training_progress_keeps_metrics_unchanged_and_handles_failed_candidates(students, mitigation):
    config = TrainingConfig(dataset_id="test", target="situacao", positive_class="Evadido", algorithms=["logistic", "knn"],
                            identifier_column="matricula", sensitive_features=["sexo"], mitigation=mitigation, cv_folds=3)
    plain = AutoMLService().train(students, config)
    events = []
    measured = AutoMLService().train(students, config, lambda value, stage: events.append((value, stage)))
    assert measured.metrics == plain.metrics and measured.fairness == plain.fairness
    assert measured.comparison == plain.comparison and measured.split == plain.split
    assert [value for value, _ in events] == sorted(value for value, _ in events)
    assert max(value for value, _ in events) < 100  # Explicação e persistência ainda não ocorreram.
    assert any("validação cruzada" in stage for _, stage in events)
    if mitigation == "reweighing":
        assert "knn:reweighing" in measured.failed


@pytest.mark.parametrize("save_fails", [False, True])
def test_training_run_only_reaches_100_after_model_is_saved(students, isolated_storage, monkeypatch, save_fails):
    events = observe(isolated_storage, monkeypatch, "training_runs")
    if save_fails:
        def fail(*args, **kwargs):
            raise OSError("unavailable")
        monkeypatch.setattr(ModelRegistry, "save", fail)
    with TestClient(app) as client:
        dataset = client.post("/datasets", files={"file": ("base.csv", students.to_csv(index=False).encode())}).json()
        response = client.post("/training-runs", json={"dataset_id": dataset["id"], "target": "situacao",
                                "positive_class": "Evadido", "algorithms": ["logistic"], "identifier_column": "matricula"})
        assert response.status_code == 202 and response.json()["progress"] == 0
        run = client.get(f"/training-runs/{response.json()['id']}").json()
        assert [e["progress"] for e in events] == sorted(e["progress"] for e in events)
        assert all(e["progress"] < 100 for e in events if e["status"] != "completed")
        if save_fails:
            assert run["status"] == "failed" and run["progress"] == 96 and run["model_id"] is None
        else:
            assert run["status"] == "completed" and run["progress"] == 100
            assert client.get(f"/models/{run['model_id']}").status_code == 200


def test_restart_preserves_partial_progress_and_cleans_staged_upload(isolated_storage):
    run = stage_import(isolated_storage, UploadFile(BytesIO(b"a,b\n1,2\n"), filename="base.csv"), None)
    training = TrainingRun(id=new_id(), created_at=now(), status="running", progress=42, stage="Treinando.")
    isolated_storage.put("training_runs", training.model_dump())
    with TestClient(app) as client:
        imported = client.get(f"/dataset-imports/{run.id}").json()
        assert imported["status"] == "failed" and imported["progress"] == 0
        interrupted = client.get(f"/training-runs/{training.id}").json()
        assert interrupted["status"] == "failed" and interrupted["progress"] == 42
    assert not ArtifactStore(isolated_storage).path("dataset_imports", run.id, "upload.bin").exists()
    assert TrainingRun(id=new_id(), created_at=now(), status="queued").progress is None


def test_staging_enforces_size_limit_and_cleans_up(isolated_storage, monkeypatch):
    monkeypatch.setattr("app.services.dataset_imports.MAX_UPLOAD_BYTES", 5)
    with pytest.raises(DatasetError):
        stage_import(isolated_storage, UploadFile(BytesIO(b"123456"), filename="base.csv"), None)
    assert isolated_storage.count("dataset_imports") == 0
    assert not list(ArtifactStore(isolated_storage).root.glob("dataset_imports/*/upload.bin"))
