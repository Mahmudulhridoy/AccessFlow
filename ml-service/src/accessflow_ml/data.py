"""Dataset building, quality checks and leakage-safe splitting."""
from __future__ import annotations

import hashlib
import json
import random
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd
from sklearn.metrics import cohen_kappa_score

from .features import LABELS

TEST_PERCENT = 20
MIN_TEST_PER_CLASS = 30       # working gates (see ml-service/data/DATASET_SPEC.md); rules of thumb, not standards
MIN_DOMAINS = 40
MAX_DOMAIN_SHARE = 0.05
MIN_SELF_KAPPA = 0.6
VALID_FLAGS = {"none", "unsure", "false_positive", "needs_context"}


def read_jsonl(path: str | Path) -> list[dict[str, Any]]:
    with open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def write_jsonl(path: str | Path, records: list[dict[str, Any]]) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        for r in records:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")


def registrable_domain(host: str) -> str:
    """Heuristic eTLD+1 (no public-suffix list available offline). Good enough for grouping;
    swap for `tldts`/`publicsuffix2` if exact grouping is needed."""
    host = host.lower().split(":")[0].strip(".")
    parts = host.split(".")
    if len(parts) <= 2:
        return host
    second_level = {"co", "com", "org", "net", "gov", "edu", "ac"}
    if len(parts[-1]) == 2 and parts[-2] in second_level:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def assign_split(domain: str, seed: int = 42, test_percent: int = TEST_PERCENT) -> str:
    """Stable, domain-level assignment: the same domain always lands in the same split."""
    bucket = int(hashlib.sha256(f"{seed}:{domain}".encode()).hexdigest(), 16) % 100
    return "test" if bucket < test_percent else "train"


def load_manifest(path: str | Path) -> dict[str, str]:
    p = Path(path)
    return json.loads(p.read_text()) if p.exists() else {}


def apply_splits(records: list[dict[str, Any]], manifest: dict[str, str], seed: int = 42) -> dict[str, str]:
    """Existing domains keep their split forever (locked test set); only new domains are added."""
    for r in records:
        manifest.setdefault(r["registrable_domain"], assign_split(r["registrable_domain"], seed))
        r["split"] = manifest[r["registrable_domain"]]
    return manifest


def merge_labels(raw: list[dict[str, Any]], annotations: pd.DataFrame) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Attach the first-pass human label to each raw finding.

    Rows with a flag other than 'none', no label, or no annotation are excluded and counted.
    axe impact is never used to fill a missing label.
    """
    stats: Counter[str] = Counter()
    ann = annotations.copy()
    ann["pass"] = pd.to_numeric(ann.get("pass", 1), errors="coerce").fillna(1).astype(int)
    first = ann[ann["pass"] == 1].drop_duplicates("finding_id", keep="last").set_index("finding_id")

    out = []
    for rec in raw:
        row = first.loc[rec["finding_id"]] if rec["finding_id"] in first.index else None
        if row is None:
            stats["excluded_unlabelled"] += 1
            continue
        flag = str(row.get("flag") or "none").strip().lower()
        label = str(row.get("priority") or "").strip().title()
        if flag not in VALID_FLAGS:
            raise ValueError(f"invalid flag {flag!r} for {rec['finding_id']}")
        if flag != "none":
            stats[f"excluded_{flag}"] += 1
            continue
        if label not in LABELS:
            stats["excluded_invalid_label"] += 1
            continue
        out.append({**rec, "final_label": label, "label_method": "single_annotator"})
        stats["kept"] += 1
    return out, dict(stats)


def self_consistency(annotations: pd.DataFrame) -> dict[str, Any]:
    """Agreement between the first labelling pass and the blind re-label pass (same annotator)."""
    ann = annotations.copy()
    ann["pass"] = pd.to_numeric(ann.get("pass", 1), errors="coerce").fillna(1).astype(int)
    p1 = ann[ann["pass"] == 1].drop_duplicates("finding_id", keep="last").set_index("finding_id")["priority"]
    p2 = ann[ann["pass"] == 2].drop_duplicates("finding_id", keep="last").set_index("finding_id")["priority"]
    common = p1.index.intersection(p2.index)
    common = [i for i in common if str(p1[i]).title() in LABELS and str(p2[i]).title() in LABELS]
    if len(common) < 10:
        return {"n": len(common), "weighted_kappa": None, "note": "Too few re-labelled items to compute."}
    idx = {l: i for i, l in enumerate(LABELS)}
    a = [idx[str(p1[i]).title()] for i in common]
    b = [idx[str(p2[i]).title()] for i in common]
    return {"n": len(common), "weighted_kappa": float(cohen_kappa_score(a, b, weights="quadratic")),
            "exact_agreement": float(sum(x == y for x, y in zip(a, b)) / len(common))}


def quality_report(records: list[dict[str, Any]], merge_stats: dict[str, int], consistency: dict[str, Any]) -> dict[str, Any]:
    """Minimum dataset quality checks + training-readiness gates. Never hides a failed gate."""
    n = len(records)
    keys = Counter((r["registrable_domain"], r["rule_id"], r.get("dedupe_key")) for r in records)
    duplicates = sum(c - 1 for c in keys.values() if c > 1)
    ids = Counter(r["finding_id"] for r in records)
    dup_ids = sum(c - 1 for c in ids.values() if c > 1)
    required = ["finding_id", "rule_id", "node_count", "registrable_domain", "final_label", "split", "data_origin"]
    missing = {k: sum(1 for r in records if r.get(k) in (None, "")) for k in required}

    by_split_label: dict[str, dict[str, int]] = {"train": {}, "test": {}}
    for s in by_split_label:
        c = Counter(r["final_label"] for r in records if r["split"] == s)
        by_split_label[s] = {l: c.get(l, 0) for l in LABELS}
    domains = Counter(r["registrable_domain"] for r in records)
    top_share = (max(domains.values()) / n) if n else 0.0
    origins = sorted({r["data_origin"] for r in records})

    gates = {
        "real_annotated_data_only": origins == ["own_collected"],
        "test_has_min_examples_per_class": all(by_split_label["test"][l] >= MIN_TEST_PER_CLASS for l in LABELS),
        "enough_domains": len(domains) >= MIN_DOMAINS,
        "no_domain_dominates": top_share <= MAX_DOMAIN_SHARE if n else False,
        "self_consistency_ok": (consistency.get("weighted_kappa") or 0) >= MIN_SELF_KAPPA,
        "no_duplicate_findings": duplicates == 0 and dup_ids == 0,
        "no_missing_required": all(v == 0 for v in missing.values()),
    }
    return {
        "n_findings": n, "n_domains": len(domains), "data_origins": origins,
        "label_counts": {l: sum(1 for r in records if r["final_label"] == l) for l in LABELS},
        "split_label_counts": by_split_label, "merge_stats": merge_stats,
        "duplicates": duplicates, "duplicate_ids": dup_ids, "missing_required": missing,
        "top_domain_share": round(top_share, 4), "self_consistency": consistency,
        "readiness_gates": gates,
        "ready_for_meaningful_training": all(gates.values()),
        "interpretation": ("All gates passed." if all(gates.values()) else
                           "NOT ready: results from this data must be reported as exploratory, "
                           "with the failed gates listed."),
    }


def shuffled(items: list[Any], seed: int = 42) -> list[Any]:
    items = list(items)
    random.Random(seed).shuffle(items)
    return items
