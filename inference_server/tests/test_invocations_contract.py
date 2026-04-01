"""Contract tests: JSON shape matches SageMaker / Kotlin SageMakerClient expectations."""

from __future__ import annotations

import io
from unittest.mock import MagicMock

import pytest
from PIL import Image
from starlette.testclient import TestClient

from app.inference_core import predict_image_bytes
from app.main import app


def _tiny_jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 24), color=(128, 64, 32)).save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def test_predict_rejects_unsupported_content_type():
    model = MagicMock()
    body, status = predict_image_bytes(model, b"abc", "text/plain")
    assert status == 400
    assert body["success"] is False
    assert "Unsupported content type" in body["error"]


def test_predict_rejects_empty_body():
    model = MagicMock()
    body, status = predict_image_bytes(model, b"", "image/jpeg")
    assert status == 400
    assert body["success"] is False
    assert "Empty" in body["error"]


def test_predict_mock_model_success_shape():
    """Ultralytics-like single detection; assert keys match production JSON."""
    model = MagicMock()
    model.names = {0: "person"}

    coord = MagicMock()
    coord.tolist = lambda: [10.0, 20.0, 100.0, 200.0]
    mock_box = MagicMock()
    mock_box.xyxy = [coord]
    mock_box.cls = [MagicMock(item=lambda: 0)]
    mock_box.conf = [MagicMock(item=lambda: 0.91)]

    mock_res = MagicMock()
    mock_res.boxes = [mock_box]
    model.return_value = [mock_res]

    jpeg = _tiny_jpeg_bytes()
    body, status = predict_image_bytes(model, jpeg, "image/jpeg")
    assert status == 200
    assert body["success"] is True
    assert "predictions" in body
    assert "image" in body
    assert body["image"]["width"] >= 1
    assert body["image"]["height"] >= 1
    assert len(body["predictions"]) == 1
    p0 = body["predictions"][0]
    assert p0["class"] == "person"
    assert isinstance(p0["confidence"], float)
    assert set(p0["box"].keys()) == {"x1", "y1", "x2", "y2"}


def test_ping_via_client():
    with TestClient(app) as client:
        r = client.get("/ping")
        assert r.status_code in (200, 503)
        data = r.json()
        assert "status" in data


def test_invocations_bad_content_type_via_client():
    """With model loaded: 400. Without model (matches SageMaker): 500 Model not loaded first."""
    with TestClient(app) as client:
        r = client.post(
            "/invocations",
            content=b"hello",
            headers={"content-type": "application/json"},
        )
        if r.status_code == 500:
            assert r.json().get("error") == "Model not loaded"
        else:
            assert r.status_code == 400
            assert r.json()["success"] is False


def test_api_logs_json_via_client():
    with TestClient(app) as client:
        r = client.get("/api/logs")
        assert r.status_code == 200
        assert "entries" in r.json()


def test_invocations_real_image(yolo_model):
    jpeg = _tiny_jpeg_bytes()
    body, status = predict_image_bytes(yolo_model, jpeg, "image/jpeg")
    assert status == 200
    assert body["success"] is True
    assert isinstance(body["predictions"], list)
