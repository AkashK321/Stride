"""
Copy/paste this entire file into a Google Colab cell and run it.

You only need to edit:
1) DATASET_ROOT
2) CLASS_NAMES

Expected dataset layout (YOLO format):
DATASET_ROOT/
  images/
    train/   -> .jpg/.jpeg/.png files
    val/     -> .jpg/.jpeg/.png files
  labels/
    train/   -> .txt files (same basename as image)
    val/     -> .txt files (same basename as image)
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path


# -------------------------
# Edit only this section
# -------------------------
DATASET_ROOT = "/content/drive/MyDrive/room_sign_dataset"
CLASS_NAMES = [
    "230",
    "232",
    "226",
    "224",
]

# Optional training config
BASE_MODEL = "yolo11n.pt"  # options: yolo11n.pt, yolo11s.pt, ...
EPOCHS = 50
IMG_SIZE = 640
BATCH_SIZE = 16
RUN_NAME = "yolo_custom_colab"
PROJECT_DIR = "/content/runs/detect"

# If True, attempts to mount Google Drive automatically
MOUNT_DRIVE = True
EXPORT_TO_DRIVE_DIR = "/content/drive/MyDrive/yolo-trained-models"


def install_dependencies() -> None:
    packages = [
        "ultralytics>=8.3.0",
        "pyyaml",
    ]
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q"] + packages)


def maybe_mount_drive() -> None:
    if not MOUNT_DRIVE:
        return
    try:
        from google.colab import drive  # type: ignore

        drive.mount("/content/drive", force_remount=False)
    except Exception:
        # Safe fallback if not running in Colab
        print("Skipping Google Drive mount (not running in Colab or mount failed).")


def gather_images(directory: Path) -> list[Path]:
    image_exts = {".jpg", ".jpeg", ".png"}
    return sorted([p for p in directory.glob("*") if p.suffix.lower() in image_exts and p.is_file()])


def gather_label_stems(directory: Path) -> set[str]:
    return {p.stem for p in directory.glob("*.txt") if p.is_file()}


def validate_dataset(dataset_root: Path) -> tuple[list[Path], list[Path]]:
    train_images_dir = dataset_root / "images" / "train"
    val_images_dir = dataset_root / "images" / "val"
    train_labels_dir = dataset_root / "labels" / "train"
    val_labels_dir = dataset_root / "labels" / "val"

    required_dirs = [
        train_images_dir,
        val_images_dir,
        train_labels_dir,
        val_labels_dir,
    ]
    for d in required_dirs:
        if not d.exists() or not d.is_dir():
            raise FileNotFoundError(f"Missing required directory: {d}")

    train_images = gather_images(train_images_dir)
    val_images = gather_images(val_images_dir)
    if not train_images:
        raise ValueError(f"No training images found in: {train_images_dir}")
    if not val_images:
        raise ValueError(f"No validation images found in: {val_images_dir}")

    train_label_stems = gather_label_stems(train_labels_dir)
    val_label_stems = gather_label_stems(val_labels_dir)

    missing_train_labels = [img.name for img in train_images if img.stem not in train_label_stems]
    missing_val_labels = [img.name for img in val_images if img.stem not in val_label_stems]

    if missing_train_labels:
        preview = ", ".join(missing_train_labels[:10])
        raise ValueError(
            "Missing .txt labels for some train images. "
            f"Examples: {preview}"
        )
    if missing_val_labels:
        preview = ", ".join(missing_val_labels[:10])
        raise ValueError(
            "Missing .txt labels for some val images. "
            f"Examples: {preview}"
        )

    return train_images, val_images


def write_data_yaml(dataset_root: Path, class_names: list[str]) -> Path:
    import yaml

    if not class_names:
        raise ValueError("CLASS_NAMES cannot be empty.")

    data = {
        "path": str(dataset_root),
        "train": "images/train",
        "val": "images/val",
        "names": {i: name for i, name in enumerate(class_names)},
    }

    yaml_path = Path("/content/yolo_data.yaml")
    with yaml_path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False, allow_unicode=False)
    return yaml_path


def train_model(data_yaml_path: Path) -> Path:
    from ultralytics import YOLO

    model = YOLO(BASE_MODEL)
    results = model.train(
        data=str(data_yaml_path),
        epochs=EPOCHS,
        imgsz=IMG_SIZE,
        batch=BATCH_SIZE,
        project=PROJECT_DIR,
        name=RUN_NAME,
        exist_ok=True,
    )

    best_model_path = Path(results.save_dir) / "weights" / "best.pt"
    if not best_model_path.exists():
        raise FileNotFoundError(f"Training finished but best model not found at: {best_model_path}")
    return best_model_path


def export_model(best_model_path: Path) -> None:
    export_dir = Path(EXPORT_TO_DRIVE_DIR)
    export_dir.mkdir(parents=True, exist_ok=True)

    target_path = export_dir / f"{RUN_NAME}_best.pt"
    shutil.copy2(best_model_path, target_path)

    print("\nTraining complete.")
    print(f"Best model (local): {best_model_path}")
    print(f"Best model (copied): {target_path}")


def main() -> None:
    maybe_mount_drive()
    install_dependencies()

    dataset_root = Path(DATASET_ROOT)
    if not dataset_root.exists():
        raise FileNotFoundError(
            f"DATASET_ROOT does not exist: {dataset_root}\n"
            "Update DATASET_ROOT to your actual dataset folder in Colab."
        )

    train_images, val_images = validate_dataset(dataset_root)
    print(f"Train images: {len(train_images)}")
    print(f"Val images:   {len(val_images)}")
    print(f"Classes:      {CLASS_NAMES}")

    data_yaml_path = write_data_yaml(dataset_root, CLASS_NAMES)
    print(f"Generated data.yaml: {data_yaml_path}")

    best_model_path = train_model(data_yaml_path)
    export_model(best_model_path)


if __name__ == "__main__":
    main()
