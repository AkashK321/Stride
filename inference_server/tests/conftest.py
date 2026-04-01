"""Pytest fixtures: optional real YOLO model when .cache/yolo11n.pt exists."""

from __future__ import annotations

import pytest

from app.inference_core import load_yolo, resolve_model_path


@pytest.fixture(scope="session")
def yolo_model():
    path = resolve_model_path()
    if not path.is_file():
        pytest.skip(f"No weights at {path}; run: python scripts/download_model.py")
    model = load_yolo(path)
    if model is None:
        pytest.skip("YOLO failed to load")
    return model
