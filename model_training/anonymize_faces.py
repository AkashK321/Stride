"""
Face anonymization script for BHEE hallway dataset.

Uses MediaPipe Face Detection as the primary detector with OpenCV Haar Cascades
as a fallback. Detected faces receive a heavy Gaussian blur to comply with
FERPA privacy standards before images are uploaded to any annotation platform.

Usage:
    python anonymize_faces.py                        # process all images
    python anonymize_faces.py --input DIR --output DIR
    python anonymize_faces.py --watch                # watch mode (auto-process new images)
"""

import argparse
import hashlib
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"}
BLUR_KERNEL_SIZE = (99, 99)
BLUR_SIGMA = 50
BBOX_PADDING = 0.25

LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / "anonymize.log"),
    ],
)
logger = logging.getLogger(__name__)


def get_mediapipe_detector():
    """Try to initialise a MediaPipe face detector. Returns None on failure."""
    try:
        import mediapipe as mp
        mp_face = mp.solutions.face_detection
        detector = mp_face.FaceDetection(
            model_selection=1,  # full-range model (better for varying distances)
            min_detection_confidence=0.35,
        )
        logger.info("Using MediaPipe face detection (primary)")
        return ("mediapipe", detector)
    except (ImportError, AttributeError, Exception) as e:
        logger.warning("MediaPipe unavailable (%s) – falling back to Haar Cascades", e)
        return None


def get_haar_detector():
    """Initialise an OpenCV Haar Cascade face detector."""
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    profile_path = cv2.data.haarcascades + "haarcascade_profileface.xml"
    frontal = cv2.CascadeClassifier(cascade_path)
    profile = cv2.CascadeClassifier(profile_path)
    if frontal.empty():
        logger.error("Could not load Haar frontal cascade from %s", cascade_path)
        sys.exit(1)
    logger.info("Using OpenCV Haar Cascade face detection (fallback)")
    return ("haar", (frontal, profile))


def load_detector():
    """Return the best available face detector."""
    det = get_mediapipe_detector()
    if det is not None:
        return det
    return get_haar_detector()


def detect_faces_mediapipe(detector, image_rgb):
    """Return list of (x, y, w, h) bounding boxes using MediaPipe."""
    results = detector.process(image_rgb)
    boxes = []
    if results.detections:
        h, w, _ = image_rgb.shape
        for det in results.detections:
            bb = det.location_data.relative_bounding_box
            x = int(bb.xmin * w)
            y = int(bb.ymin * h)
            bw = int(bb.width * w)
            bh = int(bb.height * h)
            boxes.append((x, y, bw, bh))
    return boxes


def detect_faces_haar(detectors, image_bgr):
    """Return list of (x, y, w, h) bounding boxes using Haar Cascades."""
    frontal, profile = detectors
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)

    frontal_faces = frontal.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
    )
    profile_faces = profile.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
    )

    boxes = []
    if len(frontal_faces) > 0:
        boxes.extend(frontal_faces.tolist())
    if len(profile_faces) > 0:
        boxes.extend(profile_faces.tolist())
    return _merge_overlapping(boxes)


def _merge_overlapping(boxes, overlap_thresh=0.3):
    """Merge overlapping bounding boxes using non-maximum suppression."""
    if not boxes:
        return boxes
    rects = np.array(boxes)
    x1 = rects[:, 0]
    y1 = rects[:, 1]
    x2 = rects[:, 0] + rects[:, 2]
    y2 = rects[:, 1] + rects[:, 3]
    areas = rects[:, 2] * rects[:, 3]
    order = areas.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        iou = inter / (areas[i] + areas[order[1:]] - inter)
        remaining = np.where(iou <= overlap_thresh)[0]
        order = order[remaining + 1]
    return rects[keep].tolist()


def apply_blur(image_bgr, boxes):
    """Apply heavy Gaussian blur to each bounding box region with padding."""
    h, w = image_bgr.shape[:2]
    blurred = image_bgr.copy()
    for (bx, by, bw, bh) in boxes:
        pad_w = int(bw * BBOX_PADDING)
        pad_h = int(bh * BBOX_PADDING)
        x1 = max(0, bx - pad_w)
        y1 = max(0, by - pad_h)
        x2 = min(w, bx + bw + pad_w)
        y2 = min(h, by + bh + pad_h)
        roi = blurred[y1:y2, x1:x2]
        roi_blurred = cv2.GaussianBlur(roi, BLUR_KERNEL_SIZE, BLUR_SIGMA)
        blurred[y1:y2, x1:x2] = roi_blurred
    return blurred


def file_hash(path):
    """Compute SHA-256 hash of a file for change detection."""
    sha = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha.update(chunk)
    return sha.hexdigest()


def load_manifest(manifest_path):
    """Load the processing manifest (tracks which files have been processed)."""
    if manifest_path.exists():
        with open(manifest_path, "r") as f:
            return json.load(f)
    return {}


def save_manifest(manifest_path, manifest):
    """Persist the processing manifest."""
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)


def process_image(image_path, output_path, detector_type, detector):
    """
    Process a single image: detect faces, blur them, save result.
    Returns (num_faces_found, output_path) or raises on error.
    """
    img_bgr = cv2.imread(str(image_path))
    if img_bgr is None:
        raise ValueError(f"Could not read image: {image_path}")

    if detector_type == "mediapipe":
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        boxes = detect_faces_mediapipe(detector, img_rgb)
    else:
        boxes = detect_faces_haar(detector, img_bgr)

    if boxes:
        result = apply_blur(img_bgr, boxes)
    else:
        result = img_bgr

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), result, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return len(boxes), output_path


def process_directory(input_dir, output_dir, detector_type, detector, force=False):
    """
    Batch-process all images in input_dir → output_dir.
    Uses a manifest to skip already-processed files unless force=True.
    Returns summary stats.
    """
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = output_dir / ".manifest.json"
    manifest = {} if force else load_manifest(manifest_path)

    image_files = sorted(
        p for p in input_dir.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    if not image_files:
        logger.warning("No images found in %s", input_dir)
        return {"processed": 0, "skipped": 0, "faces_found": 0, "errors": 0}

    stats = {"processed": 0, "skipped": 0, "faces_found": 0, "errors": 0}

    for img_path in image_files:
        current_hash = file_hash(img_path)
        relative_name = img_path.name

        if not force and relative_name in manifest and manifest[relative_name]["hash"] == current_hash:
            logger.debug("Skipping (unchanged): %s", relative_name)
            stats["skipped"] += 1
            continue

        out_path = output_dir / (img_path.stem + ".jpg")
        try:
            num_faces, _ = process_image(img_path, out_path, detector_type, detector)
            manifest[relative_name] = {
                "hash": current_hash,
                "faces_detected": num_faces,
                "output": str(out_path.name),
                "processed_at": datetime.now(timezone.utc).isoformat(),
            }
            stats["processed"] += 1
            stats["faces_found"] += num_faces
            status = f"{num_faces} face(s) blurred" if num_faces else "no faces detected"
            logger.info("Processed: %s → %s (%s)", relative_name, out_path.name, status)
        except Exception as e:
            stats["errors"] += 1
            logger.error("Failed to process %s: %s", relative_name, e)

    save_manifest(manifest_path, manifest)
    return stats


def watch_mode(input_dir, output_dir, detector_type, detector, interval=2.0):
    """
    Continuously watch input_dir for new/changed images and process them.
    Polls every `interval` seconds.
    """
    logger.info("Watch mode active – monitoring %s (poll every %.1fs)", input_dir, interval)
    logger.info("Press Ctrl+C to stop")
    try:
        while True:
            stats = process_directory(input_dir, output_dir, detector_type, detector)
            if stats["processed"] > 0:
                logger.info(
                    "Batch complete: %d processed, %d faces blurred, %d errors",
                    stats["processed"], stats["faces_found"], stats["errors"],
                )
            time.sleep(interval)
    except KeyboardInterrupt:
        logger.info("Watch mode stopped")


def main():
    parser = argparse.ArgumentParser(
        description="Anonymize faces in BHEE hallway images for FERPA compliance"
    )
    base = Path(__file__).parent
    parser.add_argument(
        "--input", "-i",
        type=str,
        default=str(base / "bhee_raw_dataset"),
        help="Directory containing raw images (default: bhee_raw_dataset/)",
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default=str(base / "bhee_clean_dataset"),
        help="Directory for anonymized output (default: bhee_clean_dataset/)",
    )
    parser.add_argument(
        "--watch", "-w",
        action="store_true",
        help="Watch mode: continuously monitor input for new images",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=2.0,
        help="Poll interval in seconds for watch mode (default: 2.0)",
    )
    parser.add_argument(
        "--force", "-f",
        action="store_true",
        help="Re-process all images, ignoring the manifest cache",
    )
    args = parser.parse_args()

    input_dir = Path(args.input)
    output_dir = Path(args.output)

    if not input_dir.exists():
        logger.error("Input directory does not exist: %s", input_dir)
        sys.exit(1)

    detector_type, detector = load_detector()

    logger.info("Input:  %s", input_dir.resolve())
    logger.info("Output: %s", output_dir.resolve())

    if args.watch:
        watch_mode(input_dir, output_dir, detector_type, detector, args.interval)
    else:
        stats = process_directory(input_dir, output_dir, detector_type, detector, force=args.force)
        logger.info(
            "Done — %d processed, %d skipped, %d faces blurred, %d errors",
            stats["processed"], stats["skipped"], stats["faces_found"], stats["errors"],
        )
        if stats["errors"] > 0:
            sys.exit(1)


if __name__ == "__main__":
    main()
