"""
Edges for floor2_v2.
"""

from __future__ import annotations

from .constants import edge

EDGES = [
    # n_west_116 -> n_west_106: 0 deg (north), reverse: 180 deg (south)
    edge(start="n_west_116", end="n_west_106", bearing_deg=0, bidirectional=True),
]
