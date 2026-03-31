# Model Training — Data Preparation Pipeline

End-to-end pipeline for preparing BHEE hallway images into a YOLO-formatted training dataset.
Covers both [Issue #186](https://github.com/AkashK321/Stride/issues/186) (privacy anonymization) and [Issue #207](https://github.com/AkashK321/Stride/issues/207) (data annotation & labeling).

## Pipeline Overview

```
bhee_raw_dataset/          ──► Stage 1: Face Anonymization ──►  bhee_clean_dataset/
(raw photos)                   (MediaPipe / Haar Cascades)       (faces blurred)
                                                                       │
                                                                       ▼
                               Stage 2a: Auto Pre-Label  ◄─────────────┘
                               (YOLO-World zero-shot)
                                       │
                                       ▼
                               Stage 2b: Prepare Dataset
                               (clean → split → validate)
                                       │
                                       ▼
                               dataset/  (train/val/test)
                               Ready for YOLO training
```

## Directory Structure

```
model_training/
├── bhee_raw_dataset/          ← Drop your raw photos here
├── bhee_clean_dataset/        ← Anonymized images (Stage 1 output → Stage 2 input)
├── annotations/
│   ├── raw/                   ← Auto-generated YOLO labels + Label Studio JSON
│   └── yolo_labels/           ← Final cleaned YOLO .txt labels
├── dataset/                   ← Split YOLO dataset (Stage 2 output)
│   ├── images/{train,val,test}/
│   ├── labels/{train,val,test}/
│   └── data.yaml
├── configs/
│   └── classes.yaml           ← Class ontology (door_sign)
├── scripts/                   ← Annotation & labeling scripts
│   ├── auto_prelabel.py
│   ├── setup_label_studio.py
│   ├── export_annotations.py
│   ├── convert_to_yolo.py
│   ├── split_dataset.py
│   ├── prepare_dataset.py
│   └── validate_dataset.py
├── logs/                      ← Processing logs
├── tests/                     ← Unit & integration tests
├── anonymize_faces.py         ← Face detection + blur script
├── run_pipeline.sh            ← One-command automation
├── requirements.txt
└── README.md
```

## Quick Start

### 1. Add your raw images

Copy your raw BHEE hallway photos into `bhee_raw_dataset/`.
Supported formats: `.jpg`, `.jpeg`, `.png`, `.bmp`, `.tiff`, `.webp`

### 2. Run the full pipeline (one command)

```bash
cd model_training
./run_pipeline.sh
```

This runs both stages automatically:
- **Stage 1**: Detects and blurs faces in all raw images → saves to `bhee_clean_dataset/`
- **Stage 2**: Runs YOLO-World zero-shot detection to auto-label door signs → splits into train/val/test → validates

### 3. Run individual stages

```bash
./run_pipeline.sh --anonymize-only    # Stage 1 only (face blurring)
./run_pipeline.sh --annotate-only     # Stage 2 only (assumes clean images exist)
./run_pipeline.sh --force             # Re-process everything from scratch
./run_pipeline.sh --watch             # Watch mode: auto-anonymize new images as they appear
```

## Stage 1: Face Anonymization (Issue #186)

Uses MediaPipe Face Detection (full-range model) as the primary detector with OpenCV Haar Cascades as fallback. Each detected face is padded by 25% and blurred with a 99x99 Gaussian kernel, making faces completely unrecognizable for FERPA compliance.

A `.manifest.json` tracks file hashes so re-runs skip already-processed images.

### Running directly

```bash
python anonymize_faces.py                          # process all
python anonymize_faces.py --input DIR --output DIR  # custom directories
python anonymize_faces.py --watch                   # watch mode
python anonymize_faces.py --force                   # ignore cache
```

## Stage 2: Annotation & Labeling (Issue #207)

### Step 2a: Auto Pre-Label

Uses YOLO-World's open-vocabulary zero-shot detection to find "door sign" in images without any training. Generates YOLO `.txt` labels and Label Studio import JSON.

```bash
python scripts/auto_prelabel.py
python scripts/auto_prelabel.py --confidence 0.2 --model-size m
```

### Step 2b: Review in Label Studio (optional)

Launch the annotation UI to review and correct the auto-generated boxes:

```bash
python scripts/setup_label_studio.py
python scripts/setup_label_studio.py --api-key YOUR_KEY --no-launch --import-predictions
```

### Step 2c: Prepare Final Dataset

```bash
# Using auto pre-labels directly
python scripts/prepare_dataset.py --source yolo-prelabels

# From Label Studio
python scripts/prepare_dataset.py --source label-studio --api-key KEY --project-id 1

# From exported JSON
python scripts/prepare_dataset.py --source label-studio-file --file annotations/raw/label_studio_export.json
```

### Validate

```bash
python scripts/validate_dataset.py
```

## Classes

| ID | Name | Description |
|----|------|-------------|
| 0 | `door_sign` | Any door sign in the BHEE building |

## Training (Next Step)

Once the dataset is prepared:

```bash
yolo detect train data=dataset/data.yaml model=yolo11n.pt epochs=100 imgsz=640
```

## Running Tests

```bash
cd model_training
pip install -r requirements.txt
pytest tests/ -v
```
