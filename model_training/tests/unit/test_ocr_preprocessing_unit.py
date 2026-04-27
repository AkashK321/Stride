"""
Unit tests for model_training/test_ocr_extraction.py

Tests parse_polygon_labels() and preprocess_for_ocr() in isolation
using synthetic label files and NumPy images.  No EasyOCR model loaded.
"""

import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
import test_ocr_extraction as ocr


# ── parse_polygon_labels ────────────────────────────────────────────────────


class TestParsePolygonLabels:
    def test_single_polygon(self, tmp_path):
        lbl = tmp_path / "label.txt"
        lbl.write_text("0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8\n")
        polygons = ocr.parse_polygon_labels(str(lbl))

        assert len(polygons) == 1
        assert len(polygons[0]) == 4  # 8 floats → 4 (x,y) pairs

    def test_multiple_polygons(self, tmp_path):
        lbl = tmp_path / "label.txt"
        lbl.write_text(
            "0 0.1 0.2 0.3 0.4 0.5 0.6\n"
            "1 0.5 0.5 0.6 0.6 0.7 0.7 0.8 0.8\n"
        )
        polygons = ocr.parse_polygon_labels(str(lbl))
        assert len(polygons) == 2

    def test_malformed_short_line_skipped(self, tmp_path):
        lbl = tmp_path / "label.txt"
        lbl.write_text("0 0.1\n0 0.2 0.3\n0 0.4 0.5 0.6 0.7 0.8 0.9\n")
        polygons = ocr.parse_polygon_labels(str(lbl))
        assert len(polygons) == 1

    def test_empty_file_returns_empty(self, tmp_path):
        lbl = tmp_path / "empty.txt"
        lbl.write_text("")
        polygons = ocr.parse_polygon_labels(str(lbl))
        assert polygons == []

    def test_coordinates_are_floats(self, tmp_path):
        lbl = tmp_path / "label.txt"
        lbl.write_text("0 0.123 0.456 0.789 0.012 0.345 0.678\n")
        polygons = ocr.parse_polygon_labels(str(lbl))

        for x, y in polygons[0]:
            assert isinstance(x, float)
            assert isinstance(y, float)

    def test_coordinate_values_match_input(self, tmp_path):
        lbl = tmp_path / "label.txt"
        lbl.write_text("0 0.25 0.50 0.75 0.80 0.10 0.90\n")
        polygons = ocr.parse_polygon_labels(str(lbl))
        expected = [(0.25, 0.50), (0.75, 0.80), (0.10, 0.90)]
        assert polygons[0] == expected


# ── polygon_to_bbox ─────────────────────────────────────────────────────────


class TestPolygonToBbox:
    def test_simple_rectangle(self):
        polygon = [(0.1, 0.2), (0.5, 0.2), (0.5, 0.8), (0.1, 0.8)]
        x_min, y_min, x_max, y_max = ocr.polygon_to_bbox(polygon)

        assert x_min == pytest.approx(0.1)
        assert y_min == pytest.approx(0.2)
        assert x_max == pytest.approx(0.5)
        assert y_max == pytest.approx(0.8)

    def test_triangle(self):
        polygon = [(0.0, 0.0), (1.0, 0.0), (0.5, 1.0)]
        x_min, y_min, x_max, y_max = ocr.polygon_to_bbox(polygon)

        assert x_min == pytest.approx(0.0)
        assert y_min == pytest.approx(0.0)
        assert x_max == pytest.approx(1.0)
        assert y_max == pytest.approx(1.0)


# ── preprocess_for_ocr ─────────────────────────────────────────────────────


class TestPreprocessForOcr:
    def test_output_is_single_channel(self):
        crop = np.random.randint(0, 255, (100, 500, 3), dtype=np.uint8)
        result = ocr.preprocess_for_ocr(crop)
        assert result.ndim == 2  # grayscale

    def test_small_crop_upscaled(self):
        crop = np.random.randint(0, 255, (60, 200, 3), dtype=np.uint8)
        result = ocr.preprocess_for_ocr(crop)
        assert result.shape[1] >= ocr.MIN_OCR_WIDTH

    def test_large_crop_not_resized(self):
        crop = np.random.randint(0, 255, (100, 600, 3), dtype=np.uint8)
        result = ocr.preprocess_for_ocr(crop)
        assert result.shape[1] == 600

    def test_output_dtype_uint8(self):
        crop = np.random.randint(0, 255, (80, 300, 3), dtype=np.uint8)
        result = ocr.preprocess_for_ocr(crop)
        assert result.dtype == np.uint8

    def test_pixel_values_in_range(self):
        crop = np.random.randint(0, 255, (80, 300, 3), dtype=np.uint8)
        result = ocr.preprocess_for_ocr(crop)
        assert result.min() >= 0
        assert result.max() <= 255

    def test_clahe_changes_pixel_values(self):
        crop = np.random.randint(50, 150, (100, 500, 3), dtype=np.uint8)
        result = ocr.preprocess_for_ocr(crop)
        plain_gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        assert not np.array_equal(result, plain_gray)


# ── crop_sign ───────────────────────────────────────────────────────────────


class TestCropSign:
    def test_crop_dimensions_reasonable(self):
        image = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (0.25, 0.25, 0.75, 0.75)
        crop = ocr.crop_sign(image, bbox)

        assert crop.shape[0] > 0
        assert crop.shape[1] > 0

    def test_full_image_bbox(self):
        image = np.zeros((100, 200, 3), dtype=np.uint8)
        bbox = (0.0, 0.0, 1.0, 1.0)
        crop = ocr.crop_sign(image, bbox)

        assert crop.shape[0] <= 100 + 2 * ocr.PADDING_PX
        assert crop.shape[1] <= 200 + 2 * ocr.PADDING_PX

    def test_padding_does_not_exceed_image_bounds(self):
        image = np.zeros((100, 100, 3), dtype=np.uint8)
        bbox = (0.0, 0.0, 0.1, 0.1)
        crop = ocr.crop_sign(image, bbox)

        assert crop.shape[0] <= 100
        assert crop.shape[1] <= 100


# ── sanitize_ocr_text ──────────────────────────────────────────────────────


class TestSanitizeOcrText:
    def test_extracts_room_number(self):
        assert ocr.sanitize_ocr_text("Room 242") == "242"

    def test_extracts_number_with_letter(self):
        assert ocr.sanitize_ocr_text("Suite 101A next") == "101A"

    def test_no_digits_returns_empty(self):
        assert ocr.sanitize_ocr_text("no numbers here") == ""

    def test_multiple_numbers(self):
        result = ocr.sanitize_ocr_text("Rooms 100 and 200")
        assert "100" in result
        assert "200" in result

    def test_empty_input(self):
        assert ocr.sanitize_ocr_text("") == ""
