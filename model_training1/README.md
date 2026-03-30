# BHEE Door Sign Dataset — Annotation & Labeling Pipeline

Prepares a YOLO-formatted training dataset from cleaned BHEE building images.
Part of the two-stage navigation pipeline where the object detector identifies
door signs in camera frames (Stage 1), and a separate OCR/matching step reads
them (Stage 2).

## Quick Start

```bash
cd model_training
pip install -r requirements.txt
```

## Directory Structure

```
model_training/
├── bhee_clean_dataset/        # Raw cleaned images (input)
├── annotations/
│   ├── raw/                   # Auto-generated YOLO labels + Label Studio JSON
│   └── yolo_labels/           # Final cleaned YOLO .txt labels
├── dataset/                   # Split YOLO dataset (output)
│   ├── images/{train,val,test}/
│   ├── labels/{train,val,test}/
│   └── data.yaml
├── configs/
│   └── classes.yaml           # Class ontology
├── scripts/                   # All pipeline scripts
├── requirements.txt
└── README.md
```

## Workflow

### Step 1: Auto Pre-Label Images

Uses YOLO-World (zero-shot object detection) to automatically detect door signs
and generate initial bounding box annotations. No training required — the model
understands the text prompt "door sign."

```bash
python scripts/auto_prelabel.py
```

Options:
- `--confidence 0.2` — raise threshold if too many false positives (default: 0.15)
- `--model-size m` — use a larger model for better accuracy (`s`, `m`, `l`)

This creates:
- `annotations/raw/*.txt` — YOLO-format label files (one per image)
- `annotations/label_studio_predictions.json` — for Label Studio import

### Step 2: Review & Correct in Label Studio

Launch the annotation UI to review the auto-generated boxes:

```bash
# Start Label Studio
python scripts/setup_label_studio.py

# After creating an account and copying your API key:
python scripts/setup_label_studio.py --api-key YOUR_KEY --no-launch --import-predictions
```

In Label Studio:
1. Open each image
2. Verify/adjust the pre-drawn bounding boxes
3. Delete false positives, add missed signs
4. Submit each annotation

**Bounding box rules:**
- Encompass the **entire** physical sign (shape + mounting context)
- Do NOT just box the text
- Keep boxes tight but fully encompassing

### Step 3: Prepare the Final Dataset

After finishing annotation review, run the full pipeline:

```bash
# Option A: Export from Label Studio and build dataset
python scripts/prepare_dataset.py --source label-studio --api-key YOUR_KEY --project-id 1

# Option B: Use auto pre-labels directly (if you reviewed them outside Label Studio)
python scripts/prepare_dataset.py --source yolo-prelabels

# Option C: Use a previously exported Label Studio JSON
python scripts/prepare_dataset.py --source label-studio-file --file annotations/raw/label_studio_export.json
```

This will:
1. Convert annotations to clean YOLO .txt format
2. Split into train (80%) / val (15%) / test (5%)
3. Validate everything and print a report

### Step 4: Verify

Run validation independently at any time:

```bash
python scripts/validate_dataset.py
```

## Individual Scripts

| Script | Purpose |
|--------|---------|
| `auto_prelabel.py` | Zero-shot detection to generate initial bounding boxes |
| `setup_label_studio.py` | Launch and configure Label Studio for annotation |
| `export_annotations.py` | Pull completed annotations from Label Studio API |
| `convert_to_yolo.py` | Convert Label Studio JSON or clean YOLO .txt files |
| `split_dataset.py` | Split images+labels into train/val/test |
| `validate_dataset.py` | Check dataset integrity, report statistics |
| `prepare_dataset.py` | One-command orchestration of the full pipeline |

## Classes

Currently a single class:

| ID | Name | Description |
|----|------|-------------|
| 0 | `door_sign` | Any door sign in the BHEE building |

## YOLO Label Format

Each `.txt` file has one line per detected object:

```
<class_id> <x_center> <y_center> <width> <height>
```

All coordinates are normalized to `[0, 1]` relative to image dimensions.

## Training (Next Step)

Once the dataset is prepared:

```bash
yolo detect train data=dataset/data.yaml model=yolo11n.pt epochs=100 imgsz=640
```
