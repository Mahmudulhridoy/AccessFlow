# AccessFlow ML service (Module 2)

Status: dataset tooling, feature engineering, training pipeline and notebook (Phases 5-7). FastAPI inference service in `app/` (Phase 8).
No real model has been trained yet and no performance is claimed.

```
src/accessflow_ml/   shared package: features.py (used by training AND inference), data.py (splits, quality checks)
tools/               make_annotation_sheet.py, build_dataset.py, make_synthetic_fixture.py
data/                specs, annotation guideline, provenance, templates (raw/private/built data are git-ignored)
tests/               pytest (uses the SYNTHETIC fixture, tests/fixtures/)
notebooks/model_training.ipynb   offline experiment (never run in production)
artifacts/           exported model; non-production models go to artifacts/dev/ only
```

## Workflow
```
# 1. collect (from server/): public URLs only
node scripts/collect-dataset.js --urls ../ml-service/data/urls.txt --run-id run-01
# 2. blind annotation sheet (shuffled, no axe impact)
python tools/make_annotation_sheet.py data/raw/run-01.jsonl data/annotations.csv
#    -> fill priority/flag/confidence/rationale following data/ANNOTATION_GUIDELINE.md
# 3. build dataset + quality report
python tools/build_dataset.py data/raw/run-01.jsonl data/annotations.csv --version v0.1
```
## Training and export (needs a real labelled dataset)
```
python tools/train.py data/dataset_v0.1.jsonl          # script: tune, evaluate once on test, export
jupyter notebook notebooks/model_training.ipynb        # same steps, step by step (set DATASET_VERSION)
```
Exports `accessflow_priority_model.joblib`, `feature_schema.json`, `model_metadata.json`.
Only a **real** dataset that passes every readiness gate writes to `artifacts/`; anything else goes to `artifacts/dev/` with
`production_eligible: false`. Never report metrics from the synthetic fixture. `jupyter` is not in requirements.txt:
`pip install notebook matplotlib` to open the notebook.

## Setup and tests
```
cd ml-service
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements.txt
set PYTHONPATH=src && pytest -q tests                # PowerShell: $env:PYTHONPATH="src"
```

## Inference service (FastAPI)
Loads the exported `.joblib` once at startup. It never trains and never runs the notebook.
```
cd ml-service
pip install -r requirements.txt
copy .env.example .env      # then set ML_SERVICE_API_KEY (any long random string)
set ML_SERVICE_API_KEY=your-long-random-key
uvicorn app.main:app --port 8000
```
| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /health` | none | liveness + `model_loaded` |
| `GET /ready` | none | 200 only when a model is loaded, else 503 |
| `GET /v1/model` | key | model name/version/origin/evaluation status |
| `POST /v1/predict` | key | one finding -> priority, probabilities, model version |
| `POST /v1/predict/batch` | key | up to 100 findings |

Send the key as header `X-API-Key`. Unknown request fields (e.g. raw HTML) are rejected with 422.

**No model = 503 `MODEL_UNAVAILABLE`**, never a guess. Production loads only `artifacts/` models that are real-data and passed
the readiness gates. A model in `artifacts/dev/` (synthetic or exploratory) is served only with `ALLOW_DEV_MODEL=true`, and every
response then carries `development_model: true` and `model_origin`. The model file is checked against `model_sha256`, and the
feature schema must match the service's feature code, otherwise it refuses to load.
`joblib` files are pickles: only deploy artifacts you trained yourself.

Environment: `ML_SERVICE_API_KEY`, `ML_SERVICE_ALLOW_NO_AUTH` (local dev only), `ALLOW_DEV_MODEL`, `ACCESSFLOW_ARTIFACT_DIR`, `ML_SERVICE_ENABLE_DOCS`.
Quick dev run with the synthetic dev model: `python tools/train.py tests/fixtures/synthetic_fixture.jsonl` then `set ALLOW_DEV_MODEL=true`.
