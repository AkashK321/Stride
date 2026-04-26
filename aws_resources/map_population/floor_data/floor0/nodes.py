"""
Nodes for floor0.

Authoring note: map node coordinates from the floor plan first, then apply any
global coordinate offset/rotation during upload.
"""


from __future__ import annotations

from .constants import DoorRef, DoorSideByBearing, HallwayPointNode, IntersectionRef


NODES = [
    
    HallwayPointNode(
        id="hall_016",
        x_feet= -83,
        y_feet= 17,
        doors=[
            DoorRef(
                id="room_016",
                label="Room 016",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="right"),  # 51 degrees
                    DoorSideByBearing(bearing_deg=180, side="left"),  
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_018_020",
        x_feet= -89,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_020",
                label="Room 020",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                ],
            ),
            DoorRef(
                id="room_018",
                label="Room 018",

                # TODO: HOW TO MAP THIS? 
                # 042 is straight from this node, no turn is needed.

                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="left"),
                ],
            ),
        ],
    ).asdict(),
     HallwayPointNode(
        id="hall_022",
        x_feet= -80,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_022",
                label="Room 022",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_024",
        x_feet= -53,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_024",
                label="Room 024",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_026",
        x_feet= -35,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_026",
                label="Room 026",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),

    HallwayPointNode(
        id="hall_030",
        x_feet= 18,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_030",
                label="Room 030",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_032",
        x_feet= 26,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_032",
                label="Room 032",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_034",
        x_feet= 38,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_034",
                label="Room 034",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_036",
        x_feet= 52,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_036",
                label="Room 036",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_038",
        x_feet= 75,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_038",
                label="Room 038",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_040_042",
        x_feet= 89,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_040",
                label="Room 040",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=90, side="right"),
                ],
            ),
            DoorRef(
                id="room_042",
                label="Room 042",

                # TODO: HOW TO MAP THIS? 
                # 042 is straight from this node, no turn is needed.

                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=90, side="left"),
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_044",
        x_feet= 82.5,
        y_feet= 13,
        doors=[
            DoorRef(
                id="room_044",
                label="Room 044",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="right"), 
                    DoorSideByBearing(bearing_deg=0, side="left"), 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_043_046",
        x_feet= 82.5,
        y_feet= 21,
        doors=[
            DoorRef(
                id="room_046",
                label="Room 046",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="right"), 
                    DoorSideByBearing(bearing_deg=0, side="left"), 
                ],
            ),
            DoorRef(
                id="room_043",
                label="Room 043",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="right"), 
                    DoorSideByBearing(bearing_deg=180, side="left"), 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_048",
        x_feet= 82.5,
        y_feet= 34,
        doors=[
            DoorRef(
                id="room_048",
                label="Room 048",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="right"), 
                    DoorSideByBearing(bearing_deg=0, side="left"), 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_050",
        x_feet= 82.5,
        y_feet= 44,
        doors=[
            DoorRef(
                id="room_050",
                label="Room 050",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="right"), 
                    DoorSideByBearing(bearing_deg=0, side="left"), 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_052",
        x_feet= 82.5,
        y_feet= 52,
        doors=[
            DoorRef(
                id="room_052",
                label="Room 052",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="right"), 
                    DoorSideByBearing(bearing_deg=0, side="left"), 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_054",
        x_feet= 89,
        y_feet= 90,
        doors=[
            DoorRef(
                id="room_054",
                label="Room 054",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="right"), 
                    DoorSideByBearing(bearing_deg=0, side="left"), 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_054b",
        x_feet= 89,
        y_feet= 78,
        doors=[
            DoorRef(
                id="room_054b",
                label="Room 054B",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="right"), 
                    DoorSideByBearing(bearing_deg=0, side="left"), 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_056",
        x_feet= 89,
        y_feet= 150,
        doors=[
            DoorRef(
                id="room_056",
                label="Room 056",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"), 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_056b",
        x_feet= 87,
        y_feet= 100,
        doors=[
            DoorRef(
                id="room_056b",
                label="Room 056b",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="right"), 
                    DoorSideByBearing(bearing_deg=0, side="left"), 
                ],
            ),
        ],
    ).asdict(),

    # LEFT side of the hallway 

    HallwayPointNode(
        id="hall_023",
        x_feet= -60,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_023",
                label="Room 023",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="left"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="right"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
        HallwayPointNode(
        id="hall_029",
        x_feet= 0,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_029",
                label="Room 029",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="left"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="right"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_039",
        x_feet= 66,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_039",
                label="Room 039",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="left"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="right"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_059",
        x_feet= 87,
        y_feet= 145,
        doors=[
            DoorRef(
                id="room_059",
                label="Room 059",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="left"), # 321 degrees
                    DoorSideByBearing(bearing_deg=0, side="right"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_061",
        x_feet= 51,
        y_feet= 103,
        doors=[
            DoorRef(
                id="room_061",
                label="Room 061",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="left"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="right"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_065",
        x_feet= -2,
        y_feet= 103,
        doors=[
            DoorRef(
                id="room_065",
                label="Room 065",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="left"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="right"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_069",
        x_feet= -46,
        y_feet= 103,
        doors=[
            DoorRef(
                id="room_069",
                label="Room 069",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="left"), # 321 degrees
                    DoorSideByBearing(bearing_deg=0, side="right"),
                ],
            ),
        ],
    ).asdict(),

    # TODO: change angles after turn
    HallwayPointNode(
        id="hall_007",
        x_feet= -83,
        y_feet= 94,
        doors=[
            DoorRef(
                id="room_007",
                label="Room 007",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="left"), 
                    DoorSideByBearing(bearing_deg=90, side="right"),
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_005",
        x_feet= -70,
        y_feet= 65,
        doors=[
            DoorRef(
                id="room_005b",
                label="Room 005B",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=90, side="left"),
                ],
            ),
            DoorRef(
                id="room_005",
                label="Room 005",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=90, side="right"),
                ],
            ),
        ],
    ).asdict(),

    HallwayPointNode(
        id="hall_011",
        x_feet= -83,
        y_feet= 50,
        doors=[
            DoorRef(
                id="room_011",
                label="Room 011",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"), 
                    DoorSideByBearing(bearing_deg=180, side="right"), 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_013",
        x_feet= -83,
        y_feet= 29,
        doors=[
            DoorRef(
                id="room_013",
                label="Room 013",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"), 
                    DoorSideByBearing(bearing_deg=180, side="right"), 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_045",
        x_feet= 82.5,
        y_feet= 32,
        doors=[
            DoorRef(
                id="room_045",
                label="Room 045",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="right"), 
                    DoorSideByBearing(bearing_deg=180, side="left"), 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_047",
        x_feet= 82.5,
        y_feet= 49,
        doors=[
            DoorRef(
                id="room_047",
                label="Room 047",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="right"), 
                    DoorSideByBearing(bearing_deg=180, side="left"), 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_049",
        x_feet= 82.5,
        y_feet= 64,
        doors=[
            DoorRef(
                id="room_049",
                label="Room 049",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="right"), 
                    DoorSideByBearing(bearing_deg=180, side="left"),  
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_051",
        x_feet= 82.5,
        y_feet= 77,
        doors=[
            DoorRef(
                id="room_051",
                label="Room 051",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="right"), 
                    DoorSideByBearing(bearing_deg=180, side="left"), 
                ],
            ),
        ],
    ).asdict(),

    HallwayPointNode(
        id="hall_129",
        x_feet= -41,
        y_feet= 93,
        doors=[
            DoorRef(
                id="room_129low",
                label="Room 129",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"), 
                    DoorSideByBearing(bearing_deg=90, side="right"),
                ],
            ),
        ],
    ).asdict(),

    # corner nodes
    HallwayPointNode(
        id="corner_southwest_f0",
        x_feet=-83,
        y_feet=4.5,
        # No doors, just a corner
    ).asdict(),
    
    HallwayPointNode(
        id="corner_southeast_f0",
        x_feet=82.5,
        y_feet=4.5,
    ).asdict(),

    HallwayPointNode(
        id="corner_northeast_f0",
        x_feet=87,
        y_feet=103,
    ).asdict(),

    HallwayPointNode(
        id="corner_rm005_f0",
        x_feet=-83,
        y_feet=65,
    ).asdict(),

    # HallwayPointNode(
    #     id="corner_rm005_2",
    #     x_feet=-83,
    #     y_feet=65,
    # ).asdict(),

    HallwayPointNode( #the turn from lab wing to the staircase area
        id="corner_mid_f0",
        x_feet=-46,
        y_feet=98,
    ).asdict(),

    HallwayPointNode(
        id="corner_mid2_f0",
        x_feet=-46,
        y_feet=94,
    ).asdict(),

    HallwayPointNode(
        id="corner_mid3_f0",
        x_feet=-41,
        y_feet=4.5,
    ).asdict(),

    HallwayPointNode(
        id="corner_lobby_mid_f0",
        x_feet=-111,
        y_feet=94,
    ).asdict(),

    HallwayPointNode(
        id="corner_lobby_north_f0",
        x_feet=-111,
        y_feet=145,
    ).asdict(),

    HallwayPointNode(
        id="corner_lobby_south_f0",
        x_feet=-111,
        y_feet=87,
    ).asdict(),

    HallwayPointNode(
        id="corner_lobby_west_f0",
        x_feet=-121,
        y_feet=87,
    ).asdict(),
    
]

# NODES = [
#     HallwayPointNode(
#         id="room_206_207",
#         x_feet=-83.5,
#         y_feet=116.0,
#         doors=[
#             DoorRef(
#                 id="room_206",
#                 label="Room 206",
#                 side_by_bearing=[
#                     DoorSideByBearing(bearing_deg=180, side="right"),
#                 ],
#             ),
#             DoorRef(
#                 id="room_207",
#                 label="Room 207",
#                 side_by_bearing=[
#                     DoorSideByBearing(bearing_deg=180, side="left"),
#                 ],
#             ),
#         ],
#     ).asdict(),
# ]