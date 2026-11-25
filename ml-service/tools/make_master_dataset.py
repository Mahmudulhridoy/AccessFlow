
import csv
import json
import random
from pathlib import Path
from collections import defaultdict

# Run files
RUN_FILES = [
    Path("data/raw/run-01.jsonl"),
    Path("data/raw/run-02.jsonl"),
    Path("data/raw/run-03.jsonl"),
]

OUTPUT_CSV = Path("data/annotation_sheet_master.csv")
OUTPUT_JSONL = Path("data/processed/combined_deduped.jsonl")

SEED = 42
GUIDELINE_VERSION = "0.1"


def read_runs():
    groups = defaultdict(list)

    for file_path in RUN_FILES:
        if not file_path.exists():
            raise FileNotFoundError(f"Missing file: {file_path}")

        run_id = file_path.stem

        with file_path.open("r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue

                record = json.loads(line)

                key = (
                    record["registrable_domain"],
                    record["rule_id"],
                    record["dedupe_key"],
                )

                groups[key].append({
                    "run_id": run_id,
                    "record": record,
                })

    return groups


def main():
    rng = random.Random(SEED)
    groups = read_runs()

    selected_records = []
    annotation_rows = []
    missing_crops = 0

    # One representative per composite key
    for key in sorted(groups):
        candidates = groups[key]
        chosen = rng.choice(candidates)

        record = chosen["record"]
        run_id = chosen["run_id"]

        all_ids = [
            item["record"]["finding_id"]
            for item in candidates
        ]

        all_runs = sorted({
            item["run_id"] for item in candidates
        })

        finding_id = record["finding_id"]

        crop_path = (
            Path("data")
            / "private"
            / run_id
            / f"{finding_id}.png"
        )

        if not crop_path.exists():
            missing_crops += 1

        crop_file = crop_path.as_posix()

        # Preserve original raw record and source information
        clean_record = dict(record)
        clean_record["source_run"] = run_id
        clean_record["source_finding_ids"] = all_ids
        clean_record["source_runs"] = all_runs
        clean_record["duplicate_count"] = len(candidates)

        selected_records.append(clean_record)

        # Build blind annotation row
        nodes = record.get("nodes", [])[:3]

        row = {
            "finding_id": finding_id,
            "page_url": record["page_url"],
            "rule_id": record["rule_id"],
            "rule_description": record["axe_description"],
            "help_url": record.get("help_url"),
            "wcag_criteria": ", ".join(
                c["criterion"]
                for c in record.get("wcag_criteria", [])
            ) or "(best practice)",
            "node_count": record["node_count"],
            "crop_file": crop_file,
        }

        for i in range(3):
            node = nodes[i] if i < len(nodes) else {}
            row[f"node{i+1}_selector"] = node.get("selector", "")
            row[f"node{i+1}_html"] = node.get("html_snippet", "")

        row.update({
            "priority": "",
            "flag": "none",
            "confidence": "",
            "rationale": "",
            "annotator_id": "",
            "pass": 1,
            "guideline_version": GUIDELINE_VERSION,
            "labeled_at": "",
            "source_run": run_id,
            "duplicate_count": len(candidates),
            "source_finding_ids": ";".join(all_ids),
            "source_runs": ";".join(all_runs),
            "registrable_domain": record["registrable_domain"],
            "dedupe_key": record["dedupe_key"],
        })

        annotation_rows.append(row)

    # Randomize annotation order
    rng.shuffle(annotation_rows)

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSONL.parent.mkdir(parents=True, exist_ok=True)

    # Write master annotation sheet
    with OUTPUT_CSV.open(
        "w", encoding="utf-8-sig", newline=""
    ) as f:
        writer = csv.DictWriter(
            f,
            fieldnames=list(annotation_rows[0].keys())
        )
        writer.writeheader()
        writer.writerows(annotation_rows)

    # Write matching deduplicated raw dataset
    with OUTPUT_JSONL.open("w", encoding="utf-8") as f:
        for record in selected_records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    print("\n========== MASTER DATASET SUMMARY ==========")
    print("Original raw findings:", sum(
        len(items) for items in groups.values()
    ))
    print("Unique composite findings:", len(groups))
    print("Duplicate rows removed:", sum(
        len(items) - 1 for items in groups.values()
    ))
    print("Master annotation rows:", len(annotation_rows))
    print("Deduplicated raw records:", len(selected_records))
    print("Missing screenshot crops:", missing_crops)
    print("\nCSV:", OUTPUT_CSV)
    print("JSONL:", OUTPUT_JSONL)
    print("============================================")


if __name__ == "__main__":
    main()

