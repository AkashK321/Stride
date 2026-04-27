"""
Integration tests for model_training/split_dataset.py

Tests the full collect_pairs → split_list → move_pairs pipeline using
a temporary directory structure that mirrors the Roboflow YOLOv11 export.
All file I/O uses temporary directories — the real dataset is never touched.
"""

import sys
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
import split_dataset as sd


# ── Helpers ─────────────────────────────────────────────────────────────────


def _build_fake_dataset(root: Path, count: int = 20):
    """
    Create a directory layout identical to a Roboflow export:
        root/train/images/<stem>.jpg
        root/train/labels/<stem>.txt
    """
    images_dir = root / "train" / "images"
    labels_dir = root / "train" / "labels"
    images_dir.mkdir(parents=True)
    labels_dir.mkdir(parents=True)

    stems = []
    for i in range(count):
        stem = f"frame_{i:04d}"
        stems.append(stem)
        img = np.random.randint(0, 255, (64, 64, 3), dtype=np.uint8)
        cv2.imwrite(str(images_dir / f"{stem}.jpg"), img)
        (labels_dir / f"{stem}.txt").write_text(
            f"0 0.25 0.25 0.75 0.25 0.75 0.75 0.25 0.75\n"
        )

    return stems


# ── Full pipeline ───────────────────────────────────────────────────────────


class TestSplitPipeline:
    """End-to-end: build a fake dataset, run the split, verify results."""

    @pytest.fixture(autouse=True)
    def setup_dataset(self, tmp_path):
        self.root = tmp_path / "Stride.yolov11"
        self.root.mkdir()
        self.original_stems = _build_fake_dataset(self.root, count=20)

    def _run_split(self):
        """Patch module-level paths, then run the pipeline functions."""
        src_images = self.root / "train" / "images"
        src_labels = self.root / "train" / "labels"

        with patch.object(sd, "DATASET_ROOT", self.root), \
             patch.object(sd, "SRC_IMAGES", src_images), \
             patch.object(sd, "SRC_LABELS", src_labels):
            pairs = sd.collect_pairs()
            splits = sd.split_list(pairs)
            sd.move_pairs(splits["valid"], "valid")
            sd.move_pairs(splits["test"], "test")
        return splits

    def test_valid_and_test_dirs_created(self):
        self._run_split()

        assert (self.root / "valid" / "images").is_dir()
        assert (self.root / "valid" / "labels").is_dir()
        assert (self.root / "test" / "images").is_dir()
        assert (self.root / "test" / "labels").is_dir()

    def test_total_count_preserved(self):
        self._run_split()
        total = 0
        for split_name in ("train", "valid", "test"):
            img_dir = self.root / split_name / "images"
            if img_dir.exists():
                total += len(list(img_dir.glob("*.jpg")))

        assert total == 20

    def test_every_image_has_matching_label(self):
        self._run_split()
        for split_name in ("train", "valid", "test"):
            img_dir = self.root / split_name / "images"
            lbl_dir = self.root / split_name / "labels"
            if not img_dir.exists():
                continue
            for img in img_dir.glob("*.jpg"):
                lbl = lbl_dir / f"{img.stem}.txt"
                assert lbl.exists(), f"Missing label for {img.name} in {split_name}/"

    def test_moved_files_no_longer_in_train(self):
        splits = self._run_split()

        train_images = self.root / "train" / "images"
        remaining = {p.stem for p in train_images.glob("*.jpg")}

        for stem in splits["valid"]:
            assert stem not in remaining
        for stem in splits["test"]:
            assert stem not in remaining

    def test_train_has_approximately_70_percent(self):
        self._run_split()

        train_count = len(list((self.root / "train" / "images").glob("*.jpg")))
        assert train_count == 14  # 70% of 20

    def test_valid_has_approximately_20_percent(self):
        self._run_split()

        valid_count = len(list((self.root / "valid" / "images").glob("*.jpg")))
        assert valid_count == 4  # 20% of 20

    def test_test_has_approximately_10_percent(self):
        self._run_split()

        test_count = len(list((self.root / "test" / "images").glob("*.jpg")))
        assert test_count == 2  # 10% of 20

    def test_no_empty_pairs_dir_raises(self, tmp_path):
        empty_root = tmp_path / "empty_ds"
        empty_root.mkdir()
        (empty_root / "train" / "images").mkdir(parents=True)
        (empty_root / "train" / "labels").mkdir(parents=True)

        with patch.object(sd, "DATASET_ROOT", empty_root), \
             patch.object(sd, "SRC_IMAGES", empty_root / "train" / "images"), \
             patch.object(sd, "SRC_LABELS", empty_root / "train" / "labels"):
            with pytest.raises(FileNotFoundError):
                sd.collect_pairs()


# ── collect_pairs ───────────────────────────────────────────────────────────


class TestCollectPairsIntegration:
    def test_only_matched_pairs_collected(self, tmp_path):
        root = tmp_path / "ds"
        img_dir = root / "train" / "images"
        lbl_dir = root / "train" / "labels"
        img_dir.mkdir(parents=True)
        lbl_dir.mkdir(parents=True)

        img = np.zeros((32, 32, 3), dtype=np.uint8)
        cv2.imwrite(str(img_dir / "paired.jpg"), img)
        (lbl_dir / "paired.txt").write_text("0 0.1 0.2 0.3 0.4 0.5 0.6\n")

        cv2.imwrite(str(img_dir / "orphan_img.jpg"), img)
        (lbl_dir / "orphan_lbl.txt").write_text("0 0.1 0.2 0.3 0.4 0.5 0.6\n")

        with patch.object(sd, "DATASET_ROOT", root), \
             patch.object(sd, "SRC_IMAGES", img_dir), \
             patch.object(sd, "SRC_LABELS", lbl_dir):
            pairs = sd.collect_pairs()

        assert pairs == ["paired"]

    def test_pairs_are_sorted(self, tmp_path):
        root = tmp_path / "ds"
        img_dir = root / "train" / "images"
        lbl_dir = root / "train" / "labels"
        img_dir.mkdir(parents=True)
        lbl_dir.mkdir(parents=True)

        img = np.zeros((32, 32, 3), dtype=np.uint8)
        for name in ["charlie", "alpha", "bravo"]:
            cv2.imwrite(str(img_dir / f"{name}.jpg"), img)
            (lbl_dir / f"{name}.txt").write_text("0 0.1 0.2 0.3 0.4 0.5 0.6\n")

        with patch.object(sd, "DATASET_ROOT", root), \
             patch.object(sd, "SRC_IMAGES", img_dir), \
             patch.object(sd, "SRC_LABELS", lbl_dir):
            pairs = sd.collect_pairs()

        assert pairs == ["alpha", "bravo", "charlie"]
