"""Inference HTTP routes: /ping and /invocations."""

from __future__ import annotations

import io
import time
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from PIL import Image

from app.inference_core import predict_image_bytes
from app.session_gate import HEADER_NAME, require_session_enabled
from app.visualization import render_overlay_rgb

router = APIRouter(tags=["inference"])


@router.get("/ping")
async def ping(request: Request) -> JSONResponse:
    model = getattr(request.app.state, "model", None)
    if model is not None:
        return JSONResponse({"status": "healthy"}, status_code=200)
    return JSONResponse(
        {"status": "unhealthy", "error": "Model not loaded"},
        status_code=503,
    )


@router.post("/invocations")
async def invocations(request: Request) -> JSONResponse:
    t0 = time.perf_counter()
    model = getattr(request.app.state, "model", None)
    store = getattr(request.app.state, "store", None)
    session_id = getattr(request.app.state, "current_session_id", None)
    model_id = getattr(request.app.state, "current_model_id", None)

    content_type = request.headers.get("content-type")
    body = await request.body()

    if require_session_enabled():
        sess = getattr(request.app.state, "inference_session", None)
        if sess is None or not sess.active():
            out = {
                "success": False,
                "error": (
                    "Inference session not started. Open the dashboard and click "
                    '"Start session", then set INFERENCE_HTTP_SECRET on Lambda to the shown token.'
                ),
            }
            latency_ms = (time.perf_counter() - t0) * 1000
            if store:
                store.add_log(
                    content_type=content_type,
                    latency_ms=latency_ms,
                    http_status=503,
                    request_image=body,
                    response_body=out,
                    overlay_png=None,
                    session_id=session_id,
                    model_id=model_id,
                )
            return JSONResponse(out, status_code=503)
        supplied = request.headers.get(HEADER_NAME)
        if not sess.verify_secret(supplied):
            out = {
                "success": False,
                "error": (
                    f"Invalid or missing {HEADER_NAME} header. "
                    "Set Lambda env INFERENCE_HTTP_SECRET to match the dashboard session token."
                ),
            }
            latency_ms = (time.perf_counter() - t0) * 1000
            if store:
                store.add_log(
                    content_type=content_type,
                    latency_ms=latency_ms,
                    http_status=401,
                    request_image=body,
                    response_body=out,
                    overlay_png=None,
                    session_id=session_id,
                    model_id=model_id,
                )
            return JSONResponse(out, status_code=401)

    if model is None:
        out = {"success": False, "error": "Model not loaded"}
        latency_ms = (time.perf_counter() - t0) * 1000
        if store:
            store.add_log(
                content_type=content_type,
                latency_ms=latency_ms,
                http_status=500,
                request_image=body,
                response_body=out,
                overlay_png=None,
                session_id=session_id,
                model_id=model_id,
            )
        return JSONResponse(out, status_code=500)

    body_dict, status = predict_image_bytes(model, body, content_type)
    latency_ms = (time.perf_counter() - t0) * 1000

    overlay_png: bytes | None = None
    if status == 200 and body_dict.get("success"):
        try:
            im = Image.open(io.BytesIO(body)).convert("RGB")
            preds = body_dict.get("predictions") or []
            if isinstance(preds, list) and preds:
                overlay_png = render_overlay_rgb(im, preds)
        except Exception:
            overlay_png = None

    if store:
        store.add_log(
            content_type=content_type,
            latency_ms=latency_ms,
            http_status=status,
            request_image=body,
            response_body=body_dict,
            overlay_png=overlay_png,
            session_id=session_id,
            model_id=model_id,
        )

    return JSONResponse(body_dict, status_code=status)
