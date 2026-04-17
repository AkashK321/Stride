"""
Edges for floor2_v2.

Authoring note: map edge connectivity/bearings from the floor plan first, then
apply any global coordinate offset/rotation during upload.
"""

from __future__ import annotations

from .constants import edge

EDGES = [
    # ==================================================================
    # WEST VERTICAL HALLWAY (x=-83.5, South to North)
    # ==================================================================
    
    # hall_220_222 -> hall_218_mens (going North, 0°)
    edge(start="hall_220_222", end="hall_218_mens", bearing_deg=0, bidirectional=True),
    
    # hall_218_mens -> hall_221 (North, 0°)
    edge(start="hall_218_mens", end="hall_221", bearing_deg=0, bidirectional=True),
    
    # hall_221 -> hall_217 (North, 0°)
    edge(start="hall_221", end="hall_217", bearing_deg=0, bidirectional=True),
    
    # hall_217 -> hall_216 (North, 0°)
    edge(start="hall_217", end="hall_216", bearing_deg=0, bidirectional=True),
    
    # hall_216 -> hall_214 (North, 0°)
    edge(start="hall_216", end="hall_214", bearing_deg=0, bidirectional=True),
    
    # hall_214 -> hall_vend_215 (North, 0°)
    edge(start="hall_214", end="hall_vend_215", bearing_deg=0, bidirectional=True),
    
    # hall_vend_215 -> hall_2s03_211 (North, 0°)
    edge(start="hall_vend_215", end="hall_2s03_211", bearing_deg=0, bidirectional=True),
    
    # hall_2s03_211 -> room_208_209 (North, 0°)
    edge(start="hall_2s03_211", end="hall_208_209", bearing_deg=0, bidirectional=True),
    
    # room_208_209 -> room_206_207 (North, 0°)
    edge(start="hall_208_209", end="hall_206_207", bearing_deg=0, bidirectional=True),
    
    
    # ==================================================================
    # MAIN HORIZONTAL HALLWAY (y=4.5, West to East)
    # ==================================================================
    
    # Connect west vertical to main horizontal
    edge(start="hall_220_222", end="hall_225", bearing_deg=90, bidirectional=True),
    
    # hall_225 -> hall_224 (going East, 90°)
    edge(start="hall_225", end="hall_224", bearing_deg=90, bidirectional=True),
    
    # hall_224 -> hall_226 (East, 90°)
    edge(start="hall_224", end="hall_226", bearing_deg=90, bidirectional=True),
    
    # hall_226 -> staircase_main_2s01 (East, 90°)
    edge(start="hall_226", end="staircase_main_2s01", bearing_deg=90, bidirectional=True),
    
    # staircase_main_2s01 -> hall_230 (East, 90°)
    edge(start="staircase_main_2s01", end="hall_230", bearing_deg=90, bidirectional=True),
    
    # hall_230 -> hall_232 (East, 90°)
    edge(start="hall_230", end="hall_232", bearing_deg=90, bidirectional=True),
    
    # hall_232 -> hall_234 (East, 90°)
    edge(start="hall_232", end="hall_234", bearing_deg=90, bidirectional=True),
    
    # hall_234 -> hall_236_237 (East, 90°)
    edge(start="hall_234", end="hall_236_237", bearing_deg=90, bidirectional=True),
    
    # hall_236_237 -> corner_southeast (East, 90°)
    edge(start="hall_236_237", end="corner_southeast", bearing_deg=90, bidirectional=True),
    
    
    # ==================================================================
    # EAST VERTICAL HALLWAY (x=83, South to North)
    # ==================================================================
    
    # corner_southeast -> hall_240_2e01 (going North, 0°)
    edge(start="corner_southeast", end="hall_240_2e01", bearing_deg=0, bidirectional=True),
    
    # hall_240_2e01 -> hall_240a_241 (North, 0°)
    edge(start="hall_240_2e01", end="hall_240a_241", bearing_deg=0, bidirectional=True),
    
    # hall_240a_241 -> hall_MSEEcrossing (North, 0°)
    edge(start="hall_240a_241", end="hall_MSEEcrossing", bearing_deg=0, bidirectional=True),
    
    # hall_MSEEcrossing -> hall_241a (North, 0°)
    edge(start="hall_MSEEcrossing", end="hall_241a", bearing_deg=0, bidirectional=True),
    
    # hall_241a -> hall_242 (North, 0°)
    edge(start="hall_241a", end="hall_242", bearing_deg=0, bidirectional=True),
    
    # hall_242 -> hall_244 (North, 0°)
    edge(start="hall_242", end="hall_244", bearing_deg=0, bidirectional=True),
    
    # hall_244 -> staircase_east_2S02 (North, 0°)
    edge(start="hall_244", end="staircase_east_2S02", bearing_deg=0, bidirectional=True),
    
    # staircase_east_2S02 -> hall_restrooms (North, 0°)
    edge(start="staircase_east_2S02", end="hall_restrooms", bearing_deg=0, bidirectional=True),
    
    # hall_restrooms -> hall_offices (North, 0°)
    edge(start="hall_restrooms", end="hall_offices", bearing_deg=0, bidirectional=True),
]