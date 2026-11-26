import numpy as np
from sklearn.calibration import calibration_curve
from sklearn.metrics import (accuracy_score, average_precision_score, balanced_accuracy_score,
                             brier_score_loss, confusion_matrix, f1_score, precision_score,
                             recall_score, roc_auc_score, roc_curve, precision_recall_curve)

from app.schemas.platform import Metrics


def evaluate_model(model, X, y, threshold: float) -> tuple[Metrics, np.ndarray]:
    probability = model.predict_proba(X)[:, 1]
    prediction = (probability >= threshold).astype(int)
    matrix = confusion_matrix(y, prediction, labels=[0, 1])
    tn, fp, _, _ = matrix.ravel()
    observed, predicted = calibration_curve(y, probability, n_bins=8, strategy="quantile")
    both_classes = len(np.unique(y)) == 2
    # Só pontos observados; reduzimos o desenho, não as métricas calculadas.
    def points(x, y_values, x_name, y_name):
        indices = np.unique(np.linspace(0, len(x) - 1, min(150, len(x))).astype(int))
        return [{x_name: float(x[i]), y_name: float(y_values[i])} for i in indices]
    roc, pr = [], []
    if both_classes:
        fpr, tpr, _ = roc_curve(y, probability)
        precision, recall, _ = precision_recall_curve(y, probability)
        roc, pr = points(fpr, tpr, "fpr", "tpr"), points(recall, precision, "recall", "precision")
    bins = np.linspace(0, 1, 11)
    negatives, _ = np.histogram(probability[np.asarray(y) == 0], bins=bins)
    positives, _ = np.histogram(probability[np.asarray(y) == 1], bins=bins)
    return Metrics(
        roc_curve=roc, precision_recall_curve=pr,
        probability_histogram=[{"start": float(bins[i]), "end": float(bins[i + 1]), "negative": int(negatives[i]), "positive": int(positives[i])} for i in range(10)],
        accuracy=accuracy_score(y, prediction), precision=precision_score(y, prediction, zero_division=0),
        recall=recall_score(y, prediction, zero_division=0), f1=f1_score(y, prediction, zero_division=0),
        roc_auc=roc_auc_score(y, probability) if both_classes else None,
        pr_auc=average_precision_score(y, probability) if both_classes else None,
        specificity=float(tn / (tn + fp)) if tn + fp else 0,
        balanced_accuracy=balanced_accuracy_score(y, prediction),
        brier_score=brier_score_loss(y, probability), confusion_matrix=matrix.tolist(),
        calibration_curve=[{"predicted": float(p), "observed": float(o)} for p, o in zip(predicted, observed)],
    ), prediction
