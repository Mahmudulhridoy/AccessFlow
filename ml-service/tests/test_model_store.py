import json, shutil
from pathlib import Path
import pytest
from accessflow_ml import train
from accessflow_ml.features import LABELS, FeatureInputError
from app.config import Settings
from app.model_store import ModelStore, ModelUnavailable
from app.schemas import BatchIn, FindingIn
from pydantic import ValidationError

FIX = Path(__file__).parent / "fixtures/synthetic_fixture.jsonl"
FINDING = {"rule_id": "button-name", "axe_impact": "critical", "tags": ["cat.name-role-value", "wcag2a", "wcag412"],
           "wcag_criteria": [{"criterion": "4.1.2", "level": "A"}], "node_count": 2, "page_finding_count": 6,
           "nodes": [{"tag": "button", "is_interactive": True, "landmark": "main"}]}


@pytest.fixture(scope="module")
def root(tmp_path_factory):
    r = tmp_path_factory.mktemp("art"); ds = tmp_path_factory.mktemp("d") / "dataset_synthetic.jsonl"
    shutil.copy(FIX, ds); train.run(ds, r, n_boot=10, verbose=False)   # writes r/dev (synthetic -> dev only)
    return r


def store(root, **kw): s = ModelStore(Settings(artifact_dir=root, **kw)); s.load(); return s


def test_missing_model_is_unavailable_not_faked(tmp_path):
    s = store(tmp_path)
    assert not s.ready and "missing artifact" in s.reason
    with pytest.raises(ModelUnavailable):
        s.predict([FINDING])


def test_dev_model_refused_unless_explicitly_allowed(root):
    s = store(root)
    assert not s.ready and "ALLOW_DEV_MODEL" in s.reason
    assert store(root, allow_dev_model=True).ready


def test_prediction_is_valid_and_marked_as_development(root):
    out = store(root, allow_dev_model=True).predict([FINDING, {**FINDING, "rule_id": "region", "axe_impact": "moderate"}])
    assert len(out) == 2
    for p in out:
        assert p["priority"] in LABELS and p["source"] == "ML"
        assert abs(sum(p["probabilities"].values()) - 1) < 1e-9 and set(p["probabilities"]) == set(LABELS)
        assert p["model_version"] and p["development_model"] is True and p["model_origin"] == "synthetic_fixture"


def test_invalid_features_raise(root):
    s = store(root, allow_dev_model=True)
    with pytest.raises(FeatureInputError):
        s.predict([{**FINDING, "node_count": -1}])


def test_corrupted_model_file_is_rejected(root, tmp_path):
    shutil.copytree(root, tmp_path / "a")
    (tmp_path / "a/dev/accessflow_priority_model.joblib").write_bytes(b"not a model")
    assert "sha256" in store(tmp_path / "a", allow_dev_model=True).reason


def test_feature_schema_mismatch_is_rejected(root, tmp_path):
    shutil.copytree(root, tmp_path / "b")
    p = tmp_path / "b/dev/feature_schema.json"; sch = json.loads(p.read_text()); sch["features"].pop(); p.write_text(json.dumps(sch))
    assert "feature schema" in store(tmp_path / "b", allow_dev_model=True).reason


def test_production_dir_rejects_non_eligible_model(root, tmp_path):
    shutil.copytree(root / "dev", tmp_path / "prod_like")           # a dev model copied into the production slot
    s = store(tmp_path / "prod_like", allow_dev_model=False)
    assert not s.ready and "not production-eligible" in s.reason


def test_schemas_reject_extra_and_out_of_range_fields():
    ok = FindingIn(**{**FINDING, "axe_impact": "SERIOUS"})
    assert ok.axe_impact == "serious"
    for bad in [{**FINDING, "html": "<div>secret</div>"}, {**FINDING, "node_count": -1}, {**FINDING, "rule_id": ""},
                {**FINDING, "axe_impact": "catastrophic"}, {**FINDING, "wcag_criteria": [{"criterion": "x"}]},
                {k: v for k, v in FINDING.items() if k != "node_count"}]:
        with pytest.raises(ValidationError):
            FindingIn(**bad)
    with pytest.raises(ValidationError):
        BatchIn(findings=[])
    with pytest.raises(ValidationError):
        BatchIn(findings=[FINDING] * 101)
