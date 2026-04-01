#!/usr/bin/env python3
"""Download generic yolo11n.pt for local testing (same asset as SageMaker Docker image)."""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

# Ensure inference_core is importable when run as script
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from app.inference_core import DEFAULT_MODEL_URL, default_cache_model_path  # noqa: E402


def main() -> int:
    dest = default_cache_model_path()
    if dest.is_file():
        print(f"Already present: {dest}")
        return 0
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {DEFAULT_MODEL_URL} -> {dest}")
    urllib.request.urlretrieve(DEFAULT_MODEL_URL, dest)
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
