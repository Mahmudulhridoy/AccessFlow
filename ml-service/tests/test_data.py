import pandas as pd
from accessflow_ml.data import (apply_splits, assign_split, merge_labels, quality_report, read_jsonl,
                                registrable_domain, self_consistency)
from pathlib import Path

FIXTURE = Path(__file__).parent / "fixtures/synthetic_fixture.jsonl"


def raw(i, domain="a.com"):
    return {"finding_id": f"f{i}", "rule_id": "image-alt", "node_count": 1, "registrable_domain": domain,
            "dedupe_key": f"k{i}", "data_origin": "own_collected"}


def ann(rows):
    return pd.DataFrame(rows, columns=["finding_id", "priority", "flag", "pass"]).astype(str)


def test_registrable_domain():
    assert registrable_domain("www.example.com") == "example.com"
    assert registrable_domain("news.bbc.co.uk") == "bbc.co.uk"
    assert registrable_domain("www.du.ac.bd") == "du.ac.bd"


def test_split_is_stable_and_group_safe():
    recs = [raw(i, d) for i, d in enumerate(["a.com", "a.com", "b.com", "b.com", "c.com"])]
    m = apply_splits(recs, {})
    assert len({r["split"] for r in recs if r["registrable_domain"] == "a.com"}) == 1
    assert assign_split("a.com") == assign_split("a.com")
    again = apply_splits([raw(9, "a.com"), raw(10, "new.com")], dict(m))
    assert again["a.com"] == m["a.com"]  # locked: existing domains never move


def test_unlabelled_flagged_and_invalid_rows_are_excluded_not_guessed():
    records = [raw(1), raw(2), raw(3), raw(4), raw(5)]
    a = ann([("f1", "High", "none", "1"), ("f2", "Low", "unsure", "1"), ("f3", "Banana", "none", "1"),
             ("f4", "", "none", "1")])  # f5 has no annotation
    kept, stats = merge_labels(records, a)
    assert [r["finding_id"] for r in kept] == ["f1"] and kept[0]["final_label"] == "High"
    assert stats["excluded_unsure"] == 1 and stats["excluded_invalid_label"] == 2 and stats["excluded_unlabelled"] == 1


def test_second_pass_does_not_replace_first_pass_label():
    kept, _ = merge_labels([raw(1)], ann([("f1", "High", "none", "1"), ("f1", "Low", "none", "2")]))
    assert kept[0]["final_label"] == "High"


def test_self_consistency_kappa():
    rows = [(f"f{i}", l, "none", p) for i, l in enumerate(["High", "Medium", "Low"] * 5) for p in ("1", "2")]
    assert self_consistency(ann(rows))["weighted_kappa"] == 1.0
    assert self_consistency(ann(rows[:4]))["weighted_kappa"] is None


def test_quality_report_marks_synthetic_data_not_ready():
    recs = read_jsonl(FIXTURE)
    rep = quality_report(recs, {}, {"weighted_kappa": None})
    assert rep["data_origins"] == ["synthetic_fixture"]
    assert rep["readiness_gates"]["real_annotated_data_only"] is False
    assert rep["ready_for_meaningful_training"] is False


def test_quality_report_detects_duplicates_and_missing():
    a, b = raw(1), raw(1)
    a.update(final_label="High", split="train"); b.update(final_label="High", split="train")
    rep = quality_report([a, b], {}, {})
    assert rep["duplicate_ids"] == 1 and rep["readiness_gates"]["no_duplicate_findings"] is False
