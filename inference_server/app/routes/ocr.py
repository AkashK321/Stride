"""OCR-only HTTP route: POST /ocr for pre-cropped sign images."""

from __future__ import annotations

import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.inference_core import ocr_from_image_bytes
from app.session_gate import HEADER_NAME, require_session_enabled

router = APIRouter(tags=["ocr"])


@router.post("/ocr")
async def ocr(request: Request) -> JSONResponse:
    t0 = time.perf_counter()

    if require_session_enabled():
        sess = getattr(request.app.state, "inference_session", None)
        if sess is None or not sess.active():
            return JSONResponse(
                {"success": False, "error": "Inference session not started."},
                status_code=503,
            )
        supplied = request.headers.get(HEADER_NAME)
        if not sess.verify_secret(supplied):
            return JSONResponse(
                {"success": False, "error": f"Invalid or missing {HEADER_NAME} header."},
                status_code=401,
            )

    content_type = request.headers.get("content-type")
    body = await request.body()

    body_dict, status = ocr_from_image_bytes(body, content_type)
    latency_ms = (time.perf_counter() - t0) * 1000
    body_dict["latency_ms"] = round(latency_ms, 1)

    return JSONResponse(body_dict, status_code=status)
