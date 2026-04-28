"""
Draw floor map nodes/edges from deployed DB state (MapNodes/MapEdges).

Invoked by `python cli.py plot-db`.
Coordinates are transformed so plot-up is true north.
"""

import argparse
import json
import math
import ssl
from pathlib import Path
from typing import Dict, List

import pg8000
from dotenv import load_dotenv

from populate_floor_data import get_db_secret

load_dotenv()


def _distance_point_to_segment(px, py, ax, ay, bx, by):
    abx = bx - ax
    aby = by - ay
    ab2 = abx * abx + aby * aby
    if ab2 == 0:
        return math.hypot(px - ax, py - ay), 0.0, ax, ay
    t = ((px - ax) * abx + (py - ay) * aby) / ab2
    t = max(0.0, min(1.0, t))
    cx = ax + t * abx
    cy = ay + t * aby
    return math.hypot(px - cx, py - cy), t, cx, cy


def _format_record(title, record):
    return f"{title}\n" + json.dumps(record, indent=2, sort_keys=True, default=str)


def _connect():
    creds = get_db_secret()
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    return pg8000.connect(
        user=creds["username"],
        password=creds["password"],
        host=creds["host"],
        port=int(creds["port"]),
        database=creds["dbname"],
        ssl_context=ssl_context,
    )


def _resolve_floor_id(cursor, building_id: str, floor_number: int) -> int:
    cursor.execute(
        """
        SELECT FloorID
        FROM Floors
        WHERE BuildingID = %s AND FloorNumber = %s
        LIMIT 1
        """,
        (building_id, floor_number),
    )
    row = cursor.fetchone()
    if not row:
        raise ValueError(f"No floor found for BuildingID={building_id}, FloorNumber={floor_number}")
    return int(row[0])


def _fetch_nodes(cursor, floor_id: int) -> Dict[str, dict]:
    cursor.execute(
        """
        SELECT NodeIDString, CoordinateX, CoordinateY, NodeType, NodeMeta
        FROM MapNodes
        WHERE FloorID = %s
        ORDER BY NodeIDString
        """,
        (floor_id,),
    )
    rows = cursor.fetchall()
    return {
        str(node_id): {
            "node_id": str(node_id),
            "x": float(x),
            "y": float(y),
            "type": str(node_type or ""),
            "node_meta": node_meta,
        }
        for node_id, x, y, node_type, node_meta in rows
    }


def _fetch_edges(cursor, floor_id: int) -> List[dict]:
    cursor.execute(
        """
        SELECT EdgeID, StartNodeID, EndNodeID, DistanceMeters, Bearing, IsBidirectional
        FROM MapEdges
        WHERE FloorID = %s
        ORDER BY EdgeID
        """,
        (floor_id,),
    )
    rows = cursor.fetchall()
    edges: List[dict] = []
    for edge_id, start_id, end_id, distance_m, bearing, bidir in rows:
        edges.append(
            {
                "edge_id": int(edge_id),
                "start": str(start_id),
                "end": str(end_id),
                "distance_meters": None if distance_m is None else float(distance_m),
                "bearing": None if bearing is None else float(bearing),
                "bidirectional": bool(bidir),
            }
        )
    return edges


def _fetch_landmarks(cursor, floor_id: int) -> List[dict]:
    cursor.execute(
        """
        SELECT LandmarkID, Name, NearestNodeID, DistanceToNode, BearingFromNode, MapCoordinateX, MapCoordinateY
        FROM Landmarks
        WHERE FloorID = %s
        ORDER BY LandmarkID
        """,
        (floor_id,),
    )
    rows = cursor.fetchall()
    landmarks: List[dict] = []
    for landmark_id, name, nearest_node_id, distance_to_node, bearing_from_node, x, y in rows:
        if x is None or y is None:
            continue
        landmarks.append(
            {
                "landmark_id": int(landmark_id),
                "name": str(name),
                "nearest_node_id": None if nearest_node_id is None else str(nearest_node_id),
                "distance_to_node": None if distance_to_node is None else float(distance_to_node),
                "bearing_from_node": bearing_from_node,
                "x": float(x),
                "y": float(y),
            }
        )
    return landmarks


def _resolve_output_path(output_arg: str | None, building_id: str, floor_number: int) -> Path:
    plots_dir = Path(__file__).resolve().parents[1] / "plots"
    if output_arg:
        output_path = Path(output_arg)
        if output_path.parent == Path("."):
            output_path = plots_dir / output_path.name
    else:
        output_path = plots_dir / f"plot-db-{building_id}-floor-{floor_number}.png"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    return output_path


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--building-id", default="B01")
    parser.add_argument("--floor-number", type=int, default=2)
    parser.add_argument(
        "--output",
        default=None,
        help="Output file path. If a filename is provided, it is saved under ./plots/.",
    )
    parser.add_argument("--show-edge-bearings", action="store_true")
    parser.add_argument("--show-node-labels", action="store_true", help="Render node ID/type labels")
    parser.add_argument("--show-landmark-labels", action="store_true", help="Render landmark name labels")
    parser.add_argument("--no-show", action="store_true", help="Skip opening interactive plot window")


def run_from_args(args: argparse.Namespace) -> int:
    try:
        import matplotlib.pyplot as plt
    except ImportError as exc:
        raise SystemExit("matplotlib is required. Install with: pip install matplotlib") from exc

    conn = None
    try:
        conn = _connect()
        cursor = conn.cursor()
        floor_id = _resolve_floor_id(cursor, args.building_id, args.floor_number)
        nodes = _fetch_nodes(cursor, floor_id)
        edges = _fetch_edges(cursor, floor_id)
        landmarks = _fetch_landmarks(cursor, floor_id)
    finally:
        if conn:
            conn.close()

    if not nodes:
        raise SystemExit("No nodes found for requested floor.")

    fig, ax = plt.subplots(figsize=(15, 10))
    edge_segments: List[dict] = []

    for edge in edges:
        start_id = edge["start"]
        end_id = edge["end"]
        if start_id not in nodes or end_id not in nodes:
            continue
        x1, y1 = nodes[start_id]["x"], nodes[start_id]["y"]
        x2, y2 = nodes[end_id]["x"], nodes[end_id]["y"]
        ax.plot([x1, x2], [y1, y2], color="#2563eb", linewidth=1.8, alpha=0.8)
        ax.annotate(
            "",
            xy=(x2, y2),
            xytext=(x1, y1),
            arrowprops={
                "arrowstyle": "-|>",
                "color": "#1d4ed8",
                "lw": 1.1,
                "alpha": 0.9,
                "shrinkA": 8,
                "shrinkB": 8,
                "mutation_scale": 11,
            },
            zorder=2,
        )
        edge_segments.append({"x1": x1, "y1": y1, "x2": x2, "y2": y2, "edge": edge})

        if args.show_edge_bearings and edge["bearing"] is not None:
            heading = edge["bearing"]
            is_bidirectional = edge["bidirectional"]
            label = f"{heading:.1f}°" if not is_bidirectional else f"{heading:.1f}°/{(heading + 180) % 360:.1f}°"
            xm = (x1 + x2) / 2.0
            ym = (y1 + y2) / 2.0
            ax.text(
                xm,
                ym,
                label,
                fontsize=7,
                color="#1d4ed8",
                bbox={"facecolor": "white", "edgecolor": "none", "alpha": 0.6, "pad": 0.5},
                ha="center",
                va="center",
            )

    x_vals = [v["x"] for v in nodes.values()]
    y_vals = [v["y"] for v in nodes.values()]
    node_scatter = ax.scatter(x_vals, y_vals, color="#111827", s=24, zorder=3, label="nodes")
    node_ids = list(nodes.keys())

    landmark_x = [lm["x"] for lm in landmarks]
    landmark_y = [lm["y"] for lm in landmarks]
    landmark_scatter = None
    if landmarks:
        landmark_scatter = ax.scatter(landmark_x, landmark_y, s=30, c="#dc2626", marker="x", zorder=4, label="landmarks")

    if args.show_node_labels:
        for node_id, node in nodes.items():
            x, y = node["x"], node["y"]
            node_type = node.get("type", "")
            ax.annotate(
                f"{node_id}\n({node_type})",
                xy=(x, y),
                xytext=(5, 5),
                textcoords="offset points",
                fontsize=6,
                color="#111827",
            )

    if args.show_landmark_labels:
        for landmark in landmarks:
            ax.annotate(
                landmark["name"],
                xy=(landmark["x"], landmark["y"]),
                xytext=(5, 5),
                textcoords="offset points",
                fontsize=7,
                color="#dc2626",
            )

    annot = ax.annotate(
        "",
        xy=(0, 0),
        xytext=(15, 15),
        textcoords="offset points",
        bbox={"boxstyle": "round", "fc": "w", "alpha": 0.95},
        arrowprops={"arrowstyle": "->"},
    )
    annot.set_visible(False)

    edge_hit_radius = 5.0

    def _show_annotation(event):
        if event.inaxes != ax or event.xdata is None or event.ydata is None:
            return False

        contains_node, node_info = node_scatter.contains(event)
        node_inds = node_info.get("ind", [])
        if contains_node and len(node_inds) > 0:
            idx = int(node_inds[0])
            node_id = node_ids[idx]
            rec = nodes[node_id]
            annot.xy = (rec["x"], rec["y"])
            annot.set_text(_format_record("Node", rec))
            annot.set_visible(True)
            return True

        if landmark_scatter is not None:
            contains_landmark, landmark_info = landmark_scatter.contains(event)
            landmark_inds = landmark_info.get("ind", [])
            if contains_landmark and len(landmark_inds) > 0:
                idx = int(landmark_inds[0])
                rec = landmarks[idx]
                annot.xy = (rec["x"], rec["y"])
                annot.set_text(_format_record("Landmark", rec))
                annot.set_visible(True)
                return True

        best = None
        for seg in edge_segments:
            d, t, cx, cy = _distance_point_to_segment(
                event.xdata,
                event.ydata,
                seg["x1"],
                seg["y1"],
                seg["x2"],
                seg["y2"],
            )
            if d <= edge_hit_radius and (best is None or d < best[0]):
                best = (d, t, cx, cy, seg["edge"])
        if best:
            _, t, cx, cy, edge = best
            edge_view = dict(edge)
            edge_view["hover_projection_t"] = round(t, 4)
            annot.xy = (cx, cy)
            annot.set_text(_format_record("Edge", edge_view))
            annot.set_visible(True)
            return True

        return False

    def on_move(event):
        shown = _show_annotation(event)
        if not shown and annot.get_visible():
            annot.set_visible(False)
        fig.canvas.draw_idle()

    fig.canvas.mpl_connect("motion_notify_event", on_move)

    ax.set_title(
        f"Deployed Map Graph: Building {args.building_id}, Floor {args.floor_number} (FloorID={floor_id})\n"
        "Source: MapNodes/MapEdges (raw DB coordinates)"
    )
    ax.set_xlabel("X (raw DB)")
    ax.set_ylabel("Y (raw DB)")
    ax.grid(True, alpha=0.2)
    ax.set_aspect("equal", adjustable="box")
    ax.margins(0.05)
    ax.legend(loc="best")

    output_path = _resolve_output_path(args.output, args.building_id, args.floor_number)
    plt.tight_layout()
    plt.savefig(output_path, dpi=220)
    print(f"Saved plot: {output_path}")

    if not args.no_show:
        plt.show()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    add_arguments(parser)
    args = parser.parse_args(argv)
    return run_from_args(args)


if __name__ == "__main__":
    raise SystemExit(main())

