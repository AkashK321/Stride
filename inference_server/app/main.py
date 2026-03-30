"""FastAPI application: SageMaker-compatible API + dev dashboard."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.inference_core import load_yolo, resolve_model_path
from app.persistence.sqlite_store import SqliteStore
from app.routes import dashboard, invocations
from app.session_gate import InferenceSessionState

BASE_DIR = Path(__file__).resolve().parent.parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    path = resolve_model_path()
    store = SqliteStore(BASE_DIR)
    default_model = store.upsert_model(display_name=path.stem, file_path=str(path))
    app.state.store = store
    app.state.model_cache = {}
    app.state.current_session_id = None
    app.state.current_model_id = int(default_model["id"]) if default_model else None
    app.state.current_model_path = str(path)
    app.state.model = load_yolo(path)
    app.state.inference_session = InferenceSessionState()
    active_session = store.get_active_session()
    if active_session:
        app.state.current_session_id = int(active_session["id"])
        app.state.current_model_id = int(active_session["selected_model_id"])
        app.state.current_model_path = str(active_session["model_file_path"])
        active_model = load_yolo(Path(app.state.current_model_path))
        if active_model is not None:
            app.state.model = active_model
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
