"""
Edges for floor0.

Authoring note: map edge connectivity/bearings from the floor plan first, then
apply any global coordinate offset/rotation during upload.
"""

from __future__ import annotations

from .constants import edge

EDGES = [
    # ==================================================================
    # MAIN HORIZONTAL HALLWAY (y=4.5, West to East)
    # ==================================================================
    
    # West end: hall_018_020 -> hall_022 (going East, 90°)
    # edge(start="hall_018_020", end="hall_022", bearing_deg=90, bidirectional=True),
    edge(start="corner_southwest", end="hall_022", bearing_deg=90, bidirectional=True),
    edge(start="hall_018_020", end="corner_southwest", bearing_deg=90, bidirectional=True),
    # hall_022 -> hall_023 (East, 90°)
    edge(start="hall_022", end="hall_023", bearing_deg=90, bidirectional=True),
    
    # hall_023 -> hall_024 (East, 90°)
    edge(start="hall_023", end="hall_024", bearing_deg=90, bidirectional=True),
    
    # hall_024 -> hall_026 (East, 90°)
    edge(start="hall_024", end="hall_026", bearing_deg=90, bidirectional=True),
    
    # hall_026 -> hall_029 (East, 90°)
    edge(start="hall_026", end="hall_029", bearing_deg=90, bidirectional=True),
    
    # hall_029 -> hall_030 (East, 90°)
    edge(start="hall_029", end="hall_030", bearing_deg=90, bidirectional=True),
    
    # hall_030 -> hall_032 (East, 90°)
    edge(start="hall_030", end="hall_032", bearing_deg=90, bidirectional=True),
    
    # hall_032 -> hall_034 (East, 90°)
    edge(start="hall_032", end="hall_034", bearing_deg=90, bidirectional=True),
    
    # hall_034 -> hall_036 (East, 90°)
    edge(start="hall_034", end="hall_036", bearing_deg=90, bidirectional=True),
    
    # hall_036 -> hall_039 (East, 90°)
    edge(start="hall_036", end="hall_039", bearing_deg=90, bidirectional=True),
    
    # hall_039 -> hall_038 (East, 90°)
    edge(start="hall_039", end="hall_038", bearing_deg=90, bidirectional=True),
    
    # hall_038 -> hall_040_042 (East, 90°)
    edge(start="hall_038", end="hall_040_042", bearing_deg=90, bidirectional=True),
    
    
    # ==================================================================
    # WEST VERTICAL HALLWAY (x=-83, South to North)
    # ==================================================================
    
    # edge(start="hall_018_020", end="hall_016", bearing_deg=0, bidirectional=True),

    # hall_016 -> hall_013 (going North, 0°)
    edge(start="hall_016", end="hall_013", bearing_deg=0, bidirectional=True),
    
    # hall_013 -> hall_011 (North, 0°)
    edge(start="hall_013", end="hall_011", bearing_deg=0, bidirectional=True),
    
    # hall_011 -> hall_005 (North, 0°)
    edge(start="hall_011", end="corner_rm005", bearing_deg=0, bidirectional=True),
    
    edge(start="corner_rm005", end="hall_007", bearing_deg=0, bidirectional=True),
    edge(start="corner_rm005", end="hall_005", bearing_deg=90, bidirectional=True),
    edge(start="hall_069", end="hall_065", bearing_deg=90, bidirectional=True),
    
    edge(start="corner_lobby_mid", end="hall_007", bearing_deg=90, bidirectional=True),
    edge(start="hall_007", end="corner_mid2", bearing_deg=90, bidirectional=True),

    
    
    # ==================================================================
    # EAST VERTICAL HALLWAY (x=82.5-89, South to North)
    # ==================================================================
    
    # hall_040_042 -> hall_044 (going North, 0°)
    # edge(start="hall_040_042", end="hall_044", bearing_deg=0, bidirectional=True),
    
    # hall_044 -> hall_043_046 (North, 0°)
    edge(start="hall_044", end="hall_043_046", bearing_deg=0, bidirectional=True),
    
    # hall_043_046 -> hall_045 (North, 0°)
    edge(start="hall_043_046", end="hall_045", bearing_deg=0, bidirectional=True),
    
    # hall_045 -> hall_048 (North, 0°)
    edge(start="hall_045", end="hall_048", bearing_deg=0, bidirectional=True),
    
    # hall_048 -> hall_050 (North, 0°)
    edge(start="hall_048", end="hall_050", bearing_deg=0, bidirectional=True),
    
    # hall_050 -> hall_047 (North, 0°)
    edge(start="hall_050", end="hall_047", bearing_deg=0, bidirectional=True),
    
    # hall_047 -> hall_052 (North, 0°)
    edge(start="hall_047", end="hall_052", bearing_deg=0, bidirectional=True),
    
    # hall_052 -> hall_049 (North, 0°)
    edge(start="hall_052", end="hall_049", bearing_deg=0, bidirectional=True),
    
    # hall_049 -> hall_051 (North, 0°)
    edge(start="hall_049", end="hall_051", bearing_deg=0, bidirectional=True),
    
    # hall_051 -> hall_054b (North, 0°)
    edge(start="hall_051", end="hall_054b", bearing_deg=0, bidirectional=True),
    
    # hall_054b -> hall_054 (North, 0°)
    edge(start="hall_054b", end="hall_054", bearing_deg=0, bidirectional=True),
    
    # hall_054 -> hall_056b (North, 0°)
    edge(start="hall_054", end="hall_056b", bearing_deg=0, bidirectional=True),
    
    # hall_056b -> hall_059 (North, 0°)
    edge(start="hall_056b", end="hall_059", bearing_deg=0, bidirectional=True),
    
    # hall_059 -> hall_056 (North, 0°)
    edge(start="hall_059", end="hall_056", bearing_deg=0, bidirectional=True),
    
    
    # ==================================================================
    # MIDDLE HORIZONTAL HALLWAY (y=103, West to East)
    # ==================================================================
    
    # hall_069 -> hall_065 (going East, 90°)
    edge(start="hall_069", end="hall_065", bearing_deg=90, bidirectional=True),
    
    # hall_065 -> hall_061 (East, 90°)
    edge(start="hall_065", end="hall_061", bearing_deg=90, bidirectional=True),
    
    # hall_061 -> hall_056b (East, 90°) - connects to vertical hallway
    edge(start="hall_061", end="hall_056b", bearing_deg=90, bidirectional=True),


    # ==================================================================
    # EXTRAS
    # ==================================================================
    edge(start="hall_069", end="corner_mid", bearing_deg=0, bidirectional=True),
    edge(start="corner_mid", end="corner_mid2", bearing_deg=0, bidirectional=True),
    edge(start="corner_mid2", end="hall_129", bearing_deg=90, bidirectional=True),
    edge(start="corner_lobby_mid", end="corner_lobby_south", bearing_deg=0, bidirectional=True),
    edge(start="corner_lobby_south", end="corner_lobby_west", bearing_deg=90, bidirectional=True),
    edge(start="corner_lobby_north", end="corner_lobby_mid", bearing_deg=0, bidirectional=True),
    edge(start="hall_129", end="corner_mid3", bearing_deg=0, bidirectional=True),
    
    edge(start="corner_rm005", end="hall_005", bearing_deg=0, bidirectional=True),
    edge(start="hall_016", end="corner_southwest", bearing_deg=180, bidirectional=True),
    edge(start="hall_044", end="corner_southeast", bearing_deg=0, bidirectional=True),




    
]   