import os
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))   # lets `uvicorn app.main:app` import accessflow_ml without installing it


def _flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes"}


@dataclass(frozen=True)
class Settings:
    artifact_dir: Path = ROOT / "artifacts"
    allow_dev_model: bool = False        # load artifacts/dev (synthetic or gate-failing models) — development only
    api_key: str | None = None           # shared secret expected in the X-API-Key header
    allow_no_auth: bool = False          # local development only
    enable_docs: bool = False
    max_batch: int = 100

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            artifact_dir=Path(os.getenv("ACCESSFLOW_ARTIFACT_DIR", ROOT / "artifacts")),
            allow_dev_model=_flag("ALLOW_DEV_MODEL"),
            api_key=os.getenv("ML_SERVICE_API_KEY") or None,
            allow_no_auth=_flag("ML_SERVICE_ALLOW_NO_AUTH"),
            enable_docs=_flag("ML_SERVICE_ENABLE_DOCS"),
        )
