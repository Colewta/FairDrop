"""Diagnóstico prévio com a mesma limpeza e semente da divisão principal."""
import pandas as pd
from sklearn.model_selection import train_test_split

from app.core.config import RANDOM_STATE
from app.schemas.dataset import DatasetError
from app.services.data_cleaning import clean_table, clean_identifiers
from app.services.dataset_profiler import DatasetProfiler
from app.services.model_registry import ArtifactStore
from app.services.mitigation_methods import METHODS, training_groups
from app.services.numeric import parse_numeric
from app.services.leakage_detector import LeakageDetector


def experiment_options(repository, card, constraint="demographic_parity"):
    config = card.config
    frame = clean_table(ArtifactStore(repository).load("datasets", card.dataset_id, "dataset.joblib"))
    frame = frame.loc[frame[card.target].notna()].copy()
    if config.target_rule:
        numeric = parse_numeric(frame[card.target])
        frame = frame.loc[numeric.notna()].copy()
    frame = clean_identifiers(frame, card.identifier_column, card.target)
    # O mapa de localização já foi usado na limpeza. Evitar copiá-lo em cada
    # coluna/método do diagnóstico, especialmente em históricos grandes.
    frame.attrs.pop("source_rows", None)
    if config.target_rule:
        numeric = parse_numeric(frame[card.target])
        y = (numeric >= config.target_rule.value if config.target_rule.operator == "ge" else numeric <= config.target_rule.value).astype(int)
    else:
        y = (frame[card.target].astype(str) == card.positive_class).astype(int)
    if len(frame) < 30 or y.nunique() < 2 or y.value_counts().min() < 8:
        raise DatasetError("INSUFFICIENT_DATA", "A base não tem exemplos suficientes para preparar outro experimento.")
    trainval, _ = train_test_split(frame.index, test_size=.2, stratify=y, random_state=RANDOM_STATE)
    train, _ = train_test_split(trainval, test_size=.25, stratify=y.loc[trainval], random_state=RANDOM_STATE)
    training_frame, training_y = frame.loc[train], y.loc[train]
    profile = DatasetProfiler().profile(training_frame, card.target)
    # Associação forte com y pode ser justamente o viés a investigar. Para
    # grupos, bloquear metadados pós-evento por nome, não associação estatística.
    named_alerts = LeakageDetector().detect(pd.DataFrame(columns=frame.columns), card.target, profile.potential_ids)
    blocked = set(profile.potential_ids) | {card.target} | {a.column for a in named_alerts}
    groups = []
    for column in frame.columns:
        if column in blocked:
            continue
        eligibility = {}
        audit = {}
        for method in METHODS:
            try:
                _, _, audit = training_groups(training_frame, [column], training_y, method, constraint)
                eligibility[method] = {"available": True, "reason": "Há exemplos suficientes para iniciar este teste."}
            except DatasetError as exc:
                eligibility[method] = {"available": False, "reason": str(exc)}
        groups.append({"column": column, "suggested": column in profile.potential_sensitive_features,
                       "eligibility": eligibility, "audit": audit})
    return {"methods": [{"id": key, "name": name, "stage": stage, "implementation": implementation} for key, (name, stage, implementation) in METHODS.items()],
            "groups": groups, "training_rows": len(train), "constraint": constraint,
            "note": "A verificação usa os exemplos que ficaram para aprendizado depois da limpeza. Se você ativar calibração ou validação cruzada, cada divisão menor será conferida de novo e ainda pode faltar um grupo. Comparar turnos ou cursos não permite tirar conclusões sobre raça, gênero ou outras informações que não estão na base."}
