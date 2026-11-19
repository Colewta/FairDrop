from typing import Literal

import pandas as pd

from app.core.config import MIN_ASSOCIATION_ROWS, NEAR_PERFECT_CORRELATION
from app.schemas.dataset import LeakageAlert
from app.services.semantic_analyzer import normalize_name

POST_EVENT_NAMES = {
    "data_evasao", "data_cancelamento", "motivo_cancelamento", "data_desligamento",
    "status_final", "situacao_final", "documento_cancelamento", "dropout_date",
    "cancellation_date", "withdrawal_date", "graduation_date", "data_conclusao",
    "data_trancamento", "motivo_trancamento", "data_formatura",
    "alteracao_situacao", "alteracao_status", "mudanca_situacao", "mudanca_status",
    "status_change", "status_update", "outcome_date",
}


class LeakageDetector:
    def detect(self, df: pd.DataFrame, target: str | None,
               identifiers: list[str]) -> list[LeakageAlert]:
        alerts = []
        for column in df.columns:
            if column == target or column in identifiers:
                continue
            name = normalize_name(column)
            reason = None
            risk: Literal["HIGH", "MEDIUM"] = "HIGH"
            if any(f"_{term}_" in f"_{name}_" for term in POST_EVENT_NAMES):
                reason = "O nome sugere informação posterior ao desfecho; confirme quando ela fica disponível."
            elif target and self._target_metadata(name, normalize_name(target)):
                reason = "A coluna registra quando o resultado foi informado ou alterado; pode revelar um evento que ainda queremos prever."
            elif target:
                observed = df.loc[df[target].notna(), [column, target]]
                missing = observed[column].isna()
                if len(observed) >= MIN_ASSOCIATION_ROWS and min(missing.sum(), (~missing).sum()) >= 5:
                    absent_labels = set(observed.loc[missing, target])
                    present_labels = set(observed.loc[~missing, target])
                    if absent_labels.isdisjoint(present_labels) and min(len(absent_labels), len(present_labels)) == 1:
                        reason = "Só o fato de este campo estar preenchido ou vazio já identifica uma das situações do resultado; pode haver vazamento de informação."
                pair = df[[column, target]].dropna()
                if reason is None and len(pair) >= MIN_ASSOCIATION_ROWS and pair[target].nunique() >= 2:
                    # Exigir repetição de categorias evita marcar IDs e texto único.
                    counts = pair.groupby(column, observed=True)[target].agg(["nunique", "size"])
                    if (2 <= len(counts) <= 20 and counts["size"].min() >= 5
                            and counts["nunique"].max() == 1):
                        reason = "A coluna determina o resultado nas linhas observadas; pode ser uma cópia ou proxy do target."
                    else:
                        x = pd.to_numeric(pair[column], errors="coerce")
                        y = pd.to_numeric(pair[target], errors="coerce")
                        valid = x.notna() & y.notna()
                        if valid.sum() >= MIN_ASSOCIATION_ROWS and x[valid].nunique() > 1 and y[valid].nunique() > 1:
                            correlation = x[valid].corr(y[valid])
                            if abs(correlation) >= NEAR_PERFECT_CORRELATION:
                                risk = "MEDIUM"
                                reason = "Correlação numérica quase perfeita com o target; revise a disponibilidade temporal."
            if reason:
                alerts.append(LeakageAlert(column=column, risk=risk, reason=reason))
        return alerts

    @staticmethod
    def _target_metadata(name: str, target: str) -> bool:
        """Datas e marcos do próprio resultado exigem revisão temporal explícita."""
        tokens = set(name.split("_"))
        temporal = {"data", "date", "ano", "year", "periodo", "semestre", "timestamp"}
        changes = {"alteracao", "mudanca", "atualizacao", "change", "changed", "update", "updated"}
        return f"_{target}_" in f"_{name}_" and bool(tokens & (temporal | changes))
