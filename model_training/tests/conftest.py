"""
Shared fixtures for model_training test suite.

Provides synthetic images and temporary directory layouts so that tests
never depend on real BHEE hallway photos or external services.
"""

import json
import shutil
from pathlib import Path

import cv2
import numpy as np
import pytest


@pytest.fixture
def solid_image():
    """A 200x300 solid-blue BGR image (no faces)."""
    return np.full((200, 300, 3), (255, 140, 0), dtype=np.uint8)  # BGR orange


@pytest.fixture
def gradient_image():
    """A 480x640 gradient image with distinct pixel values (no faces)."""
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    for i in range(480):
        img[i, :, 0] = i * 255 // 480
        img[i, :, 1] = 128
        img[i, :, 2] = 255 - (i * 255 // 480)
    return img


@pytest.fixture
def raw_dataset_dir(tmp_path, solid_image, gradient_image):
    """
    A temporary directory mimicking bhee_raw_dataset/ with several synthetic
    images in different formats.
    """
    raw = tmp_path / "bhee_raw_dataset"
    raw.mkdir()

    cv2.imwrite(str(raw / "hallway_01.jpg"), solid_image)
    cv2.imwrite(str(raw / "hallway_02.png"), gradient_image)
    cv2.imwrite(str(raw / "hallway_03.jpeg"), solid_image)

    (raw / "notes.txt").write_text("not an image")

    return raw


@pytest.fixture
def clean_dataset_dir(tmp_path):
    """An empty temporary directory mimicking bhee_clean_dataset/."""
    clean = tmp_path / "bhee_clean_dataset"
    clean.mkdir()
    return clean


@pytest.fixture
def haar_detector():
    """Provide the Haar cascade detector tuple for tests that need it."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import anonymize_faces
    return anonymize_faces.get_haar_detector()


@pytest.fixture
def sample_manifest(tmp_path):
    """Write and return a sample .manifest.json for caching tests."""
    manifest_path = tmp_path / ".manifest.json"
    data = {
        "hallway_01.jpg": {
            "hash": "abc123",
            "faces_detected": 1,
            "output": "hallway_01.jpg",
            "processed_at": "2026-03-26T00:00:00+00:00",
        }
    }
    manifest_path.write_text(json.dumps(data))
    return manifest_path, data
