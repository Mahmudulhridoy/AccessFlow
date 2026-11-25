"""AccessFlow ML inference service. Start: `uvicorn app.main:app --port 8000` (from ml-service/)."""
import hmac
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from accessflow_ml.features import FeatureInputError

from .config import Settings
from .model_store import ModelStore, ModelUnavailable
from .schemas import BatchIn, BatchOut, FindingIn, PredictionOut

log = logging.getLogger("accessflow.ml")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    store = ModelStore(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store.load()                      # model is loaded once at startup, never per request
        yield

    docs = settings.enable_docs
    app = FastAPI(title="AccessFlow ML service", version="1.0.0", lifespan=lifespan,
                  docs_url="/docs" if docs else None, redoc_url=None, openapi_url="/openapi.json" if docs else None)
    app.state.store = store

    def require_key(x_api_key: str | None = Header(default=None)) -> None:
        if not settings.api_key:
            if settings.allow_no_auth:
                return
            raise HTTPException(503, {"code": "SERVICE_MISCONFIGURED", "message": "ML_SERVICE_API_KEY is not set"})
        if not x_api_key or not hmac.compare_digest(x_api_key.encode(), settings.api_key.encode()):
            raise HTTPException(401, {"code": "UNAUTHORIZED", "message": "Invalid or missing API key"})

    @app.exception_handler(ModelUnavailable)
    async def _unavailable(_: Request, exc: ModelUnavailable):
        return JSONResponse(status_code=503, content={"detail": {"code": "MODEL_UNAVAILABLE", "message": str(exc)}})

    @app.exception_handler(FeatureInputError)
    async def _bad_features(_: Request, exc: FeatureInputError):
        return JSONResponse(status_code=422, content={"detail": {"code": "INVALID_FEATURES", "message": str(exc)}})

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception):
        log.exception("unhandled error")
        return JSONResponse(status_code=500, content={"detail": {"code": "INTERNAL", "message": "Internal error"}})

    @app.get("/health")
    def health():
        """Liveness. 200 even without a model, so orchestrators do not restart-loop; use /ready for model state."""
        return {"status": "ok", "model_loaded": store.ready}

    @app.get("/ready")
    def ready():
        if not store.ready:
            return JSONResponse(status_code=503, content={"status": "unavailable", "model_loaded": False})
        return {"status": "ready", "model_loaded": True}

    @app.get("/v1/model", dependencies=[Depends(require_key)])
    def model_info():
        return store.info()

    @app.post("/v1/predict", response_model=PredictionOut, dependencies=[Depends(require_key)])
    def predict(finding: FindingIn):
        return store.predict([finding.model_dump()])[0]

    @app.post("/v1/predict/batch", response_model=BatchOut, dependencies=[Depends(require_key)])
    def predict_batch(body: BatchIn):
        return {"predictions": store.predict([f.model_dump() for f in body.findings])}

    return app


app = create_app()
