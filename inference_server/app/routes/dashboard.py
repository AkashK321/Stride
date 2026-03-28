"""Dev-only dashboard and log APIs."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from fastapi.templating import Jinja2Templates

from app.logging_store import LogEntry
from app.session_gate import HEADER_NAME, require_session_enabled

router = APIRouter(tags=["dashboard"])


def _templates(request: Request) -> Jinja2Templates:
    return request.app.state.templates


@router.get("/", response_class=HTMLResponse)
async def dashboard_index(request: Request) -> HTMLResponse:
    store = request.app.state.log_store
    entries = store.list_entries()
    rows = [
        {
            "id": e.id,
            "created": e.created_at,
            "latency_ms": round(e.latency_ms, 2),
            "http_status": e.http_status,
            "content_type": e.content_type,
            "success": bool(e.response_body.get("success")),
        }
        for e in reversed(entries)
    ]
    return _templates(request).TemplateResponse(
        request,
        "index.html",
        {
            "request": request,
            "rows": rows,
            "require_session": require_session_enabled(),
        },
    )


@router.get("/logs/{entry_id}", response_class=HTMLResponse)
async def log_detail(request: Request, entry_id: int) -> HTMLResponse:
    store = request.app.state.log_store
    entry = store.get(entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Log entry not found")
    response_json = json.dumps(entry.response_body, indent=2)
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
    store = request.app.state.log_store
    out = []
    for e in reversed(store.list_entries()):
        out.append(
            {
                "id": e.id,
                "created_at": e.created_at,
                "latency_ms": e.latency_ms,
                "http_status": e.http_status,
                "content_type": e.content_type,
                "response": e.response_body,
            }
        )
    return {"entries": out}


@router.get("/api/logs/{entry_id}")
async def api_logs_get(request: Request, entry_id: int) -> dict[str, Any]:
    store = request.app.state.log_store
    entry = store.get(entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Log entry not found")
    return _serialize_entry(entry)


def _serialize_entry(e: LogEntry) -> dict[str, Any]:
    return {
        "id": e.id,
        "created_at": e.created_at,
        "latency_ms": e.latency_ms,
        "http_status": e.http_status,
        "content_type": e.content_type,
        "response": e.response_body,
        "has_image": e.request_image is not None,
        "has_overlay": e.overlay_png is not None,
    }


@router.get("/api/logs/{entry_id}/image")
async def api_log_image(request: Request, entry_id: int) -> Response:
    store = request.app.state.log_store
    entry = store.get(entry_id)
    if entry is None or not entry.request_image:
        raise HTTPException(status_code=404, detail="Image not available")
    ct = entry.content_type or "application/octet-stream"
    media = ct.split(";")[0].strip()
    return Response(content=entry.request_image, media_type=media)


@router.get("/api/logs/{entry_id}/overlay")
async def api_log_overlay(request: Request, entry_id: int) -> Response:
    store = request.app.state.log_store
    entry = store.get(entry_id)
    if entry is None or not entry.overlay_png:
        raise HTTPException(status_code=404, detail="Overlay not available")
    return Response(content=entry.overlay_png, media_type="image/png")


@router.post("/api/logs/clear")
async def api_logs_clear(request: Request) -> dict[str, str]:
    request.app.state.log_store.clear()
    return {"status": "ok"}


@router.get("/api/session/status")
async def api_session_status(request: Request) -> dict[str, Any]:
    sess = getattr(request.app.state, "inference_session", None)
    active = bool(sess and sess.active())
    return {
        "active": active,
        "require_session": require_session_enabled(),
        "header_name": HEADER_NAME,
        "started_at": sess.started_at() if sess and active else None,
    }


@router.post("/api/session/start")
async def api_session_start(request: Request) -> dict[str, Any]:
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
    }


@router.post("/api/session/end")
async def api_session_end(request: Request) -> dict[str, str]:
    sess = getattr(request.app.state, "inference_session", None)
    if sess is not None:
        sess.end()
    return {"status": "ok"}
