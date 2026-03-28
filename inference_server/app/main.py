"""FastAPI application: SageMaker-compatible API + dev dashboard."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.inference_core import load_yolo, resolve_model_path
from app.logging_store import LogStore
from app.routes import dashboard, invocations
from app.session_gate import InferenceSessionState

BASE_DIR = Path(__file__).resolve().parent.parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    path = resolve_model_path()
    model = load_yolo(path)
    app.state.model = model
    app.state.log_store = LogStore()
    app.state.inference_session = InferenceSessionState()
    yield


app = FastAPI(
    title="Stride local inference",
    description="SageMaker-compatible /ping and /invocations for local YOLO development.",
    lifespan=lifespan,
)

app.state.templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

app.include_router(invocations.router)
app.include_router(dashboard.router)

static_dir = BASE_DIR / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
