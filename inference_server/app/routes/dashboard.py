"""Dev-only dashboard APIs: models, sessions, logs, metrics."""

from __future__ import annotations

import json
from pathlib import Path
import time
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, Response
from fastapi.templating import Jinja2Templates

from app.inference_core import load_yolo
from app.session_gate import HEADER_NAME, require_session_enabled

router = APIRouter(tags=["dashboard"])


def _templates(request: Request) -> Jinja2Templates:
    return request.app.state.templates


@router.get("/", response_class=HTMLResponse)
async def dashboard_index(request: Request) -> HTMLResponse:
    store = request.app.state.store
    rows = store.list_logs(limit=100)
    return _templates(request).TemplateResponse(
        request,
        "index.html",
        {
            "request": request,
            "rows": rows,
            "require_session": require_session_enabled(),
            "models": store.list_models(),
            "sessions": store.list_sessions(),
            "active_session": store.get_active_session(),
        },
    )


@router.get("/logs/{entry_id}", response_class=HTMLResponse)
async def log_detail(request: Request, entry_id: int) -> HTMLResponse:
    store = request.app.state.store
    entry = store.get_log(entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Log entry not found")
    response_json = json.dumps(entry.get("response", {}), indent=2)
    return _templates(request).TemplateResponse(
        request,
        "detail.html",
        {
            "request": request,
            "entry": entry,
            "response_json": response_json,
        },
    )


@router.get("/api/logs")
async def api_logs_list(request: Request) -> dict[str, Any]:
    store = request.app.state.store
    q = request.query_params
    session_id = int(q["session_id"]) if q.get("session_id") else None
    model_id = int(q["model_id"]) if q.get("model_id") else None
    status = int(q["status"]) if q.get("status") else None
    since_ts = float(q["since_ts"]) if q.get("since_ts") else None
    until_ts = float(q["until_ts"]) if q.get("until_ts") else None
    limit = int(q["limit"]) if q.get("limit") else 200
    return {
        "entries": store.list_logs(
            session_id=session_id,
            model_id=model_id,
            status=status,
            since_ts=since_ts,
            until_ts=until_ts,
            limit=limit,
        )
    }


@router.get("/api/logs/{entry_id}")
async def api_logs_get(request: Request, entry_id: int) -> dict[str, Any]:
    store = request.app.state.store
    entry = store.get_log(entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Log entry not found")
    return entry


@router.get("/api/logs/{entry_id}/image")
async def api_log_image(request: Request, entry_id: int) -> Response:
    store = request.app.state.store
    entry = store.get_log(entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Image not available")
    data = store.read_artifact(entry.get("request_artifact_path"))
    if not data:
        raise HTTPException(status_code=404, detail="Image not available")
    ct = entry.get("content_type") or "application/octet-stream"
    media = ct.split(";")[0].strip()
    return Response(content=data, media_type=media)


@router.get("/api/logs/{entry_id}/overlay")
async def api_log_overlay(request: Request, entry_id: int) -> Response:
    store = request.app.state.store
    entry = store.get_log(entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Overlay not available")
    data = store.read_artifact(entry.get("overlay_artifact_path"))
    if not data:
        raise HTTPException(status_code=404, detail="Overlay not available")
    return Response(content=data, media_type="image/png")


@router.post("/api/logs/clear")
async def api_logs_clear(request: Request) -> dict[str, str]:
    request.app.state.store.clear_logs()
    return {"status": "ok"}


@router.get("/api/session/status")
async def api_session_status(request: Request) -> dict[str, Any]:
    sess = getattr(request.app.state, "inference_session", None)
    active = bool(sess and sess.active())
    active_named = request.app.state.store.get_active_session()
    return {
        "active": active,
        "require_session": require_session_enabled(),
        "header_name": HEADER_NAME,
        "started_at": sess.started_at() if sess and active else None,
        "active_named_session": active_named,
    }


@router.post("/api/session/start")
async def api_session_start(request: Request) -> dict[str, Any]:
    body = await request.json()
    name = (body.get("name") or "").strip()
    model_id = body.get("model_id")
    if not name:
        raise HTTPException(status_code=400, detail="Session name is required")
    if model_id is None:
        raise HTTPException(status_code=400, detail="model_id is required")

    store = request.app.state.store
    model = store.get_model(int(model_id))
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")

    started = store.start_session(name=name, model_id=int(model_id))
    request.app.state.current_session_id = int(started["id"])
    request.app.state.current_model_id = int(started["selected_model_id"])
    request.app.state.current_model_path = str(started["model_file_path"])
    loaded = load_yolo(Path(started["model_file_path"]))
    if loaded is not None:
        request.app.state.model = loaded

    sess = getattr(request.app.state, "inference_session", None)
    if sess is None:
        raise HTTPException(status_code=500, detail="Session state not initialized")
    token = sess.start()
    return {
        "token": token,
        "header_name": HEADER_NAME,
        "message": (
            "Set AWS Lambda env INFERENCE_HTTP_SECRET to this value (dev object-detection function only). "
            "The mobile app does not call this URL; Lambda adds the header automatically."
        ),
        "session": started,
    }


@router.post("/api/session/end")
async def api_session_end(request: Request) -> dict[str, str]:
    sess = getattr(request.app.state, "inference_session", None)
    if sess is not None:
        sess.end()
    request.app.state.store.end_active_session()
    request.app.state.current_session_id = None
    return {"status": "ok"}


@router.get("/api/models")
async def api_models(request: Request) -> dict[str, Any]:
    return {"models": request.app.state.store.list_models()}


@router.post("/api/models/upload")
async def api_models_upload(
    request: Request,
    display_name: str = Form(...),
    model_file: UploadFile = File(...),
) -> dict[str, Any]:
    uploads_dir = request.app.state.store.models_dir()
    safe_name = model_file.filename or f"{int(time.time())}.pt"
    out_path = uploads_dir / safe_name
    out_path.write_bytes(await model_file.read())
    row = request.app.state.store.upsert_model(display_name=display_name.strip(), file_path=str(out_path))
    return {"model": row}


@router.get("/api/sessions")
async def api_sessions(request: Request) -> dict[str, Any]:
    return {"sessions": request.app.state.store.list_sessions()}


@router.get("/api/metrics")
async def api_metrics(request: Request) -> dict[str, Any]:
    q = request.query_params
    session_id = int(q["session_id"]) if q.get("session_id") else None
    model_id = int(q["model_id"]) if q.get("model_id") else None
    return request.app.state.store.metrics(session_id=session_id, model_id=model_id)
