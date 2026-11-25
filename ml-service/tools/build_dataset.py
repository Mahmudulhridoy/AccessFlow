"""Join raw findings + human annotations into a versioned dataset with splits and a quality report.

  python tools/build_dataset.py data/raw/run.jsonl data/annotations.csv --version v0.1
"""
import argparse, json, sys
from pathlib import Path
import pandas as pd
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from accessflow_ml.data import (read_jsonl, write_jsonl, merge_labels, self_consistency,
                                load_manifest, apply_splits, quality_report)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("raw", nargs="+"); ap.add_argument("annotations")
    ap.add_argument("--version", required=True); ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()

    raw = [r for p in a.raw for r in read_jsonl(p)]
    ann = pd.read_csv(a.annotations, dtype=str).fillna("")
    labelled, stats = merge_labels(raw, ann)
    manifest_path = ROOT / "data/splits/split_manifest.json"
    manifest = apply_splits(labelled, load_manifest(manifest_path), a.seed)
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True))

    report = quality_report(labelled, stats, self_consistency(ann))
    report["dataset_version"] = a.version
    out = ROOT / f"data/dataset_{a.version}.jsonl"
    write_jsonl(out, labelled)
    (ROOT / f"data/reports/quality_{a.version}.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    print(f"\nwrote {out}")

if __name__ == "__main__":
    main()
