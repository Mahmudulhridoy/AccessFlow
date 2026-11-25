"""python tools/train.py data/dataset_v0.1.jsonl [--artifacts artifacts] [--version 1.0.0]
Non-production data (synthetic, or real data that fails the readiness gates) is written to artifacts/dev/ only."""
import argparse, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from accessflow_ml.train import run

ap = argparse.ArgumentParser()
ap.add_argument("dataset"); ap.add_argument("--artifacts", default=str(ROOT / "artifacts"))
ap.add_argument("--version"); ap.add_argument("--seed", type=int, default=42); ap.add_argument("--n-boot", type=int, default=1000)
a = ap.parse_args()
run(a.dataset, a.artifacts, seed=a.seed, n_boot=a.n_boot, model_version=a.version)
