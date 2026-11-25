
import pandas as pd
from pathlib import Path

CSV = Path("data/annotation_sheet_master.csv")
df = pd.read_csv(CSV, dtype=str).fillna("")

required = [
    "finding_id",
    "page_url",
    "rule_id",
    "rule_description",
    "wcag_criteria",
    "node_count",
    "crop_file",
    "priority",
    "flag",
    "confidence",
    "rationale",
    "annotator_id",
    "pass",
    "guideline_version",
    "labeled_at",
]

print("========== MASTER SHEET VALIDATION ==========")

print("Total rows:", len(df))
print("Total columns:", len(df.columns))

missing_columns = [
    col for col in required if col not in df.columns
]
print("Missing required columns:", missing_columns)

print("Duplicate finding IDs:", df["finding_id"].duplicated().sum())

for col in ["priority", "confidence", "rationale", "annotator_id", "labeled_at"]:
    print(f"Non-empty {col}:",
          df[col].astype(str).str.strip().ne("").sum())

print("Default flag values:")
print(df["flag"].value_counts(dropna=False).to_dict())

print("Screenshot available:",
      df["crop_file"].apply(lambda p: Path(p).exists()).sum())

print("HTML evidence available:",
      sum(
          df[f"node{i}_html"].astype(str).str.strip().ne("").sum()
          for i in range(1, 4)
      ))

print("============================================")
