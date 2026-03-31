"""
Auto pre-labeling using YOLO-World zero-shot object detection.

Uses YOLO-World's open-vocabulary capability to detect "door_sign" in BHEE
images without any prior training. Generates initial bounding box annotations
in YOLO .txt format and Label Studio JSON format for human review.

Usage:
    python scripts/auto_prelabel.py
    python scripts/auto_prelabel.py --confidence 0.2 --model-size m
"""

import argparse
import json
import sys
from pathlib import Path

import yaml
from tqdm import tqdm

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}


def load_classes(config_path=None):
    if config_path is None:
        config_path = PROJECT_DIR / "configs" / "classes.yaml"
    with open(config_path) as f:
        return yaml.safe_load(f)["classes"]


def get_image_files(image_dir):
    image_dir = Path(image_dir)
    if not image_dir.exists():
        print(f"Error: Image directory not found: {image_dir}")
        sys.exit(1)
    files = [f for f in image_dir.iterdir() if f.suffix.lower() in IMAGE_EXTENSIONS]
    return sorted(files)


def run_prelabeling(image_dir, output_dir, confidence_threshold=0.15, model_size="s"):
    """
    Run YOLO-World zero-shot detection on all images.

    YOLO-World accepts arbitrary text prompts as classes. We pass our class
    names (e.g. "door_sign" -> "door sign") and it detects matching objects
    without any fine-tuning.

    Args:
        image_dir: Directory containing raw BHEE images
        output_dir: Where to write YOLO-format .txt label files
        confidence_threshold: Minimum detection confidence (low default to
                              catch more signs — false positives are corrected
                              during human review)
        model_size: YOLO-World variant: 's' (fast), 'm' (balanced), 'l' (accurate)
    """
    from ultralytics import YOLO

    classes = load_classes()
    image_files = get_image_files(image_dir)

    if not image_files:
        print(f"No images found in {image_dir}")
        sys.exit(1)

    # YOLO-World expects human-readable phrases, so convert underscores
    class_prompts = [c.replace("_", " ") for c in classes]

    print(f"Found {len(image_files)} images in {image_dir}")
    print(f"Classes: {classes} (prompts: {class_prompts})")
    print(f"Confidence threshold: {confidence_threshold}")

    model_name = f"yolov8{model_size}-worldv2.pt"
    print(f"Loading YOLO-World model: {model_name}")
    model = YOLO(model_name)
    model.set_classes(class_prompts)

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    stats = {"total_images": 0, "images_with_detections": 0, "total_detections": 0}

    for img_path in tqdm(image_files, desc="Pre-labeling"):
        stats["total_images"] += 1

        results = model.predict(source=str(img_path), conf=confidence_threshold, verbose=False)
        result = results[0]

        label_path = output_dir / f"{img_path.stem}.txt"

        if len(result.boxes) == 0:
            label_path.write_text("")
            continue

        stats["images_with_detections"] += 1
        lines = []

        for box in result.boxes:
            cls_id = int(box.cls[0])
            x_center, y_center, width, height = box.xywhn[0].tolist()
            lines.append(f"{cls_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}")
            stats["total_detections"] += 1

        label_path.write_text("\n".join(lines) + "\n")

    print(f"\nPre-labeling complete:")
    print(f"  Images processed:        {stats['total_images']}")
    print(f"  Images with detections:  {stats['images_with_detections']}")
    print(f"  Total detections:        {stats['total_detections']}")
    print(f"  Avg detections/image:    {stats['total_detections'] / max(stats['total_images'], 1):.2f}")
    print(f"  Labels saved to:         {output_dir}")

    _generate_label_studio_import(image_files, output_dir, classes)

    return stats


def _generate_label_studio_import(image_files, yolo_labels_dir, classes):
    """
    Build a single Label Studio import JSON: one task per image, with optional
    pre-annotations. Uses the same `data.image` form as setup_label_studio.py
    (`/data/local-files/?d=filename`) so imports merge correctly and local file
    serving works.
    """
    from PIL import Image

    # Must match import_tasks_from_images() in setup_label_studio.py
    def image_ref(name: str) -> str:
        return f"/data/local-files/?d={name}"

    tasks_out = []

    for img_path in image_files:
        label_path = yolo_labels_dir / f"{img_path.stem}.txt"
        content = label_path.read_text().strip() if label_path.exists() else ""

        if not content:
            tasks_out.append({"data": {"image": image_ref(img_path.name)}})
            continue

        img = Image.open(img_path)
        img_w, img_h = img.size

        annotation_results = []
        for line in content.split("\n"):
            parts = line.strip().split()
            if len(parts) != 5:
                continue

            cls_id = int(parts[0])
            x_center, y_center, w, h = map(float, parts[1:])

            # YOLO normalized (0-1) -> Label Studio percentage (0-100)
            x_ls = (x_center - w / 2) * 100
            y_ls = (y_center - h / 2) * 100
            w_ls = w * 100
            h_ls = h * 100

            annotation_results.append(
                {
                    "type": "rectanglelabels",
                    "from_name": "label",
                    "to_name": "image",
                    "original_width": img_w,
                    "original_height": img_h,
                    "value": {
                        "x": x_ls,
                        "y": y_ls,
                        "width": w_ls,
                        "height": h_ls,
                        "rectanglelabels": [classes[cls_id]],
                        "rotation": 0,
                    },
                }
            )

        task = {"data": {"image": image_ref(img_path.name)}}
        if annotation_results:
            task["predictions"] = [{"result": annotation_results}]
        tasks_out.append(task)

    out_dir = yolo_labels_dir.parent
    import_path = out_dir / "label_studio_import.json"
    with open(import_path, "w") as f:
        json.dump(tasks_out, f, indent=2)

    # Backward-compatible alias (predictions-only subset) for older docs
    legacy_path = out_dir / "label_studio_predictions.json"
    with open(legacy_path, "w") as f:
        json.dump([t for t in tasks_out if "predictions" in t], f, indent=2)

    print(f"  Label Studio import (all images): {import_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Auto pre-label BHEE images using YOLO-World zero-shot detection"
    )
    parser.add_argument(
        "--images",
        type=str,
        default=str(PROJECT_DIR / "bhee_clean_dataset"),
        help="Path to raw images directory",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(PROJECT_DIR / "annotations" / "raw"),
        help="Path to save YOLO-format label files",
    )
    parser.add_argument(
        "--confidence",
        type=float,
        default=0.15,
        help="Confidence threshold (default: 0.15, intentionally low to favor recall)",
    )
    parser.add_argument(
        "--model-size",
        type=str,
        default="s",
        choices=["s", "m", "l"],
        help="YOLO-World model size: s=fast, m=balanced, l=accurate (default: s)",
    )

    args = parser.parse_args()
    run_prelabeling(args.images, args.output, args.confidence, args.model_size)
