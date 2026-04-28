"""
Generic floor-data validation helpers reusable across all registered floors.
"""

from __future__ import annotations

from collections import Counter
import math


def validate_floor_payload(
    floor: dict,
    floor_label: str = "unknown-floor",
    enforce_door_bearing_incidence: bool = True,
    enforce_unique_coordinates: bool = True,
) -> None:
    """
    Validate a single floor payload in the canonical map authoring format.

    Expected floor shape:
      {
        "floor_number": int,
        "nodes": [...],
        "edges": [...],
        "landmarks": [...],
      }
    """
    _assert_floor_required_fields(floor, floor_label)

    nodes = floor["nodes"]
    edges = floor["edges"]
    landmarks = floor["landmarks"]

    _assert_nodes_have_required_fields(nodes, floor_label)
    _assert_edges_have_required_fields(edges, floor_label)
    _assert_landmarks_have_required_fields(landmarks, floor_label)

    node_ids = _assert_unique_node_ids(nodes, floor_label)
    _assert_valid_node_types(nodes, floor_label)
    _assert_no_spaces_in_node_ids(nodes, floor_label)
    _assert_coordinates_are_numeric(nodes, floor_label)

    _assert_edges_reference_existing_nodes(edges, node_ids, floor_label)
    _assert_edge_bearings_valid(edges, floor_label)
    _assert_no_unintentional_self_loops(edges, floor_label)
    if enforce_unique_coordinates:
        _assert_no_unintentional_duplicate_coordinates(nodes, floor_label)

    _assert_landmarks_reference_existing_nodes(landmarks, node_ids, floor_label)
    _assert_hallwaypoint_doors_have_side_by_bearing(nodes, floor_label)
    if enforce_door_bearing_incidence:
        _assert_doors_reference_valid_incident_bearings(nodes, edges, floor_label)
    _assert_landmark_door_ids_exist_on_nearest_nodes(nodes, landmarks, floor_label)


def _assert_floor_required_fields(floor: dict, floor_label: str) -> None:
    required = {"floor_number", "nodes", "edges", "landmarks"}
    missing = sorted(required - set(floor.keys()))
    if missing:
        raise ValueError(f"{floor_label}: missing floor fields: {missing}")


def _assert_unique_node_ids(nodes: list[dict], floor_label: str) -> set[str]:
    node_ids = [node["id"] for node in nodes]
    duplicates = [node_id for node_id, count in Counter(node_ids).items() if count > 1]
    if duplicates:
        raise ValueError(f"{floor_label}: duplicate node ids: {duplicates}")
    return set(node_ids)


def _assert_no_spaces_in_node_ids(nodes: list[dict], floor_label: str) -> None:
    bad = [node["id"] for node in nodes if " " in node["id"]]
    if bad:
        raise ValueError(f"{floor_label}: node ids with spaces: {bad}")


def _assert_nodes_have_required_fields(nodes: list[dict], floor_label: str) -> None:
    required = ["id", "x_feet", "y_feet", "type"]
    for node in nodes:
        missing = [field for field in required if field not in node]
        if missing:
            raise ValueError(f"{floor_label}: node '{node.get('id', 'UNKNOWN')}' missing fields: {missing}")


def _assert_edges_have_required_fields(edges: list[dict], floor_label: str) -> None:
    required = ["start", "end", "bidirectional", "bearing_deg", "rev_bearing_deg"]
    for edge in edges:
        missing = [field for field in required if field not in edge]
        if missing:
            raise ValueError(
                f"{floor_label}: edge '{edge.get('start', '?')}' -> '{edge.get('end', '?')}' "
                f"missing fields: {missing}"
            )


def _assert_landmarks_have_required_fields(landmarks: list[dict], floor_label: str) -> None:
    required = ["name", "x_feet", "y_feet", "nearest_node", "door_id"]
    for landmark in landmarks:
        missing = [field for field in required if field not in landmark]
        if missing:
            raise ValueError(
                f"{floor_label}: landmark '{landmark.get('name', 'UNKNOWN')}' missing fields: {missing}"
            )


def _assert_valid_node_types(nodes: list[dict], floor_label: str) -> None:
    valid_types = {"Intersection", "Corner", "Elevator", "Stairwell", "Door", "HallwayPoint"}
    bad = [node["id"] for node in nodes if node.get("type") not in valid_types]
    if bad:
        raise ValueError(f"{floor_label}: nodes with invalid types: {bad}")


def _assert_coordinates_are_numeric(nodes: list[dict], floor_label: str) -> None:
    bad = []
    for node in nodes:
        if not isinstance(node.get("x_feet"), (int, float)) or not isinstance(node.get("y_feet"), (int, float)):
            bad.append(node.get("id", "UNKNOWN"))
    if bad:
        raise ValueError(f"{floor_label}: nodes with non-numeric coordinates: {bad}")


def _assert_edges_reference_existing_nodes(
    edges: list[dict],
    node_ids: set[str],
    floor_label: str,
) -> None:
    missing = []
    for edge in edges:
        if edge["start"] not in node_ids:
            missing.append(("start", edge["start"]))
        if edge["end"] not in node_ids:
            missing.append(("end", edge["end"]))
    if missing:
        raise ValueError(f"{floor_label}: edges reference missing nodes: {missing}")


def _assert_edge_bearings_valid(edges: list[dict], floor_label: str) -> None:
    bad = []
    for edge in edges:
        fwd = float(edge["bearing_deg"]) % 360.0
        rev = float(edge["rev_bearing_deg"]) % 360.0
        expected_rev = (fwd + 180.0) % 360.0
        if not math.isclose(rev, expected_rev, abs_tol=1e-6):
            bad.append((edge["start"], edge["end"], f"rev {rev} != {expected_rev}"))
    if bad:
        raise ValueError(f"{floor_label}: invalid edge bearings: {bad}")


def _assert_no_unintentional_self_loops(edges: list[dict], floor_label: str) -> None:
    bad = []
    for edge in edges:
        if edge["start"] == edge["end"]:
            bad.append((edge["start"], edge["end"]))
    if bad:
        raise ValueError(f"{floor_label}: unexpected self-loop edges: {bad}")


def _assert_no_unintentional_duplicate_coordinates(nodes: list[dict], floor_label: str) -> None:
    coords = [(node["x_feet"], node["y_feet"]) for node in nodes]
    duplicate_coords = [coord for coord, count in Counter(coords).items() if count > 1]
    if duplicate_coords:
        raise ValueError(f"{floor_label}: unexpected duplicate coordinates: {duplicate_coords}")


def _assert_landmarks_reference_existing_nodes(
    landmarks: list[dict],
    node_ids: set[str],
    floor_label: str,
) -> None:
    missing = [lm["nearest_node"] for lm in landmarks if lm["nearest_node"] not in node_ids]
    if missing:
        raise ValueError(f"{floor_label}: landmarks reference missing nearest nodes: {sorted(set(missing))}")


def _assert_hallwaypoint_doors_have_side_by_bearing(nodes: list[dict], floor_label: str) -> None:
    issues = []
    for node in nodes:
        if node.get("type") != "HallwayPoint":
            continue
        for door in node.get("doors", []):
            if "id" not in door or "label" not in door:
                issues.append((node.get("id"), "missing door id/label"))
                continue
            side_entries = door.get("side_by_bearing")
            if not side_entries:
                issues.append((node.get("id"), door.get("id"), "missing side_by_bearing"))
                continue
            for side_entry in side_entries:
                side = side_entry.get("side")
                bearing = side_entry.get("bearing_deg")
                if side not in {"left", "right"}:
                    issues.append((node.get("id"), door.get("id"), f"invalid side '{side}'"))
                if not isinstance(bearing, (int, float)):
                    issues.append((node.get("id"), door.get("id"), f"invalid bearing '{bearing}'"))
    if issues:
        raise ValueError(f"{floor_label}: hallway-point door metadata invalid: {issues}")


def _assert_doors_reference_valid_incident_bearings(
    nodes: list[dict],
    edges: list[dict],
    floor_label: str,
) -> None:
    incoming_by_node: dict[str, set[float]] = {node["id"]: set() for node in nodes}
    for edge in edges:
        incoming_by_node[edge["end"]].add(float(edge["bearing_deg"]) % 360.0)
        incoming_by_node[edge["start"]].add(float(edge["rev_bearing_deg"]) % 360.0)

    issues = []
    for node in nodes:
        node_id = node["id"]
        incident = incoming_by_node.get(node_id, set())
        for door in node.get("doors", []):
            side_entries = door.get("side_by_bearing", [])
            for entry in side_entries:
                bearing = float(entry["bearing_deg"]) % 360.0
                if bearing not in incident:
                    issues.append((node_id, door.get("id"), f"bearing {bearing} not incident on node"))

    if issues:
        raise ValueError(f"{floor_label}: door side_by_bearing validation failed: {issues}")


def _assert_landmark_door_ids_exist_on_nearest_nodes(
    nodes: list[dict],
    landmarks: list[dict],
    floor_label: str,
) -> None:
    node_lookup = {node["id"]: node for node in nodes}
    issues = []
    for landmark in landmarks:
        door_id = landmark.get("door_id")
        nearest = landmark.get("nearest_node")
        node = node_lookup.get(nearest, {})
        door_ids = {door.get("id") for door in node.get("doors", [])}
        if door_id not in door_ids:
            issues.append((landmark.get("name"), nearest, door_id))
    if issues:
        raise ValueError(f"{floor_label}: landmark door_id not found on nearest node doors: {issues}")
