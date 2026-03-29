"""
Integration tests for model_training/anonymize_faces.py

Tests the full pipeline end-to-end: directory processing, manifest caching,
force-reprocessing, and multi-format support.  All tests use synthetic images
in temporary directories — no real photos or external services required.
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
import anonymize_faces as anon


# ── Helpers ─────────────────────────────────────────────────────────────────


def _create_test_images(directory, count=3):
    """Write `count` synthetic images into `directory`."""
    for i in range(count):
        img = np.random.randint(0, 255, (200, 300, 3), dtype=np.uint8)
        cv2.imwrite(str(directory / f"img_{i:03d}.jpg"), img)


# ── Full pipeline ───────────────────────────────────────────────────────────


class TestProcessDirectory:
    def test_processes_all_images(self, raw_dataset_dir, clean_dataset_dir, haar_detector):
        dtype, det = haar_detector
        stats = anon.process_directory(raw_dataset_dir, clean_dataset_dir, dtype, det)

        assert stats["processed"] == 3  # hallway_01.jpg, hallway_02.png, hallway_03.jpeg
        assert stats["errors"] == 0

        outputs = list(clean_dataset_dir.glob("*.jpg"))
        assert len(outputs) == 3

    def test_non_image_files_ignored(self, raw_dataset_dir, clean_dataset_dir, haar_detector):
        dtype, det = haar_detector
        stats = anon.process_directory(raw_dataset_dir, clean_dataset_dir, dtype, det)

        output_names = {p.stem for p in clean_dataset_dir.glob("*.jpg")}
        assert "notes" not in output_names
        assert stats["processed"] == 3

    def test_empty_directory_returns_zero_stats(self, tmp_path, haar_detector):
        empty_in = tmp_path / "empty_in"
        empty_out = tmp_path / "empty_out"
        empty_in.mkdir()
        empty_out.mkdir()

        dtype, det = haar_detector
        stats = anon.process_directory(empty_in, empty_out, dtype, det)

        assert stats["processed"] == 0
        assert stats["skipped"] == 0
        assert stats["errors"] == 0

    def test_output_dir_created_if_missing(self, raw_dataset_dir, tmp_path, haar_detector):
        non_existent = tmp_path / "new_output_dir"
        dtype, det = haar_detector
        stats = anon.process_directory(raw_dataset_dir, non_existent, dtype, det)

        assert non_existent.exists()
        assert stats["processed"] == 3


# ── Manifest caching ───────────────────────────────────────────────────────


class TestManifestCaching:
    def test_second_run_skips_processed_images(self, raw_dataset_dir, clean_dataset_dir, haar_detector):
        dtype, det = haar_detector

        first_run = anon.process_directory(raw_dataset_dir, clean_dataset_dir, dtype, det)
        assert first_run["processed"] == 3
        assert first_run["skipped"] == 0

        second_run = anon.process_directory(raw_dataset_dir, clean_dataset_dir, dtype, det)
        assert second_run["processed"] == 0
        assert second_run["skipped"] == 3

    def test_new_image_processed_on_rerun(self, raw_dataset_dir, clean_dataset_dir, haar_detector):
        dtype, det = haar_detector

        anon.process_directory(raw_dataset_dir, clean_dataset_dir, dtype, det)

        new_img = np.full((100, 100, 3), 128, dtype=np.uint8)
        cv2.imwrite(str(raw_dataset_dir / "hallway_04.jpg"), new_img)

        second_run = anon.process_directory(raw_dataset_dir, clean_dataset_dir, dtype, det)
        assert second_run["processed"] == 1
        assert second_run["skipped"] == 3

    def test_modified_image_reprocessed(self, raw_dataset_dir, clean_dataset_dir, haar_detector):
        dtype, det = haar_detector

        anon.process_directory(raw_dataset_dir, clean_dataset_dir, dtype, det)

        modified = np.full((200, 300, 3), 42, dtype=np.uint8)
        cv2.imwrite(str(raw_dataset_dir / "hallway_01.jpg"), modified)

        second_run = anon.process_directory(raw_dataset_dir, clean_dataset_dir, dtype, det)
        assert second_run["processed"] == 1
        assert second_run["skipped"] == 2

    def test_manifest_file_created(self, raw_dataset_dir, clean_dataset_dir, haar_detector):
        dtype, det = haar_detector
        anon.process_directory(raw_dataset_dir, clean_dataset_dir, dtype, det)

        manifest_path = clean_dataset_dir / ".manifest.json"
        assert manifest_path.exists()

        manifest = json.loads(manifest_path.read_text())
        assert len(manifest) == 3
        for entry in manifest.values():
            assert "hash" in entry
            assert "faces_detected" in entry
            assert "output" in entry
            assert "processed_at" in entry


# ── Force mode ──────────────────────────────────────────────────────────────


class TestForceMode:
    def test_force_reprocesses_all(self, raw_dataset_dir, clean_dataset_dir, haar_detector):
        dtype, det = haar_detector

        anon.process_directory(raw_dataset_dir, clean_dataset_dir, dtype, det)
        force_run = anon.process_directory(
            raw_dataset_dir, clean_dataset_dir, dtype, det, force=True
        )

        assert force_run["processed"] == 3
        assert force_run["skipped"] == 0


# ── Multi-format support ───────────────────────────────────────────────────


class TestMultiFormat:
    def test_jpg_png_jpeg_all_produce_output(self, raw_dataset_dir, clean_dataset_dir, haar_detector):
        dtype, det = haar_detector
        anon.process_directory(raw_dataset_dir, clean_dataset_dir, dtype, det)

        stems = {p.stem for p in clean_dataset_dir.glob("*.jpg")}
        assert "hallway_01" in stems
        assert "hallway_02" in stems
        assert "hallway_03" in stems

    def test_bmp_format_supported(self, tmp_path, haar_detector):
        in_dir = tmp_path / "in"
        out_dir = tmp_path / "out"
        in_dir.mkdir()
        out_dir.mkdir()

        img = np.full((100, 100, 3), 200, dtype=np.uint8)
        cv2.imwrite(str(in_dir / "test.bmp"), img)

        dtype, det = haar_detector
        stats = anon.process_directory(in_dir, out_dir, dtype, det)
        assert stats["processed"] == 1

    def test_output_always_jpg(self, raw_dataset_dir, clean_dataset_dir, haar_detector):
        """All output files should be .jpg regardless of input format."""
        dtype, det = haar_detector
        anon.process_directory(raw_dataset_dir, clean_dataset_dir, dtype, det)

        for p in clean_dataset_dir.iterdir():
            if p.name == ".manifest.json":
                continue
            assert p.suffix == ".jpg"


# ── Output integrity ───────────────────────────────────────────────────────


class TestOutputIntegrity:
    def test_output_images_are_readable(self, raw_dataset_dir, clean_dataset_dir, haar_detector):
        dtype, det = haar_detector
        anon.process_directory(raw_dataset_dir, clean_dataset_dir, dtype, det)

        for p in clean_dataset_dir.glob("*.jpg"):
            img = cv2.imread(str(p))
            assert img is not None, f"Output {p.name} is not a valid image"
            assert img.shape[0] > 0 and img.shape[1] > 0

    def test_output_dimensions_match_input(self, tmp_path, haar_detector):
        in_dir = tmp_path / "in"
        out_dir = tmp_path / "out"
        in_dir.mkdir()

        img = np.zeros((350, 500, 3), dtype=np.uint8)
        cv2.imwrite(str(in_dir / "sized.png"), img)

        dtype, det = haar_detector
        anon.process_directory(in_dir, out_dir, dtype, det)

        out_img = cv2.imread(str(out_dir / "sized.jpg"))
        assert out_img.shape[0] == 350
        assert out_img.shape[1] == 500


# ── Concurrent-safe manifest ───────────────────────────────────────────────


class TestManifestPersistence:
    def test_manifest_survives_across_separate_calls(self, raw_dataset_dir, clean_dataset_dir, haar_detector):
        """Simulate two separate script invocations by reloading the manifest."""
        dtype, det = haar_detector

        anon.process_directory(raw_dataset_dir, clean_dataset_dir, dtype, det)

        manifest_path = clean_dataset_dir / ".manifest.json"
        manifest = anon.load_manifest(manifest_path)
        assert len(manifest) == 3

        stats = anon.process_directory(raw_dataset_dir, clean_dataset_dir, dtype, det)
        assert stats["skipped"] == 3
