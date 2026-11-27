"""Progresso por etapas concluídas, sem estimar duração ou avançar por tempo."""
from collections.abc import Callable

ProgressCallback = Callable[[int, str], None]


def report_progress(callback: ProgressCallback | None, percent: int, stage: str) -> None:
    if callback is not None:
        callback(percent, stage)
