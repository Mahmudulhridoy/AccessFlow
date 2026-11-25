
import json
from pathlib import Path

TARGET_IDS = {
    "d53f937746049fc2",
    "47cd68e9df772880",
}

FILES = [
    Path("data/raw/run-01.jsonl"),
    Path("data/raw/run-02.jsonl"),
    Path("data/raw/run-03.jsonl"),
]

for file_path in FILES:
    with file_path.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue

            record = json.loads(line)

            if record["finding_id"] in TARGET_IDS:
                print("\n" + "=" * 60)
                print("SOURCE:", file_path)
                print("FINDING ID:", record["finding_id"])
                print("=" * 60)

                print(json.dumps(
                    record,
                    ensure_ascii=False,
                    indent=2
                )[:6000])
