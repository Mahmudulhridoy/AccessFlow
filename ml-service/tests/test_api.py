"""HTTP-level tests. Need fastapi + httpx installed (pip install -r requirements.txt); skipped otherwise."""
import shutil
from pathlib import Path
import pytest

pytest.importorskip("fastapi"); pytest.importorskip("httpx")
from fastapi.testclient import TestClient
from accessflow_ml import train
from app.config import Settings
from app.main import create_app

FIX = Path(__file__).parent / "fixtures/synthetic_fixture.jsonl"
KEY = {"X-API-Key": "test-key"}
FINDING = {"rule_id": "button-name", "axe_impact": "critical", "tags": ["wcag2a", "wcag412"],
           "wcag_criteria": [{"criterion": "4.1.2", "level": "A"}], "node_count": 2, "nodes": [{"tag": "button", "is_interactive": True}]}


@pytest.fixture(scope="module")
def art(tmp_path_factory):
    r = tmp_path_factory.mktemp("art"); ds = tmp_path_factory.mktemp("d") / "dataset_synthetic.jsonl"
    shutil.copy(FIX, ds); train.run(ds, r, n_boot=10, verbose=False)
    return r


def client(art, **kw):
    s = Settings(artifact_dir=art, api_key="test-key", **kw)
    return TestClient(create_app(s))


def test_health_is_open_and_reports_model_state(tmp_path):
    with client(tmp_path) as c:                      # no model at all
        assert c.get("/health").json() == {"status": "ok", "model_loaded": False}
        assert c.get("/ready").status_code == 503


def test_predict_requires_api_key(art):
    with client(art, allow_dev_model=True) as c:
        assert c.post("/v1/predict", json=FINDING).status_code == 401
        assert c.post("/v1/predict", json=FINDING, headers={"X-API-Key": "wrong"}).status_code == 401


def test_predict_returns_503_without_model_not_a_fake_prediction(tmp_path):
    with client(tmp_path) as c:
        r = c.post("/v1/predict", json=FINDING, headers=KEY)
        assert r.status_code == 503 and r.json()["detail"]["code"] == "MODEL_UNAVAILABLE"


def test_dev_model_not_served_without_flag(art):
    with client(art) as c:
        assert c.post("/v1/predict", json=FINDING, headers=KEY).status_code == 503


def test_predict_and_batch_with_dev_model(art):
    with client(art, allow_dev_model=True) as c:
        r = c.post("/v1/predict", json=FINDING, headers=KEY)
        assert r.status_code == 200
        body = r.json()
        assert body["priority"] in {"High", "Medium", "Low"} and body["source"] == "ML" and body["model_version"]
        assert body["development_model"] is True
        b = c.post("/v1/predict/batch", json={"findings": [FINDING, FINDING]}, headers=KEY)
        assert b.status_code == 200 and len(b.json()["predictions"]) == 2
        assert c.get("/v1/model", headers=KEY).json()["is_synthetic"] is True


def test_validation_errors_are_422(art):
    with client(art, allow_dev_model=True) as c:
        assert c.post("/v1/predict", json={**FINDING, "node_count": -5}, headers=KEY).status_code == 422
        assert c.post("/v1/predict", json={**FINDING, "html": "<p>x</p>"}, headers=KEY).status_code == 422
        assert c.post("/v1/predict/batch", json={"findings": []}, headers=KEY).status_code == 422


def test_missing_server_key_is_a_misconfiguration_not_open_access(art):
    with TestClient(create_app(Settings(artifact_dir=art, allow_dev_model=True))) as c:
        assert c.post("/v1/predict", json=FINDING).status_code == 503
