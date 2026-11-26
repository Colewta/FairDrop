import csv
from io import StringIO
from hashlib import sha256

import numpy as np
from fastapi.testclient import TestClient
from sklearn.metrics import average_precision_score, roc_auc_score, precision_recall_curve, roc_curve

from app.main import app
from app.services.repository import Repository, new_id
from app.services.model_evaluator import evaluate_model
from app.services.dataset_usage import using_dataset
from test_training_pipeline import students  # noqa: F401


def upload(client, frame, name="historico.csv", display=None):
    content = frame.to_csv(index=False).encode()
    response = client.post("/datasets", files={"file": (name, content)}, data={"name": display} if display else {})
    assert response.status_code == 201, response.text
    return response.json(), content


def test_catalog_search_order_pagination_and_institution_scope(students, isolated_storage):
    with TestClient(app) as client:
        record, _ = upload(client, students, display="Turma Azul")
        for i in range(24):
            copy = {**record, "id": new_id(), "name": f"Turma {i:02d}", "profile": {**record["profile"], "rows": 100 + i}}
            isolated_storage.put("datasets", copy)
        result = client.get("/dataset-catalog", params={"q": "turma", "sort": "rows", "direction": "asc", "limit": 10, "offset": 10}).json()
        assert result["total"] == 25 and len(result["items"]) == 10
        assert [row["rows"] for row in result["items"]] == sorted(row["rows"] for row in result["items"])
        assert client.get("/dataset-catalog", params={"q": "TURMA AZUL"}).json()["total"] == 1
        client.patch(f"/datasets/{record['id']}", json={"name": "Turma Ázul"})
        assert client.get("/dataset-catalog", params={"q": "TURMA AZUL"}).json()["total"] == 1
        assert client.get("/dataset-catalog", params={"q": "%"}).json()["total"] == 0
        assert client.get("/dataset-catalog", params={"sort": "invalid"}).status_code == 422
        assert client.get("/dataset-catalog", params={"source": "demo"}).json()["total"] == 0
        other = Repository(isolated_storage.root, "other")
        try:
            assert other.dataset_catalog("", "created_at", True, "all", 20, 0)["total"] == 0
        finally:
            other.engine.dispose()


def test_duplicate_hash_rename_preview_export_preserve_source(students, isolated_storage):
    frame = students.copy()
    frame["observacao"] = "=1+1"
    with TestClient(app) as client:
        record, content = upload(client, frame, name="original.csv", display="Histórico 2024")
        assert record["sha256"] == sha256(content).hexdigest()
        matches = client.post("/datasets/check-duplicate", files={"file": ("outro-nome.csv", content)}).json()["matches"]
        assert [r["id"] for r in matches] == [record["id"]]
        assert client.post("/datasets/check-duplicate", files={"file": ("original.csv", content + b"\n")}).json()["matches"] == []
        preview = client.get(f"/datasets/{record['id']}/preview", params={"offset": 8, "limit": 8}).json()
        assert len(preview["rows"]) == 8 and preview["total"] == len(frame)
        assert all(r["matricula"] == "••••" for r in preview["rows"])
        renamed = client.patch(f"/datasets/{record['id']}", json={"name": "  Nova identificação  "}).json()
        assert renamed["name"] == "Nova identificação" and renamed["original_name"] == "original.csv"
        assert renamed["sha256"] == record["sha256"]
        assert client.patch(f"/datasets/{record['id']}", json={"name": "   "}).status_code == 422
        assert client.get(f"/datasets/{record['id']}/preview", params={"offset": 8, "limit": 8}).json() == preview
        exported = client.get(f"/datasets/{record['id']}/export")
        assert exported.status_code == 200
        rows = list(csv.DictReader(StringIO(exported.content.decode("utf-8-sig"))))
        assert len(rows) == len(frame) and all(r["matricula"] == "••••" for r in rows)
        assert all(r["observacao"] == "'=1+1" for r in rows)
        version, _ = upload(client, frame, name="original.csv")
        assert version["id"] != record["id"]


def test_dependencies_and_real_counts_keep_experiments_reproducible(students, isolated_storage):
    with TestClient(app) as client:
        record, _ = upload(client, students)
        # A procedência fictícia deve acompanhar os modelos derivados.
        stored = isolated_storage.get("datasets", record["id"])
        stored["is_demo"] = True
        isolated_storage.put("datasets", stored)
        response = client.post("/train-automl", json={"dataset_id": record["id"], "target": "situacao", "positive_class": "Evadido", "algorithms": ["logistic"], "identifier_column": "matricula", "sensitive_features": ["sexo"]})
        assert response.status_code == 200, response.text
        model = response.json()
        assert model["is_demo"] and model["training_metadata"]["random_state"] == 42
        assert model["training_metadata"]["estimator_class"] == "LogisticRegression"
        assert "C" in model["training_metadata"]["model_parameters"]
        assert client.get(f"/models/{model['id']}").json()["prediction_available"] is True
        assert client.get(f"/datasets/{record['id']}/dependencies").json() == {"models": 1, "active_runs": 0}
        assert client.delete(f"/datasets/{record['id']}").status_code == 409
        assert client.get(f"/models/{model['id']}").json()["metrics"] == model["metrics"]
        stats = client.get("/dashboard").json()["counts"]
        assert stats["datasets"] == stats["models"] == stats["demo_models"] == 1
        assert stats["prediction_batches"] == stats["mitigation_experiments"] == 0
        # Metadados antigos continuam legíveis, sem preencher a persistência com inferências.
        legacy = isolated_storage.get("models", model["id"])
        legacy.pop("training_metadata")
        for field in ("roc_curve", "precision_recall_curve", "probability_histogram"):
            legacy["metrics"].pop(field)
        isolated_storage.put("models", legacy)
        loaded = client.get(f"/models/{model['id']}").json()
        assert loaded["metrics"]["roc_curve"] == [] and loaded["training_metadata"] == {}
        assert "training_metadata" not in isolated_storage.get("models", model["id"])
        client.delete(f"/models/{model['id']}")
        run_id = new_id()
        isolated_storage.put("training_runs", {"id": run_id, "status": "running", "config": {"dataset_id": record["id"]}})
        assert client.delete(f"/datasets/{record['id']}").status_code == 409
        isolated_storage.put("training_runs", {"id": run_id, "status": "failed", "config": {"dataset_id": record["id"]}})
        with using_dataset(isolated_storage, record["id"]):
            assert client.get(f"/datasets/{record['id']}/dependencies").json()["active_runs"] == 1
            assert client.delete(f"/datasets/{record['id']}").status_code == 409
        assert client.delete(f"/datasets/{record['id']}").status_code == 204


def test_curve_points_and_histogram_use_actual_predictions():
    probabilities = np.linspace(.01, .99, 500)
    y = np.asarray([i % 3 == 0 for i in range(500)], dtype=int)
    class Predictor:
        def predict_proba(self, X):
            return np.column_stack([1 - probabilities[:len(X)], probabilities[:len(X)]])
    metrics, predicted = evaluate_model(Predictor(), np.zeros((500, 1)), y, .5)
    assert np.array_equal(predicted, probabilities >= .5)
    assert np.isclose(metrics.roc_auc, roc_auc_score(y, probabilities))
    assert np.isclose(metrics.pr_auc, average_precision_score(y, probabilities))
    fpr, tpr, _ = roc_curve(y, probabilities)
    precision, recall, _ = precision_recall_curve(y, probabilities)
    assert all((p["fpr"], p["tpr"]) in set(zip(fpr, tpr)) for p in metrics.roc_curve)
    assert all((p["recall"], p["precision"]) in set(zip(recall, precision)) for p in metrics.precision_recall_curve)
    assert len(metrics.roc_curve) <= 150 and len(metrics.precision_recall_curve) <= 150
    assert sum(p["negative"] + p["positive"] for p in metrics.probability_histogram) == 500
    one_class, _ = evaluate_model(Predictor(), np.zeros((5, 1)), np.zeros(5, dtype=int), .5)
    assert one_class.roc_curve == [] and one_class.precision_recall_curve == []
