"""Create a BLIND annotation sheet (no axe impact, no model output) from collected raw findings.

  python tools/make_annotation_sheet.py data/raw/run.jsonl data/annotation_sheet.csv
  # blind re-label pass on a random sample of already-labelled findings:
  python tools/make_annotation_sheet.py data/raw/run.jsonl data/relabel_sheet.csv --relabel 0.15 --labelled data/annotations.csv
"""
import argparse, sys
from pathlib import Path
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from accessflow_ml.data import read_jsonl, shuffled

GUIDELINE_VERSION = "0.1"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("raw"); ap.add_argument("out")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--relabel", type=float, default=0.0, help="fraction of labelled findings to re-label (pass 2)")
    ap.add_argument("--labelled", help="existing annotations.csv (needed with --relabel)")
    a = ap.parse_args()

    records = shuffled(read_jsonl(a.raw), a.seed)  # shuffled so page order does not anchor labels
    pass_no = 1
    if a.relabel:
        done = set(pd.read_csv(a.labelled)["finding_id"])
        pool = [r for r in records if r["finding_id"] in done]
        records = pool[: max(1, int(len(pool) * a.relabel))]
        pass_no = 2

    rows = []
    for r in records:
        nodes = r.get("nodes", [])[:3]
        row = {
            "finding_id": r["finding_id"], "page_url": r["page_url"], "rule_id": r["rule_id"],
            "rule_description": r["axe_description"], "help_url": r.get("help_url"),
            "wcag_criteria": ", ".join(c["criterion"] for c in r.get("wcag_criteria", [])) or "(best practice)",
            "node_count": r["node_count"], "crop_file": f"{r['finding_id']}.png",
        }
        for i in range(3):
            n = nodes[i] if i < len(nodes) else {}
            row[f"node{i+1}_selector"] = n.get("selector", "")
            row[f"node{i+1}_html"] = n.get("html_snippet", "")
        row.update({"priority": "", "flag": "none", "confidence": "", "rationale": "",
                    "annotator_id": "", "pass": pass_no, "guideline_version": GUIDELINE_VERSION, "labeled_at": ""})
        rows.append(row)
    pd.DataFrame(rows).to_csv(a.out, index=False)
    print(f"wrote {len(rows)} rows (pass {pass_no}) to {a.out}")

if __name__ == "__main__":
    main()
