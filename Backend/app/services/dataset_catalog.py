"""Metadados e exportação; não modifica o dataframe usado no treinamento."""
from hashlib import sha256
from io import StringIO
from math import isfinite

from fastapi import UploadFile
import pandas as pd

from app.core.config import MAX_UPLOAD_BYTES
from app.schemas.dataset import DatasetError


def upload_digest(file: UploadFile) -> str:
    digest, size = sha256(), 0
    file.file.seek(0)
    try:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise DatasetError("FILE_TOO_LARGE", "O arquivo excede o limite de importação.", 413)
            digest.update(chunk)
    finally:
        file.file.seek(0)
    return digest.hexdigest()


def protected_csv(frame: pd.DataFrame, masked: list[str]):
    """Exporta em blocos, mascara IDs reconhecidos e neutraliza fórmulas de planilha."""
    def safe(value):
        if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")):
            try:
                if isfinite(float(value)):
                    return value
            except ValueError:
                pass
            return "'" + value
        return value
    yield "\ufeff"
    for start in range(0, len(frame), 1000):
        chunk = frame.iloc[start:start + 1000].copy()
        for column in masked:
            if column in chunk:
                chunk[column] = "••••"
        chunk = chunk.map(safe)
        chunk.columns = [safe(column) for column in chunk.columns]
        buffer = StringIO()
        chunk.to_csv(buffer, index=False, header=start == 0)
        yield buffer.getvalue()
