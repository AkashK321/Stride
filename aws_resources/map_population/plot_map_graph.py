"""
Draw floor map nodes/edges from deployed DB state (MapNodes/MapEdges).

This visualizes what is actively deployed, not local floor_data/*.py.
Coordinates are transformed so plot-up is true north.

Examples:
  python plot_map_graph.py
  python plot_map_graph.py --floor-number 2 --building-id B01 --output floor_map_deployed.png
  python plot_map_graph.py --show-edge-bearings
"""

import argparse
import math
import ssl
from typing import Dict, List, Tuple

import pg8000
from dotenv import load_dotenv

from populate_floor_data import get_db_secret

load_dotenv()


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
        SELECT NodeIDString, CoordinateX, CoordinateY, NodeType
        FROM MapNodes
        WHERE FloorID = %s
        ORDER BY NodeIDString
        """,
        (floor_id,),
    )
    rows = cursor.fetchall()
    return {
        str(node_id): {
            "x": float(x),
            "y": float(y),
            "type": str(node_type or ""),
        }
        for node_id, x, y, node_type in rows
    }


def _fetch_edges(cursor, floor_id: int) -> List[dict]:
    cursor.execute(
        """
        SELECT StartNodeID, EndNodeID, Bearing, IsBidirectional
        FROM MapEdges
        WHERE FloorID = %s
        ORDER BY EdgeID
        """,
        (floor_id,),
    )
    rows = cursor.fetchall()
    edges: List[dict] = []
    for start_id, end_id, bearing, bidir in rows:
        edges.append(
            {
                "start": str(start_id),
                "end": str(end_id),
                "bearing": None if bearing is None else float(bearing),
                "bidirectional": bool(bidir),
            }
        )
    return edges


def _to_plot_coords_true_north(
    x_px: float,
    y_px: float,
    true_north_offset_deg: float,
) -> Tuple[float, float]:
    """
    DB coordinates are screen-style (y increases downward).
    Convert to true-north plotting coordinates:
    - invert Y to math-style coordinates
    - rotate clockwise by true north offset (CCW by -offset)
    """
    x = x_px
    y = -y_px
    angle = math.radians(-true_north_offset_deg)
    x_rot = (x * math.cos(angle)) - (y * math.sin(angle))
    y_rot = (x * math.sin(angle)) + (y * math.cos(angle))
    return x_rot, y_rot


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--building-id", default="B01")
    parser.add_argument("--floor-number", type=int, default=2)
    parser.add_argument("--output", default="floor_map_true_north.png")
    parser.add_argument(
        "--offset",
        type=float,
        default=51.0,
        help="True-north offset degrees used to rotate deployed coordinates (default: 51).",
    )
    parser.add_argument("--show-edge-bearings", action="store_true")
    parser.add_argument("--show", action="store_true", help="Show interactive plot window")
    args = parser.parse_args()

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
    finally:
        if conn:
            conn.close()

    if not nodes:
        raise SystemExit("No nodes found for requested floor.")

    transformed = {
        node_id: _to_plot_coords_true_north(v["x"], v["y"], args.offset)
        for node_id, v in nodes.items()
    }

    fig, ax = plt.subplots(figsize=(15, 11))

    # Draw edges first.
    for edge in edges:
        start_id = edge["start"]
        end_id = edge["end"]
        if start_id not in transformed or end_id not in transformed:
            continue
        x1, y1 = transformed[start_id]
        x2, y2 = transformed[end_id]

        ax.plot([x1, x2], [y1, y2], color="#2563eb", linewidth=1.8, alpha=0.8)

        if args.show_edge_bearings and edge["bearing"] is not None:
            heading = edge["bearing"]
            is_bidirectional = edge["bidirectional"]
            label = (
                f"{heading:.1f}°"
                if not is_bidirectional
                else f"{heading:.1f}°/{(heading + 180) % 360:.1f}°"
            )
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

    # Draw nodes and labels.
    x_vals = [pt[0] for pt in transformed.values()]
    y_vals = [pt[1] for pt in transformed.values()]
    ax.scatter(x_vals, y_vals, color="#111827", s=18, zorder=3)

    for node_id, (x, y) in transformed.items():
        node_type = nodes[node_id].get("type", "")
        ax.text(
            x + 6,
            y + 6,
            f"{node_id}\n({node_type})",
            fontsize=6,
            color="#111827",
        )

    # North indicator (up in plot).
    x_min, x_max = min(x_vals), max(x_vals)
    y_min, y_max = min(y_vals), max(y_vals)
    span_x = max(1.0, x_max - x_min)
    span_y = max(1.0, y_max - y_min)
    nx = x_min + 0.05 * span_x
    ny = y_max - 0.05 * span_y
    ax.annotate(
        "",
        xy=(nx, ny + 0.12 * span_y),
        xytext=(nx, ny),
        arrowprops={"arrowstyle": "->", "lw": 2, "color": "#dc2626"},
    )
    ax.text(nx, ny + 0.13 * span_y, "N (Up)", color="#dc2626", fontsize=10, ha="center")

    ax.set_title(
        f"Deployed Map Graph: Building {args.building_id}, Floor {args.floor_number} (FloorID={floor_id})\n"
        f"Source: MapNodes/MapEdges, true-north offset={args.offset}°"
    )
    ax.set_xlabel("X (deployed pixels, true-north frame)")
    ax.set_ylabel("Y (deployed pixels, up = true north)")
    ax.grid(True, alpha=0.2)
    ax.set_aspect("equal", adjustable="box")
    ax.margins(0.05)

    plt.tight_layout()
    plt.savefig(args.output, dpi=220)
    print(f"Saved plot: {args.output}")

    if args.show:
        plt.show()


if __name__ == "__main__":
    main()
