"""
Validation utilities for floor0 manual authoring.

Run:
    python -m floor_data.floor0.validate
"""

from __future__ import annotations

import importlib

from . import FLOOR0_DATA
from .constants import BUILDING_ID, FLOOR_NUMBER


def validate_floor0() -> None:
    floors = FLOOR0_DATA.get("floors", [])
    floor = next((item for item in floors if item.get("floor_number") == FLOOR_NUMBER), None)
    if floor is None:
        raise ValueError(f"{BUILDING_ID}-F{FLOOR_NUMBER}: floor payload not found")
    generic_validator = importlib.import_module("floor_data.validation").validate_floor_payload
    generic_validator(floor, floor_label=f"{BUILDING_ID}-F{FLOOR_NUMBER}")


if __name__ == "__main__":
    validate_floor0()
    print("floor0 validation passed")
