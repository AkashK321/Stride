"""
Split annotated images into train / val / test sets.

Takes a flat directory of images and their corresponding YOLO .txt label files,
then distributes them into the standard YOLO directory structure:

    dataset/
      images/{train,val,test}/
      labels/{train,val,test}/

Also writes/updates the data.yaml YOLO config file.

Usage:
    python scripts/split_dataset.py
    python scripts/split_dataset.py --train 0.70 --val 0.20 --test 0.10 --seed 123
"""

import argparse
import random
import shutil
import sys
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


def split_dataset(
    image_dir, labels_dir, output_dir, train_ratio=0.80, val_ratio=0.15, test_ratio=0.05, seed=42
):
    ratio_sum = train_ratio + val_ratio + test_ratio
    if abs(ratio_sum - 1.0) > 1e-6:
        print(f"Error: split ratios must sum to 1.0 (got {ratio_sum:.4f})")
        sys.exit(1)

    image_dir = Path(image_dir)
    labels_dir = Path(labels_dir)
    output_dir = Path(output_dir)

    image_files = sorted(f for f in image_dir.iterdir() if f.suffix.lower() in IMAGE_EXTENSIONS)

    if not image_files:
        print(f"No images found in {image_dir}")
        sys.exit(1)

    # Pair each image with its label file
    paired = []
    missing_labels = []
    for img in image_files:
        label = labels_dir / f"{img.stem}.txt"
        if label.exists():
            paired.append((img, label))
        else:
            missing_labels.append(img.name)

    if missing_labels:
        print(f"Warning: {len(missing_labels)} images have no label file — skipping them")
        if len(missing_labels) <= 10:
            for name in missing_labels:
                print(f"  {name}")

    if not paired:
        print("No image-label pairs found. Run annotation + conversion first.")
        sys.exit(1)

    print(f"Found {len(paired)} image-label pairs")

    # Reproducible shuffle
    random.seed(seed)
    random.shuffle(paired)

    n = len(paired)
    n_train = int(n * train_ratio)
    n_val = int(n * val_ratio)

    splits = {
        "train": paired[:n_train],
        "val": paired[n_train : n_train + n_val],
        "test": paired[n_train + n_val :],
    }

    # Clear old split data and copy files
    for split_name, split_pairs in splits.items():
        img_out = output_dir / "images" / split_name
        lbl_out = output_dir / "labels" / split_name

        # Remove old files in the split directories
        for d in (img_out, lbl_out):
            if d.exists():
                shutil.rmtree(d)
            d.mkdir(parents=True, exist_ok=True)

        for img_path, lbl_path in split_pairs:
            shutil.copy2(img_path, img_out / img_path.name)
            shutil.copy2(lbl_path, lbl_out / lbl_path.name)

    print(f"\nDataset split (seed={seed}):")
    print(f"  Train: {len(splits['train']):>4}  ({train_ratio * 100:.0f}%)")
    print(f"  Val:   {len(splits['val']):>4}  ({val_ratio * 100:.0f}%)")
    print(f"  Test:  {len(splits['test']):>4}  ({test_ratio * 100:.0f}%)")

    # Write data.yaml
    classes = load_classes()
    data_yaml = {
        "path": str(output_dir.resolve()),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "nc": len(classes),
        "names": {i: name for i, name in enumerate(classes)},
    }

    yaml_path = output_dir / "data.yaml"
    with open(yaml_path, "w") as f:
        yaml.dump(data_yaml, f, default_flow_style=False, sort_keys=False)

    print(f"  data.yaml written to {yaml_path}")

    return splits


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Split dataset into train/val/test")
    parser.add_argument(
        "--images",
        type=str,
        default=str(PROJECT_DIR / "bhee_clean_dataset"),
        help="Source images directory",
    )
    parser.add_argument(
        "--labels",
        type=str,
        default=str(PROJECT_DIR / "annotations" / "yolo_labels"),
        help="YOLO label files directory",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(PROJECT_DIR / "dataset"),
        help="Output directory for the split dataset",
    )
    parser.add_argument("--train", type=float, default=0.80, help="Train ratio (default: 0.80)")
    parser.add_argument("--val", type=float, default=0.15, help="Val ratio (default: 0.15)")
    parser.add_argument("--test", type=float, default=0.05, help="Test ratio (default: 0.05)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed (default: 42)")

    args = parser.parse_args()
    split_dataset(args.images, args.labels, args.output, args.train, args.val, args.test, args.seed)
