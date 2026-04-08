"""
Edges for floor2_v2.

Authoring note: map edge connectivity/bearings from the floor plan first, then
apply any global coordinate offset/rotation during upload.
"""

from __future__ import annotations

from .constants import edge

EDGES = [
    # n_west_116 -> n_west_106: 0 deg (north), reverse: 180 deg (south)
    edge(start="hall030", end="hall040_042", bearing_deg=0, bidirectional=True),
]
