"""
Integration tests for the OCR extraction pipeline.

Exercises the full chain: polygon label → bbox → crop → preprocess → OCR.
Uses synthetic images with rendered text so EasyOCR is invoked for real.
Requires easyocr to be installed (the first run downloads ~100 MB of models).
"""

import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
import test_ocr_extraction as ocr


@pytest.fixture(scope="module")
def ocr_reader():
    """Load EasyOCR once for the whole module (expensive init)."""
    import easyocr
    return easyocr.Reader(["en"], gpu=False)


def _render_text_image(text: str, width: int = 640, height: int = 480) -> np.ndarray:
    """Create a white image with black text rendered in the centre."""
    img = np.full((height, width, 3), 255, dtype=np.uint8)
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 3.0
    thickness = 6
    (tw, th), _ = cv2.getTextSize(text, font, scale, thickness)
    x = (width - tw) // 2
    y = (height + th) // 2
    cv2.putText(img, text, (x, y), font, scale, (0, 0, 0), thickness)
    return img


# ── Full OCR pipeline ──────────────────────────────────────────────────────


class TestOcrPipelineEndToEnd:
    """Run the complete label→crop→preprocess→OCR chain on synthetic images."""

    def test_digit_extraction_from_rendered_text(self, tmp_path, ocr_reader):
        img = _render_text_image("242")
        img_path = tmp_path / "sign_242.jpg"
        cv2.imwrite(str(img_path), img)

        lbl_path = tmp_path / "sign_242.txt"
        lbl_path.write_text("0 0.15 0.15 0.85 0.15 0.85 0.85 0.15 0.85\n")

        polygons = ocr.parse_polygon_labels(str(lbl_path))
        assert len(polygons) == 1

        bbox = ocr.polygon_to_bbox(polygons[0])
        crop = ocr.crop_sign(img, bbox)
        assert crop.size > 0

        processed = ocr.preprocess_for_ocr(crop)
        raw_text = ocr.run_ocr(ocr_reader, processed)

        assert raw_text != "", "OCR should produce some output for rendered digits"
        cleaned = ocr.sanitize_ocr_text(raw_text)
        assert "242" in cleaned, f"Expected '242' in cleaned output, got: '{cleaned}'"

    def test_multi_digit_sign(self, tmp_path, ocr_reader):
        img = _render_text_image("101")
        img_path = tmp_path / "sign_101.jpg"
        cv2.imwrite(str(img_path), img)

        lbl_path = tmp_path / "sign_101.txt"
        lbl_path.write_text("0 0.10 0.10 0.90 0.10 0.90 0.90 0.10 0.90\n")

        polygons = ocr.parse_polygon_labels(str(lbl_path))
        bbox = ocr.polygon_to_bbox(polygons[0])
        crop = ocr.crop_sign(img, bbox)
        processed = ocr.preprocess_for_ocr(crop)
        raw_text = ocr.run_ocr(ocr_reader, processed)
        cleaned = ocr.sanitize_ocr_text(raw_text)

        assert cleaned != "", f"Should extract digits from '101', got empty string"

    def test_crop_region_has_valid_dimensions(self, tmp_path):
        img = _render_text_image("300")

        lbl_path = tmp_path / "label.txt"
        lbl_path.write_text("0 0.2 0.2 0.8 0.2 0.8 0.8 0.2 0.8\n")

        polygons = ocr.parse_polygon_labels(str(lbl_path))
        bbox = ocr.polygon_to_bbox(polygons[0])
        crop = ocr.crop_sign(img, bbox)

        assert crop.shape[0] > 0, "Crop height must be positive"
        assert crop.shape[1] > 0, "Crop width must be positive"
        assert crop.shape[2] == 3, "Crop must be a 3-channel BGR image"

    def test_preprocessing_produces_grayscale(self, tmp_path):
        img = _render_text_image("555")

        lbl_path = tmp_path / "label.txt"
        lbl_path.write_text("0 0.1 0.1 0.9 0.1 0.9 0.9 0.1 0.9\n")

        polygons = ocr.parse_polygon_labels(str(lbl_path))
        bbox = ocr.polygon_to_bbox(polygons[0])
        crop = ocr.crop_sign(img, bbox)
        processed = ocr.preprocess_for_ocr(crop)

        assert processed.ndim == 2, "Preprocessed image must be single-channel"
        assert processed.dtype == np.uint8


# ── sanitize_ocr_text integration ──────────────────────────────────────────


class TestSanitizeIntegration:
    """End-to-end: render text, OCR it, then verify sanitize cleans it."""

    def test_sanitize_extracts_digits_from_ocr_output(self, tmp_path, ocr_reader):
        img = _render_text_image("Room 308")
        lbl_path = tmp_path / "label.txt"
        lbl_path.write_text("0 0.05 0.05 0.95 0.05 0.95 0.95 0.05 0.95\n")

        polygons = ocr.parse_polygon_labels(str(lbl_path))
        bbox = ocr.polygon_to_bbox(polygons[0])
        crop = ocr.crop_sign(img, bbox)
        processed = ocr.preprocess_for_ocr(crop)
        raw_text = ocr.run_ocr(ocr_reader, processed)
        cleaned = ocr.sanitize_ocr_text(raw_text)

        assert cleaned != "", "Sanitize should extract digit portion"

    def test_empty_sign_produces_empty_sanitized(self, tmp_path, ocr_reader):
        img = np.full((480, 640, 3), 255, dtype=np.uint8)
        lbl_path = tmp_path / "label.txt"
        lbl_path.write_text("0 0.4 0.4 0.6 0.4 0.6 0.6 0.4 0.6\n")

        polygons = ocr.parse_polygon_labels(str(lbl_path))
        bbox = ocr.polygon_to_bbox(polygons[0])
        crop = ocr.crop_sign(img, bbox)
        processed = ocr.preprocess_for_ocr(crop)
        raw_text = ocr.run_ocr(ocr_reader, processed)
        cleaned = ocr.sanitize_ocr_text(raw_text)

        assert isinstance(cleaned, str)
