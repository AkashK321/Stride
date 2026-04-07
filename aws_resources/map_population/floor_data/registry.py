"""
Map data registry.

Single source of truth for which floor modules are populated.
"""

from __future__ import annotations

from typing import Any

from floor_data.floor2_v2 import FLOOR2_DATA_V2


def get_all_buildings_data() -> list[dict[str, Any]]:
    """Return all building payloads that should be populated."""
    return [FLOOR2_DATA_V2]

