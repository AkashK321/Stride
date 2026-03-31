# Model Training — Data Preparation Pipeline

End-to-end pipeline for preparing BHEE hallway images into a YOLOv11-formatted
training dataset. Covers [Issue #186](https://github.com/AkashK321/Stride/issues/186)
(privacy anonymization) and [Issue #207](https://github.com/AkashK321/Stride/issues/207)
(data annotation & labeling via Roboflow).

## Pipeline Overview

```
bhee_raw_dataset/        ──► Stage 1: Face Anonymization ──►  bhee_clean_dataset/
(raw photos)                 (MediaPipe / Haar Cascades)       (faces blurred)
                                                                     │
                                                          ┌──────────┘
                                                          ▼
                                                Upload to Roboflow
                                                Draw bounding boxes
                                                Export as YOLOv11
                                                          │
                                                          ▼
                                               roboflow_export/
                                                          │
                              Stage 2: Import ◄───────────┘
                              (validate + preview)
                                       │
                                       ▼
                              dataset/  (train/val/test)
                              Ready for YOLOv11 training
```

## Directory Structure

```
model_training/
├── bhee_raw_dataset/          ← Drop your raw photos here
├── bhee_clean_dataset/        ← Anonymized images (Stage 1 output)
├── roboflow_export/           ← Unzip your Roboflow export here
├── dataset/                   ← Final YOLO dataset (Stage 2 output)
│   ├── images/{train,val,test}/
│   ├── labels/{train,val,test}/
│   └── data.yaml
├── previews/                  ← Images with bounding boxes drawn (for verification)
├── configs/
│   └── classes.yaml           ← Class ontology (door_sign)
├── scripts/
│   ├── validate_dataset.py
│   └── visualize_labels.py
├── logs/                      ← Processing logs
├── tests/                     ← Unit & integration tests
├── anonymize_faces.py         ← Face detection + blur script
├── run_pipeline.sh            ← One-command automation
├── cleanup.sh                 ← Reset generated outputs
├── requirements.txt
└── README.md
```

## Quick Start

### Step 1: Anonymize raw images

```bash
cd model_training
./run_pipeline.sh --anonymize-only
```

This blurs any faces in `bhee_raw_dataset/` and saves clean images to `bhee_clean_dataset/`.

### Step 2: Label in Roboflow (manual)

1. Go to [Roboflow](https://roboflow.com) and create a project
2. Upload all images from `bhee_clean_dataset/`
3. Draw tight bounding boxes around every door sign (include the full sign shape, not just text)
4. Use class name: `door_sign`
5. Let Roboflow split into train/valid/test (or configure your own split)
6. Generate → Export as **YOLOv11** format → Download zip
7. Unzip into `model_training/roboflow_export/`

The export directory should look like:

```
roboflow_export/
├── train/
│   ├── images/
│   └── labels/
├── valid/          (or val/)
│   ├── images/
│   └── labels/
├── test/
│   ├── images/
│   └── labels/
└── data.yaml
```

### Step 3: Import, validate, and preview

```bash
./run_pipeline.sh --import-only
```

This copies the Roboflow export into `dataset/`, validates all labels, and generates
preview images in `previews/` with bounding boxes drawn so you can visually confirm
the labels are correct.

### Or run both stages at once

```bash
./run_pipeline.sh
```

(Requires the Roboflow export to already be in `roboflow_export/`.)

## CLI Options

| Flag | Description |
|------|-------------|
| `--anonymize-only` | Stage 1 only — anonymize faces |
| `--import-only` | Stage 2 only — import Roboflow export, validate, preview |
| `--force` / `-f` | Re-process all images (ignore anonymization cache) |
| `--watch` / `-w` | Watch mode — auto-anonymize new images as they appear |

## Augmentations

You do **not** need to augment images before training. YOLOv11 (Ultralytics) applies
augmentations on-the-fly during training — mosaic, mixup, HSV shifts, flips, scaling,
etc. Just provide your labeled images and YOLO handles the rest.

## Classes

| ID | Name | Description |
|----|------|-------------|
| 0 | `door_sign` | Any door sign in the BHEE building |

## Training

Once the dataset is validated:

```bash
yolo detect train data=dataset/data.yaml model=yolo11n.pt epochs=100 imgsz=640
```

## Cleanup

```bash
./cleanup.sh              # remove generated outputs (keeps raw images + Roboflow export)
./cleanup.sh --all        # also remove Roboflow export
./cleanup.sh --yes        # skip confirmation prompt
```

## Running Tests

```bash
cd model_training
pip install -r requirements.txt
pytest tests/ -v
```
