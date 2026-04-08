"""
Landmarks for floor0

Authoring note: map landmark positions from the floor plan first, then apply
any global coordinate offset/rotation during upload.
"""

from __future__ import annotations

from .constants import landmark

LANDMARKS = [
    landmark("Room 030", 18, 4.5, nearest_node="hall_030", door_id="room_030"),
    landmark("Room 032", 26, 4.5, nearest_node="hall_032", door_id="room_032"),
    landmark("Room 034", 38, 4.5, nearest_node="hall_034", door_id="room_034"),
    landmark("Room 036", 52, 4.5, nearest_node="hall_036", door_id="room_036"),
    landmark("Room 038", 75, 4.5, nearest_node="hall_038", door_id="room_038"),
    landmark("Room 040", 89, 4.5, nearest_node="hall_040_042", door_id="room_040"),
    landmark("Room 042", 89, 4.5, nearest_node="hall_040_042", door_id="room_042")
]
