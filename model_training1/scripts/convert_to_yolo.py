"""
Convert annotations to YOLO .txt format.

Supports two input formats:
  1. Label Studio JSON export  -> YOLO .txt
  2. Existing YOLO .txt files  -> cleaned/validated YOLO .txt

YOLO label format (one line per object):
    <class_id> <x_center> <y_center> <width> <height>
    All coordinates are normalized to [0, 1] relative to image dimensions.

Usage:
    # From Label Studio export
    python scripts/convert_to_yolo.py --source annotations/raw/label_studio_export.json

    # Clean existing YOLO labels (e.g. from auto_prelabel.py)
    python scripts/convert_to_yolo.py --source annotations/raw --format yolo
"""

import argparse
import json
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import yaml

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent


def image_stem_from_label_studio_field(image_field: str) -> str:
    """
    Label Studio stores `data.image` as a filename, a /data/local-files/?d=... URL,
    or a full http(s) URL. Path().stem breaks on '?d=foo.jpg'. Extract the real stem.
    """
    if not image_field:
        return ""
    s = unquote(image_field.strip())
    parsed = urlparse(s)
    if parsed.query:
        q = parse_qs(parsed.query)
        if "d" in q and q["d"]:
            return Path(q["d"][0]).stem
    # strip query fragment for normal paths / URLs
    base = s.split("?")[0].split("#")[0]
    return Path(base).stem


def load_classes(config_path=None):
    if config_path is None:
        config_path = PROJECT_DIR / "configs" / "classes.yaml"
    with open(config_path) as f:
        return yaml.safe_load(f)["classes"]


def _clamp(value, lo=0.0, hi=1.0):
    return max(lo, min(hi, value))


def convert_label_studio_to_yolo(export_path, output_dir, classes):
    """
    Convert Label Studio JSON export to YOLO .txt label files.

    Label Studio stores bounding boxes as percentage coordinates (0–100),
    where (x, y) is the top-left corner. YOLO expects normalized center
    coordinates (0–1). This function handles the conversion and clamping.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with open(export_path) as f:
        tasks = json.load(f)

    class_to_id = {name: idx for idx, name in enumerate(classes)}

    stats = {"total_images": 0, "total_boxes": 0, "skipped_labels": set(), "skipped_tasks": 0}

    for task in tasks:
        image_url = task.get("data", {}).get("image", "")
        image_name = image_stem_from_label_studio_field(image_url)
        if not image_name:
            stats["skipped_tasks"] += 1
            continue

        stats["total_images"] += 1
        lines = []

        annotations = task.get("annotations", [])
        if not annotations:
            (output_dir / f"{image_name}.txt").write_text("")
            continue

        # Use the most recently completed annotation
        annotation = annotations[-1]

        for result in annotation.get("result", []):
            if result.get("type") != "rectanglelabels":
                continue

            value = result["value"]
            label_names = value.get("rectanglelabels", [])
            if not label_names:
                continue

            label = label_names[0]
            if label not in class_to_id:
                stats["skipped_labels"].add(label)
                continue

            cls_id = class_to_id[label]

            # Label Studio: (x, y) = top-left corner in percentages (0-100)
            x_pct = value["x"]
            y_pct = value["y"]
            w_pct = value["width"]
            h_pct = value["height"]

            # -> YOLO: center coordinates, normalized (0-1)
            x_center = _clamp((x_pct + w_pct / 2) / 100.0)
            y_center = _clamp((y_pct + h_pct / 2) / 100.0)
            width = _clamp(w_pct / 100.0, lo=0.001)
            height = _clamp(h_pct / 100.0, lo=0.001)

            lines.append(f"{cls_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}")
            stats["total_boxes"] += 1

        label_path = output_dir / f"{image_name}.txt"
        label_path.write_text("\n".join(lines) + "\n" if lines else "")

    print(f"Conversion complete (Label Studio -> YOLO):")
    print(f"  Images: {stats['total_images']}")
    print(f"  Boxes:  {stats['total_boxes']}")
    if stats["skipped_tasks"]:
        print(f"  Skipped tasks (no image filename): {stats['skipped_tasks']}")
    if stats["skipped_labels"]:
        print(f"  Skipped unknown labels: {stats['skipped_labels']}")
    print(f"  Output: {output_dir}")

    return stats


def clean_yolo_labels(labels_dir, output_dir, classes):
    """
    Validate and clean existing YOLO .txt files.

    Checks each line for correct format, valid class IDs, and in-range
    coordinates. Writes cleaned versions to output_dir.
    """
    labels_dir = Path(labels_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    num_classes = len(classes)
    stats = {"files": 0, "boxes": 0, "fixed": 0, "errors": 0}

    for label_path in sorted(labels_dir.glob("*.txt")):
        stats["files"] += 1
        lines = []

        for line_num, line in enumerate(label_path.read_text().strip().split("\n"), 1):
            line = line.strip()
            if not line:
                continue

            parts = line.split()
            if len(parts) != 5:
                print(f"  {label_path.name}:{line_num} — expected 5 values, got {len(parts)}")
                stats["errors"] += 1
                continue

            try:
                cls_id = int(parts[0])
                x, y, w, h = map(float, parts[1:])
            except ValueError:
                print(f"  {label_path.name}:{line_num} — invalid number format")
                stats["errors"] += 1
                continue

            if cls_id < 0 or cls_id >= num_classes:
                print(f"  {label_path.name}:{line_num} — class {cls_id} out of range [0, {num_classes - 1}]")
                stats["errors"] += 1
                continue

            orig = (x, y, w, h)
            x = _clamp(x)
            y = _clamp(y)
            w = _clamp(w, lo=0.001)
            h = _clamp(h, lo=0.001)

            if (x, y, w, h) != orig:
                stats["fixed"] += 1

            lines.append(f"{cls_id} {x:.6f} {y:.6f} {w:.6f} {h:.6f}")
            stats["boxes"] += 1

        out_path = output_dir / label_path.name
        out_path.write_text("\n".join(lines) + "\n" if lines else "")

    print(f"Cleaning complete (YOLO -> YOLO):")
    print(f"  Files: {stats['files']}")
    print(f"  Boxes: {stats['boxes']}")
    print(f"  Coordinates fixed: {stats['fixed']}")
    print(f"  Errors skipped: {stats['errors']}")

    return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert annotations to YOLO .txt format")
    parser.add_argument(
        "--source",
        type=str,
        required=True,
        help="Label Studio JSON file or directory of YOLO .txt files",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(PROJECT_DIR / "annotations" / "yolo_labels"),
        help="Output directory for YOLO label files",
    )
    parser.add_argument(
        "--format",
        type=str,
        choices=["label-studio", "yolo"],
        default="label-studio",
        help="Input format (default: label-studio)",
    )

    args = parser.parse_args()
    classes = load_classes()

    if args.format == "label-studio":
        convert_label_studio_to_yolo(args.source, args.output, classes)
    else:
        clean_yolo_labels(args.source, args.output, classes)
