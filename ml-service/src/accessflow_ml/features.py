"""Feature engineering shared by training, notebook and the FastAPI service.

This is the ONLY place features are computed. Training and production import the same
functions, so there is no train/serve skew. No raw HTML, URL, domain, annotator or label
information is ever used as a feature (see FORBIDDEN_FEATURES and tests/test_features.py).
"""
from __future__ import annotations

import math
from collections import Counter
from typing import Any, Iterable

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler

FEATURE_VERSION = "1.0"
LABELS = ["Low", "Medium", "High"]  # ordered; used for reports and the confusion matrix

# Documented fallback used (a) as the "axe impact" baseline classifier in training and (b) by the Node
# service when the ML service is unavailable. It is NOT ground truth and is never labelled as ML.
FALLBACK_IMPACT_TO_PRIORITY = {"critical": "High", "serious": "High", "moderate": "Medium", "minor": "Low", "unknown": "Medium"}

IMPACTS = ["critical", "serious", "moderate", "minor"]
TAG_GROUPS = {
    "a": "link", "button": "button", "input": "input", "select": "select", "textarea": "textarea",
    "img": "image", "svg": "image", "object": "image", "iframe": "frame", "frame": "frame",
    "html": "document", "body": "document", "head": "document", "title": "document",
    "h1": "heading", "h2": "heading", "h3": "heading", "h4": "heading", "h5": "heading", "h6": "heading",
    "ul": "list", "ol": "list", "li": "list", "video": "media", "audio": "media",
    "div": "generic", "span": "generic", "p": "text", "label": "label", "table": "table",
    "td": "table", "th": "table", "tr": "table",
}

CATEGORICAL = ["axe_impact", "rule_id", "rule_category", "wcag_level", "wcag_principle", "element_group", "landmark"]
NUMERIC = ["is_best_practice", "node_count_log1p", "interactive_ratio", "page_finding_count_log1p"]
FEATURE_COLUMNS = CATEGORICAL + NUMERIC

# Anything that would leak the target or identify the source must never become a feature.
FORBIDDEN_FEATURES = {
    "label", "final_label", "priority", "annotator_id", "rationale", "confidence", "flag",
    "split", "page_url", "registrable_domain", "html_snippet", "selector", "data_origin", "finding_id",
}

FEATURE_DOCS = {
    "axe_impact": ("categorical", "axe-core impact (critical/serious/moderate/minor/unknown). Scanner output, available at inference. NOT the label."),
    "rule_id": ("categorical", "axe rule ID from the fixed AccessFlow ruleset."),
    "rule_category": ("categorical", "First axe 'cat.*' tag (e.g. color, forms, aria), else 'none'."),
    "wcag_level": ("categorical", "Lowest WCAG level among the rule's level tags (A/AA/AAA), else 'none' for best-practice rules."),
    "wcag_principle": ("categorical", "WCAG principle digit (1-4) of the first success criterion, else 'none'."),
    "element_group": ("categorical", "Most common element type among sampled affected nodes, grouped (link, button, input, image, ...)."),
    "landmark": ("categorical", "Most common nearest landmark region among sampled nodes (main, navigation, banner, ...), else 'none'."),
    "is_best_practice": ("numeric", "1 if the rule is tagged best-practice, else 0."),
    "node_count_log1p": ("numeric", "log(1 + number of affected nodes on the page)."),
    "interactive_ratio": ("numeric", "Fraction of sampled affected nodes that are interactive (0-1)."),
    "page_finding_count_log1p": ("numeric", "log(1 + number of findings on the same page/scan)."),
}


class FeatureInputError(ValueError):
    """Raised when a finding payload is missing required fields or has wrong types."""


def _most_common(values: list[str], default: str = "none") -> str:
    values = [v for v in values if v]
    if not values:
        return default
    counts = Counter(values)
    best = max(counts.values())
    return next(v for v in values if counts[v] == best)  # ties -> first seen


def extract_features(finding: dict[str, Any]) -> dict[str, Any]:
    """Turn one finding (dataset/API record, snake_case) into the model feature dict."""
    if not isinstance(finding, dict):
        raise FeatureInputError("finding must be an object")
    rule_id = finding.get("rule_id")
    if not isinstance(rule_id, str) or not rule_id.strip():
        raise FeatureInputError("rule_id is required")
    node_count = finding.get("node_count")
    if not isinstance(node_count, int) or isinstance(node_count, bool) or node_count < 0:
        raise FeatureInputError("node_count must be a non-negative integer")
    page_count = finding.get("page_finding_count", 1)
    if not isinstance(page_count, int) or isinstance(page_count, bool) or page_count < 0:
        raise FeatureInputError("page_finding_count must be a non-negative integer")

    impact = str(finding.get("axe_impact") or "").lower()
    tags = [t for t in (finding.get("tags") or []) if isinstance(t, str)]
    criteria = [c for c in (finding.get("wcag_criteria") or []) if isinstance(c, dict)]
    nodes = [n for n in (finding.get("nodes") or []) if isinstance(n, dict)]

    categories = [t[4:] for t in tags if t.startswith("cat.")]
    levels = [c.get("level") for c in criteria if c.get("level")]
    level_rank = {"A": 0, "AA": 1, "AAA": 2}
    wcag_level = min(levels, key=lambda l: level_rank.get(l, 9)) if levels else "none"
    principle = str(criteria[0].get("criterion", ""))[:1] if criteria else ""

    tag_groups = [TAG_GROUPS.get(str(n.get("tag") or "").lower(), "other") for n in nodes if n.get("tag")]
    interactive = [bool(n.get("is_interactive")) for n in nodes]

    return {
        "axe_impact": impact if impact in IMPACTS else "unknown",
        "rule_id": rule_id.strip(),
        "rule_category": categories[0] if categories else "none",
        "wcag_level": wcag_level,
        "wcag_principle": principle if principle in {"1", "2", "3", "4"} else "none",
        "element_group": _most_common(tag_groups),
        "landmark": _most_common([str(n.get("landmark") or "") for n in nodes]),
        "is_best_practice": 1 if "best-practice" in tags else 0,
        "node_count_log1p": math.log1p(node_count),
        "interactive_ratio": (sum(interactive) / len(interactive)) if interactive else 0.0,
        "page_finding_count_log1p": math.log1p(page_count),
    }


def features_frame(findings: Iterable[dict[str, Any]]) -> pd.DataFrame:
    rows = [extract_features(f) for f in findings]
    return pd.DataFrame(rows, columns=FEATURE_COLUMNS)


def build_preprocessor() -> ColumnTransformer:
    """Unfitted preprocessing; always fitted inside a sklearn Pipeline on TRAIN data only."""
    return ColumnTransformer(
        [
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
            ("num", StandardScaler(), NUMERIC),
        ],
        remainder="drop",
    )


def feature_schema() -> dict[str, Any]:
    """Machine-readable schema that is exported as feature_schema.json."""
    return {
        "feature_version": FEATURE_VERSION,
        "labels": LABELS,
        "features": [
            {"name": name, "kind": FEATURE_DOCS[name][0], "description": FEATURE_DOCS[name][1]}
            for name in FEATURE_COLUMNS
        ],
        "known_impacts": IMPACTS,
    }
