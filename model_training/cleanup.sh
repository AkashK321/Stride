#!/usr/bin/env bash
#
# Reset the pipeline — removes all generated outputs while keeping raw images,
# Roboflow export, and source code intact.
#
# Usage:
#   ./cleanup.sh          # interactive (asks for confirmation)
#   ./cleanup.sh --yes    # skip confirmation
#   ./cleanup.sh --all    # also delete roboflow_export/
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }

DELETE_EXPORT=false
SKIP_CONFIRM=false

for arg in "$@"; do
    case "$arg" in
        --all)       DELETE_EXPORT=true ;;
        --yes|-y)    SKIP_CONFIRM=true ;;
    esac
done

echo -e "${RED}This will delete all generated pipeline outputs:${NC}"
echo "  - bhee_clean_dataset/*       (anonymized images)"
echo "  - dataset/images/*/*         (split images)"
echo "  - dataset/labels/*/*         (split labels)"
echo "  - previews/                  (visualization previews)"
echo "  - logs/*                     (processing logs)"
if [ "$DELETE_EXPORT" = true ]; then
    echo "  - roboflow_export/           (Roboflow export — --all flag)"
fi
echo ""
echo -e "${GREEN}Preserved:${NC}"
echo "  - bhee_raw_dataset/*         (your original photos)"
if [ "$DELETE_EXPORT" = false ]; then
    echo "  - roboflow_export/           (Roboflow labeled export)"
fi
echo "  - scripts/, configs/, tests/ (source code)"
echo "  - .venv/                     (virtual environment)"
echo ""

if [ "$SKIP_CONFIRM" = false ]; then
    read -rp "Continue? [y/N] " confirm
    if [[ "$confirm" != [yY] ]]; then
        echo "Aborted."
        exit 0
    fi
fi

cd "$SCRIPT_DIR"

# Anonymized images
find bhee_clean_dataset -type f ! -name '.gitkeep' -delete 2>/dev/null || true
rm -f bhee_clean_dataset/.manifest.json 2>/dev/null || true
info "Cleaned bhee_clean_dataset/"

# Dataset splits
for split in train val test; do
    find "dataset/images/$split" -type f ! -name '.gitkeep' -delete 2>/dev/null || true
    find "dataset/labels/$split" -type f ! -name '.gitkeep' -delete 2>/dev/null || true
done
info "Cleaned dataset/"

# Previews
rm -rf previews 2>/dev/null || true
info "Cleaned previews/"

# Logs
find logs -type f ! -name '.gitkeep' -delete 2>/dev/null || true
info "Cleaned logs/"

# Roboflow export (only with --all)
if [ "$DELETE_EXPORT" = true ]; then
    rm -rf roboflow_export 2>/dev/null || true
    info "Cleaned roboflow_export/"
fi

echo ""
info "Cleanup complete — ready to re-run ./run_pipeline.sh"
