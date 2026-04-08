"""
Nodes for floor0.

Authoring note: map node coordinates from the floor plan first, then apply any
global coordinate offset/rotation during upload.
"""


from __future__ import annotations

from .constants import DoorRef, DoorSideByBearing, HallwayPointNode, IntersectionRef


NODES = [
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
                    DoorSideByBearing(bearing_deg=270, side="right"), # 321 degrees
                    DoorSideByBearing(bearing_deg=90, side="left"), # 141 degrees 
                ],
            ),
            DoorRef(
                id="room_042",
                label="Room 042",

                # TODO: HOW TO MAP THIS? 
                # 042 is straight from this node, no turn is needed.

                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=270, side="right"), 
                    DoorSideByBearing(bearing_deg=90, side="left"), 
                ],
            ),
        ],
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