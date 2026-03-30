"""
Validate the final YOLO dataset for correctness.

Checks performed on each split (train / val / test):
  - Every image has a matching label file (and vice versa)
  - All bounding box coordinates are in valid range [0, 1]
  - All class IDs are within the defined ontology
  - Flags suspiciously small (<0.1% area) or large (>90% area) boxes
  - Reports per-class distribution and per-image box counts

Usage:
    python scripts/validate_dataset.py
    python scripts/validate_dataset.py --dataset path/to/dataset
"""

import argparse
import sys
from collections import defaultdict
from pathlib import Path

import yaml

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}


def load_classes(config_path=None):
    if config_path is None:
        config_path = PROJECT_DIR / "configs" / "classes.yaml"
    with open(config_path) as f:
        return yaml.safe_load(f)["classes"]


def validate_split(images_dir, labels_dir, classes, split_name):
    """Validate one split. Returns (issues_list, stats_dict)."""
    images_dir = Path(images_dir)
    labels_dir = Path(labels_dir)
    num_classes = len(classes)

    issues = []
    stats = {
        "images": 0,
        "labels": 0,
        "boxes": 0,
        "empty_labels": 0,
        "class_counts": defaultdict(int),
        "boxes_per_image": [],
        "box_areas": [],
    }

    images = {f.stem: f for f in images_dir.iterdir() if f.suffix.lower() in IMAGE_EXTENSIONS}
    labels = {f.stem: f for f in labels_dir.iterdir() if f.suffix == ".txt"}

    stats["images"] = len(images)
    stats["labels"] = len(labels)

    # Pairing checks
    images_only = set(images) - set(labels)
    labels_only = set(labels) - set(images)

    if images_only:
        samples = sorted(images_only)[:5]
        issues.append(
            f"[{split_name}] {len(images_only)} images missing labels: "
            f"{samples}{'...' if len(images_only) > 5 else ''}"
        )
    if labels_only:
        samples = sorted(labels_only)[:5]
        issues.append(
            f"[{split_name}] {len(labels_only)} labels missing images: "
            f"{samples}{'...' if len(labels_only) > 5 else ''}"
        )

    # Validate each label file
    for stem in sorted(labels):
        label_path = labels[stem]
        content = label_path.read_text().strip()

        if not content:
            stats["empty_labels"] += 1
            stats["boxes_per_image"].append(0)
            continue

        box_count = 0
        for line_num, line in enumerate(content.split("\n"), 1):
            line = line.strip()
            if not line:
                continue

            parts = line.split()
            if len(parts) != 5:
                issues.append(
                    f"[{split_name}] {label_path.name}:{line_num} — "
                    f"expected 5 values, got {len(parts)}"
                )
                continue

            try:
                cls_id = int(parts[0])
                x, y, w, h = map(float, parts[1:])
            except ValueError:
                issues.append(f"[{split_name}] {label_path.name}:{line_num} — invalid numbers")
                continue

            if cls_id < 0 or cls_id >= num_classes:
                issues.append(
                    f"[{split_name}] {label_path.name}:{line_num} — "
                    f"class {cls_id} out of range [0, {num_classes - 1}]"
                )
            else:
                stats["class_counts"][classes[cls_id]] += 1

            for val, name in [(x, "x_center"), (y, "y_center"), (w, "width"), (h, "height")]:
                if val < 0 or val > 1:
                    issues.append(
                        f"[{split_name}] {label_path.name}:{line_num} — "
                        f"{name}={val:.4f} outside [0, 1]"
                    )

            area = w * h
            stats["box_areas"].append(area)

            if area < 0.001:
                issues.append(
                    f"[{split_name}] {label_path.name}:{line_num} — "
                    f"very small box (area={area:.6f})"
                )
            elif area > 0.9:
                issues.append(
                    f"[{split_name}] {label_path.name}:{line_num} — "
                    f"very large box (area={area:.4f})"
                )

            box_count += 1
            stats["boxes"] += 1

        stats["boxes_per_image"].append(box_count)

    return issues, stats


def validate_dataset(dataset_dir):
    """Run validation across all splits and print a report."""
    dataset_dir = Path(dataset_dir)
    classes = load_classes()

    print(f"Validating dataset: {dataset_dir}")
    print(f"Expected classes:   {classes}\n")

    data_yaml = dataset_dir / "data.yaml"
    if not data_yaml.exists():
        print("WARNING: data.yaml not found in dataset directory!\n")

    all_issues = []
    all_stats = {}

    for split in ("train", "val", "test"):
        images_dir = dataset_dir / "images" / split
        labels_dir = dataset_dir / "labels" / split

        if not images_dir.exists():
            print(f"[{split}] Skipped — directory not found\n")
            continue

        issues, stats = validate_split(images_dir, labels_dir, classes, split)
        all_issues.extend(issues)
        all_stats[split] = stats

        print(f"--- {split.upper()} ---")
        print(f"  Images:          {stats['images']}")
        print(f"  Label files:     {stats['labels']}")
        print(f"  Bounding boxes:  {stats['boxes']}")
        print(f"  Empty labels:    {stats['empty_labels']}")

        if stats["boxes_per_image"]:
            avg = sum(stats["boxes_per_image"]) / len(stats["boxes_per_image"])
            print(f"  Avg boxes/image: {avg:.2f}")
            print(f"  Max boxes/image: {max(stats['boxes_per_image'])}")

        if stats["class_counts"]:
            print("  Class distribution:")
            for cls_name, count in sorted(stats["class_counts"].items()):
                print(f"    {cls_name}: {count}")
        print()

    # Summary
    total_images = sum(s["images"] for s in all_stats.values())
    total_boxes = sum(s["boxes"] for s in all_stats.values())

    print("=" * 50)
    print("VALIDATION SUMMARY")
    print("=" * 50)
    print(f"Total images:  {total_images}")
    print(f"Total boxes:   {total_boxes}")

    if all_issues:
        print(f"\nISSUES FOUND: {len(all_issues)}")
        for issue in all_issues[:25]:
            print(f"  - {issue}")
        if len(all_issues) > 25:
            print(f"  ... and {len(all_issues) - 25} more")
        return False
    else:
        print("\nNo issues found — dataset is valid.")
        return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate YOLO dataset integrity")
    parser.add_argument(
        "--dataset",
        type=str,
        default=str(PROJECT_DIR / "dataset"),
        help="Path to dataset directory",
    )

    args = parser.parse_args()
    is_valid = validate_dataset(args.dataset)
    sys.exit(0 if is_valid else 1)
