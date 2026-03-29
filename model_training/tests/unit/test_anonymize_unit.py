"""
Unit tests for model_training/anonymize_faces.py

Tests individual functions in isolation using synthetic images and mocks.
No real face images or external services required.
"""

import hashlib
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
import anonymize_faces as anon


# ── _merge_overlapping (NMS) ────────────────────────────────────────────────


class TestMergeOverlapping:
    def test_empty_input_returns_empty(self):
        assert anon._merge_overlapping([]) == []

    def test_single_box_returned_unchanged(self):
        boxes = [[10, 20, 50, 60]]
        result = anon._merge_overlapping(boxes)
        assert len(result) == 1
        assert result[0] == [10, 20, 50, 60]

    def test_non_overlapping_boxes_all_kept(self):
        boxes = [[0, 0, 30, 30], [100, 100, 30, 30], [200, 200, 30, 30]]
        result = anon._merge_overlapping(boxes)
        assert len(result) == 3

    def test_identical_boxes_merged_to_one(self):
        boxes = [[10, 10, 50, 50], [10, 10, 50, 50]]
        result = anon._merge_overlapping(boxes)
        assert len(result) == 1

    def test_partially_overlapping_boxes_merged(self):
        boxes = [[10, 10, 100, 100], [30, 30, 100, 100]]
        result = anon._merge_overlapping(boxes, overlap_thresh=0.3)
        assert len(result) == 1

    def test_custom_threshold_respected(self):
        boxes = [[0, 0, 100, 100], [60, 0, 100, 100]]
        strict = anon._merge_overlapping(boxes, overlap_thresh=0.01)
        lenient = anon._merge_overlapping(boxes, overlap_thresh=0.99)
        assert len(strict) <= len(lenient)


# ── apply_blur ──────────────────────────────────────────────────────────────


class TestApplyBlur:
    def test_no_boxes_returns_identical_copy(self, solid_image):
        result = anon.apply_blur(solid_image, [])
        np.testing.assert_array_equal(result, solid_image)
        assert result is not solid_image  # must be a copy

    def test_blur_modifies_only_bbox_region(self, gradient_image):
        h, w = gradient_image.shape[:2]
        boxes = [(100, 100, 80, 80)]
        result = anon.apply_blur(gradient_image, boxes)

        corner = gradient_image[0:10, 0:10]
        np.testing.assert_array_equal(result[0:10, 0:10], corner)

        roi_original = gradient_image[100:180, 100:180]
        roi_blurred = result[100:180, 100:180]
        assert not np.array_equal(roi_original, roi_blurred)

    def test_bbox_with_padding_does_not_exceed_image_bounds(self, solid_image):
        h, w = solid_image.shape[:2]
        boxes = [(0, 0, w, h)]
        result = anon.apply_blur(solid_image, boxes)
        assert result.shape == solid_image.shape

    def test_multiple_boxes_all_blurred(self, gradient_image):
        boxes = [(10, 10, 50, 50), (200, 200, 50, 50)]
        result = anon.apply_blur(gradient_image, boxes)

        for bx, by, bw, bh in boxes:
            roi_orig = gradient_image[by:by + bh, bx:bx + bw]
            roi_blur = result[by:by + bh, bx:bx + bw]
            assert not np.array_equal(roi_orig, roi_blur)

    def test_blur_uses_gaussian(self, gradient_image):
        """Verify the blur is actually Gaussian (smooth, not just zeroed)."""
        boxes = [(100, 100, 80, 80)]
        result = anon.apply_blur(gradient_image, boxes)
        roi = result[100:180, 100:180]
        assert roi.std() < gradient_image[100:180, 100:180].std()


# ── file_hash ───────────────────────────────────────────────────────────────


class TestFileHash:
    def test_deterministic_for_same_content(self, tmp_path):
        f = tmp_path / "test.bin"
        f.write_bytes(b"hello world")
        h1 = anon.file_hash(f)
        h2 = anon.file_hash(f)
        assert h1 == h2

    def test_matches_known_sha256(self, tmp_path):
        f = tmp_path / "test.bin"
        content = b"stride test data"
        f.write_bytes(content)
        expected = hashlib.sha256(content).hexdigest()
        assert anon.file_hash(f) == expected

    def test_different_content_different_hash(self, tmp_path):
        f1 = tmp_path / "a.bin"
        f2 = tmp_path / "b.bin"
        f1.write_bytes(b"data_a")
        f2.write_bytes(b"data_b")
        assert anon.file_hash(f1) != anon.file_hash(f2)


# ── load_manifest / save_manifest ───────────────────────────────────────────


class TestManifestIO:
    def test_load_nonexistent_returns_empty_dict(self, tmp_path):
        result = anon.load_manifest(tmp_path / "nope.json")
        assert result == {}

    def test_round_trip(self, tmp_path):
        path = tmp_path / ".manifest.json"
        data = {"img.jpg": {"hash": "abc", "faces_detected": 2}}
        anon.save_manifest(path, data)
        loaded = anon.load_manifest(path)
        assert loaded == data

    def test_load_existing_manifest(self, sample_manifest):
        path, expected = sample_manifest
        loaded = anon.load_manifest(path)
        assert loaded == expected


# ── detect_faces_haar ───────────────────────────────────────────────────────


class TestDetectFacesHaar:
    def test_no_faces_in_solid_image(self, haar_detector, solid_image):
        _, detectors = haar_detector
        boxes = anon.detect_faces_haar(detectors, solid_image)
        assert boxes == [] or len(boxes) == 0

    def test_no_faces_in_gradient_image(self, haar_detector, gradient_image):
        _, detectors = haar_detector
        boxes = anon.detect_faces_haar(detectors, gradient_image)
        assert isinstance(boxes, list)

    def test_returns_list_of_four_tuples(self, haar_detector, gradient_image):
        _, detectors = haar_detector
        boxes = anon.detect_faces_haar(detectors, gradient_image)
        for box in boxes:
            assert len(box) == 4


# ── detect_faces_mediapipe (mocked) ─────────────────────────────────────────


class TestDetectFacesMediapipe:
    def test_no_detections_returns_empty(self):
        mock_detector = MagicMock()
        mock_result = MagicMock()
        mock_result.detections = None
        mock_detector.process.return_value = mock_result

        img = np.zeros((480, 640, 3), dtype=np.uint8)
        boxes = anon.detect_faces_mediapipe(mock_detector, img)
        assert boxes == []

    def test_detections_converted_to_pixel_coords(self):
        mock_detector = MagicMock()
        mock_result = MagicMock()

        mock_det = MagicMock()
        mock_det.location_data.relative_bounding_box.xmin = 0.25
        mock_det.location_data.relative_bounding_box.ymin = 0.25
        mock_det.location_data.relative_bounding_box.width = 0.5
        mock_det.location_data.relative_bounding_box.height = 0.5
        mock_result.detections = [mock_det]
        mock_detector.process.return_value = mock_result

        img = np.zeros((200, 400, 3), dtype=np.uint8)
        boxes = anon.detect_faces_mediapipe(mock_detector, img)

        assert len(boxes) == 1
        x, y, w, h = boxes[0]
        assert x == 100  # 0.25 * 400
        assert y == 50   # 0.25 * 200
        assert w == 200  # 0.5 * 400
        assert h == 100  # 0.5 * 200


# ── process_image ───────────────────────────────────────────────────────────


class TestProcessImage:
    def test_creates_output_file(self, tmp_path, solid_image, haar_detector):
        in_path = tmp_path / "input.jpg"
        out_path = tmp_path / "output" / "result.jpg"
        cv2.imwrite(str(in_path), solid_image)

        _, det = haar_detector
        num_faces, result_path = anon.process_image(in_path, out_path, "haar", det)

        assert result_path.exists()
        assert num_faces >= 0

    def test_output_is_valid_image(self, tmp_path, gradient_image, haar_detector):
        in_path = tmp_path / "input.png"
        out_path = tmp_path / "output.jpg"
        cv2.imwrite(str(in_path), gradient_image)

        _, det = haar_detector
        anon.process_image(in_path, out_path, "haar", det)

        loaded = cv2.imread(str(out_path))
        assert loaded is not None
        assert loaded.shape[0] > 0 and loaded.shape[1] > 0

    def test_invalid_image_raises(self, tmp_path, haar_detector):
        bad_file = tmp_path / "corrupt.jpg"
        bad_file.write_bytes(b"not an image")
        out_path = tmp_path / "out.jpg"

        _, det = haar_detector
        with pytest.raises(ValueError, match="Could not read image"):
            anon.process_image(bad_file, out_path, "haar", det)

    def test_creates_parent_directories(self, tmp_path, solid_image, haar_detector):
        in_path = tmp_path / "in.jpg"
        out_path = tmp_path / "a" / "b" / "c" / "out.jpg"
        cv2.imwrite(str(in_path), solid_image)

        _, det = haar_detector
        anon.process_image(in_path, out_path, "haar", det)
        assert out_path.exists()


# ── load_detector ───────────────────────────────────────────────────────────


class TestLoadDetector:
    def test_falls_back_to_haar_when_mediapipe_missing(self):
        with patch("anonymize_faces.get_mediapipe_detector", return_value=None):
            dtype, det = anon.load_detector()
            assert dtype == "haar"

    def test_returns_valid_detector_type(self):
        dtype, det = anon.load_detector()
        assert dtype in ("mediapipe", "haar")
        assert det is not None

    def test_haar_detector_loads_cascades(self):
        dtype, det = anon.get_haar_detector()
        assert dtype == "haar"
        frontal, profile = det
        assert not frontal.empty()

    def test_mediapipe_returns_none_when_unavailable(self):
        with patch("anonymize_faces.get_mediapipe_detector", return_value=None):
            result = anon.get_mediapipe_detector()
            assert result is None


# ── SUPPORTED_EXTENSIONS constant ───────────────────────────────────────────


class TestConstants:
    def test_supported_extensions_are_lowercase(self):
        for ext in anon.SUPPORTED_EXTENSIONS:
            assert ext == ext.lower()
            assert ext.startswith(".")

    def test_common_formats_included(self):
        assert ".jpg" in anon.SUPPORTED_EXTENSIONS
        assert ".jpeg" in anon.SUPPORTED_EXTENSIONS
        assert ".png" in anon.SUPPORTED_EXTENSIONS

    def test_blur_kernel_is_odd(self):
        kw, kh = anon.BLUR_KERNEL_SIZE
        assert kw % 2 == 1 and kh % 2 == 1
