"""
Nodes for floor2_v2.
"""

from __future__ import annotations

from .constants import DoorRef, DoorSideByBearing, HallwayPointNode, IntersectionRef

NODES = [
    HallwayPointNode(
        id="n_west_116",
        x_feet=-83.5,
        y_feet=116.0,
        doors=[
            DoorRef(
                id="room_206",
                label="Room 206",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="right"),
                ],
            ),
            DoorRef(
                id="room_207",
                label="Room 207",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=180, side="left"),
                ],
            ),
        ],
    ).asdict(),
    HallwayPointNode(
        id="n_west_106",
        x_feet=-83.5,
        y_feet=106.0,
        doors=[
            DoorRef(
                id="room_208",
                label="Room 208",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="left"),
                ],
            ),
            DoorRef(
                id="room_209",
                label="Room 209",
                side_by_bearing=[
                    DoorSideByBearing(bearing_deg=0, side="right"),
                ],
            ),
        ],
        intersections=[
            IntersectionRef(id="west_cross_north", kind="tee", bearing_deg=0),
        ],
    ).asdict(),
]
