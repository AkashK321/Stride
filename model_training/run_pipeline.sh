#!/usr/bin/env bash
#
# Automated pipeline for BHEE image data collection & privacy anonymization.
#
# Usage:
#   ./run_pipeline.sh              # one-shot: process all images in bhee_raw_dataset/
#   ./run_pipeline.sh --watch      # watch mode: auto-process new images as they appear
#   ./run_pipeline.sh --force      # re-process every image (ignore cache)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
REQ_FILE="$SCRIPT_DIR/requirements.txt"
ANON_SCRIPT="$SCRIPT_DIR/anonymize_faces.py"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

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

# ── 4. Run the anonymization pipeline ──────────────────────────────────────
info "Starting face anonymization pipeline ..."
echo ""

python "$ANON_SCRIPT" "$@"

EXIT_CODE=$?
echo ""
if [ $EXIT_CODE -eq 0 ]; then
    info "Pipeline finished successfully"
else
    error "Pipeline exited with code $EXIT_CODE"
fi

exit $EXIT_CODE
