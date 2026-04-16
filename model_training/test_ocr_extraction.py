"""
OCR extraction test harness.

Crops sign regions from dataset images using polygon annotations,
preprocesses them, runs EasyOCR (scene-text neural network), and
outputs a results report with saved crop images.
"""

import re
import sys
import time
from pathlib import Path

import cv2
import easyocr
import numpy as np

DATASET_DIR = Path(__file__).parent / "roboflow_dataset" / "Stride.yolov11" / "train"
IMAGES_DIR = DATASET_DIR / "images"
LABELS_DIR = DATASET_DIR / "labels"
OUTPUT_DIR = Path(__file__).parent / "ocr_test_results"

PADDING_PX = 15
CLAHE_CLIP_LIMIT = 3.0
CLAHE_GRID_SIZE = (8, 8)
MIN_OCR_WIDTH = 400


def parse_polygon_labels(label_path: str) -> list[list[tuple[float, float]]]:
    """Return a list of polygons, each polygon a list of (x, y) normalised coords."""
    polygons = []
    with open(label_path) as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) < 5:
                continue
            coords = list(map(float, parts[1:]))
            polygon = [(coords[i], coords[i + 1]) for i in range(0, len(coords), 2)]
            polygons.append(polygon)
    return polygons


def polygon_to_bbox(polygon: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    """Convert polygon vertices to (x_min, y_min, x_max, y_max) in normalised coords."""
    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    return min(xs), min(ys), max(xs), max(ys)


def crop_sign(image: np.ndarray, bbox_norm: tuple[float, float, float, float]) -> np.ndarray:
    """Crop the sign ROI from the image, with padding."""
    h, w = image.shape[:2]
    x_min, y_min, x_max, y_max = bbox_norm

    x1 = max(0, int(x_min * w) - PADDING_PX)
    y1 = max(0, int(y_min * h) - PADDING_PX)
    x2 = min(w, int(x_max * w) + PADDING_PX)
    y2 = min(h, int(y_max * h) + PADDING_PX)

    return image[y1:y2, x1:x2]


def upscale_if_needed(crop: np.ndarray) -> np.ndarray:
    """Upscale small crops so the OCR model has enough pixels to work with."""
    h, w = crop.shape[:2]
    if w < MIN_OCR_WIDTH:
        scale = MIN_OCR_WIDTH / w
        new_w = int(w * scale)
        new_h = int(h * scale)
        upscaled = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
        return cv2.filter2D(upscaled, -1, kernel)
    return crop


def preprocess_for_ocr(crop: np.ndarray) -> np.ndarray:
    """Upscale, then grayscale + CLAHE (no binarization -- EasyOCR needs gradient info)."""
    crop = upscale_if_needed(crop)
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=CLAHE_CLIP_LIMIT, tileGridSize=CLAHE_GRID_SIZE)
    return clahe.apply(gray)


def sanitize_ocr_text(raw: str) -> str:
    """Strip non-alphanumeric noise, keeping digits and letters common on signs."""
    room_match = re.findall(r"\d+[A-Za-z]?", raw)
    return " ".join(room_match) if room_match else ""


def run_ocr(reader: easyocr.Reader, processed_crop: np.ndarray) -> str:
    results = reader.readtext(processed_crop, detail=0, paragraph=True)
    return " ".join(results).strip() if results else ""


def main():
    if not IMAGES_DIR.is_dir() or not LABELS_DIR.is_dir():
        print(f"ERROR: dataset not found at {DATASET_DIR}", file=sys.stderr)
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading EasyOCR model (first run downloads ~100 MB)...")
    reader = easyocr.Reader(["en"], gpu=False)
    print("Model loaded.\n")

    image_files = sorted(IMAGES_DIR.glob("*.jpg"))
    print(f"Found {len(image_files)} images\n")

    col_w = {"img": 45, "sign": 6, "size": 12, "pre_ms": 8, "ocr_ms": 8, "raw": 35, "clean": 15}
    header = (
        f"{'Image':<{col_w['img']}} "
        f"{'Sign#':>{col_w['sign']}} "
        f"{'Crop Size':<{col_w['size']}} "
        f"{'Pre ms':>{col_w['pre_ms']}} "
        f"{'OCR ms':>{col_w['ocr_ms']}} "
        f"{'Raw OCR':<{col_w['raw']}} "
        f"{'Cleaned':<{col_w['clean']}}"
    )
    print(header)
    print("-" * len(header))

    total_signs = 0
    signs_with_text = 0
    signs_with_digits = 0
    all_pre_ms = []
    all_ocr_ms = []
    all_total_ms = []
    results = []

    for img_path in image_files:
        stem = img_path.stem
        label_path = LABELS_DIR / f"{stem}.txt"

        if not label_path.exists():
            continue

        image = cv2.imread(str(img_path))
        if image is None:
            print(f"  WARNING: could not read {img_path.name}")
            continue

        polygons = parse_polygon_labels(str(label_path))
        if not polygons:
            continue

        for idx, polygon in enumerate(polygons):
            bbox = polygon_to_bbox(polygon)
            crop = crop_sign(image, bbox)

            if crop.size == 0:
                continue

            t0 = time.perf_counter()
            processed = preprocess_for_ocr(crop)
            t1 = time.perf_counter()
            raw_text = run_ocr(reader, processed)

            if not raw_text:
                color_upscaled = upscale_if_needed(crop)
                raw_text = run_ocr(reader, color_upscaled)

            t2 = time.perf_counter()
            cleaned = sanitize_ocr_text(raw_text)

            pre_ms = (t1 - t0) * 1000
            ocr_ms = (t2 - t1) * 1000
            total_ms = (t2 - t0) * 1000
            all_pre_ms.append(pre_ms)
            all_ocr_ms.append(ocr_ms)
            all_total_ms.append(total_ms)

            crop_h, crop_w = crop.shape[:2]
            total_signs += 1
            if raw_text:
                signs_with_text += 1
            if cleaned:
                signs_with_digits += 1

            short_name = img_path.name[:col_w["img"]]
            size_str = f"{crop_w}x{crop_h}"
            raw_display = raw_text.replace("\n", " ")[:col_w["raw"]]
            clean_display = cleaned[:col_w["clean"]]
            print(
                f"{short_name:<{col_w['img']}} "
                f"{idx + 1:>{col_w['sign']}} "
                f"{size_str:<{col_w['size']}} "
                f"{pre_ms:>{col_w['pre_ms']}.0f} "
                f"{ocr_ms:>{col_w['ocr_ms']}.0f} "
                f"{raw_display:<{col_w['raw']}} "
                f"{clean_display:<{col_w['clean']}}"
            )

            safe_text = re.sub(r"[^a-zA-Z0-9_-]", "", cleaned or "NONE")
            crop_filename = f"{stem}_sign{idx + 1}_{safe_text}.jpg"
            cv2.imwrite(str(OUTPUT_DIR / crop_filename), processed)

            results.append({
                "image": img_path.name,
                "sign_idx": idx + 1,
                "raw": raw_text,
                "cleaned": cleaned,
            })

    print("\n" + "=" * len(header))
    print(f"Total signs processed:        {total_signs}")
    print(f"Signs with any OCR output:    {signs_with_text}")
    print(f"Signs with extracted digits:  {signs_with_digits}")
    if total_signs:
        print(f"Digit extraction rate:        {signs_with_digits / total_signs * 100:.1f}%")

    if all_total_ms:
        print(f"\n--- Latency (per crop) ---")
        print(f"  Preprocessing (upscale+CLAHE):")
        print(f"    min: {min(all_pre_ms):.0f} ms  |  median: {sorted(all_pre_ms)[len(all_pre_ms)//2]:.0f} ms  |  max: {max(all_pre_ms):.0f} ms")
        print(f"  OCR inference:")
        print(f"    min: {min(all_ocr_ms):.0f} ms  |  median: {sorted(all_ocr_ms)[len(all_ocr_ms)//2]:.0f} ms  |  max: {max(all_ocr_ms):.0f} ms")
        print(f"  Total (preprocess + OCR):")
        print(f"    min: {min(all_total_ms):.0f} ms  |  median: {sorted(all_total_ms)[len(all_total_ms)//2]:.0f} ms  |  max: {max(all_total_ms):.0f} ms")
        print(f"    avg: {sum(all_total_ms)/len(all_total_ms):.0f} ms")
        print(f"  Wall time all {total_signs} crops: {sum(all_total_ms)/1000:.1f}s")

    print(f"\nCropped images saved to: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
