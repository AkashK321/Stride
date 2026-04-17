"""
Landmarks for floor0

Authoring note: map landmark positions from the floor plan first, then apply
any global coordinate offset/rotation during upload.
"""

from __future__ import annotations

from .constants import landmark

LANDMARKS = [
    landmark("Room 016", -87, 17, nearest_node="hall_016", door_id="room_016"),
    landmark("Room 018", -93, 4, nearest_node="hall_018_020", door_id="room_018"),
    landmark("Room 020", -88, 0, nearest_node="hall_018_020", door_id="room_020"),
    landmark("Room 022", -80, 0, nearest_node="hall_022", door_id="room_022"),
    landmark("Room 024", -53, 0, nearest_node="hall_024", door_id="room_024"),
    landmark("Room 026", -35, 0, nearest_node="hall_026", door_id="room_026"),
    landmark("Room 030", 18, 0, nearest_node="hall_030", door_id="room_030"),
    landmark("Room 032", 26, 0, nearest_node="hall_032", door_id="room_032"),
    landmark("Room 034", 38, 0, nearest_node="hall_034", door_id="room_034"),
    landmark("Room 036", 52, 0, nearest_node="hall_036", door_id="room_036"),
    landmark("Room 038", 75, 0, nearest_node="hall_038", door_id="room_038"),
    landmark("Room 040", 89, 0, nearest_node="hall_040_042", door_id="room_040"),
    landmark("Room 042", 93, 4, nearest_node="hall_040_042", door_id="room_042"),
    landmark("Room 044", 87, 13, nearest_node="hall_044", door_id="room_044"),
    landmark("Room 046", 87, 21, nearest_node="hall_043_046", door_id="room_046"),
    landmark("Room 048", 87, 34, nearest_node="hall_048", door_id="room_048"),
    landmark("Room 050", 87, 44, nearest_node="hall_050", door_id="room_050"),
    landmark("Room 052", 87, 52, nearest_node="hall_052", door_id="room_052"),
    landmark("Room 054", 92, 90, nearest_node="hall_054", door_id="room_054"),
    landmark("Room 054B", 92, 78, nearest_node="hall_054b", door_id="room_054b"),
    landmark("Room 056", 98, 150, nearest_node="hall_056", door_id="room_056"),
    landmark("Room 056B", 93, 103, nearest_node="hall_056b", door_id="room_056b"),

    landmark("Room 005", -70, 68, nearest_node="hall_005", door_id="room_005"),
    landmark("Room 005B", -67, 62, nearest_node="hall_005", door_id="room_005b"),

    landmark("Room 007", -83, 98, nearest_node="hall_007", door_id="room_007"),
    landmark("Room 011", -79, 50, nearest_node="hall_011", door_id="room_011"),
    landmark("Room 013", -79, 29, nearest_node="hall_013", door_id="room_013"),
    landmark("Room 023", -60, 9, nearest_node="hall_023", door_id="room_023"),
    landmark("Room 029", 0, 9, nearest_node="hall_029", door_id="room_029"),
    landmark("Room 039", 66, 9, nearest_node="hall_039", door_id="room_039"),
    landmark("Room 043", 78, 22, nearest_node="hall_043_046", door_id="room_043"),
    landmark("Room 045", 78, 32, nearest_node="hall_045", door_id="room_045"),
    landmark("Room 047", 78, 49, nearest_node="hall_047", door_id="room_047"),
    landmark("Room 049", 78, 64, nearest_node="hall_049", door_id="room_049"),
    landmark("Room 051", 78, 77, nearest_node="hall_051", door_id="room_051"),
    landmark("Room 059", 82, 145, nearest_node="hall_059", door_id="room_059"),
    landmark("Room 061", 51, 108, nearest_node="hall_061", door_id="room_061"),
    landmark("Room 065", -2, 108, nearest_node="hall_069", door_id="room_069"),
    landmark("Room 069", -46, 108, nearest_node="hall_069", door_id="room_069"),
    landmark("Room 129", -38, 93, nearest_node="hall_129", door_id="room_129low"),


]
