"""
Edges for floor2_v2.
"""

from __future__ import annotations

from .constants import edge

EDGES = [
    # n_west_116 -> n_west_106: 0 deg (north), reverse: 180 deg (south)
    edge(start="room_206_207", end="room_208_209", bearing_deg=0, bidirectional=True),
]
