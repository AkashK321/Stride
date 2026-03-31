"""
Render labeled preview images with bounding boxes drawn on top.

Reads YOLO .txt label files and draws the corresponding boxes on images
so you can visually verify that detections are correct.

Usage:
    python scripts/visualize_labels.py
    python scripts/visualize_labels.py --images bhee_clean_dataset --labels annotations/raw
"""

import argparse
import sys
from pathlib import Path

import cv2
import yaml

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}

BOX_COLOR = (0, 0, 255)  # red in BGR
BOX_THICKNESS = 3
LABEL_FONT = cv2.FONT_HERSHEY_SIMPLEX
LABEL_SCALE = 0.7
LABEL_COLOR = (255, 255, 255)
LABEL_BG_COLOR = (0, 0, 255)


def load_classes(config_path=None):
    if config_path is None:
        config_path = PROJECT_DIR / "configs" / "classes.yaml"
    with open(config_path) as f:
        return yaml.safe_load(f)["classes"]


def draw_labels(image_dir, labels_dir, output_dir, classes):
    image_dir = Path(image_dir)
    labels_dir = Path(labels_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    image_files = sorted(
        f for f in image_dir.iterdir() if f.suffix.lower() in IMAGE_EXTENSIONS
    )

    if not image_files:
        print(f"No images found in {image_dir}")
        return

    stats = {"images": 0, "with_boxes": 0, "total_boxes": 0}

    for img_path in image_files:
        label_path = labels_dir / f"{img_path.stem}.txt"

        img = cv2.imread(str(img_path))
        if img is None:
            print(f"  Warning: could not read {img_path.name}")
            continue

        stats["images"] += 1
        h, w = img.shape[:2]
        boxes_drawn = 0

        if label_path.exists():
            content = label_path.read_text().strip()
            if content:
                for line in content.split("\n"):
                    parts = line.strip().split()
                    if len(parts) != 5:
                        continue

                    cls_id = int(parts[0])
                    xc, yc, bw, bh = map(float, parts[1:])

                    x1 = int((xc - bw / 2) * w)
                    y1 = int((yc - bh / 2) * h)
                    x2 = int((xc + bw / 2) * w)
                    y2 = int((yc + bh / 2) * h)

                    cv2.rectangle(img, (x1, y1), (x2, y2), BOX_COLOR, BOX_THICKNESS)

                    cls_name = classes[cls_id] if cls_id < len(classes) else f"cls_{cls_id}"
                    label_text = cls_name
                    (tw, th), _ = cv2.getTextSize(label_text, LABEL_FONT, LABEL_SCALE, 1)
                    cv2.rectangle(img, (x1, y1 - th - 8), (x1 + tw + 4, y1), LABEL_BG_COLOR, -1)
                    cv2.putText(img, label_text, (x1 + 2, y1 - 4), LABEL_FONT, LABEL_SCALE, LABEL_COLOR, 1)

                    boxes_drawn += 1

        if boxes_drawn > 0:
            stats["with_boxes"] += 1
            stats["total_boxes"] += boxes_drawn
            tag = f"  [{boxes_drawn} box(es)]"
        else:
            tag = "  [no detections]"

        out_path = output_dir / f"{img_path.stem}_labeled.jpg"
        cv2.imwrite(str(out_path), img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        print(f"  {img_path.name} → {out_path.name}{tag}")

    print(f"\nVisualization complete:")
    print(f"  Images:           {stats['images']}")
    print(f"  With detections:  {stats['with_boxes']}")
    print(f"  Total boxes:      {stats['total_boxes']}")
    print(f"  Previews saved:   {output_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Render preview images with YOLO bounding boxes drawn on top"
    )
    parser.add_argument(
        "--images",
        type=str,
        default=str(PROJECT_DIR / "bhee_clean_dataset"),
        help="Source images directory",
    )
    parser.add_argument(
        "--labels",
        type=str,
        default=str(PROJECT_DIR / "annotations" / "raw"),
        help="YOLO .txt label files directory",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(PROJECT_DIR / "previews"),
        help="Output directory for labeled preview images",
    )

    args = parser.parse_args()
    classes = load_classes()
    draw_labels(args.images, args.labels, args.output, classes)
