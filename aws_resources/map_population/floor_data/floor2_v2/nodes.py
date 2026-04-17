"""
Nodes for floor2_v2.

Authoring note: map node coordinates from the floor plan first, then apply any
global coordinate offset/rotation during upload.
"""

from __future__ import annotations

from .constants import DoorRef, DoorSideByBearing, HallwayPointNode, IntersectionRef

NODES = [
    HallwayPointNode(
        id="hall_206_207",
        x_feet=-83.5,
        y_feet=113.0,
        doors=[
            DoorRef(
                id="room_206",
                label="Room 206",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="left"),
                    DoorSideByBearing(bearing_deg=0, side="right"),
                ],
            ),
            DoorRef(
                id="room_207",
                label="Room 207",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"),
                    DoorSideByBearing(bearing_deg=180, side="right"),

                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_208_209",
        x_feet=-83.5,
        y_feet=106.0,
        doors=[
            DoorRef(
                id="room_208",
                label="Room 208",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="left"),
                    DoorSideByBearing(bearing_deg=0, side="right"),
                ],
            ),
            DoorRef(
                id="room_209",
                label="Room 209",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"),
                    DoorSideByBearing(bearing_deg=180, side="right"),
                ],
            ),
        ],
        intersections=[
            IntersectionRef(id="west_cross_north", kind="tee", bearing_deg=0),
        ],
    ).asdict(),

     HallwayPointNode(
        id="hall_Bside",
        x_feet=-83.5,
        y_feet=80,
        doors=[
            DoorRef(
                id="hallway_Bside",
                label="Hallway B Side",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="left"),
                    DoorSideByBearing(bearing_deg=0, side="right"),
                ],
            ),
        ],
    ).asdict(),

    HallwayPointNode(
    id="hall_2s03_211",  
    x_feet=-83.5,
    y_feet=73,
    doors=[
        DoorRef(
            id="staircase_2S03",  
            label="West Staircase 2S03",
            side_by_bearing=[
                DoorSideByBearing(bearing_deg=180, side="left"),
                DoorSideByBearing(bearing_deg=0, side="right"),
            ],
        ),
        DoorRef(
            id="room_211", 
            label="Room 211",
            side_by_bearing=[
                DoorSideByBearing(bearing_deg=0, side="left"),
                DoorSideByBearing(bearing_deg=180, side="right"),
            ],
        ),
    ],
    ).asdict(),

    HallwayPointNode(
    id="hall_vend_215",  
    x_feet=-83.5,
    y_feet=64.0,
    doors=[
        DoorRef(
            id="vending_west",  
            label="Vending Machine",
            side_by_bearing=[
                DoorSideByBearing(bearing_deg=180, side="left"),
                DoorSideByBearing(bearing_deg=0, side="right"),
            ],
        ),
        DoorRef(
            id="room_215", 
            label="Room 215",
            side_by_bearing=[
                DoorSideByBearing(bearing_deg=0, side="left"),
                DoorSideByBearing(bearing_deg=180, side="right"),
            ],
        ),
    ],
    ).asdict(),
    
    HallwayPointNode(
    id="hall_214",  
    x_feet=-83.5,
    y_feet=47.0,
    doors=[
        DoorRef(
            id="room_214",  
            label="Room 214",
            side_by_bearing=[
                DoorSideByBearing(bearing_deg=180, side="left"),
                DoorSideByBearing(bearing_deg=0, side="right"),
            ],
        ),
    ],
    ).asdict(),

    HallwayPointNode(
    id="hall_216",  
    x_feet=-83.5,
    y_feet=43.0,
    doors=[
        DoorRef(
            id="room_216",  
            label="Room 216",
            side_by_bearing=[
                DoorSideByBearing(bearing_deg=180, side="left"),
                DoorSideByBearing(bearing_deg=0, side="right"),
            ],
        ),
    ],
    ).asdict(),

    HallwayPointNode(
    id="hall_217",  
    x_feet=-83.5,
    y_feet=35.0,
    doors=[
        DoorRef(
            id="room_217", 
            label="Room 217",
            side_by_bearing=[
                DoorSideByBearing(bearing_deg=0, side="left"),
                DoorSideByBearing(bearing_deg=180, side="right"),
            ],
        ),
    ],
    ).asdict(),

    HallwayPointNode(
    id="hall_221",  
    x_feet=-83.5,
    y_feet=22.0,
    doors=[
        DoorRef(
            id="room_221", 
            label="Room 221",
            side_by_bearing=[
                DoorSideByBearing(bearing_deg=0, side="left"),
                DoorSideByBearing(bearing_deg=180, side="right"),
            ],
        ),
    ],
    ).asdict(),

    HallwayPointNode(
    id="hall_218_mens",  
    x_feet=-83.5,
    y_feet=14,
    doors=[
        DoorRef(
            id="room_218",  
            label="Room 218",
            side_by_bearing=[
                DoorSideByBearing(bearing_deg=180, side="left"),
                DoorSideByBearing(bearing_deg=0, side="right"),
            ],
        ),
        DoorRef(
            id="room_219", 
            label="Mens Restroom",
            side_by_bearing=[
                DoorSideByBearing(bearing_deg=0, side="left"),
                DoorSideByBearing(bearing_deg=180, side="right"),
            ],
        ),
    ],
    ).asdict(),

    HallwayPointNode(
    id="hall_220_222",  
    x_feet=-83.5,
    y_feet=4.5,
    doors=[
        DoorRef(
            id="room_220",  
            label="Room 220",
            side_by_bearing=[
                DoorSideByBearing(bearing_deg=180, side="left"),
                DoorSideByBearing(bearing_deg=0, side="right"),
            ],
        ),
        # TODO: HOW TO MAP THIS? 
                # 222 is straight from this node, no turn is needed.
        DoorRef(
            id="room_222", 
            label="Room 220",
            side_by_bearing=[
                DoorSideByBearing(bearing_deg=0, side="left"),
                DoorSideByBearing(bearing_deg=180, side="right"),
            ],
        ),
    ],
    ).asdict(),

    HallwayPointNode(
        id="hall_225",
        x_feet= -60,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_225",
                label="Room 225",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="left"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="right"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),

    HallwayPointNode(
        id="hall_224",
        x_feet= -54,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_224",
                label="Room 224",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_226",
        x_feet= -28,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_226",
                label="Room 226",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),

    # main staircase
    HallwayPointNode(
        id="staircase_main_2s01",
        x_feet= 0,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="staircase_2S01",
                label="Main Staircase 2S01",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),

    HallwayPointNode(
        id="hall_230",
        x_feet= 18,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_230",
                label="Room 230",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_232",
        x_feet= 27,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_232",
                label="Room 232",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_234",
        x_feet= 38,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_234",
                label="Room 234",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),

    HallwayPointNode(
        id="hall_236_237",
        x_feet= 64,
        y_feet= 4.5,
        doors=[
            DoorRef(
                id="room_236",
                label="Room 236",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
            DoorRef(
                id="room_237",
                label="Room 237",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="left"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="right"), # 141 degrees 
                ],
            ),
        ],
    ).asdict(),
    
    HallwayPointNode(
        id="corner_southeast", # room 218 at the same time
        x_feet=83.0,
        y_feet=4.5,
        doors=[
            DoorRef(
                id="room_238",
                label="Room 238",
                side_by_bearing=[
                    #TODO: fix the directions, 238 is straight from this hallway angle no turn
                    DoorSideByBearing(bearing_deg=270, side="right"), 
                    DoorSideByBearing(bearing_deg=90, side="left"), 
                ],
            ),
        ],
    ).asdict(),

    HallwayPointNode(
        id="hall_240_2e01",  
        x_feet=83.0,
        y_feet=15,
        doors=[
            DoorRef(
                id="room_240",  
                label="Room 240",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"),
                    DoorSideByBearing(bearing_deg=180, side="right"),
                ],
            ),
            DoorRef(
                id="elevator_2E01", 
                label="East Elevator 2E01",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="left"),
                    DoorSideByBearing(bearing_deg=0, side="right"),
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="hall_240a_241",
        x_feet= 83,
        y_feet= 21,
        doors=[
            DoorRef(
                id="room_240a",
                label="Room 240A",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"),
                    DoorSideByBearing(bearing_deg=180, side="right"),
                ],
            ),
            DoorRef(
                id="room_241",
                label="Room 241",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="left"),
                    DoorSideByBearing(bearing_deg=0, side="right"),
                ],
            ),
        ],
    ).asdict(),

    HallwayPointNode(
        id="hall_MSEEcrossing",
        x_feet= 83,
        y_feet= 29,
        doors=[
            DoorRef(
                id="msee_crossing",
                label="MSEE Crossing",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"),
                    DoorSideByBearing(bearing_deg=180, side="right"),
                ],
            ),
        ],
    ).asdict(),

    HallwayPointNode(
        id="hall_241a",
        x_feet= 83,
        y_feet= 37,
        doors=[
            DoorRef(
                id="room_241a",
                label="Room 241A",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="left"),
                    DoorSideByBearing(bearing_deg=0, side="right"),
                ],
            ),
        ],
    ).asdict(),

    HallwayPointNode(
        id="hall_242",
        x_feet= 83,
        y_feet= 45,
        doors=[
            DoorRef(
                id="room_242",
                label="Room 242",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"),
                    DoorSideByBearing(bearing_deg=180, side="right"),
                ],
            ),
        ],
    ).asdict(),

    HallwayPointNode(
        id="hall_244",
        x_feet= 83,
        y_feet= 52,
        doors=[
            DoorRef(
                id="room_244",
                label="Room 244",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"),
                    DoorSideByBearing(bearing_deg=180, side="right"),
                ],
            ),
        ],
    ).asdict(),

    HallwayPointNode(
        id="staircase_east_2S02",
        x_feet= 83,
        y_feet= 65,
        doors=[
            DoorRef(
                id="staircase_2S03",
                label="East Staircase 2S02",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"),
                    DoorSideByBearing(bearing_deg=180, side="right"),
                ],
            ),
        ],
    ).asdict(),

    HallwayPointNode(
        id="hall_restrooms",
        x_feet= 83,
        y_feet= 78,
        doors=[
            #TODO: this is not direclty on the left
            DoorRef(
                id="room_245",
                label="Mens Restroom",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"),
                    DoorSideByBearing(bearing_deg=180, side="right"),
                ],
            ),
            DoorRef(
                id="room_243",
                label="Womens Restroom",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"),
                    DoorSideByBearing(bearing_deg=180, side="right"),
                ],
            ),
        ],
    ).asdict(),

    HallwayPointNode(
        id="hall_offices",
        x_feet= 83,
        y_feet= 96,
        doors=[
            DoorRef(
                id="office_wing",
                label="Offices wing",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"),
                    DoorSideByBearing(bearing_deg=180, side="right"),
                ],
            ),
        ],
    ).asdict(),
]
