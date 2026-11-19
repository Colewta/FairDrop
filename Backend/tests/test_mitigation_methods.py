import joblib
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.platform import TrainingConfig
from app.services.automl import AutoMLService
from app.services.mitigation_methods import METHODS, training_groups
from app.services.mitigation_methods import FairLogisticClassifier
from app.schemas.dataset import DatasetError


@pytest.fixture
def biased():
    rng = np.random.default_rng(73)
    group = np.repeat(["A", "B"], 240)
    return pd.DataFrame({"matricula": [f"RA{i:04}" for i in range(480)], "grupo": group,
                         "campus": group, "nota": rng.normal(6, 2, 480),
                         "situacao": np.where(rng.random(480) < np.where(group == "A", .18, .8), "Risco", "Ativo")})


@pytest.mark.parametrize("method", list(METHODS))
def test_methods_compare_same_holdout_serialize_and_predict_without_groups(biased, tmp_path, method):
    config = TrainingConfig(dataset_id="test", target="situacao", positive_class="Risco", identifier_column="matricula",
                            sensitive_features=["grupo"], mitigation_features=["grupo"], mitigation=method,
                            algorithms=["logistic"], balance_classes=False, prefer_mitigated=True)
    output = AutoMLService().train(biased, config)
    assert output.failed == {}, output.failed
    assert {c.variant for c in output.comparison} == {"baseline", method}
    report = output.mitigation
    assert report.status == "evaluated" and report.selected
    assert report.implementation and report.stage and report.parameters["seed"] == 42
    assert report.audit["training_rows"] == output.split["train"]
    assert sum(map(sum, report.before_metrics.confusion_matrix)) == output.split["test"]
    assert sum(map(sum, report.after_metrics.confusion_matrix)) == output.split["test"]
    future = biased[output.features].head(11)
    probabilities = output.model.predict_proba(future)
    assert np.isfinite(probabilities).all() and np.allclose(probabilities.sum(axis=1), 1)
    assert "grupo" not in output.features
    joblib.dump(output.model, tmp_path / "model.joblib")
    np.testing.assert_allclose(probabilities, joblib.load(tmp_path / "model.joblib").predict_proba(future))
    assert output.metrics == report.after_metrics
    if method == "resampling":
        assert report.audit["sampled_rows"] == output.split["train"]
        assert sum(c["negative"] + c["positive"] for c in report.audit["cells_after"]) == output.split["train"]


def test_options_allow_unconfigured_groups_and_block_impossible_experiment(biased, isolated_storage):
    biased["grupo_resultado"] = biased.situacao
    with TestClient(app) as client:
        dataset = client.post("/datasets", files={"file": ("historico.csv", biased.to_csv(index=False).encode())}).json()
        card = client.post("/train-automl", json={"dataset_id": dataset["id"], "target": "situacao", "positive_class": "Risco",
                          "identifier_column": "matricula", "algorithms": ["logistic"]}).json()
        assert not card["sensitive_features"]
        options = client.get(f"/models/{card['id']}/mitigation-options").json()
        group = next(g for g in options["groups"] if g["column"] == "grupo")
        assert all(e["available"] for e in group["eligibility"].values())
        assert not any(g["column"] in {"matricula", "situacao"} for g in options["groups"])
        deterministic = next(g for g in options["groups"] if g["column"] == "grupo_resultado")
        assert deterministic["eligibility"]["regularization"]["available"]
        assert not deterministic["eligibility"]["resampling"]["available"]
        response = client.post(f"/models/{card['id']}/mitigate", json={"feature": "grupo", "method": "resampling", "apply": True})
        assert response.status_code == 202, response.text
        run = client.get(f"/training-runs/{response.json()['id']}").json()
        assert run["status"] == "completed", run
        new = client.get(f"/models/{run['model_id']}").json()
        assert new["sensitive_features"] == ["grupo"] and new["mitigation"]["selected"]
        assert client.get(f"/models/{card['id']}").json()["sensitive_features"] == []
        assert client.post(f"/models/{card['id']}/mitigate", json={"feature": "situacao", "method": "resampling"}).status_code == 400


def test_methods_do_not_fabricate_missing_group_outcomes():
    frame = pd.DataFrame({"grupo": ["A"] * 30 + ["B"] * 30})
    y = np.array([0] * 30 + [0, 1] * 15)
    for method in ("reweighing", "resampling"):
        with pytest.raises(DatasetError, match="cada resultado"):
            training_groups(frame, ["grupo"], y, method)
    for method in ("adversarial", "constraints", "regularization"):
        training_groups(frame, ["grupo"], y, method)
        with pytest.raises(DatasetError, match="cada resultado"):
            training_groups(frame, ["grupo"], y, method, "equalized_odds")


@pytest.mark.parametrize("method,baseline", [("regularization", "baseline"), ("adversarial", "adversarial_baseline")])
def test_training_objectives_reduce_score_disparity_on_controlled_proxy(biased, method, baseline):
    from scipy.sparse import csr_matrix
    groups = (biased.grupo == "B").astype(int).to_numpy()
    X = csr_matrix(np.c_[groups, biased.nota / 10])
    y = (biased.situacao == "Risco").astype(int).to_numpy()
    original = FairLogisticClassifier(mode=baseline).fit(X, y).predict_proba(X)[:, 1]
    mitigated = FairLogisticClassifier(mode=method, strength=1).fit(X, y, groups=groups).predict_proba(X)[:, 1]
    gap = lambda p: abs(p[groups == 0].mean() - p[groups == 1].mean())
    assert gap(mitigated) < gap(original)


def test_resampling_with_calibration_and_cv_only_adjusts_internal_training(biased):
    output = AutoMLService().train(biased, TrainingConfig(dataset_id="test", target="situacao", positive_class="Risco",
        identifier_column="matricula", sensitive_features=["grupo"], algorithms=["logistic"], balance_classes=False,
        mitigation="resampling", calibrate=True, cv_folds=3, prefer_mitigated=True))
    assert output.mitigation.status == "evaluated" and output.mitigation.selected, output.failed
    assert output.mitigation.audit["training_rows"] < output.split["train"]
    assert output.comparison[0].cross_validation


def test_zero_adversarial_strength_preserves_the_predictor_training(biased):
    from scipy.sparse import csr_matrix
    groups = (biased.grupo == "B").astype(int).to_numpy()
    X = csr_matrix(np.c_[groups, biased.nota / 10])
    y = (biased.situacao == "Risco").astype(int).to_numpy()
    original = FairLogisticClassifier(mode="adversarial_baseline").fit(X, y)
    zero = FairLogisticClassifier(mode="adversarial", strength=0).fit(X, y, groups=groups)
    np.testing.assert_allclose(original.predict_proba(X), zero.predict_proba(X))
