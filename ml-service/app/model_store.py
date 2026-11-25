"""Loads and serves the exported model. No FastAPI imports here, so it is unit-testable on its own.

The service NEVER trains and NEVER runs the notebook; it only loads artifacts produced by tools/train.py.
joblib files are pickles: only load artifacts from a directory you control. A SHA-256 check against
model_metadata.json detects accidental corruption/tampering of the model file (it is not a signature).
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
from pathlib import Path
from typing import Any

import joblib

from accessflow_ml.features import FEATURE_COLUMNS, FEATURE_VERSION, LABELS, features_frame
from accessflow_ml.train import ARTIFACT_MODEL

from .config import Settings

log = logging.getLogger("accessflow.ml")


class ModelUnavailable(RuntimeError):
    """No usable model is loaded. Surfaced to clients as HTTP 503 — never as a fake prediction."""


class ModelStore:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._lock = threading.Lock()
        self.pipeline = None
        self.metadata: dict[str, Any] | None = None
        self.reason = "model not loaded yet"
        self.source_dir: Path | None = None

    # ------------------------------------------------------------ loading
    def load(self) -> bool:
        """Try production artifacts, then (only if ALLOW_DEV_MODEL) artifacts/dev. Never raises."""
        with self._lock:
            self.pipeline, self.metadata, self.source_dir = None, None, None
            attempts = [(self.settings.artifact_dir, False)]
            if self.settings.allow_dev_model:
                attempts.append((self.settings.artifact_dir / "dev", True))
            reasons = []
            for directory, is_dev in attempts:
                try:
                    self.pipeline, self.metadata = self._load_dir(directory, is_dev)
                    self.source_dir, self.reason = directory, "loaded"
                    log.info("model loaded: %s %s from %s", self.metadata["model_name"], self.metadata["model_version"], directory)
                    return True
                except ModelUnavailable as e:
                    reasons.append(f"{directory.name}: {e}")
            self.reason = "; ".join(reasons)
            if not self.settings.allow_dev_model and (self.settings.artifact_dir / "dev").exists():
                self.reason += " (a development model exists in artifacts/dev but ALLOW_DEV_MODEL is not enabled)"
            log.warning("no model available: %s", self.reason)
            return False

    def _load_dir(self, directory: Path, is_dev: bool):
        model_path, meta_path, schema_path = directory / ARTIFACT_MODEL, directory / "model_metadata.json", directory / "feature_schema.json"
        missing = [p.name for p in (model_path, meta_path, schema_path) if not p.exists()]
        if missing:
            raise ModelUnavailable(f"missing artifact(s): {', '.join(missing)}")
        try:
            meta = json.loads(meta_path.read_text())
            schema = json.loads(schema_path.read_text())
        except (OSError, json.JSONDecodeError) as e:
            raise ModelUnavailable(f"unreadable metadata/schema ({e.__class__.__name__})")

        if not is_dev and (meta.get("is_synthetic") or not meta.get("production_eligible")):
            raise ModelUnavailable("model is not production-eligible (synthetic data or failed quality gates)")
        if hashlib.sha256(model_path.read_bytes()).hexdigest() != meta.get("model_sha256"):
            raise ModelUnavailable("model file does not match model_sha256 in metadata")
        if [f["name"] for f in schema.get("features", [])] != FEATURE_COLUMNS or schema.get("feature_version") != FEATURE_VERSION:
            raise ModelUnavailable("feature schema does not match this service's feature code (retrain or redeploy)")
        if schema.get("labels") != LABELS or meta.get("labels") != LABELS:
            raise ModelUnavailable("label set mismatch")
        try:
            pipeline = joblib.load(model_path)
        except Exception as e:  # corrupt pickle, version mismatch, ...
            raise ModelUnavailable(f"could not load model ({e.__class__.__name__})")
        if not hasattr(pipeline, "predict_proba") or not set(pipeline.classes_) <= set(LABELS):
            raise ModelUnavailable("loaded object is not a compatible classifier")
        return pipeline, meta

    # ------------------------------------------------------------ status
    @property
    def ready(self) -> bool:
        return self.pipeline is not None

    def info(self) -> dict[str, Any]:
        if not self.ready:
            return {"model_loaded": False, "reason": self.reason}
        m = self.metadata
        return {
            "model_loaded": True, "model_name": m["model_name"], "model_version": m["model_version"],
            "algorithm": m["algorithm"], "feature_version": m["feature_version"], "labels": m["labels"],
            "dataset_version": m["dataset"]["version"], "dataset_origin": m["dataset"]["origin"],
            "is_synthetic": m["is_synthetic"], "production_eligible": m["production_eligible"],
            "evaluation_status": m["evaluation_status"], "training_date_utc": m["training_date_utc"],
        }

    # ------------------------------------------------------------ inference
    def predict(self, findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not self.ready:
            raise ModelUnavailable(self.reason)
        m = self.metadata
        X = features_frame(findings)                       # same code path as training; raises FeatureInputError
        proba = self.pipeline.predict_proba(X)
        classes = list(self.pipeline.classes_)
        origin = "real_annotated" if m["dataset"]["origin"] == "own_collected" else (
            "synthetic_fixture" if m["is_synthetic"] else "development")
        development = not m["production_eligible"]
        out = []
        for row in proba:
            probs = {c: float(p) for c, p in zip(classes, row)}
            priority = max(probs, key=probs.get)
            if priority not in LABELS:                      # defensive: never emit a label outside the contract
                raise ModelUnavailable("model produced an unknown label")
            out.append({
                "priority": priority, "probabilities": {l: probs.get(l, 0.0) for l in LABELS}, "source": "ML",
                "model_name": m["model_name"], "model_version": m["model_version"], "feature_version": m["feature_version"],
                "model_origin": origin, "development_model": development,
            })
        return out
