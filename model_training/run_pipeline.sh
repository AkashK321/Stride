#!/usr/bin/env bash
#
# Unified pipeline for BHEE model training data preparation.
#
# Two stages:
#   Stage 1 — Face anonymization  (Issue #186)
#   Stage 2 — Auto pre-labeling & dataset preparation  (Issue #207)
#
# Usage:
#   ./run_pipeline.sh                          # run full pipeline (anonymize → label → split)
#   ./run_pipeline.sh --anonymize-only         # stage 1 only
#   ./run_pipeline.sh --annotate-only          # stage 2 only (assumes clean images exist)
#   ./run_pipeline.sh --force                  # re-process all images from scratch
#   ./run_pipeline.sh --watch                  # watch mode: auto-process new raw images
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
REQ_FILE="$SCRIPT_DIR/requirements.txt"
ANON_SCRIPT="$SCRIPT_DIR/anonymize_faces.py"
PRELABEL_SCRIPT="$SCRIPT_DIR/scripts/auto_prelabel.py"
PREPARE_SCRIPT="$SCRIPT_DIR/scripts/prepare_dataset.py"

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
ANNOTATE_ONLY=false
WATCH_MODE=false
FORCE=false
EXTRA_ARGS=()

for arg in "$@"; do
    case "$arg" in
        --anonymize-only) ANONYMIZE_ONLY=true ;;
        --annotate-only)  ANNOTATE_ONLY=true ;;
        --watch|-w)       WATCH_MODE=true ;;
        --force|-f)       FORCE=true ;;
        *)                EXTRA_ARGS+=("$arg") ;;
    esac
done

# ── 1. Python check ─────────────────────────────────────────────────────────
if command -v python3 &>/dev/null; then
    PY=python3
elif command -v python &>/dev/null; then
    PY=python
else
    error "Python 3 is required but not found. Install it first."
    exit 1
fi

PY_VERSION=$($PY --version 2>&1)
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

# ── 4. Watch mode (special: only anonymization, loops forever) ──────────────
if [ "$WATCH_MODE" = true ]; then
    stage "WATCH MODE — monitoring bhee_raw_dataset/ for new images"
    python "$ANON_SCRIPT" --watch "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"
    exit $?
fi

# ── 5. Stage 1: Face Anonymization ─────────────────────────────────────────
if [ "$ANNOTATE_ONLY" = false ]; then
    stage "STAGE 1: Face Anonymization (Issue #186)"
    info "Input:  $SCRIPT_DIR/bhee_raw_dataset/"
    info "Output: $SCRIPT_DIR/bhee_clean_dataset/"

    ANON_ARGS=()
    if [ "$FORCE" = true ]; then
        ANON_ARGS+=("--force")
    fi

    python "$ANON_SCRIPT" "${ANON_ARGS[@]+"${ANON_ARGS[@]}"}" "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"

    ANON_EXIT=$?
    if [ $ANON_EXIT -ne 0 ]; then
        error "Stage 1 failed (exit code $ANON_EXIT)"
        exit $ANON_EXIT
    fi
    info "Stage 1 complete — anonymized images in bhee_clean_dataset/"
fi

# ── 6. Stage 2: Auto Pre-Labeling & Dataset Preparation ───────────────────
if [ "$ANONYMIZE_ONLY" = false ]; then
    stage "STAGE 2: Auto Pre-Labeling & Dataset Preparation (Issue #207)"

    CLEAN_DIR="$SCRIPT_DIR/bhee_clean_dataset"
    IMAGE_COUNT=$(find "$CLEAN_DIR" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.bmp" -o -iname "*.tiff" -o -iname "*.webp" \) 2>/dev/null | wc -l | tr -d ' ')

    if [ "$IMAGE_COUNT" -eq 0 ]; then
        warn "No images found in bhee_clean_dataset/ — skipping Stage 2"
        warn "Add raw images to bhee_raw_dataset/ and run again, or run Stage 1 first"
        exit 0
    fi

    info "Found $IMAGE_COUNT clean images to process"

    # Step 2a: Auto pre-label with YOLO-World
    info "Running auto pre-labeling with YOLO-World zero-shot detection..."
    python "$PRELABEL_SCRIPT" --images "$CLEAN_DIR"

    # Step 2b: Prepare the full dataset (clean labels → split → validate)
    info "Preparing final YOLO dataset (clean → split → validate)..."
    python "$PREPARE_SCRIPT" --source yolo-prelabels

    PREP_EXIT=$?
    if [ $PREP_EXIT -ne 0 ]; then
        error "Stage 2 failed (exit code $PREP_EXIT)"
        exit $PREP_EXIT
    fi
    info "Stage 2 complete — YOLO dataset ready in dataset/"
fi

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
stage "PIPELINE COMPLETE"
info "Anonymized images: bhee_clean_dataset/"
info "YOLO dataset:      dataset/"
info "YOLO config:       dataset/data.yaml"
echo ""
info "To train your model:"
echo "  yolo detect train data=dataset/data.yaml model=yolo11n.pt epochs=100 imgsz=640"
echo ""
info "To review/correct labels in Label Studio:"
echo "  python scripts/setup_label_studio.py"

exit 0
