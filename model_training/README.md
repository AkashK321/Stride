# Model Training — Image Data Collection & Privacy Anonymization

Pipeline for Issue [#186](https://github.com/AkashK321/Stride/issues/186): capture raw BHEE hallway images and automatically anonymize faces for FERPA compliance before annotation.

## Directory Structure

```
model_training/
├── bhee_raw_dataset/       ← Drop your raw photos here
├── bhee_clean_dataset/     ← Anonymized images appear here automatically
├── logs/                   ← Processing logs
├── anonymize_faces.py      ← Core face-detection + blur script
├── run_pipeline.sh         ← One-command automation wrapper
├── requirements.txt        ← Python dependencies
└── README.md
```

## Quick Start

### 1. Add your raw images

Copy or move your raw BHEE hallway photos into `bhee_raw_dataset/`.
Supported formats: `.jpg`, `.jpeg`, `.png`, `.bmp`, `.tiff`, `.webp`

### 2. Run the pipeline (one command)

```bash
cd model_training
./run_pipeline.sh
```

This will:
- Create a Python virtual environment (first run only)
- Install all dependencies (first run only)
- Process every image in `bhee_raw_dataset/`
- Save anonymized versions to `bhee_clean_dataset/`

### 3. Watch mode (auto-process new images as you add them)

```bash
./run_pipeline.sh --watch
```

Polls every 2 seconds for new/changed images and processes them automatically. Press `Ctrl+C` to stop.

## How It Works

1. **Face Detection**: Uses MediaPipe Face Detection (full-range model) as the primary detector. Falls back to OpenCV Haar Cascades (frontal + profile) if MediaPipe is unavailable.
2. **Gaussian Blur**: Each detected face region is padded by 25% and blurred with a 99×99 kernel (σ=50), making faces completely unrecognizable.
3. **Manifest Cache**: A `.manifest.json` tracks file hashes so re-runs skip already-processed images. Use `--force` to override.

## CLI Options

| Flag | Description |
|------|-------------|
| `--input DIR` / `-i DIR` | Custom input directory (default: `bhee_raw_dataset/`) |
| `--output DIR` / `-o DIR` | Custom output directory (default: `bhee_clean_dataset/`) |
| `--watch` / `-w` | Watch mode — poll for new images continuously |
| `--interval N` | Poll interval in seconds for watch mode (default: 2.0) |
| `--force` / `-f` | Re-process all images, ignoring the manifest cache |

## Running the Script Directly (without the wrapper)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python anonymize_faces.py
```
