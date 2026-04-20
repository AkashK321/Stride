"""
Landmarks for floor2_v2.

Authoring note: map landmark positions from the floor plan first, then apply
any global coordinate offset/rotation during upload.
"""

from __future__ import annotations

from .constants import landmark

LANDMARKS = [
    landmark("Room 206", -88, 116, nearest_node="room_206_207", door_id="room_206"),
    landmark("Room 207", -79, 116, nearest_node="room_206_207", door_id="room_207"),
    landmark("Room 208", -88, 106, nearest_node="room_208_209", door_id="room_208"),
    landmark("Room 209", -79, 106, nearest_node="room_208_209", door_id="room_209"),
]
