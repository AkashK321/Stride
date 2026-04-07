"""
Landmarks for floor2_v2.
"""

from __future__ import annotations

from .constants import landmark

LANDMARKS = [
    landmark("Room 206", -88, 116, nearest_node="n_west_116", door_id="room_206"),
    landmark("Room 207", -79, 116, nearest_node="n_west_116", door_id="room_207"),
    landmark("Room 208", -88, 106, nearest_node="n_west_106", door_id="room_208"),
    landmark("Room 209", -79, 106, nearest_node="n_west_106", door_id="room_209"),
]
