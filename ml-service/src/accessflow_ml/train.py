"""Reproducible training, evaluation and export. Used by tools/train.py AND notebooks/model_training.ipynb.

Rules enforced here:
* Candidates are tuned with grouped, stratified CV on the TRAIN split only.
* The best candidate is chosen by CV score, never by test score.
* The TEST split is evaluated once, after selection.
* Models trained on non-real data (or without passing the readiness gates) can only be written to a `dev/` folder.
"""
from __future__ import annotations

import hashlib
import json
import platform
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, f1_score, make_scorer, precision_score, recall_score
from sklearn.model_selection import GridSearchCV, StratifiedGroupKFold
from sklearn.pipeline import Pipeline
from sklearn.tree import DecisionTreeClassifier

from .data import read_jsonl
from .features import (FALLBACK_IMPACT_TO_PRIORITY, FEATURE_COLUMNS, FEATURE_VERSION, FORBIDDEN_FEATURES, LABELS,
                       build_preprocessor, feature_schema, features_frame)

SEED = 42
ML_CANDIDATES = ["logistic_regression", "decision_tree", "random_forest"]   # eligible for export
BASELINES = ["majority_class", "axe_impact_mapping"]                          # reference only
ARTIFACT_MODEL = "accessflow_priority_model.joblib"


class TrainingDataError(ValueError):
    pass


class ImpactMappingBaseline(BaseEstimator, ClassifierMixin):
    """Fixed axe-impact -> priority rule, wrapped as a classifier so it can be compared like any model."""

    def fit(self, X, y=None):
        self.classes_ = np.array(sorted(LABELS))
        return self

    def predict(self, X):
        return np.array([FALLBACK_IMPACT_TO_PRIORITY.get(v, "Medium") for v in X["axe_impact"]])

    def predict_proba(self, X):
        pred = self.predict(X)
        return np.array([[1.0 if c == p else 0.0 for c in self.classes_] for p in pred])


def _high_recall(y_true, y_pred):
    return recall_score(y_true, y_pred, labels=["High"], average="macro", zero_division=0)


SCORING = {
    "macro_f1": make_scorer(f1_score, average="macro", labels=LABELS, zero_division=0),
    "high_recall": make_scorer(_high_recall),
}


# ------------------------------------------------------------------ data
def load_dataset(source: "str | Path | list[dict]") -> dict[str, Any]:
    records = source if isinstance(source, list) else read_jsonl(source)
    if not records:
        raise TrainingDataError("dataset is empty")
    origins = sorted({r.get("data_origin") for r in records})
    if len(origins) != 1:
        raise TrainingDataError(f"dataset mixes data origins {origins}; build one dataset per origin")
    for r in records:
        if r.get("final_label") not in LABELS:
            raise TrainingDataError(f"{r.get('finding_id')}: invalid final_label {r.get('final_label')!r}")
        if r.get("split") not in {"train", "test"}:
            raise TrainingDataError(f"{r.get('finding_id')}: missing split")
    leak = FORBIDDEN_FEATURES & set(FEATURE_COLUMNS)
    if leak:
        raise TrainingDataError(f"forbidden features present: {leak}")

    X = features_frame(records)
    meta = pd.DataFrame({k: [r[k] for r in records] for k in ["finding_id", "registrable_domain", "split", "final_label", "rule_id"]})
    train, test = (meta["split"] == "train").to_numpy(), (meta["split"] == "test").to_numpy()
    if not train.any() or not test.any():
        raise TrainingDataError("both train and test splits must be non-empty")
    shared = set(meta.loc[train, "registrable_domain"]) & set(meta.loc[test, "registrable_domain"])
    if shared:
        raise TrainingDataError(f"domains appear in both splits (leakage): {sorted(shared)[:5]}")
    return {
        "records": records, "origin": origins[0], "X": X, "meta": meta,
        "X_train": X[train].reset_index(drop=True), "y_train": meta.loc[train, "final_label"].to_numpy(),
        "g_train": meta.loc[train, "registrable_domain"].to_numpy(),
        "X_test": X[test].reset_index(drop=True), "y_test": meta.loc[test, "final_label"].to_numpy(),
        "g_test": meta.loc[test, "registrable_domain"].to_numpy(),
        "meta_test": meta[test].reset_index(drop=True),
    }


# ------------------------------------------------------------------ models
def candidates(seed: int = SEED) -> dict[str, tuple[Pipeline, dict[str, list]]]:
    def with_pre(clf):
        return Pipeline([("pre", build_preprocessor()), ("clf", clf)])

    return {
        "majority_class": (with_pre(DummyClassifier(strategy="most_frequent")), {}),
        "axe_impact_mapping": (Pipeline([("clf", ImpactMappingBaseline())]), {}),
        "logistic_regression": (
            with_pre(LogisticRegression(class_weight="balanced", max_iter=2000, random_state=seed)),
            {"clf__C": [0.1, 1.0, 10.0]},
        ),
        "decision_tree": (
            with_pre(DecisionTreeClassifier(class_weight="balanced", random_state=seed)),
            {"clf__max_depth": [3, 5, 8, None], "clf__min_samples_leaf": [1, 3, 5]},
        ),
        "random_forest": (
            with_pre(RandomForestClassifier(n_estimators=300, class_weight="balanced_subsample", random_state=seed, n_jobs=1)),
            {"clf__max_depth": [None, 8, 16], "clf__min_samples_leaf": [1, 3], "clf__max_features": ["sqrt", 0.5]},
        ),
    }


def cv_splits(y_train, g_train, seed: int = SEED) -> StratifiedGroupKFold:
    counts = pd.Series(y_train).value_counts()
    n = int(min(5, counts.min(), len(set(g_train))))
    if n < 2:
        raise TrainingDataError(
            f"too little training data for grouped CV (smallest class has {counts.min()} rows, "
            f"{len(set(g_train))} domains). Collect and label more data.")
    return StratifiedGroupKFold(n_splits=n, shuffle=True, random_state=seed)


def tune_candidate(pipe: Pipeline, grid: dict, X_train, y_train, g_train, seed: int = SEED):
    """Grouped CV on the train split only. Returns (best fitted pipeline, CV summary)."""
    gs = GridSearchCV(pipe, grid or {}, scoring=SCORING, refit="macro_f1",
                      cv=cv_splits(y_train, g_train, seed), error_score="raise")
    gs.fit(X_train, y_train, groups=g_train)
    i = gs.best_index_
    r = gs.cv_results_
    summary = {
        "best_params": {k: (v.item() if hasattr(v, "item") else v) for k, v in gs.best_params_.items()},
        "cv_macro_f1_mean": float(r["mean_test_macro_f1"][i]), "cv_macro_f1_std": float(r["std_test_macro_f1"][i]),
        "cv_high_recall_mean": float(r["mean_test_high_recall"][i]), "cv_high_recall_std": float(r["std_test_high_recall"][i]),
        "cv_folds": int(gs.cv.n_splits), "n_param_combinations": int(len(r["params"])),
    }
    return gs.best_estimator_, summary


def select_best(summaries: dict[str, dict]) -> str:
    """Choose the export candidate by CROSS-VALIDATION macro-F1 (ties -> higher High recall). Never by test."""
    pool = {k: v for k, v in summaries.items() if k in ML_CANDIDATES}
    return max(pool, key=lambda k: (round(pool[k]["cv_macro_f1_mean"], 6), pool[k]["cv_high_recall_mean"]))


# ------------------------------------------------------------------ evaluation
def evaluate_model(model, X, y) -> dict[str, Any]:
    pred = model.predict(X)
    rep = classification_report(y, pred, labels=LABELS, output_dict=True, zero_division=0)
    return {
        "precision_macro": float(precision_score(y, pred, labels=LABELS, average="macro", zero_division=0)),
        "recall_macro": float(recall_score(y, pred, labels=LABELS, average="macro", zero_division=0)),
        "f1_macro": float(f1_score(y, pred, labels=LABELS, average="macro", zero_division=0)),
        "high_recall": float(_high_recall(y, pred)),
        "per_class": {l: {k: float(rep[l][k]) if k != "support" else int(rep[l][k]) for k in ("precision", "recall", "f1-score", "support")} for l in LABELS},
        "confusion_matrix": confusion_matrix(y, pred, labels=LABELS).tolist(),
        "labels": LABELS, "n": int(len(y)),
    }


def cluster_bootstrap_ci(model, X, y, groups, n_boot: int = 1000, seed: int = SEED) -> dict[str, Any]:
    """95% CI for macro-F1 and High recall, resampling whole domains (rows from one site are not independent)."""
    pred = np.asarray(model.predict(X)); y = np.asarray(y); groups = np.asarray(groups)
    idx_by_group = [np.where(groups == g)[0] for g in sorted(set(groups))]
    rng = np.random.default_rng(seed)
    f1s, recs = [], []
    for _ in range(n_boot):
        pick = np.concatenate([idx_by_group[i] for i in rng.integers(0, len(idx_by_group), len(idx_by_group))])
        f1s.append(f1_score(y[pick], pred[pick], labels=LABELS, average="macro", zero_division=0))
        if (y[pick] == "High").any():
            recs.append(_high_recall(y[pick], pred[pick]))
    q = lambda a: [float(np.percentile(a, 2.5)), float(np.percentile(a, 97.5))] if len(a) else None
    return {"method": "domain-cluster bootstrap", "n_boot": n_boot, "macro_f1_95ci": q(f1s), "high_recall_95ci": q(recs)}


def error_analysis(model, X, y, meta_test: pd.DataFrame) -> dict[str, Any]:
    pred = model.predict(X)
    proba = model.predict_proba(X)
    classes = list(model.classes_)
    df = meta_test[["finding_id", "registrable_domain", "rule_id"]].copy()
    df["true"], df["pred"] = y, pred
    df["confidence"] = proba.max(axis=1)
    wrong = df[df["true"] != df["pred"]]
    return {
        "n_errors": int(len(wrong)), "n": int(len(df)),
        "missed_high": wrong[wrong["true"] == "High"].to_dict("records"),
        "errors_by_rule": wrong["rule_id"].value_counts().to_dict(),
        "error_pairs": (wrong["true"] + " -> " + wrong["pred"]).value_counts().to_dict(),
        "classes_order": classes, "errors_table": wrong,
    }


# ------------------------------------------------------------------ export
def _jsonable(o):
    if isinstance(o, (np.integer,)): return int(o)
    if isinstance(o, (np.floating,)): return float(o)
    if isinstance(o, np.ndarray): return o.tolist()
    if isinstance(o, pd.DataFrame): return None
    raise TypeError(f"{type(o)} not serialisable")


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dataset_version_from(path: Path) -> str:
    m = re.match(r"dataset_(.+)\.jsonl$", path.name)
    return m.group(1) if m else path.stem


def readiness(dataset_path: Path, origin: str) -> tuple[bool, dict | None, str]:
    if origin != "own_collected":
        return False, None, f"dataset origin is '{origin}', not real annotated data"
    rp = dataset_path.parent / "reports" / f"quality_{dataset_version_from(dataset_path)}.json"
    if not rp.exists():
        return False, None, f"quality report {rp.name} not found (run tools/build_dataset.py)"
    rep = json.loads(rp.read_text())
    if not rep.get("ready_for_meaningful_training"):
        failed = [k for k, v in rep["readiness_gates"].items() if not v]
        return False, rep, f"readiness gates failed: {failed}"
    return True, rep, "all readiness gates passed"


def export_artifacts(out_dir: Path, pipeline: Pipeline, metadata: dict[str, Any]) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = {"model": out_dir / ARTIFACT_MODEL, "schema": out_dir / "feature_schema.json", "metadata": out_dir / "model_metadata.json"}
    joblib.dump(pipeline, paths["model"], compress=3)
    paths["schema"].write_text(json.dumps(feature_schema(), indent=2))
    metadata = {**metadata, "model_sha256": _sha256(paths["model"])}
    paths["metadata"].write_text(json.dumps(metadata, indent=2, default=_jsonable))
    return {k: str(v) for k, v in paths.items()}


def resolve_target(dataset_path: Path, origin: str, artifacts_root: Path, out_dir: Path | None):
    eligible, quality, reason = readiness(dataset_path, origin)
    target = Path(out_dir) if out_dir else (artifacts_root if eligible else artifacts_root / "dev")
    if not eligible and "dev" not in target.parts:
        raise TrainingDataError(f"refusing to write a non-production model outside a 'dev' folder ({reason})")
    return target, eligible, quality, reason


def finalize(dataset_path, d, fitted, cv, best, test_metrics, ci, errors, errors_table, artifacts_root,
             seed=SEED, model_version=None, out_dir=None) -> dict[str, Any]:
    """Build honest metadata and export the three artifacts. Shared by tools/train.py and the notebook."""
    dataset_path = Path(dataset_path)
    target, eligible, quality, reason = resolve_target(dataset_path, d["origin"], Path(artifacts_root), out_dir)
    dataset_version = dataset_version_from(dataset_path)
    now = datetime.now(timezone.utc)
    model_version = model_version or f"{now:%Y.%m.%d}-{dataset_version}"
    metadata = {
        "model_name": "accessflow_priority", "model_version": model_version, "algorithm": best,
        "random_forest_selected": best == "random_forest",
        "training_date_utc": now.isoformat(timespec="seconds"),
        "is_synthetic": d["origin"] != "own_collected", "production_eligible": eligible, "eligibility_reason": reason,
        "evaluation_status": "meaningful" if eligible else "NOT_VALID_PERFORMANCE_DEVELOPMENT_ONLY",
        "dataset": {
            "version": dataset_version, "origin": d["origin"], "file_sha256": _sha256(dataset_path),
            "n_total": len(d["records"]), "n_train": len(d["y_train"]), "n_test": len(d["y_test"]),
            "n_domains_train": len(set(d["g_train"])), "n_domains_test": len(set(d["g_test"])),
            "class_counts_train": pd.Series(d["y_train"]).value_counts().reindex(LABELS, fill_value=0).to_dict(),
            "class_counts_test": pd.Series(d["y_test"]).value_counts().reindex(LABELS, fill_value=0).to_dict(),
            "quality_report": quality,
        },
        "label_definitions": {"High": "blocks/severely hinders a core task, no practical workaround", "Medium": "real difficulty with a workaround or non-core element", "Low": "minor annoyance / best-practice / unlikely to affect task completion", "source": "ml-service/data/ANNOTATION_GUIDELINE.md"},
        "labels": LABELS, "feature_version": FEATURE_VERSION, "features": feature_schema()["features"],
        "fallback_impact_to_priority": FALLBACK_IMPACT_TO_PRIORITY,
        "selection": {"criterion": "grouped-CV macro-F1 on train split (tie-break: High recall)", "selected": best, "cv": cv},
        "test_metrics_selected": test_metrics[best], "test_ci_selected": ci,
        "test_metrics_all_models": test_metrics,
        "beats_axe_impact_baseline_on_test_macro_f1": test_metrics[best]["f1_macro"] > test_metrics["axe_impact_mapping"]["f1_macro"],
        "training_config": {"seed": seed, "cv": "StratifiedGroupKFold(groups=registrable_domain)", "scoring_refit": "macro_f1",
                            "grids": {n: g for n, (_, g) in candidates(seed).items()}, "class_weight": "balanced",
                            "split": "domain-level hash split (locked manifest)", "final_fit": "train split only"},
        "environment": {"python": platform.python_version(), "scikit_learn": sklearn.__version__, "numpy": np.__version__,
                        "pandas": pd.__version__, "joblib": joblib.__version__},
    }
    paths = export_artifacts(target, fitted[best], metadata)
    errors_table.to_csv(target / "error_analysis.csv", index=False)
    (target / "error_summary.json").write_text(json.dumps(errors, indent=2, default=_jsonable))
    return {"metadata": metadata, "paths": paths, "dir": str(target)}


def run(dataset_path: str | Path, artifacts_root: str | Path, seed: int = SEED, n_boot: int = 1000,
        model_version: str | None = None, out_dir: str | Path | None = None, verbose: bool = True) -> dict[str, Any]:
    dataset_path, artifacts_root = Path(dataset_path), Path(artifacts_root)
    d = load_dataset(dataset_path)
    resolve_target(dataset_path, d["origin"], artifacts_root, out_dir)   # fail fast before any training

    fitted, cv = {}, {}
    for name, (pipe, grid) in candidates(seed).items():
        fitted[name], cv[name] = tune_candidate(pipe, grid, d["X_train"], d["y_train"], d["g_train"], seed)
        if verbose:
            print(f"{name:22s} CV macro-F1 {cv[name]['cv_macro_f1_mean']:.3f}  High recall {cv[name]['cv_high_recall_mean']:.3f}")

    best = select_best(cv)                                   # chosen WITHOUT looking at the test split
    test_metrics = {n: evaluate_model(m, d["X_test"], d["y_test"]) for n, m in fitted.items()}   # test used once
    ci = cluster_bootstrap_ci(fitted[best], d["X_test"], d["y_test"], d["g_test"], n_boot, seed)
    errors = error_analysis(fitted[best], d["X_test"], d["y_test"], d["meta_test"])
    errors_table = errors.pop("errors_table")
    res = finalize(dataset_path, d, fitted, cv, best, test_metrics, ci, errors, errors_table,
                   artifacts_root, seed, model_version, out_dir)
    if verbose:
        m = res["metadata"]
        print(f"\nselected: {best}  (production_eligible={m['production_eligible']}: {m['eligibility_reason']})\nartifacts -> {res['dir']}")
    return res
