"""
Registry for floor-data packages used by map validation/population flows.
"""

from __future__ import annotations

from dataclasses import dataclass
import importlib
from typing import Callable


@dataclass(frozen=True)
class FloorRegistration:
    building_id: str
    floor_number: int
    module_path: str
    data_var: str
    validator_path: str | None = None


# Add additional floor packages here as they are authored.
REGISTERED_FLOORS: tuple[FloorRegistration, ...] = (
    FloorRegistration(
        building_id="B01",
        floor_number=2,
        module_path="floor_data.floor2_v2",
        data_var="FLOOR2_DATA_V2",
        validator_path="floor_data.floor2_v2.validate:validate_floor2_v2",
    ),
    FloorRegistration(
        building_id="B01",
        floor_number=0,
        module_path="floor_data.floor0",
        data_var="FLOOR0_DATA",
        validator_path="floor_data.floor0.validate:validate_floor0",
    ),
)


def _load_validator(validator_path: str) -> Callable[[], None]:
    module_path, function_name = validator_path.split(":", maxsplit=1)
    module = importlib.import_module(module_path)
    validator = getattr(module, function_name)
    if not callable(validator):
        raise TypeError(f"Validator is not callable: {validator_path}")
    return validator


def _extract_registered_floor_data(registration: FloorRegistration) -> tuple[str, str, dict]:
    module = importlib.import_module(registration.module_path)
    data_obj = getattr(module, registration.data_var)

    building_id = data_obj.get("building_id")
    if building_id != registration.building_id:
        raise ValueError(
            f"{registration.module_path}.{registration.data_var} building_id={building_id!r} "
            f"does not match registry building_id={registration.building_id!r}"
        )

    building_name = data_obj.get("building_name")
    if not building_name:
        raise ValueError(
            f"{registration.module_path}.{registration.data_var} missing non-empty building_name"
        )

    floors = data_obj.get("floors", [])
    matching = [floor for floor in floors if floor.get("floor_number") == registration.floor_number]
    if len(matching) != 1:
        raise ValueError(
            f"{registration.module_path}.{registration.data_var} expected exactly one floor "
            f"for floor_number={registration.floor_number}, found {len(matching)}"
        )
    return building_id, building_name, matching[0]


def get_all_buildings_data() -> list[dict]:
    """
    Assemble a normalized list of building payloads from registered floor packages.

    Output shape matches `populate_floor_data.populate_database` expectations:
      [
        {
          "building_id": "...",
          "building_name": "...",
          "floors": [ ... ],
        },
      ]
    """
    by_building: dict[str, dict] = {}

    for registration in REGISTERED_FLOORS:
        building_id, building_name, floor = _extract_registered_floor_data(registration)

        current = by_building.get(building_id)
        if current is None:
            current = {
                "building_id": building_id,
                "building_name": building_name,
                "floors": [],
            }
            by_building[building_id] = current
        elif current["building_name"] != building_name:
            raise ValueError(
                f"Building name mismatch for {building_id}: "
                f"{current['building_name']!r} vs {building_name!r}"
            )

        current["floors"].append(floor)

    for building in by_building.values():
        building["floors"].sort(key=lambda floor: floor.get("floor_number", 0))

    return sorted(by_building.values(), key=lambda building: building["building_id"])


def validate_registered_floors() -> None:
    """
    Run all registered floor validators and verify registry payloads can be assembled.
    """
    for registration in REGISTERED_FLOORS:
        if registration.validator_path:
            validator = _load_validator(registration.validator_path)
            validator()
        else:
            _, _, floor = _extract_registered_floor_data(registration)
            # Runtime import avoids pyright path-resolution issues in CLI tooling context.
            generic_validator = importlib.import_module("floor_data.validation").validate_floor_payload
            generic_validator(
                floor,
                floor_label=f"{registration.building_id}-F{registration.floor_number}",
            )

    # Also verify the registration/data contract itself.
    get_all_buildings_data()

