"""Limpeza conservadora com contagens e localização, sem guardar valores pessoais no relatório."""
from copy import deepcopy

import numpy as np
import pandas as pd

from app.services.numeric import parse_numeric

MAX_REPORTED_ROWS = 20


def report_for(frame: pd.DataFrame) -> dict:
    return frame.attrs.setdefault("cleaning_report", {
        "input_rows": len(frame), "output_rows": len(frame), "removed_rows": 0, "issues": [],
    })


def add_issue(frame: pd.DataFrame, code: str, action: str, message: str,
              mask=None, column: str | None = None, rows: list[int] | None = None,
              count: int | None = None) -> None:
    if rows is None:
        indices = frame.index[mask] if mask is not None else []
        locations = frame.attrs.get("source_rows", {})
        rows = [int(locations.get(index, position + 2)) for position, index in enumerate(indices)]
    size = len(rows) if count is None else count
    if not size:
        return
    issues = report_for(frame)["issues"]
    existing = next((item for item in issues if (item["code"], item["column"]) == (code, column)), None)
    if existing:
        existing["count"] += size
        existing["rows"] = sorted(set(existing["rows"] + rows[:MAX_REPORTED_ROWS]))[:MAX_REPORTED_ROWS]
    else:
        issues.append({"code": code, "action": action, "message": message, "column": column,
                       "count": size, "rows": rows[:MAX_REPORTED_ROWS]})


def finish_report(frame: pd.DataFrame) -> pd.DataFrame:
    report = report_for(frame)
    report["output_rows"] = len(frame)
    report["removed_rows"] = report["input_rows"] - len(frame)
    return frame


def clean_table(frame: pd.DataFrame, source_rows: list[int] | None = None) -> pd.DataFrame:
    """Normaliza ausências, remove linhas vazias/iguais e mantém a primeira cópia."""
    attrs = deepcopy(frame.attrs)
    previous = attrs.get("source_rows", {})
    locations = source_rows if source_rows is not None else [
        int(previous.get(index, position + 2)) for position, index in enumerate(frame.index)
    ]
    result = frame.copy().reset_index(drop=True)
    result.attrs = attrs
    result.attrs["source_rows"] = dict(enumerate(locations))
    report_for(result)
    first_pass = not result.attrs.get("cleaning_normalized", False)
    for column in result.columns:
        original = result[column]
        values = original.map(lambda value: value.strip() if isinstance(value, str) else value)
        nulls = values.astype("string").str.fullmatch(r"(?i)(?:nan|null|none|n/a|na|\?|)", na=False)
        numeric_infinity = values.map(lambda value: isinstance(value, (float, np.floating)) and not np.isfinite(value) and not pd.isna(value))
        missing = values.isna() | nulls | numeric_infinity
        if first_pass:
            add_issue(result, "MISSING_VALUES", "marked_missing", "Campos vazios e valores como “N/A” foram reconhecidos como informação ausente. Se a coluna for usada na previsão, o sistema tratará esses campos com regras aprendidas no histórico.", missing, column)
        result[column] = values.mask(nulls | numeric_infinity, pd.NA)
    result.attrs["cleaning_normalized"] = True
    empty = result.isna().all(axis=1)
    add_issue(result, "EMPTY_ROWS", "removed", "Linhas totalmente vazias removidas.", empty)
    result = result.loc[~empty].copy()
    repeated_header = result.apply(lambda column: column.astype("string").eq(str(column.name)).fillna(False)).all(axis=1)
    add_issue(result, "REPEATED_HEADERS", "removed", "Cabeçalhos repetidos no meio dos dados foram removidos.", repeated_header)
    result = result.loc[~repeated_header].copy()
    duplicate = result.duplicated(keep="first")
    add_issue(result, "DUPLICATE_ROWS", "removed", "Linhas idênticas removidas; a primeira ocorrência foi mantida.", duplicate)
    result = result.loc[~duplicate].copy()
    return finish_report(result)


def clean_identifiers(frame: pd.DataFrame, column: str | None, target: str | None = None) -> pd.DataFrame:
    """Um registro por identificador; resultados contraditórios são omitidos do treino."""
    result = frame.copy()
    if not column or column not in result.columns:
        return result
    if target:
        missing = result[column].isna()
        add_issue(result, "MISSING_IDENTIFIERS", "removed", "Registros sem identificação foram retirados do aprendizado. Sem ela, não podemos conferir se o mesmo aluno aparece também na parte usada para avaliar a previsão.", missing, column)
        result = result.loc[~missing].copy()
    ids = result[column].map(lambda value: str(value).strip() if pd.notna(value) else pd.NA)
    result[column] = ids
    repeated = ids.notna() & ids.duplicated(keep=False)
    if not repeated.any():
        return finish_report(result)
    if target:
        counts = result.loc[repeated].groupby(column, sort=False)[target].nunique()
        conflicts = result[column].isin(counts[counts > 1].index)
        add_issue(result, "CONFLICTING_RESULTS", "removed", "A mesma matrícula apareceu com situações diferentes. Esses registros ficaram fora do aprendizado, pois a planilha não indica qual resultado usar. Confira os casos no arquivo original.", conflicts, column)
        result = result.loc[~conflicts].copy()
    # A linha mais completa é mantida; empates preservam a ordem do arquivo.
    repeated = result[column].notna() & result[column].duplicated(keep=False)
    completeness = result.loc[repeated].notna().sum(axis=1)
    ordered = completeness.sort_values(ascending=False, kind="stable").index
    keep = result.loc[ordered].drop_duplicates(subset=[column], keep="first").index
    remove = repeated & ~result.index.isin(keep)
    add_issue(result, "REPEATED_IDENTIFIERS", "removed", "Quando a mesma matrícula apareceu mais de uma vez com o mesmo resultado, ficou o registro com mais informações preenchidas. Em caso de empate, ficou o primeiro do arquivo.", remove, column)
    return finish_report(result.loc[~remove].copy())


def clean_feature_values(frame: pd.DataFrame, schema: dict[str, str]) -> pd.DataFrame:
    """Usa somente o schema do treino; o preenchimento continua dentro do pipeline."""
    result = frame.copy()
    for column, kind in schema.items():
        if column not in result.columns or kind not in {"numeric", "date"}:
            continue
        values = parse_numeric(result[column]) if kind == "numeric" else pd.to_datetime(result[column], errors="coerce", format="mixed", utc=True)
        invalid = result[column].notna() & values.isna()
        add_issue(result, "INVALID_FEATURE_VALUES", "marked_missing",
                  "Valores incompatíveis tratados como ausentes. Um exemplo é uma palavra no lugar de uma nota. Esses campos serão preenchidos com as regras aprendidas no histórico, sem adivinhar a situação final do aluno.", invalid, column)
        result.loc[invalid, column] = pd.NA
    return result


def cleaning_messages(frame: pd.DataFrame) -> list[str]:
    messages = []
    for issue in report_for(frame)["issues"]:
        location = f" Coluna: {issue['column']}." if issue["column"] else ""
        if issue["rows"]:
            location += " Linhas de origem: " + ", ".join(map(str, issue["rows"]))
            location += " (amostra)." if issue["count"] > len(issue["rows"]) else "."
        messages.append(f"{issue['message']} Quantidade: {issue['count']}.{location}")
    return messages
