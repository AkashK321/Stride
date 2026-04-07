"""
Validation utilities for floor2_v2 manual authoring.

Run:
    python -m floor_data.floor2_v2.validate
"""

from __future__ import annotations

from collections import Counter
import math

from .edges import EDGES
from .landmarks import LANDMARKS
from .nodes import NODES


def _assert_unique_node_ids() -> set[str]:
    node_ids = [node["id"] for node in NODES]
    duplicates = [node_id for node_id, count in Counter(node_ids).items() if count > 1]
    if duplicates:
        raise ValueError(f"Duplicate node ids: {duplicates}")
    return set(node_ids)


def _assert_edges_reference_existing_nodes(node_ids: set[str]) -> None:
    missing = []
    for edge in EDGES:
        if edge["start"] not in node_ids:
            missing.append(("start", edge["start"]))
        if edge["end"] not in node_ids:
            missing.append(("end", edge["end"]))
    if missing:
        raise ValueError(f"Edges reference missing nodes: {missing}")


def _assert_edge_bearings_valid() -> None:
    bad = []
    for edge in EDGES:
        if "bearing_deg" not in edge or "rev_bearing_deg" not in edge:
            bad.append((edge.get("start"), edge.get("end"), "missing bearing fields"))
            continue
        fwd = float(edge["bearing_deg"]) % 360.0
        rev = float(edge["rev_bearing_deg"]) % 360.0
        expected_rev = (fwd + 180.0) % 360.0
        if not math.isclose(rev, expected_rev, abs_tol=1e-6):
            bad.append((edge["start"], edge["end"], f"rev {rev} != {expected_rev}"))
    if bad:
        raise ValueError(f"Invalid edge bearings: {bad}")


def _assert_landmarks_reference_existing_nodes(node_ids: set[str]) -> None:
    missing = [lm["nearest_node"] for lm in LANDMARKS if lm["nearest_node"] not in node_ids]
    if missing:
        raise ValueError(f"Landmarks reference missing nearest_node ids: {sorted(set(missing))}")


def _assert_no_unintentional_duplicate_coordinates() -> None:
    coords = [(node["x_feet"], node["y_feet"]) for node in NODES]
    duplicate_coords = [coord for coord, count in Counter(coords).items() if count > 1]
    if duplicate_coords:
        raise ValueError(f"Unexpected duplicate coordinates: {duplicate_coords}")


def _assert_no_unintentional_self_loops() -> None:
    bad = []
    for edge in EDGES:
        pair = (edge["start"], edge["end"])
        if edge["start"] == edge["end"]:
            bad.append(pair)
    if bad:
        raise ValueError(f"Unexpected self-loop edges: {bad}")


def _assert_doors_reference_valid_incident_bearings() -> None:
    incoming_by_node: dict[str, set[float]] = {node["id"]: set() for node in NODES}
    for edge in EDGES:
        # Heading when approaching end node from start node.
        incoming_by_node[edge["end"]].add(float(edge["bearing_deg"]) % 360.0)
        # Heading when approaching start node from end node.
        incoming_by_node[edge["start"]].add(float(edge["rev_bearing_deg"]) % 360.0)

    issues = []
    for node in NODES:
        node_id = node["id"]
        incident = incoming_by_node.get(node_id, set())
        for door in node.get("doors", []):
            side_entries = door.get("side_by_bearing")
            if not side_entries:
                issues.append((node_id, door.get("id"), "missing side_by_bearing"))
                continue
            for entry in side_entries:
                bearing = float(entry["bearing_deg"]) % 360.0
                side = entry.get("side")
                if side not in {"left", "right"}:
                    issues.append((node_id, door.get("id"), f"invalid side '{side}'"))
                if bearing not in incident:
                    issues.append((node_id, door.get("id"), f"bearing {bearing} not incident on node"))

    if issues:
        raise ValueError(f"Door side_by_bearing validation failed: {issues}")


def _assert_landmark_door_ids_exist_on_nearest_nodes() -> None:
    node_lookup = {node["id"]: node for node in NODES}
    issues = []
    for landmark in LANDMARKS:
        door_id = landmark.get("door_id")
        if door_id is None:
            issues.append((landmark["name"], landmark["nearest_node"], "missing door_id"))
            continue
        nearest = landmark["nearest_node"]
        node = node_lookup.get(nearest, {})
        door_ids = {door.get("id") for door in node.get("doors", [])}
        if door_id not in door_ids:
            issues.append((landmark["name"], nearest, door_id))
    if issues:
        raise ValueError(f"Landmark door_id not found on nearest node doors: {issues}")


def validate_floor2_v2() -> None:
    node_ids = _assert_unique_node_ids()
    _assert_edges_reference_existing_nodes(node_ids)
    _assert_edge_bearings_valid()
    _assert_landmarks_reference_existing_nodes(node_ids)
    _assert_no_unintentional_duplicate_coordinates()
    _assert_no_unintentional_self_loops()
    _assert_doors_reference_valid_incident_bearings()
    _assert_landmark_door_ids_exist_on_nearest_nodes()


if __name__ == "__main__":
    validate_floor2_v2()
    print("floor2_v2 validation passed")
