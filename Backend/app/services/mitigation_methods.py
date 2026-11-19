"""Estimadores serializáveis; todo ajuste ocorre exclusivamente em fit()."""
import numpy as np
import pandas as pd
from scipy import sparse
from scipy.optimize import minimize
from scipy.special import expit, softmax
from sklearn.base import BaseEstimator, ClassifierMixin, clone
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import MinMaxScaler

from app.core.config import RANDOM_STATE
from app.schemas.dataset import DatasetError
from app.services.numeric import parse_numeric


METHODS = {
    "reweighing": ("Reponderação", "pre", "AIF360 Reweighing"),
    "resampling": ("Reamostragem por grupo e resultado", "pre", "FairDrop: amostragem estratificada com reposição"),
    "lfr": ("Transformação de atributos (LFR)", "pre", "AIF360 Learning Fair Representations"),
    "adversarial": ("Aprendizado adversarial", "in", "FairDrop: preditor logístico e adversário softmax, NumPy"),
    "constraints": ("Treinamento com restrições", "in", "Fairlearn GridSearch"),
    "regularization": ("Regularização de fairness", "in", "FairDrop: regressão logística com penalidade de disparidade"),
}


def training_groups(X, columns, y, method, constraint="demographic_parity"):
    if not columns or any(c not in X for c in columns):
        raise DatasetError("MITIGATION_GROUP_REQUIRED", "Escolha uma coluna da base para comparar os grupos.")
    groups, cuts = pd.DataFrame(index=X.index), {}
    for column in columns:
        s = X[column]
        if s.isna().any():
            raise DatasetError("MITIGATION_MISSING_GROUP", f"{column}: alguns registros usados no aprendizado estão sem esta informação. Confira essa coluna na planilha antes de comparar os grupos.")
        numeric = parse_numeric(s)
        if s.nunique() > 12 and numeric.notna().all():
            cuts[column] = float(numeric.median())
            groups[column] = np.where(numeric <= cuts[column], "até mediana", "acima da mediana")
        elif s.nunique() <= 12:
            groups[column] = s.astype(str)
        else:
            raise DatasetError("MITIGATION_TOO_MANY_GROUPS", f"{column}: esta coluna tem mais de 12 grupos. Escolha outra coluna ou prepare um agrupamento que faça sentido para a escola antes de testar a técnica.")
    codes, names = pd.factorize(pd.MultiIndex.from_frame(groups))
    counts = pd.crosstab(codes, np.asarray(y)).reindex(columns=[0, 1], fill_value=0)
    if len(counts) < 2 or len(counts) > 32 or (counts.sum(axis=1) < 5).any():
        raise DatasetError("MITIGATION_SMALL_GROUPS", "A comparação precisa ter entre 2 e 32 grupos e pelo menos 5 exemplos de cada um na parte do histórico usada para aprender. Confira a quantidade de registros dos grupos.")
    if (method in {"reweighing", "resampling"} or constraint == "equalized_odds") and (counts < 5).any().any():
        raise DatasetError("MITIGATION_SMALL_CELLS", "Faltam exemplos de cada resultado: cada grupo precisa ter pelo menos 5 registros com a situação acompanhada e 5 sem ela na parte usada para aprender. Repetir registros não resolve a falta de um tipo de exemplo. Veja a tabela dos grupos ou escolha outra técnica disponível.")
    if method == "lfr" and len(counts) != 2:
        raise DatasetError("MITIGATION_BINARY_GROUP", "Esta versão do LFR só compara dois grupos. A coluna escolhida tem outra quantidade. Escolha uma coluna com dois grupos ou teste outra técnica; juntar grupos depende de uma decisão da escola.")
    audit = {"training_rows": len(X), "numeric_cuts": cuts,
             "cells_before": [{"group": " / ".join(map(str, names[i])), "negative": int(row[0]), "positive": int(row[1])}
                              for i, row in counts.iterrows()]}
    return codes, counts, audit


class FairLogisticClassifier(ClassifierMixin, BaseEstimator):
    """Penalidade nas médias dos scores ou jogo preditor/adversário.

    A regularização usa BCE + L2 + lambda * média das disparidades quadráticas.
    O adversário usa o logit (e y/interação para EO). O gradiente do preditor
    remove a projeção na direção do adversário e inverte essa direção, seguindo
    o framework de Zhang et al.; esta é uma implementação própria, não AIF360.
    """
    def __init__(self, mode="regularization", strength=0.5, constraint="demographic_parity", epochs=300):
        self.mode, self.strength, self.constraint, self.epochs = mode, strength, constraint, epochs

    def fit(self, X, y, groups=None):
        X = sparse.csr_matrix(X, dtype=float)
        y = np.asarray(y, dtype=float)
        self.classes_ = np.array([0, 1])
        n, d = X.shape
        w = np.zeros(d + 1)
        groups = np.zeros(n, dtype=int) if groups is None else np.asarray(groups, dtype=int)
        masks = []
        conditions = [np.ones(n, bool)] if self.constraint == "demographic_parity" else [y == 0, y == 1]
        for condition in conditions:
            for group in np.unique(groups):
                mask = condition & (groups == group)
                if mask.any():
                    masks.append((condition, mask))

        def objective(parameters):
            z = np.asarray(X @ parameters[:-1]).ravel() + parameters[-1]
            p = expit(z)
            loss = np.mean(np.logaddexp(0, z) - y * z) + .0005 * np.square(parameters[:-1]).sum()
            residual = (p - y) / n
            if self.mode == "regularization" and self.strength:
                for condition, mask in masks:
                    delta = p[mask].mean() - p[condition].mean()
                    factor = self.strength / len(masks)
                    loss += factor * delta * delta
                    deriv = np.zeros(n)
                    deriv[mask] += 1 / mask.sum()
                    deriv[condition] -= 1 / condition.sum()
                    residual += 2 * factor * delta * deriv * p * (1 - p)
            grad = np.r_[np.asarray(X.T @ residual).ravel() + .001 * parameters[:-1], residual.sum()]
            return loss, grad

        if self.mode in {"adversarial", "adversarial_baseline"}:
            rng = np.random.default_rng(RANDOM_STATE)
            k = len(np.unique(groups))
            a = np.random.default_rng(RANDOM_STATE + 1).normal(0, .01, (4 if self.constraint == "equalized_odds" else 2, k))
            m, v = np.zeros_like(w), np.zeros_like(w)
            for epoch in range(1, self.epochs + 1):
                # Um lote aleatório por passo limita o custo; a semente é persistida.
                idx = rng.choice(n, min(n, 512), replace=False)
                xb, yb, gb = X[idx], y[idx], groups[idx]
                z = np.asarray(xb @ w[:-1]).ravel() + w[-1]
                residual = (expit(z) - yb) / len(idx)
                gradient = np.r_[np.asarray(xb.T @ residual).ravel() + .001 * w[:-1], residual.sum()]
                if self.mode == "adversarial" and self.strength:
                    inputs = np.c_[z, yb, z * yb, np.ones(len(idx))] if self.constraint == "equalized_odds" else np.c_[z, np.ones(len(idx))]
                    for _ in range(3):
                        error = softmax(inputs @ a, axis=1) - np.eye(k)[gb]
                        a -= .05 * (inputs.T @ error / len(idx) + .001 * a)
                    error = softmax(inputs @ a, axis=1) - np.eye(k)[gb]
                    derivative = error @ a[0]
                    if self.constraint == "equalized_odds":
                        derivative += yb * (error @ a[2])
                    derivative /= len(idx)
                    adv_grad = np.r_[np.asarray(xb.T @ derivative).ravel(), derivative.sum()]
                    norm = np.linalg.norm(adv_grad)
                    if norm > 1e-12:
                        direction = adv_grad / norm
                        gradient -= np.dot(gradient, direction) * direction
                    gradient -= (10 * self.strength) * adv_grad
                gradient = np.clip(gradient, -5, 5)
                m, v = .9 * m + .1 * gradient, .999 * v + .001 * gradient * gradient
                w -= .02 * (m / (1 - .9 ** epoch)) / (np.sqrt(v / (1 - .999 ** epoch)) + 1e-8)
            self.n_iter_ = self.epochs
        else:
            result = minimize(objective, w, jac=True, method="L-BFGS-B", options={"maxiter": self.epochs})
            w, self.n_iter_ = result.x, int(result.nit)
            self.converged_ = bool(result.success)
        if not np.isfinite(w).all():
            raise DatasetError("MITIGATION_OPTIMIZATION", "O otimizador não encontrou parâmetros finitos. Revise a escala dos dados.")
        self.coef_, self.intercept_ = w[:-1].reshape(1, -1), w[-1:]
        return self

    def predict_proba(self, X):
        p = expit(np.asarray(X @ self.coef_[0]).ravel() + self.intercept_[0])
        return np.c_[1 - p, p]

    def predict(self, X):
        return (self.predict_proba(X)[:, 1] >= .5).astype(int)


class MitigatedClassifier(ClassifierMixin, BaseEstimator):
    def __init__(self, estimator, features, sensitive_features, method, strength=.5, constraint="demographic_parity"):
        self.estimator, self.features, self.sensitive_features = estimator, features, sensitive_features
        self.method, self.strength, self.constraint = method, strength, constraint

    def fit(self, X, y):
        codes, counts, self.audit_ = training_groups(X, self.sensitive_features, y, self.method, self.constraint)
        self.estimator_ = clone(self.estimator)
        y = np.asarray(y)
        if self.method == "resampling":
            observed = counts.to_numpy(dtype=float)
            independent = observed.sum(axis=1, keepdims=True) @ observed.sum(axis=0, keepdims=True) / len(X)
            desired = (1 - self.strength) * observed + self.strength * independent
            quotas = np.floor(desired).astype(int)
            remainder = len(X) - quotas.sum()
            for pos in np.argsort((desired - quotas).ravel())[::-1][:remainder]:
                quotas.flat[pos] += 1
            rng = np.random.default_rng(RANDOM_STATE)
            sampled = []
            cells = []
            for group in range(len(counts)):
                for label in (0, 1):
                    pool = np.flatnonzero((codes == group) & (y == label))
                    amount = int(quotas[group, label])
                    sampled.extend(rng.choice(pool, amount, replace=amount > len(pool)).tolist())
                cells.append({**self.audit_["cells_before"][group], "negative": int(quotas[group, 0]), "positive": int(quotas[group, 1])})
            sampled = rng.permutation(sampled)
            self.audit_.update(cells_after=cells, sampled_rows=len(sampled), unique_training_rows=len(set(sampled.tolist())))
            self.estimator_.fit(X[self.features].iloc[sampled], y[sampled])
        elif self.method == "constraints":
            from fairlearn.reductions import DemographicParity, EqualizedOdds, GridSearch
            constraint = DemographicParity() if self.constraint == "demographic_parity" else EqualizedOdds()
            self.search_ = GridSearch(self.estimator_, constraint, grid_size=9, constraint_weight=self.strength,
                                      sample_weight_name="model__sample_weight")
            self.search_.fit(X[self.features], y, sensitive_features=codes)
            self.estimator_ = self.search_.predictors_[self.search_.best_idx_]
            self.audit_.update(grid_candidates=len(self.search_.predictors_), chosen_index=int(self.search_.best_idx_))
            # Preservar somente o estimador escolhido: os dados/grupos de treino
            # armazenados internamente no Moment não entram no artefato salvo.
            del self.search_
        elif self.method == "lfr":
            self._fit_lfr(X[self.features], y, codes)
        else:
            self.estimator_.set_params(model=FairLogisticClassifier(self.method, self.strength, self.constraint))
            self.estimator_.fit(X[self.features], y, model__groups=codes)
            classifier = self.estimator_.named_steps["model"]
            self.audit_.update(iterations=classifier.n_iter_, converged=getattr(classifier, "converged_", None))
        self.classes_ = self.estimator_.classes_
        return self

    @staticmethod
    def _lfr_dataset(matrix, y, groups):
        from aif360.datasets import BinaryLabelDataset
        data = pd.DataFrame(matrix, columns=[f"x{i}" for i in range(matrix.shape[1])])
        data["protected"], data["label"] = groups, y
        dataset = BinaryLabelDataset(df=data, label_names=["label"], protected_attribute_names=["protected"])
        # Grupos ficam somente nos metadados, nunca no vetor de distâncias LFR.
        dataset.features = np.asarray(matrix)
        dataset.feature_names = [f"x{i}" for i in range(matrix.shape[1])]
        return dataset

    def _matrix(self, X, fit=False):
        if fit:
            matrix = self.estimator_[:-1].fit_transform(X)
            self.reducer_ = TruncatedSVD(n_components=16, random_state=RANDOM_STATE) if matrix.shape[1] > 16 else None
            if self.reducer_ is not None:
                matrix = self.reducer_.fit_transform(matrix)
            matrix = matrix.toarray() if sparse.issparse(matrix) else np.asarray(matrix)
            self.scaler_ = MinMaxScaler(clip=True).fit(matrix)
        else:
            matrix = self.estimator_[:-1].transform(X)
            if self.reducer_ is not None:
                matrix = self.reducer_.transform(matrix)
            matrix = matrix.toarray() if sparse.issparse(matrix) else np.asarray(matrix)
        return self.scaler_.transform(matrix)

    def _fit_lfr(self, X, y, codes):
        from aif360.algorithms.preprocessing import LFR
        matrix = self._matrix(X, fit=True)
        # Subamostra estratificada somente do treino para limitar o custo do LFR.
        rng = np.random.default_rng(RANDOM_STATE)
        idx = np.concatenate([rng.choice(np.flatnonzero(codes == g), min(1000, int((codes == g).sum())), replace=False) for g in (0, 1)])
        self.representation_ = LFR(unprivileged_groups=[{"protected": 0}], privileged_groups=[{"protected": 1}],
                                   k=4, Ax=.01, Ay=1, Az=50 * self.strength, seed=RANDOM_STATE)
        state = np.random.get_state()
        try:
            self.representation_.fit(self._lfr_dataset(matrix[idx], y[idx], codes[idx]), maxiter=60, maxfun=600)
            transformed = self.representation_.transform(self._lfr_dataset(matrix, y, codes)).features
        finally:
            np.random.set_state(state)
        self.estimator_.named_steps["model"].fit(transformed, y)
        self.audit_.update(representation_fit_rows=len(idx), representation_dimensions=matrix.shape[1],
                           maxiter=60, maxfun=600, prototypes=4)

    def predict_proba(self, X):
        if self.method == "lfr":
            matrix = self._matrix(X[self.features])
            # O mesmo mapeamento de protótipos vale para ambos os grupos. Não
            # acessar rótulos nem atributos sensíveis dos novos alunos.
            from aif360.algorithms.preprocessing.lfr_helpers.helpers import get_xhat_y_hat
            _, matrix, _ = get_xhat_y_hat(self.representation_.prototypes, self.representation_.w, matrix)
            return self.estimator_.named_steps["model"].predict_proba(matrix)
        return self.estimator_.predict_proba(X[self.features])

    def predict(self, X):
        return (self.predict_proba(X)[:, 1] >= .5).astype(int)
