import json, shutil
import joblib, pytest
from pathlib import Path
from accessflow_ml import train
from accessflow_ml.features import FEATURE_COLUMNS, LABELS, features_frame
from accessflow_ml.data import read_jsonl, write_jsonl

FIX = Path(__file__).parent / "fixtures/synthetic_fixture.jsonl"


@pytest.fixture(scope="module")
def trained(tmp_path_factory):
    root = tmp_path_factory.mktemp("artifacts")
    ds = tmp_path_factory.mktemp("data") / "dataset_synthetic.jsonl"
    shutil.copy(FIX, ds)
    return train.run(ds, root, n_boot=50, verbose=False), root


def test_synthetic_model_goes_to_dev_and_is_flagged(trained):
    res, root = trained
    meta = res["metadata"]
    assert Path(res["dir"]) == root / "dev"
    assert meta["is_synthetic"] and not meta["production_eligible"]
    assert meta["evaluation_status"] == "NOT_VALID_PERFORMANCE_DEVELOPMENT_ONLY"
    for f in ["accessflow_priority_model.joblib", "feature_schema.json", "model_metadata.json"]:
        assert (root / "dev" / f).exists()


def test_exported_pipeline_predicts_valid_priority_from_raw_finding(trained):
    res, _ = trained
    model = joblib.load(res["paths"]["model"])
    rec = read_jsonl(FIX)[0]
    X = features_frame([rec])
    assert list(X.columns) == FEATURE_COLUMNS
    assert model.predict(X)[0] in LABELS
    assert abs(model.predict_proba(X).sum() - 1) < 1e-9


def test_metadata_is_complete_and_honest(trained):
    meta = trained[0]["metadata"]
    for key in ["model_name", "model_version", "dataset", "features", "label_definitions", "training_date_utc",
                "test_metrics_selected", "training_config", "test_metrics_all_models", "selection"]:
        assert key in meta
    assert meta["dataset"]["origin"] == "synthetic_fixture"
    assert meta["selection"]["selected"] in train.ML_CANDIDATES  # baselines are never exported
    assert set(meta["test_metrics_all_models"]) >= {"majority_class", "axe_impact_mapping", "random_forest"}


def test_selection_ignores_test_metrics():
    cv = {"random_forest": {"cv_macro_f1_mean": .5, "cv_high_recall_mean": .5},
          "logistic_regression": {"cv_macro_f1_mean": .7, "cv_high_recall_mean": .1},
          "axe_impact_mapping": {"cv_macro_f1_mean": .99, "cv_high_recall_mean": .99}}
    assert train.select_best(cv) == "logistic_regression"


def test_training_is_reproducible(tmp_path):
    ds = tmp_path / "dataset_synthetic.jsonl"; shutil.copy(FIX, ds)
    a = train.run(ds, tmp_path / "a", n_boot=20, verbose=False)["metadata"]
    b = train.run(ds, tmp_path / "b", n_boot=20, verbose=False)["metadata"]
    assert a["test_metrics_all_models"] == b["test_metrics_all_models"] and a["selection"] == b["selection"]


def test_refuses_production_dir_for_non_production_model(tmp_path):
    ds = tmp_path / "dataset_synthetic.jsonl"; shutil.copy(FIX, ds)
    with pytest.raises(train.TrainingDataError):
        train.run(ds, tmp_path, out_dir=tmp_path / "prod", n_boot=5, verbose=False)


def test_rejects_domain_overlap_between_splits(tmp_path):
    recs = read_jsonl(FIX)
    recs[0]["split"], recs[1]["split"] = "train", "test"; recs[1]["registrable_domain"] = recs[0]["registrable_domain"]
    ds = tmp_path / "dataset_x.jsonl"; write_jsonl(ds, recs)
    with pytest.raises(train.TrainingDataError, match="leakage"):
        train.load_dataset(ds)


def test_rejects_mixed_origins_and_bad_labels(tmp_path):
    recs = read_jsonl(FIX); recs[0]["data_origin"] = "own_collected"
    ds = tmp_path / "dataset_m.jsonl"; write_jsonl(ds, recs)
    with pytest.raises(train.TrainingDataError, match="mixes"):
        train.load_dataset(ds)
    recs = read_jsonl(FIX); recs[0]["final_label"] = "Critical"; write_jsonl(ds, recs)
    with pytest.raises(train.TrainingDataError, match="invalid final_label"):
        train.load_dataset(ds)


def test_too_little_data_gives_clear_error():
    with pytest.raises(train.TrainingDataError, match="too little"):
        train.cv_splits(["High", "Low", "Low", "Low"], ["a", "b", "c", "d"])
