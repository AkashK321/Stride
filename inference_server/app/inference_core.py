"""Decode image bytes, run YOLO, return /invocations JSON + HTTP status codes.

When a 'sign' class is detected, the bounding box is cropped and passed through
EasyOCR to extract the room number text (e.g. '242').
"""

from __future__ import annotations

import io
import os
import re
import traceback
from pathlib import Path
from typing import Any

import cv2
import easyocr
import numpy as np
from PIL import Image
from ultralytics import YOLO

ALLOWED_CONTENT_TYPES = frozenset(
    {"image/jpeg", "image/png", "application/octet-stream"}
)

SIGN_CLASS_NAME = "sign"
OCR_MIN_CROP_PX = 30
OCR_MIN_WIDTH = 400
OCR_CLAHE_CLIP = 3.0
OCR_CLAHE_GRID = (8, 8)

_ocr_reader: easyocr.Reader | None = None


def get_ocr_reader() -> easyocr.Reader:
    """Lazy-load a singleton EasyOCR reader (heavy init, reuse across requests)."""
    global _ocr_reader
    if _ocr_reader is None:
        print("Loading EasyOCR model...")
        _ocr_reader = easyocr.Reader(["en"], gpu=False)
        print("EasyOCR model loaded.")
    return _ocr_reader


def _extract_sign_text(image: Image.Image, x1: int, y1: int, x2: int, y2: int) -> str:
    """Crop a sign region from the image, preprocess, and run OCR."""
    padding = 10
    w, h = image.size
    cx1 = max(0, x1 - padding)
    cy1 = max(0, y1 - padding)
    cx2 = min(w, x2 + padding)
    cy2 = min(h, y2 + padding)

    crop = image.crop((cx1, cy1, cx2, cy2))
    crop_cv = cv2.cvtColor(np.array(crop), cv2.COLOR_RGB2BGR)

    crop_h, crop_w = crop_cv.shape[:2]
    if crop_w < OCR_MIN_WIDTH:
        scale = OCR_MIN_WIDTH / crop_w
        crop_cv = cv2.resize(
            crop_cv,
            (int(crop_w * scale), int(crop_h * scale)),
            interpolation=cv2.INTER_CUBIC,
        )
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
        crop_cv = cv2.filter2D(crop_cv, -1, kernel)

    gray = cv2.cvtColor(crop_cv, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=OCR_CLAHE_CLIP, tileGridSize=OCR_CLAHE_GRID)
    enhanced = clahe.apply(gray)

    reader = get_ocr_reader()
    results = reader.readtext(enhanced, detail=0, paragraph=True)
    raw_text = " ".join(results).strip() if results else ""

    room_matches = re.findall(r"\d+[A-Za-z]?", raw_text)
    return " ".join(room_matches) if room_matches else ""


DEFAULT_MODEL_URL = (
    "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11l.pt"
)


def base_dir() -> Path:
    return Path(__file__).resolve().parent.parent


def default_cache_model_path() -> Path:
    d = base_dir() / ".cache"
    d.mkdir(parents=True, exist_ok=True)
    return d / "yolo11l.pt"


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


def ocr_from_image_bytes(image_bytes: bytes, content_type: str | None) -> tuple[dict[str, Any], int]:
    """Run OCR on a pre-cropped sign image. No YOLO — just preprocessing + EasyOCR."""
    ct = normalize_content_type(content_type)
    if ct not in ALLOWED_CONTENT_TYPES:
        return (
            {"success": False, "error": f"Unsupported content type: {content_type}"},
            400,
        )
    if not image_bytes:
        return {"success": False, "error": "Empty image data"}, 400

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        return {"success": False, "error": f"Invalid image format: {e}"}, 400

    try:
        crop_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        crop_h, crop_w = crop_cv.shape[:2]
        if crop_w < OCR_MIN_WIDTH:
            scale = OCR_MIN_WIDTH / crop_w
            crop_cv = cv2.resize(
                crop_cv,
                (int(crop_w * scale), int(crop_h * scale)),
                interpolation=cv2.INTER_CUBIC,
            )
            kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
            crop_cv = cv2.filter2D(crop_cv, -1, kernel)

        gray = cv2.cvtColor(crop_cv, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=OCR_CLAHE_CLIP, tileGridSize=OCR_CLAHE_GRID)
        enhanced = clahe.apply(gray)

        reader = get_ocr_reader()
        results = reader.readtext(enhanced, detail=0, paragraph=True)
        raw_text = " ".join(results).strip() if results else ""
        room_matches = re.findall(r"\d+[A-Za-z]?", raw_text)
        text = " ".join(room_matches) if room_matches else ""

        return {"success": True, "text": text}, 200
    except Exception as e:
        print(f"OCR processing error: {e}")
        traceback.print_exc()
        return {"success": False, "error": str(e)}, 500


def predict_image_bytes(model: YOLO, image_bytes: bytes, content_type: str | None) -> tuple[dict[str, Any], int]:
    """
    Serve the Stride HTTP inference contract at POST /invocations.
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
                pred: dict[str, Any] = {
                    "class": class_name,
                    "confidence": confidence,
                    "box": {
                        "x1": int(x1),
                        "y1": int(y1),
                        "x2": int(x2),
                        "y2": int(y2),
                    },
                }

                if class_name == SIGN_CLASS_NAME:
                    crop_w = int(x2) - int(x1)
                    crop_h = int(y2) - int(y1)
                    if crop_w < OCR_MIN_CROP_PX or crop_h < OCR_MIN_CROP_PX:
                        pred["text"] = ""
                    else:
                        try:
                            text = _extract_sign_text(image, int(x1), int(y1), int(x2), int(y2))
                            pred["text"] = text
                        except Exception as ocr_err:
                            print(f"OCR failed for sign crop: {ocr_err}")
                            pred["text"] = ""

                predictions.append(pred)

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
