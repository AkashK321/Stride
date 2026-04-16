"""
Split the Roboflow YOLOv11 dataset into train / valid / test sets.

Shuffles image–label pairs with a fixed seed and partitions them
into 70% train, 20% validation, 10% test.  Creates the required
folder structure in-place so data.yaml paths resolve correctly.
"""

import random
import shutil
from pathlib import Path

SEED = 42
TRAIN_RATIO = 0.70
VALID_RATIO = 0.20

DATASET_ROOT = Path(__file__).parent / "roboflow_dataset" / "Stride.yolov11"
SRC_IMAGES = DATASET_ROOT / "train" / "images"
SRC_LABELS = DATASET_ROOT / "train" / "labels"


def collect_pairs() -> list[str]:
    """Return sorted list of filename stems that have both an image and a label."""
    image_stems = {p.stem for p in SRC_IMAGES.glob("*.jpg")}
    label_stems = {p.stem for p in SRC_LABELS.glob("*.txt")}
    paired = sorted(image_stems & label_stems)
    if not paired:
        raise FileNotFoundError(f"No image/label pairs found in {SRC_IMAGES}")
    return paired


def split_list(stems: list[str]) -> dict[str, list[str]]:
    random.seed(SEED)
    random.shuffle(stems)
    n = len(stems)
    train_end = int(n * TRAIN_RATIO)
    valid_end = train_end + int(n * VALID_RATIO)
    return {
        "train": stems[:train_end],
        "valid": stems[train_end:valid_end],
        "test": stems[valid_end:],
    }


def move_pairs(stems: list[str], dest_name: str) -> None:
    dest_images = DATASET_ROOT / dest_name / "images"
    dest_labels = DATASET_ROOT / dest_name / "labels"
    dest_images.mkdir(parents=True, exist_ok=True)
    dest_labels.mkdir(parents=True, exist_ok=True)

    for stem in stems:
        img_src = SRC_IMAGES / f"{stem}.jpg"
        lbl_src = SRC_LABELS / f"{stem}.txt"
        shutil.move(str(img_src), str(dest_images / img_src.name))
        shutil.move(str(lbl_src), str(dest_labels / lbl_src.name))


def main():
    pairs = collect_pairs()
    print(f"Found {len(pairs)} image/label pairs")

    splits = split_list(pairs)
    for name, stems in splits.items():
        print(f"  {name}: {len(stems)} pairs")

    # Move valid and test out of train/ first
    move_pairs(splits["valid"], "valid")
    move_pairs(splits["test"], "test")
    # train/ keeps the remaining files in place — no move needed

    print("\nDone. Final layout:")
    for split_name in ("train", "valid", "test"):
        img_dir = DATASET_ROOT / split_name / "images"
        lbl_dir = DATASET_ROOT / split_name / "labels"
        img_count = len(list(img_dir.glob("*.jpg"))) if img_dir.exists() else 0
        lbl_count = len(list(lbl_dir.glob("*.txt"))) if lbl_dir.exists() else 0
        print(f"  {split_name}/  images: {img_count}  labels: {lbl_count}")


if __name__ == "__main__":
    main()
