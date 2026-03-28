"""Decode image bytes, run YOLO, return SageMaker-compatible JSON dicts and HTTP status codes."""

from __future__ import annotations

import io
import os
import traceback
from pathlib import Path
from typing import Any

from PIL import Image
from ultralytics import YOLO

ALLOWED_CONTENT_TYPES = frozenset(
    {"image/jpeg", "image/png", "application/octet-stream"}
)

DEFAULT_MODEL_URL = (
    "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt"
)


def base_dir() -> Path:
    return Path(__file__).resolve().parent.parent


def default_cache_model_path() -> Path:
    d = base_dir() / ".cache"
    d.mkdir(parents=True, exist_ok=True)
    return d / "yolo11n.pt"


def resolve_model_path() -> Path:
    """
    If YOLO_MODEL_PATH is set and the file exists, use it (trained checkpoint).
    Otherwise use .cache/yolo11n.pt for generic YOLOv11 nano testing.
    """
    env = os.environ.get("YOLO_MODEL_PATH")
    if env:
        p = Path(env).expanduser().resolve()
        if p.is_file():
            return p
    return default_cache_model_path()


def load_yolo(model_path: Path) -> YOLO | None:
    if not model_path.is_file():
        print(f"Model file not found: {model_path}. Run: python scripts/download_model.py")
        return None
    try:
        print(f"Loading YOLO from {model_path}...")
        m = YOLO(str(model_path))
        print("Model loaded successfully.")
        return m
    except Exception as e:
        print(f"Error loading model: {e}")
        traceback.print_exc()
        return None


def normalize_content_type(raw: str | None) -> str | None:
    if not raw:
        return None
    return raw.split(";")[0].strip().lower()


def predict_image_bytes(model: YOLO, image_bytes: bytes, content_type: str | None) -> tuple[dict[str, Any], int]:
    """
    Mirror aws_resources/sagemaker/inference.py behavior.
    Returns (json_body, http_status).
    """
    ct = normalize_content_type(content_type)
    if ct not in ALLOWED_CONTENT_TYPES:
        return (
            {
                "success": False,
                "error": (
                    f"Unsupported content type: {content_type}. "
                    f"Use image/jpeg, image/png, or application/octet-stream"
                ),
            },
            400,
        )

    if not image_bytes or len(image_bytes) == 0:
        return {"success": False, "error": "Empty image data"}, 400

    try:
        image = Image.open(io.BytesIO(image_bytes))
        image = image.convert("RGB")
        image_width, image_height = image.size
    except Exception as e:
        return {"success": False, "error": f"Invalid image format: {str(e)}"}, 400

    try:
        results = model(image, verbose=False)
        predictions: list[dict[str, Any]] = []
        for result in results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                class_id = int(box.cls[0].item())
                class_name = model.names[class_id]
                confidence = float(box.conf[0].item())
                predictions.append(
                    {
                        "class": class_name,
                        "confidence": confidence,
                        "box": {
                            "x1": int(x1),
                            "y1": int(y1),
                            "x2": int(x2),
                            "y2": int(y2),
                        },
                    }
                )

        body = {
            "success": True,
            "predictions": predictions,
            "image": {"width": image_width, "height": image_height},
        }
        return body, 200
    except Exception as e:
        error_msg = str(e)
        print(f"Error during inference: {error_msg}")
        traceback.print_exc()
        return {"success": False, "error": error_msg}, 500
