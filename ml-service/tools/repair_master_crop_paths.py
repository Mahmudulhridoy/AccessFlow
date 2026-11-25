
from pathlib import Path
import pandas as pd

CSV_PATH = Path("data/annotation_sheet_master.csv")

RUNS = ["run-01", "run-02", "run-03"]

PRIVATE_DIR = Path("data/private")

df = pd.read_csv(CSV_PATH, dtype=str).fillna("")

recovered = 0
already_available = 0
unresolved = []

for index, row in df.iterrows():
    finding_id = row["finding_id"]

    # Check whether the current screenshot path exists
    current_path = Path(row["crop_file"])

    if current_path.exists():
        already_available += 1
        continue

    # Check every original finding ID in this duplicate group
    source_ids = [
        x.strip()
        for x in row["source_finding_ids"].split(";")
        if x.strip()
    ]

    if not source_ids:
        source_ids = [finding_id]

    found_path = None

    for source_id in source_ids:
        for run_id in RUNS:
            run_folder = PRIVATE_DIR / run_id

            matches = list(run_folder.rglob(f"{source_id}.png"))

            if matches:
                found_path = matches[0]
                break

        if found_path:
            break

    if found_path:
        df.at[index, "crop_file"] = found_path.as_posix()
        recovered += 1
    else:
        unresolved.append(finding_id)

# Save repaired CSV
df.to_csv(CSV_PATH, index=False, encoding="utf-8-sig")

print("\n========== SCREENSHOT RECOVERY ==========")
print("Total annotation rows:", len(df))
print("Already available:", already_available)
print("Recovered from other run:", recovered)
print("Still missing:", len(unresolved))

if unresolved:
    print("\nUnresolved finding IDs:")
    for finding_id in unresolved:
        print(finding_id)

print("\nUpdated:", CSV_PATH)
print("=========================================")
