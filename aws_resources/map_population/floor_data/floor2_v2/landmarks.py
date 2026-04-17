"""
Landmarks for floor2_v2.

Authoring note: map landmark positions from the floor plan first, then apply
any global coordinate offset/rotation during upload.
"""

from __future__ import annotations

from .constants import landmark

LANDMARKS = [
    # West vertical hallway (x=-83.5)
    landmark("Room 206", -88, 116, nearest_node="hall_206_207", door_id="room_206"),
    landmark("Room 207", -79, 116, nearest_node="hall_206_207", door_id="room_207"),
    landmark("Room 208", -88, 106, nearest_node="hall_208_209", door_id="room_208"),
    landmark("Room 209", -79, 106, nearest_node="hall_208_209", door_id="room_209"),
    landmark("Hallway B Side", -88, 80, nearest_node="hall_Bside", door_id="hallway_Bside"),
    landmark("West Staircase 2S03", -88, 73, nearest_node="hall_2s03_211", door_id="staircase_2S03"),
    landmark("Room 211", -79, 73, nearest_node="hall_2s03_211", door_id="room_211"),

    landmark("Vending Machine", -88, 64, nearest_node="hall_vend_215", door_id="vending_west"),
    landmark("Room 215", -79, 64, nearest_node="hall_vend_215", door_id="room_215"),
    landmark("Room 214", -88, 47, nearest_node="hall_214", door_id="room_214"),
    landmark("Room 216", -88, 43, nearest_node="hall_216", door_id="room_216"),
    landmark("Room 217", -79, 35, nearest_node="hall_217", door_id="room_217"),
    landmark("Room 221", -79, 21, nearest_node="hall_221", door_id="room_221"),
    landmark("Room 218", -88, 14, nearest_node="hall_218_mens", door_id="room_218"),
    landmark("Mens Restroom", -79, 14, nearest_node="hall_218_mens", door_id="room_219"),
    landmark("Room 220", -88, 6, nearest_node="hall_220_222", door_id="room_220"),
    landmark("Room 222", -83, 0, nearest_node="hall_220_222", door_id="room_222"),
    
    # Main horizontal hallway (y=4.5)
    landmark("Room 225", -60, 9, nearest_node="hall_225", door_id="room_225"),
    landmark("Room 224", -54, 0, nearest_node="hall_224", door_id="room_224"),
    landmark("Room 226", -28, 0, nearest_node="hall_226", door_id="room_226"),
    landmark("Main Staircase 2S01", 0, 0, nearest_node="staircase_main_2s01", door_id="staircase_2S01"),
    landmark("Room 230", 18, 0, nearest_node="hall_230", door_id="room_230"),
    landmark("Room 232", 27, 0, nearest_node="hall_232", door_id="room_232"),
    landmark("Room 234", 38, 0, nearest_node="hall_234", door_id="room_234"),
    landmark("Room 236", 64, 0, nearest_node="hall_236_237", door_id="room_236"),
    landmark("Room 237", 64, 9, nearest_node="hall_236_237", door_id="room_237"),
    landmark("Room 238", 88, 4.5, nearest_node="corner_southeast", door_id="room_238"),
    
    # East vertical hallway (x=83)
    landmark("Room 240", 88, 14, nearest_node="hall_240_2e01", door_id="room_240"),
    landmark("East Elevator 2E01", 78, 15, nearest_node="hall_240_2e01", door_id="elevator_2E01"),
    landmark("Room 240A", 88, 21, nearest_node="hall_240a_241", door_id="room_240a"),
    landmark("Room 241", 78, 22, nearest_node="hall_240a_241", door_id="room_241"),
    landmark("MSEE Crossing", 88, 30, nearest_node="hall_MSEEcrossing", door_id="msee_crossing"),
    landmark("Room 241A", 78, 37, nearest_node="hall_241a", door_id="room_241a"),
    landmark("Room 242", 88, 45, nearest_node="hall_242", door_id="room_242"),
    landmark("Room 244", 88, 52, nearest_node="hall_244", door_id="room_244"),
    landmark("East Staircase 2S02", 88, 65, nearest_node="staircase_east_2S02", door_id="staircase_2S03"),
    landmark("Mens Restroom", 88, 83, nearest_node="hall_restrooms", door_id="room_245"),
    landmark("Womens Restroom", 88, 73, nearest_node="hall_restrooms", door_id="room_243"),
    landmark("Offices Wing", 83, 96, nearest_node="hall_offices", door_id="office_wing"),
]