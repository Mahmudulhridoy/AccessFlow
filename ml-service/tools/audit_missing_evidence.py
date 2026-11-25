
import pandas as pd
from pathlib import Path

CSV_PATH = Path("data/annotation_sheet_master.csv")
OUTPUT = Path("data/missing_screenshot_evidence_audit.csv")

df = pd.read_csv(CSV_PATH).fillna("")

missing = df[
    ~df["crop_file"].apply(lambda p: Path(p).exists())
].copy()

def evidence_status(row):
    html_fields = [
        row.get("node1_html", ""),
        row.get("node2_html", ""),
        row.get("node3_html", ""),
    ]

    selector_fields = [
        row.get("node1_selector", ""),
        row.get("node2_selector", ""),
        row.get("node3_selector", ""),
    ]

    html_count = sum(bool(str(x).strip()) for x in html_fields)
    selector_count = sum(bool(str(x).strip()) for x in selector_fields)

    if html_count > 0 and selector_count > 0:
        return "HTML_AND_SELECTOR_AVAILABLE"

    if html_count > 0:
        return "HTML_ONLY"

    if selector_count > 0:
        return "SELECTOR_ONLY"

    return "NO_NODE_EVIDENCE"


missing["evidence_status"] = missing.apply(
    evidence_status, axis=1
)

columns = [
    "finding_id",
    "page_url",
    "rule_id",
    "rule_description",
    "wcag_criteria",
    "node_count",
    "node1_html",
    "node1_selector",
    "node2_html",
    "node2_selector",
    "node3_html",
    "node3_selector",
    "evidence_status",
]

missing[columns].to_csv(
    OUTPUT,
    index=False,
    encoding="utf-8-sig"
)

print("Missing screenshot findings:", len(missing))
print("\nEvidence status:")
print(missing["evidence_status"].value_counts().to_string())
print("\nSaved:", OUTPUT)
