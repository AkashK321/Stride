#!/usr/bin/env bash
#
# Unified pipeline for BHEE model training data preparation.
#
# Two stages:
#   Stage 1 — Face anonymization (Issue #186)
#   Stage 2 — Import Roboflow labels, validate, preview (Issue #207)
#
# Workflow:
#   1. Drop raw photos into bhee_raw_dataset/
#   2. ./run_pipeline.sh --anonymize-only         # blur faces
#   3. Upload bhee_clean_dataset/ images to Roboflow, draw bounding boxes
#   4. Export from Roboflow as "YOLOv11" format, unzip into roboflow_export/
#   5. ./run_pipeline.sh --import-only            # import, validate, preview
#
# Or run everything at once (assumes Roboflow export is already in roboflow_export/):
#   ./run_pipeline.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
REQ_FILE="$SCRIPT_DIR/requirements.txt"
ANON_SCRIPT="$SCRIPT_DIR/anonymize_faces.py"
VALIDATE_SCRIPT="$SCRIPT_DIR/scripts/validate_dataset.py"
VISUALIZE_SCRIPT="$SCRIPT_DIR/scripts/visualize_labels.py"

ROBOFLOW_EXPORT_DIR="$SCRIPT_DIR/roboflow_export"
DATASET_DIR="$SCRIPT_DIR/dataset"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }
stage() { echo -e "\n${CYAN}══════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}══════════════════════════════════════════════════${NC}\n"; }

# ── Parse arguments ──────────────────────────────────────────────────────────
ANONYMIZE_ONLY=false
IMPORT_ONLY=false
WATCH_MODE=false
FORCE=false
EXTRA_ARGS=()

for arg in "$@"; do
    case "$arg" in
        --anonymize-only) ANONYMIZE_ONLY=true ;;
        --import-only)    IMPORT_ONLY=true ;;
        --watch|-w)       WATCH_MODE=true ;;
        --force|-f)       FORCE=true ;;
        *)                EXTRA_ARGS+=("$arg") ;;
    esac
done

# ── 1. Python 3 check ───────────────────────────────────────────────────────
PY=""
if command -v python3 &>/dev/null; then
    PY=python3
elif command -v python &>/dev/null; then
    PY=python
fi

if [ -z "$PY" ]; then
    error "Python 3 is required but not found. Install it first."
    exit 1
fi

PY_VERSION=$($PY --version 2>&1)
PY_MAJOR=$($PY -c "import sys; print(sys.version_info.major)" 2>/dev/null || echo "0")

if [ "$PY_MAJOR" != "3" ]; then
    error "Python 3 is required but found $PY_VERSION. Install Python 3."
    exit 1
fi

info "Found $PY_VERSION"

# ── 2. Virtual environment ──────────────────────────────────────────────────
if [ ! -d "$VENV_DIR" ]; then
    info "Creating virtual environment at $VENV_DIR ..."
    $PY -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
info "Activated venv: $VENV_DIR"

# ── 3. Install / upgrade dependencies ──────────────────────────────────────
HASH_FILE="$VENV_DIR/.req_hash"
CURRENT_HASH=$(shasum "$REQ_FILE" 2>/dev/null | awk '{print $1}')
STORED_HASH=""
[ -f "$HASH_FILE" ] && STORED_HASH=$(cat "$HASH_FILE")

if [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
    info "Installing dependencies from requirements.txt ..."
    pip install --quiet --upgrade pip
    pip install --quiet -r "$REQ_FILE"
    echo "$CURRENT_HASH" > "$HASH_FILE"
    info "Dependencies installed"
else
    info "Dependencies up to date"
fi

# ── 4. Watch mode (only anonymization, loops forever) ────────────────────────
if [ "$WATCH_MODE" = true ]; then
    stage "WATCH MODE — monitoring bhee_raw_dataset/ for new images"
    python "$ANON_SCRIPT" --watch "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"
    exit $?
fi

# ── 5. Stage 1: Face Anonymization ─────────────────────────────────────────
if [ "$IMPORT_ONLY" = false ]; then
    stage "STAGE 1: Face Anonymization (Issue #186)"
    info "Input:  $SCRIPT_DIR/bhee_raw_dataset/"
    info "Output: $SCRIPT_DIR/bhee_clean_dataset/"

    ANON_ARGS=()
    if [ "$FORCE" = true ]; then
        ANON_ARGS+=("--force")
    fi

    if ! python "$ANON_SCRIPT" "${ANON_ARGS[@]+"${ANON_ARGS[@]}"}" "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"; then
        error "Stage 1 failed — check logs/anonymize.log for details"
        exit 1
    fi
    info "Stage 1 complete — anonymized images in bhee_clean_dataset/"
fi

if [ "$ANONYMIZE_ONLY" = true ]; then
    echo ""
    stage "STAGE 1 COMPLETE"
    info "Next steps:"
    echo "  1. Upload images from bhee_clean_dataset/ to Roboflow"
    echo "  2. Draw bounding boxes around every door sign"
    echo "  3. Export as 'YOLOv11' format"
    echo "  4. Unzip the export into model_training/roboflow_export/"
    echo "  5. Run: ./run_pipeline.sh --import-only"
    exit 0
fi

# ── 6. Stage 2: Import Roboflow Export ─────────────────────────────────────
stage "STAGE 2: Import Roboflow Dataset (Issue #207)"

# Roboflow YOLO exports use train/valid/test (not val)
if [ ! -d "$ROBOFLOW_EXPORT_DIR" ]; then
    error "Roboflow export not found at: $ROBOFLOW_EXPORT_DIR"
    echo ""
    echo "  To set up:"
    echo "    1. Upload bhee_clean_dataset/ images to Roboflow"
    echo "    2. Draw bounding boxes around every door sign"
    echo "    3. Export as 'YOLOv11' format"
    echo "    4. Unzip into: model_training/roboflow_export/"
    echo "    5. Re-run: ./run_pipeline.sh --import-only"
    exit 1
fi

# Detect Roboflow's directory structure (valid vs val)
ROBOFLOW_VAL_NAME="valid"
if [ -d "$ROBOFLOW_EXPORT_DIR/val" ] && [ ! -d "$ROBOFLOW_EXPORT_DIR/valid" ]; then
    ROBOFLOW_VAL_NAME="val"
fi

info "Found Roboflow export at $ROBOFLOW_EXPORT_DIR"

# Clear old dataset
for split_dir in train val test; do
    rm -rf "$DATASET_DIR/images/$split_dir" 2>/dev/null || true
    rm -rf "$DATASET_DIR/labels/$split_dir" 2>/dev/null || true
    mkdir -p "$DATASET_DIR/images/$split_dir"
    mkdir -p "$DATASET_DIR/labels/$split_dir"
done

TOTAL_IMAGES=0

for ROBOFLOW_SPLIT in train "$ROBOFLOW_VAL_NAME" test; do
    SPLIT_SRC="$ROBOFLOW_EXPORT_DIR/$ROBOFLOW_SPLIT"

    # Map Roboflow's "valid" → our "val"
    if [ "$ROBOFLOW_SPLIT" = "valid" ]; then
        DEST_SPLIT="val"
    else
        DEST_SPLIT="$ROBOFLOW_SPLIT"
    fi

    if [ ! -d "$SPLIT_SRC" ]; then
        warn "Split '$ROBOFLOW_SPLIT' not found in export — skipping"
        continue
    fi

    # Roboflow puts images/ and labels/ inside each split
    IMG_SRC="$SPLIT_SRC/images"
    LBL_SRC="$SPLIT_SRC/labels"

    # Some exports put images and labels flat in the split dir
    if [ ! -d "$IMG_SRC" ]; then
        IMG_SRC="$SPLIT_SRC"
    fi
    if [ ! -d "$LBL_SRC" ]; then
        LBL_SRC="$SPLIT_SRC"
    fi

    IMG_COUNT=$(find "$IMG_SRC" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) 2>/dev/null | wc -l | tr -d ' ')

    if [ "$IMG_COUNT" -gt 0 ]; then
        cp "$IMG_SRC"/*.{jpg,jpeg,png} "$DATASET_DIR/images/$DEST_SPLIT/" 2>/dev/null || true
        cp "$LBL_SRC"/*.txt "$DATASET_DIR/labels/$DEST_SPLIT/" 2>/dev/null || true
        TOTAL_IMAGES=$((TOTAL_IMAGES + IMG_COUNT))
        info "$DEST_SPLIT: imported $IMG_COUNT images"
    else
        warn "$DEST_SPLIT: no images found in $IMG_SRC"
    fi
done

if [ "$TOTAL_IMAGES" -eq 0 ]; then
    error "No images found in Roboflow export. Check the directory structure."
    exit 1
fi

# Write data.yaml pointing to our local dataset
cat > "$DATASET_DIR/data.yaml" << 'YAML'
# YOLO dataset configuration for BHEE door sign detection
# Generated by run_pipeline.sh from Roboflow export

path: .
train: images/train
val: images/val
test: images/test

nc: 1
names:
  0: door_sign
YAML

info "Wrote dataset/data.yaml"

# Validate
stage "STAGE 2b: Validating Dataset"
if ! python "$VALIDATE_SCRIPT" --dataset "$DATASET_DIR"; then
    warn "Validation found issues — review warnings above"
fi

# Generate previews from the train split
stage "STAGE 2c: Generating Label Previews"
info "Drawing bounding boxes on training images for visual verification..."
python "$VISUALIZE_SCRIPT" \
    --images "$DATASET_DIR/images/train" \
    --labels "$DATASET_DIR/labels/train" \
    --output "$SCRIPT_DIR/previews"
info "Previews saved to previews/ — open them to verify labels are correct"

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
stage "PIPELINE COMPLETE"
info "YOLO dataset:   dataset/"
info "Label previews: previews/  ← check these to verify your labels"
info "YOLO config:    dataset/data.yaml"
echo ""
info "To train your YOLOv11n model:"
echo "  yolo detect train data=dataset/data.yaml model=yolo11n.pt epochs=100 imgsz=640"
echo ""
info "To reset and re-run:"
echo "  ./cleanup.sh && ./run_pipeline.sh"

exit 0
