"""Convert floor2 to centerline-oriented v2 graph."""

import copy
import json
import math
from pathlib import Path

from floor_data.floor2 import FLOOR2_DATA

# Manual hallway groups and centerline offsets.
GROUPS = [
    {
        "name": "main_horizontal",
        "anchors": ["southwest_corner", "staircase_main_2S01", "southeast_corner"],
        "doors": ["r226_door", "r224_door", "r222_door", "r230_door", "r232_door", "r234_door", "r236_door"],
        "offset": {"axis": "y", "value": 5.0},
    },
    {
        "name": "west_outer",
        "anchors": ["southwest_corner", "vend_south_corner", "staircase_west_2S03", "hallway_Bside", "west_cross_north"],
        "doors": ["r220_door", "r218_door", "r216_door", "r214_door", "r212_door", "r208_door", "r206_door", "r207_door"],
        "offset": {"axis": "x", "value": 4.5},
    },
    {
        "name": "west_inner",
        "anchors": ["west_cross_north", "inner_west_hall_north", "inner_west_hall_south", "west_cross_south"],
        "doors": ["r209_door", "r211_door", "r215_door", "r217_door", "r221_door", "r219_door", "r225_door"],
        "offset": {"axis": "x", "value": -4.5},
    },
    {
        "name": "east_outer",
        "anchors": ["southeast_corner", "hallway_MSEEcrossing", "staircase_east_2S02", "east_office_hall_mid"],
        "doors": ["r238_door", "r240_door", "r240a_door", "r242_door", "r244_door", "r243_door", "r245_door", "offices_door"],
        "offset": {"axis": "x", "value": -5.2},
    },
    {
        "name": "east_inner",
        "anchors": ["r237_door", "east_inner_south", "elevator_2e01", "r241a_door"],
        "doors": ["r237_door", "r241_door", "r241a_door"],
        "offset": {"axis": "x", "value": 5.2},
    },
]

CONNECTORS = [
    ("staircase_main_2S01", "stair_west_corner"),
    ("staircase_main_2S01", "stair_east_corner"),
    ("west_cross_south", "southwest_corner"),
    ("r225_door", "r237_door"),
]


def _cardinal_to_offset(bearing):
    return {
        "north": (0.0, 1.0),
        "south": (0.0, -1.0),
        "east": (1.0, 0.0),
        "west": (-1.0, 0.0),
    }.get((bearing or "").strip().lower())


def _compute_side_from_cardinal(start_xy, end_xy, cardinal):
    offset = _cardinal_to_offset(cardinal)
    if offset is None:
        return "left"
    sx, sy = start_xy
    ex, ey = end_xy
    hx = ex - sx
    hy_math = -(ey - sy)
    norm = math.sqrt(hx * hx + hy_math * hy_math)
    if norm == 0:
        return "left"
    hx /= norm
    hy_math /= norm
    ox = offset[0]
    oy_math = -offset[1]
    cross_z = hx * oy_math - hy_math * ox
    return "left" if cross_z > 0 else "right"


def _dist_to_segment(px, py, ax, ay, bx, by):
    abx = bx - ax
    aby = by - ay
    ab2 = abx * abx + aby * aby
    if ab2 == 0:
        return math.hypot(px - ax, py - ay), 0.0, ax, ay
    t = ((px - ax) * abx + (py - ay) * aby) / ab2
    t = max(0.0, min(1.0, t))
    qx = ax + t * abx
    qy = ay + t * aby
    return math.hypot(px - qx, py - qy), t, qx, qy


def _apply_offset(pt, offset):
    if offset["axis"] == "x":
        return (pt[0] + offset["value"], pt[1])
    if offset["axis"] == "y":
        return (pt[0], pt[1] + offset["value"])
    return pt


def _build_centerline_group(group, node_lookup):
    anchors = group["anchors"]
    base_points = [(node_lookup[n]["x_feet"], node_lookup[n]["y_feet"]) for n in anchors]
    centerline = [_apply_offset(p, group["offset"]) for p in base_points]
    projections = {}

    used_t = {}
    for door_id in group["doors"]:
        door = node_lookup[door_id]
        px, py = door["x_feet"], door["y_feet"]
        best = None
        for i in range(len(centerline) - 1):
            ax, ay = centerline[i]
            bx, by = centerline[i + 1]
            d, t, qx, qy = _dist_to_segment(px, py, ax, ay, bx, by)
            if best is None or d < best[0]:
                best = (d, i, t, qx, qy)
        _, seg_idx, t, qx, qy = best
        key = (seg_idx, round(t, 6))
        bump = used_t.get(key, 0)
        if bump:
            ax, ay = centerline[seg_idx]
            bx, by = centerline[seg_idx + 1]
            dt = min(0.02 * bump, 0.08)
            t2 = min(max(t + dt, 0.0), 1.0)
            qx = ax + (bx - ax) * t2
            qy = ay + (by - ay) * t2
            t = t2
        used_t[key] = bump + 1
        projections[door_id] = {"seg_idx": seg_idx, "t": t, "xy": (qx, qy)}
    return centerline, projections


def _build_group_sequence(group, centerline, projections):
    anchors = group["anchors"]
    by_seg = {}
    for door_id, p in projections.items():
        by_seg.setdefault(p["seg_idx"], []).append((p["t"], door_id))
    for seg_idx in by_seg:
        by_seg[seg_idx].sort(key=lambda x: x[0])
    seq = [anchors[0]]
    for i in range(len(anchors) - 1):
        for _, door_id in by_seg.get(i, []):
            seq.append(door_id)
        seq.append(anchors[i + 1])
    return seq


def _dedupe_edges(edges):
    seen = set()
    out = []
    for s, e in edges:
        key = tuple(sorted((s, e)))
        if key in seen:
            continue
        seen.add(key)
        out.append({"start": s, "end": e, "bidirectional": True})
    return out


def convert_floor_data(source):
    converted = copy.deepcopy(source)
    floor = converted["floors"][0]
    node_lookup = {n["id"]: n for n in floor["nodes"]}
    landmark_by_node = {l["nearest_node"]: l for l in floor["landmarks"] if l.get("nearest_node")}

    all_edges = []
    canonical_neighbors = {}

    # Reposition anchors and doors on group centerlines.
    for group in GROUPS:
        centerline, projections = _build_centerline_group(group, node_lookup)
        anchors = group["anchors"]

        for idx, anchor_id in enumerate(anchors):
            node_lookup[anchor_id]["x_feet"] = round(centerline[idx][0], 3)
            node_lookup[anchor_id]["y_feet"] = round(centerline[idx][1], 3)

        for door_id, p in projections.items():
            node_lookup[door_id]["x_feet"] = round(p["xy"][0], 3)
            node_lookup[door_id]["y_feet"] = round(p["xy"][1], 3)

        seq = _build_group_sequence(group, centerline, projections)
        for i in range(len(seq) - 1):
            s = seq[i]
            e = seq[i + 1]
            all_edges.append((s, e))
            if s in group["doors"]:
                canonical_neighbors[s] = e
            elif e in group["doors"]:
                canonical_neighbors[e] = s

    # Keep some connectors that preserve cross-hall reachability.
    for s, e in CONNECTORS:
        all_edges.append((s, e))
        if s in canonical_neighbors:
            pass
        elif s in node_lookup and node_lookup[s]["type"] == "Door":
            canonical_neighbors[s] = e
        if e in canonical_neighbors:
            pass
        elif e in node_lookup and node_lookup[e]["type"] == "Door":
            canonical_neighbors[e] = s

    floor["edges"] = _dedupe_edges(all_edges)

    # Build door node metadata after coordinates/edges are final.
    for node in floor["nodes"]:
        if node.get("type") != "Door":
            continue
        node_id = node["id"]
        neighbor = canonical_neighbors.get(node_id)
        landmark = landmark_by_node.get(node_id, {})
        bearing = landmark.get("bearing")
        door_id = landmark.get("name", node_id)
        if not neighbor:
            node["node_meta"] = {
                "door_id": door_id,
                "side_canonical": "left",
                "canonical_edge_start": node_id,
                "canonical_edge_end": node_id,
            }
            if bearing:
                node["node_meta"]["door_normal_cardinal"] = bearing
            continue

        start_xy = (node["x_feet"], node["y_feet"])
        n = node_lookup[neighbor]
        end_xy = (n["x_feet"], n["y_feet"])
        node["node_meta"] = {
            "door_id": door_id,
            "side_canonical": _compute_side_from_cardinal(start_xy, end_xy, bearing),
            "canonical_edge_start": node_id,
            "canonical_edge_end": neighbor,
        }
        if bearing:
            node["node_meta"]["door_normal_cardinal"] = bearing

    return converted


def write_python_module(data, target_path):
    payload = json.dumps(data, indent=4, sort_keys=False)
    payload = payload.replace("true", "True").replace("false", "False").replace("null", "None")
    content = (
        '"""\n'
        "Generated v2 map data object for centerline migration.\n"
        '"""\n\n'
        f"FLOOR2_DATA_V2 = {payload}\n"
    )
    Path(target_path).write_text(content, encoding="utf-8")


def main():
    out_path = Path(__file__).parent / "floor_data" / "floor2_v2.py"
    converted = convert_floor_data(FLOOR2_DATA)
    write_python_module(converted, out_path)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()

