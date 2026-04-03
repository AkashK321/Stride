"""
Draw floor map nodes/edges with labels and true-compass edge headings.

The plot is transformed so that the top of the image is true north.

Examples:
  python plot_map_graph.py
  python plot_map_graph.py --floor-number 2 --output floor2_true_north.png
  python plot_map_graph.py --offset 51 --flip true --flip-mode bands
"""

import argparse
import math
from typing import Dict, Tuple

from floor_data.floor2 import FLOOR2_DATA
from populate_floor_data import align_bearing_to_true_north, calculate_bearing


def _parse_bool(val: str) -> bool:
    return val.strip().lower() in ("1", "true", "yes", "on")


def _transform_for_true_north(
    x_feet: float,
    y_feet: float,
    true_north_offset_deg: float,
    mirror_x: bool,
) -> Tuple[float, float]:
    """
    Convert floor-data coordinates to plotting coordinates.

    - Floor data uses screen-style Y (increasing downward).
    - Matplotlib uses math-style Y (increasing upward).
    - Then rotate clockwise by the true-north offset so the plot's +Y is true north.
    """
    x = -x_feet if mirror_x else x_feet
    y = -y_feet

    # Clockwise rotation by offset == CCW rotation by -offset.
    angle = math.radians(-true_north_offset_deg)
    x_rot = (x * math.cos(angle)) - (y * math.sin(angle))
    y_rot = (x * math.sin(angle)) + (y * math.cos(angle))
    return x_rot, y_rot


def _get_floor_record(floor_number: int):
    for floor in FLOOR2_DATA.get("floors", []):
        if floor.get("floor_number") == floor_number:
            return floor
    raise ValueError(f"Floor {floor_number} not found in FLOOR2_DATA")


def _build_nodes(floor) -> Dict[str, dict]:
    return {node["id"]: node for node in floor.get("nodes", [])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--floor-number", type=int, default=2)
    parser.add_argument("--output", default="floor_map_true_north.png")
    parser.add_argument("--offset", type=float, default=51.0)
    parser.add_argument("--flip", default="true", help="true/false for horizontal bearing flip")
    parser.add_argument("--flip-mode", choices=["bands", "cones"], default="bands")
    parser.add_argument(
        "--mirror-x",
        default="false",
        help="Mirror X coordinates before rotation (true/false). "
        "Use true if map east/west is visually reversed.",
    )
    parser.add_argument("--show", action="store_true", help="Show interactive plot window")
    args = parser.parse_args()

    apply_flip = _parse_bool(args.flip)
    mirror_x = _parse_bool(args.mirror_x)

    try:
        import matplotlib.pyplot as plt
    except ImportError as exc:
        raise SystemExit(
            "matplotlib is required. Install with: pip install matplotlib"
        ) from exc

    floor = _get_floor_record(args.floor_number)
    nodes = _build_nodes(floor)
    edges = floor.get("edges", [])

    transformed = {}
    for node_id, node in nodes.items():
        transformed[node_id] = _transform_for_true_north(
            x_feet=node["x_feet"],
            y_feet=node["y_feet"],
            true_north_offset_deg=args.offset,
            mirror_x=mirror_x,
        )

    fig, ax = plt.subplots(figsize=(15, 11))

    # Draw edges first.
    for edge in edges:
        start_id = edge["start"]
        end_id = edge["end"]
        x1, y1 = transformed[start_id]
        x2, y2 = transformed[end_id]

        ax.plot([x1, x2], [y1, y2], color="#2563eb", linewidth=1.8, alpha=0.8)

        # Heading label in true-compass convention.
        raw = calculate_bearing(
            nodes[start_id]["x_feet"],
            nodes[start_id]["y_feet"],
            nodes[end_id]["x_feet"],
            nodes[end_id]["y_feet"],
        )
        heading = align_bearing_to_true_north(
            raw_bearing_deg=raw,
            offset_deg=args.offset,
            apply_horizontal_flip=apply_flip,
            horizontal_mode=args.flip_mode,
        )
        is_bidirectional = edge.get("bidirectional", True)
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

    # Draw nodes and labels.
    x_vals = [pt[0] for pt in transformed.values()]
    y_vals = [pt[1] for pt in transformed.values()]
    ax.scatter(x_vals, y_vals, color="#111827", s=18, zorder=3)

    for node_id, (x, y) in transformed.items():
        node_type = nodes[node_id].get("type", "")
        ax.text(
            x + 0.6,
            y + 0.6,
            f"{node_id}\n({node_type})",
            fontsize=6,
            color="#111827",
        )

    # True north indicator: up in plot.
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
    ax.text(nx, ny + 0.13 * span_y, "N (True North)", color="#dc2626", fontsize=10, ha="center")

    ax.set_title(
        f"Floor {args.floor_number} Map Graph (True-North Aligned)\n"
        f"offset={args.offset}°, flip={apply_flip}, flip_mode={args.flip_mode}, mirror_x={mirror_x}"
    )
    ax.set_xlabel("X (feet, rotated/aligned)")
    ax.set_ylabel("Y (feet, up = true north)")
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
