"""
Floor 0 map data package.
"""

from __future__ import annotations

from .constants import (
    BUILDING_ID,
    BUILDING_NAME,
    FLOOR_NUMBER,
    MAP_IMAGE_URL,
    MAP_SCALE_RATIO,
)
from .edges import EDGES
from .landmarks import LANDMARKS
from .nodes import NODES

FLOOR0_DATA = {
    "building_id": BUILDING_ID,
    "building_name": BUILDING_NAME,
    "floors": [
        {
            "floor_number": FLOOR_NUMBER,
            "map_image_url": MAP_IMAGE_URL,
            "map_scale_ratio": MAP_SCALE_RATIO,
            "nodes": NODES,
            "edges": EDGES,
            "landmarks": LANDMARKS,
        }
    ],
}

# Backward-compatible alias for any legacy references.
FLOOR2_DATA_V2 = FLOOR0_DATA

