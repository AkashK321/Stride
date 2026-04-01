"""Session + secret gating for /invocations when INFERENCE_REQUIRE_SESSION=1."""

from __future__ import annotations

import io

import pytest
from PIL import Image
from starlette.testclient import TestClient

from app.main import app
from app.session_gate import HEADER_NAME


def _tiny_jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color=(1, 2, 3)).save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def test_invocations_503_when_require_session_and_no_active_session(monkeypatch):
    monkeypatch.setenv("INFERENCE_REQUIRE_SESSION", "1")
    with TestClient(app) as client:
        client.post("/api/session/end")
        r = client.post(
            "/invocations",
            content=_tiny_jpeg_bytes(),
            headers={"content-type": "image/jpeg"},
        )
        assert r.status_code == 503
        assert r.json()["success"] is False


def test_invocations_401_when_session_active_wrong_secret(monkeypatch):
    monkeypatch.setenv("INFERENCE_REQUIRE_SESSION", "1")
    with TestClient(app) as client:
        client.post("/api/session/end")
        client.post("/api/session/start")
        r = client.post(
            "/invocations",
            content=_tiny_jpeg_bytes(),
            headers={"content-type": "image/jpeg", HEADER_NAME: "wrong"},
        )
        assert r.status_code == 401
        assert r.json()["success"] is False


def test_invocations_ok_with_session_and_matching_secret(monkeypatch, yolo_model):
    monkeypatch.setenv("INFERENCE_REQUIRE_SESSION", "1")
    with TestClient(app) as client:
        client.post("/api/session/end")
        start = client.post("/api/session/start")
        token = start.json()["token"]
        r = client.post(
            "/invocations",
            content=_tiny_jpeg_bytes(),
            headers={"content-type": "image/jpeg", HEADER_NAME: token},
        )
        if r.status_code == 500 and r.json().get("error") == "Model not loaded":
            pytest.skip("no weights")
        assert r.status_code == 200
        assert r.json()["success"] is True


def test_session_end_clears_token(monkeypatch):
    monkeypatch.setenv("INFERENCE_REQUIRE_SESSION", "1")
    with TestClient(app) as client:
        client.post("/api/session/end")
        client.post("/api/session/start")
        client.post("/api/session/end")
        r = client.get("/api/session/status")
        assert r.json()["active"] is False
