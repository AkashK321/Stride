"""
Full dataset preparation pipeline — one command to go from annotations to
a validated, split YOLO dataset ready for training.

Orchestrates:
  1. Export annotations from Label Studio (optional — can use local files)
  2. Convert annotations to YOLO .txt format
  3. Split into train / val / test
  4. Validate the final dataset

Usage:
    # After annotating in Label Studio
    python scripts/prepare_dataset.py --source label-studio --api-key KEY --project-id 1

    # Using pre-labeled YOLO files from auto_prelabel.py (skip Label Studio)
    python scripts/prepare_dataset.py --source yolo-prelabels

    # Using a previously exported Label Studio JSON file
    python scripts/prepare_dataset.py --source label-studio-file --file annotations/raw/label_studio_export.json
"""

import argparse
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

# Ensure scripts/ is on sys.path so sibling imports work
sys.path.insert(0, str(SCRIPT_DIR))


def run_pipeline(
    source_mode,
    api_key=None,
    project_id=None,
    source_file=None,
    train_ratio=0.80,
    val_ratio=0.15,
    test_ratio=0.05,
    seed=42,
):
    image_dir = PROJECT_DIR / "bhee_clean_dataset"
    annotations_dir = PROJECT_DIR / "annotations"
    yolo_labels_dir = annotations_dir / "yolo_labels"
    dataset_dir = PROJECT_DIR / "dataset"

    # ── Step 1: Obtain raw annotations ──────────────────────────────────
    if source_mode == "label-studio":
        if not api_key or not project_id:
            print("Error: --api-key and --project-id are required for label-studio source")
            sys.exit(1)

        print("=" * 50)
        print("STEP 1: Exporting annotations from Label Studio")
        print("=" * 50)
        from export_annotations import export_annotations

        export_path = export_annotations(api_key, project_id, str(annotations_dir / "raw"))

        print("\n" + "=" * 50)
        print("STEP 2: Converting Label Studio JSON -> YOLO .txt")
        print("=" * 50)
        from convert_to_yolo import convert_label_studio_to_yolo, load_classes

        classes = load_classes()
        convert_label_studio_to_yolo(str(export_path), yolo_labels_dir, classes)

    elif source_mode == "label-studio-file":
        if not source_file:
            print("Error: --file is required for label-studio-file source")
            sys.exit(1)

        print("=" * 50)
        print("STEP 1: Skipped (using local JSON file)")
        print("=" * 50)

        print("\n" + "=" * 50)
        print("STEP 2: Converting Label Studio JSON -> YOLO .txt")
        print("=" * 50)
        from convert_to_yolo import convert_label_studio_to_yolo, load_classes

        classes = load_classes()
        convert_label_studio_to_yolo(source_file, yolo_labels_dir, classes)

    elif source_mode == "yolo-prelabels":
        raw_labels = annotations_dir / "raw"
        if not raw_labels.exists() or not list(raw_labels.glob("*.txt")):
            print(f"Error: No .txt label files found in {raw_labels}")
            print("Run auto_prelabel.py first.")
            sys.exit(1)

        print("=" * 50)
        print("STEP 1: Skipped (using pre-labeled YOLO files)")
        print("=" * 50)

        print("\n" + "=" * 50)
        print("STEP 2: Cleaning YOLO label files")
        print("=" * 50)
        from convert_to_yolo import clean_yolo_labels, load_classes

        classes = load_classes()
        clean_yolo_labels(raw_labels, yolo_labels_dir, classes)

    else:
        print(f"Unknown source mode: {source_mode}")
        sys.exit(1)

    # ── Step 3: Split into train/val/test ───────────────────────────────
    print("\n" + "=" * 50)
    print("STEP 3: Splitting dataset (train/val/test)")
    print("=" * 50)
    from split_dataset import split_dataset

    split_dataset(image_dir, yolo_labels_dir, dataset_dir, train_ratio, val_ratio, test_ratio, seed)

    # ── Step 4: Validate ────────────────────────────────────────────────
    print("\n" + "=" * 50)
    print("STEP 4: Validating final dataset")
    print("=" * 50)
    from validate_dataset import validate_dataset

    is_valid = validate_dataset(dataset_dir)

    # ── Done ────────────────────────────────────────────────────────────
    print("\n" + "=" * 50)
    if is_valid:
        print("PIPELINE COMPLETE — dataset is ready for training!")
    else:
        print("PIPELINE COMPLETE — review validation warnings above")
    print("=" * 50)
    print(f"\nDataset location: {dataset_dir}")
    print(f"YOLO config:      {dataset_dir / 'data.yaml'}")
    print(f"\nTo train:")
    print(f"  yolo detect train data={dataset_dir / 'data.yaml'} model=yolo11n.pt epochs=100 imgsz=640")

    return is_valid


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Full annotation-to-dataset pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Source modes:
  label-studio      Export from a running Label Studio instance (needs --api-key, --project-id)
  label-studio-file Use a previously exported Label Studio JSON file (needs --file)
  yolo-prelabels    Use YOLO .txt files from auto_prelabel.py (in annotations/raw/)
        """,
    )
    parser.add_argument(
        "--source",
        type=str,
        required=True,
        choices=["label-studio", "label-studio-file", "yolo-prelabels"],
        help="Where to get annotations from",
    )
    parser.add_argument("--api-key", type=str, help="Label Studio API key")
    parser.add_argument("--project-id", type=int, help="Label Studio project ID")
    parser.add_argument("--file", type=str, help="Path to Label Studio JSON export file")
    parser.add_argument("--train", type=float, default=0.80, help="Train ratio (default: 0.80)")
    parser.add_argument("--val", type=float, default=0.15, help="Val ratio (default: 0.15)")
    parser.add_argument("--test", type=float, default=0.05, help="Test ratio (default: 0.05)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed (default: 42)")

    args = parser.parse_args()
    run_pipeline(
        args.source,
        args.api_key,
        args.project_id,
        args.file,
        args.train,
        args.val,
        args.test,
        args.seed,
    )
