"""
Shared builders and constants for manual floor2_v2 authoring.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


BUILDING_ID = "B01"
BUILDING_NAME = "BHEE"
FLOOR_NUMBER = 2
MAP_IMAGE_URL = None
MAP_SCALE_RATIO = 0.03048


@dataclass(frozen=True)
class DoorSideByBearing:
    bearing_deg: float
    side: str

    def asdict(self) -> dict[str, Any]:
        return {
            "bearing_deg": self.bearing_deg % 360.0,
            "side": self.side,
        }


@dataclass(frozen=True)
class DoorRef:
    id: str
    label: str
    side_by_bearing: list[DoorSideByBearing]
    offset_feet: float = 0.0

    def asdict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "side_by_bearing": [entry.asdict() for entry in self.side_by_bearing],
            "offset_feet": self.offset_feet,
        }


@dataclass(frozen=True)
class IntersectionRef:
    id: str
    kind: str
    bearing_deg: float | None = None

    def asdict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"id": self.id, "kind": self.kind}
        if self.bearing_deg is not None:
            out["bearing_deg"] = self.bearing_deg
        return out


@dataclass(frozen=True)
class HallwayPointNode:
    id: str
    x_feet: float
    y_feet: float
    type: str = "HallwayPoint"
    doors: list[DoorRef] = field(default_factory=list)
    intersections: list[IntersectionRef] = field(default_factory=list)

    def asdict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "x_feet": self.x_feet,
            "y_feet": self.y_feet,
            "type": self.type,
            "doors": [door.asdict() for door in self.doors],
            "intersections": [intersection.asdict() for intersection in self.intersections],
        }



def edge(
    start: str,
    end: str,
    bearing_deg: float,
    bidirectional: bool = True,
) -> dict[str, Any]:
    normalized = bearing_deg % 360.0
    reverse = (normalized + 180.0) % 360.0
    return {
        "start": start,
        "end": end,
        "bidirectional": bidirectional,
        "bearing_deg": normalized,
        "rev_bearing_deg": reverse,
    }


def landmark(
    name: str,
    x_feet: float,
    y_feet: float,
    nearest_node: str,
    door_id: str | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "name": name,
        "x_feet": x_feet,
        "y_feet": y_feet,
        "nearest_node": nearest_node,
    }
    if door_id is not None:
        out["door_id"] = door_id
    return out
