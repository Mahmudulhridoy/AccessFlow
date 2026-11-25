import pytest
from accessflow_ml.features import (CATEGORICAL, FEATURE_COLUMNS, FORBIDDEN_FEATURES, FeatureInputError,
                                    build_preprocessor, extract_features, feature_schema, features_frame)
from accessflow_ml.data import read_jsonl
from pathlib import Path

FIXTURE = Path(__file__).parent / "fixtures/synthetic_fixture.jsonl"

BASE = {"rule_id": "image-alt", "axe_impact": "critical", "tags": ["cat.text-alternatives", "wcag2a", "wcag111"],
        "wcag_criteria": [{"criterion": "1.1.1", "level": "A"}], "node_count": 3, "page_finding_count": 5,
        "nodes": [{"tag": "img", "is_interactive": False, "landmark": "main"},
                  {"tag": "img", "is_interactive": False, "landmark": None},
                  {"tag": "a", "is_interactive": True, "landmark": "main"}]}


def test_extracts_documented_features():
    f = extract_features(BASE)
    assert f["axe_impact"] == "critical" and f["rule_category"] == "text-alternatives"
    assert f["wcag_level"] == "A" and f["wcag_principle"] == "1"
    assert f["element_group"] == "image" and f["landmark"] == "main"
    assert f["interactive_ratio"] == pytest.approx(1 / 3)
    assert set(f) == set(FEATURE_COLUMNS)


def test_best_practice_rule_without_wcag():
    f = extract_features({**BASE, "tags": ["cat.semantics", "best-practice"], "wcag_criteria": []})
    assert f["is_best_practice"] == 1 and f["wcag_level"] == "none" and f["wcag_principle"] == "none"


def test_no_target_leakage_in_features():
    assert not FORBIDDEN_FEATURES & set(FEATURE_COLUMNS)
    assert {x["name"] for x in feature_schema()["features"]} == set(FEATURE_COLUMNS)


def test_label_and_source_fields_do_not_change_features():
    a = extract_features(BASE)
    b = extract_features({**BASE, "final_label": "High", "page_url": "https://x", "registrable_domain": "x.com",
                          "annotator_id": "me", "nodes": BASE["nodes"]})
    assert a == b


@pytest.mark.parametrize("bad", [{}, {**BASE, "rule_id": ""}, {**BASE, "node_count": -1}, {**BASE, "node_count": "3"}, "x"])
def test_rejects_invalid_payloads(bad):
    with pytest.raises(FeatureInputError):
        extract_features(bad)


def test_unknown_values_are_tolerated_by_preprocessor():
    rows = read_jsonl(FIXTURE)
    pre = build_preprocessor().fit(features_frame(rows))
    novel = features_frame([{**BASE, "rule_id": "never-seen-rule", "axe_impact": "weird"}])
    assert pre.transform(novel).shape[0] == 1  # handle_unknown='ignore'


def test_same_features_for_train_and_inference_paths():
    rows = read_jsonl(FIXTURE)
    assert list(features_frame(rows).columns) == FEATURE_COLUMNS
    assert set(CATEGORICAL) <= set(FEATURE_COLUMNS)
