from io import BytesIO

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.dataset import DatasetError
from app.schemas.platform import TrainingConfig
from app.services.automl import AutoMLService
from app.services.data_cleaning import clean_feature_values, clean_identifiers, clean_table
from app.services.dataset_profiler import infer_type
from app.services.dataset_reader import read_dataset
from app.services.numeric import parse_numeric
from test_training_pipeline import students  # noqa: F401


def by_code(report):
    return {issue["code"]: issue for issue in report["issues"]}


def test_reader_recovers_duplicates_missing_fields_and_malformed_rows_with_source_lines():
    content = b"sep=;\nmatricula;nota;situacao\n001;7;Ativo\n001 ;7;Ativo\n002;8\n003;5;Evadido;extra\n;;;\nmatricula;nota;situacao\n004;6;Evadido;\n"
    frame = read_dataset(content, "historico.csv")
    assert frame["matricula"].tolist() == ["001", "002", "004"]
    assert pd.isna(frame.iloc[1]["situacao"])
    report = frame.attrs["cleaning_report"]
    assert (report["input_rows"], report["output_rows"], report["removed_rows"]) == (7, 3, 4)
    issues = by_code(report)
    assert issues["DUPLICATE_ROWS"]["rows"] == [4]
    assert issues["MISSING_FIELDS"]["rows"] == [5]
    assert issues["INVALID_CSV_ROWS"]["rows"] == [6]
    assert issues["EMPTY_ROWS"]["rows"] == [7]
    assert issues["REPEATED_HEADERS"]["rows"] == [8]
    assert issues["EXTRA_EMPTY_FIELDS"]["rows"] == [7, 9]
    assert frame.attrs["import_info"]["header_row"] == 2


def test_csv_quote_recovery_preserves_later_records_and_valid_multiline_fields():
    frame = read_dataset(b'a,b\n1,"aspas abertas\n2,ok\n3,"campo\ncompleto"\n4,final\n', "dados.csv")
    assert frame["a"].tolist() == ["2", "3", "4"]
    assert frame.iloc[1]["b"] == "campo\ncompleto"
    assert by_code(frame.attrs["cleaning_report"])["INVALID_CSV_ROWS"]["rows"] == [2]
    assert frame.attrs["source_rows"][1] == 4


def test_excel_cleaning_preserves_physical_row_numbers():
    raw = pd.DataFrame([[None, None], ["matricula", "nota"], ["001", 7], ["001", 7], [None, None], ["002", 8]])
    output = BytesIO()
    raw.to_excel(output, index=False, header=False)
    frame = read_dataset(output.getvalue(), "historico.xlsx")
    assert frame["matricula"].tolist() == ["001", "002"]
    issues = by_code(frame.attrs["cleaning_report"])
    assert issues["DUPLICATE_ROWS"]["rows"] == [4]
    assert issues["EMPTY_ROWS"]["rows"] == [5]
    assert frame.attrs["cleaning_report"]["removed_rows"] == 2


def test_identifier_resolution_does_not_choose_between_contradictory_labels():
    frame = pd.DataFrame({"matricula": ["a", "a", "b", "b", None, "c"],
                          "nota": [None, 7, 5, 6, 8, 9],
                          "situacao": ["Ativo", "Ativo", "Ativo", "Evadido", "Ativo", "Evadido"]})
    before = frame.copy(deep=True)
    cleaned = clean_identifiers(clean_table(frame), "matricula", "situacao")
    assert cleaned["matricula"].tolist() == ["a", "c"]
    assert cleaned.iloc[0]["nota"] == 7
    issues = by_code(cleaned.attrs["cleaning_report"])
    assert issues["CONFLICTING_RESULTS"]["count"] == 2
    assert issues["REPEATED_IDENTIFIERS"]["rows"] == [2]
    assert issues["MISSING_IDENTIFIERS"]["rows"] == [6]
    pd.testing.assert_frame_equal(frame, before)


def test_invalid_features_use_the_saved_schema_and_keep_categories_unchanged():
    frame = clean_table(pd.DataFrame({"matricula": ["001", "002", "003"],
                                     "nota": ["7,5", "NAO_E_NUMERO", "inf"],
                                     "data": ["2025-01-01", "INVALIDA", None],
                                     "curso": ["A", "NOVA_CATEGORIA", "B"]}))
    cleaned = clean_feature_values(frame, {"nota": "numeric", "data": "date", "curso": "categorical"})
    assert cleaned["nota"].isna().tolist() == [False, True, True]
    assert cleaned["data"].isna().tolist() == [False, True, True]
    assert cleaned["curso"].tolist() == frame["curso"].tolist()
    assert frame.iloc[1]["nota"] == "NAO_E_NUMERO"
    issues = cleaned.attrs["cleaning_report"]["issues"]
    assert next(i for i in issues if i["column"] == "nota")["rows"] == [3, 4]
    assert "NAO_E_NUMERO" not in str(issues)
    assert infer_type(pd.Series([str(i) for i in range(19)] + ["erro"])) == "numeric"
    assert infer_type(pd.Series(["1", "2", "a", "b"])) != "numeric"
    assert parse_numeric(pd.Series([1, np.inf, -np.inf])).isna().tolist() == [False, True, True]


def test_cleaning_report_is_bounded_and_idempotent():
    frame = read_dataset(("a,b\n" + "1,2\n" * 101).encode(), "duplicados.csv")
    report = frame.attrs["cleaning_report"]
    assert report["removed_rows"] == 100
    assert len(by_code(report)["DUPLICATE_ROWS"]["rows"]) == 20
    assert clean_table(frame).attrs["cleaning_report"] == report
    incomplete = read_dataset(b"a,b\n1,\n2,3\n", "incompleto.csv")
    assert clean_table(incomplete).attrs["cleaning_report"] == incomplete.attrs["cleaning_report"]


def test_training_continues_with_missing_labels_duplicates_and_invalid_numbers(students):
    frame = students.copy()
    frame["nota"] = frame["nota"].astype(object)
    frame.loc[3, "nota"] = "erro"
    frame.loc[4, "situacao"] = None
    frame.loc[5, "matricula"] = frame.loc[6, "matricula"]
    frame.loc[5, "situacao"] = frame.loc[6, "situacao"]
    frame = pd.concat([frame, frame.iloc[[1]]], ignore_index=True)
    output = AutoMLService().train(frame, TrainingConfig(dataset_id="test", target="situacao", positive_class="Evadido", identifier_column="matricula", algorithms=["logistic"]))
    assert sum(output.split.values()) == len(frame) - 3
    assert output.feature_schema["nota"] == "numeric"
    assert {"MISSING_TARGET", "REPEATED_IDENTIFIERS", "DUPLICATE_ROWS", "INVALID_FEATURE_VALUES"} <= by_code(output.cleaning_report).keys()


def test_a_selected_empty_feature_is_removed_without_stopping_training(students):
    students["campo_vazio"] = None
    output = AutoMLService().train(students, TrainingConfig(dataset_id="test", target="situacao", positive_class="Evadido",
        identifier_column="matricula", prediction_features=["frequencia", "nota", "campo_vazio"], algorithms=["logistic"]))
    assert output.features == ["frequencia", "nota"]
    assert by_code(output.cleaning_report)["UNUSABLE_COLUMN"]["column"] == "campo_vazio"


def test_upload_train_and_predict_dirty_files_keep_valid_records_and_persist_audit(students):
    with TestClient(app) as client:
        history = pd.concat([students, students.iloc[[0]]], ignore_index=True)
        response = client.post("/datasets", files={"file": ("historico.csv", history.to_csv(index=False).encode())})
        assert response.status_code == 201, response.text
        dataset = response.json()
        assert dataset["profile"]["rows"] == len(students)
        assert dataset["profile"]["cleaning_report"]["removed_rows"] == 1
        run = client.post("/training-runs", json={"dataset_id": dataset["id"], "target": "situacao", "positive_class": "Evadido", "identifier_column": "matricula", "algorithms": ["logistic"]}).json()
        completed = client.get(f"/training-runs/{run['id']}").json()
        assert completed["status"] == "completed", completed
        model = client.get(f"/models/{completed['model_id']}").json()
        assert model["cleaning_report"]["removed_rows"] == 1
        future = students.iloc[:4].drop(columns="situacao").copy()
        future["nota"] = future["nota"].astype(object)
        future.loc[1, "nota"] = "erro"
        future.loc[2, "matricula"] = None
        future.loc[3, "matricula"] = future.loc[0, "matricula"]
        future = pd.concat([future, future.iloc[[1]]], ignore_index=True)
        response = client.post("/predict", data={"model_id": model["id"]}, files={"file": ("atual.csv", future.to_csv(index=False).encode())})
        assert response.status_code == 201, response.text
        batch = response.json()
        assert batch["total"] == 3
        assert {"DUPLICATE_ROWS", "INVALID_FEATURE_VALUES", "REPEATED_IDENTIFIERS", "GENERATED_IDENTIFIERS"} <= by_code(batch["cleaning_report"]).keys()
        items = client.get(f"/predictions/{batch['id']}/students").json()["items"]
        assert len(set(item["student_id"] for item in items)) == 3
        assert client.get(f"/predictions/{batch['id']}").json()["cleaning_report"] == batch["cleaning_report"]
        assert all(np.isfinite(item["risk_probability"]) for item in items)


def test_an_empty_or_unusable_file_still_has_an_actionable_error():
    with pytest.raises(DatasetError):
        read_dataset(b"a,b\n,,,\n", "invalido.csv")
