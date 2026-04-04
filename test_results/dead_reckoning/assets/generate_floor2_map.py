#!/usr/bin/env python3
"""
Generate a floor-2 graph map image aligned to true north (up).

Output:
  test_results/dead_reckoning/assets/floor2_map.png

The image is rendered in the same meter coordinate frame used by:
  - frontend/data/floor2Nodes.json
  - test_results/dead_reckoning/plot_runs.py
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Dict, List, Tuple


def load_floor2_graph() -> Tuple[List[dict], List[dict]]:
    repo_root = Path(__file__).resolve().parents[3]
    floor2_py = repo_root / "aws_resources" / "data_population" / "floor_data" / "floor2.py"
    spec = importlib.util.spec_from_file_location("floor2_data_module", str(floor2_py))
    if spec is None or spec.loader is None:
        raise SystemExit(f"Could not load floor2 data from {floor2_py}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    floor = module.FLOOR2_DATA["floors"][0]
    return floor["nodes"], floor["edges"]


def main() -> None:
    try:
        import matplotlib.pyplot as plt
    except ImportError as exc:
        raise SystemExit("matplotlib is required. Install with `pip install matplotlib`.") from exc

    feet_to_m = 0.3048
    nodes, edges = load_floor2_graph()

    nodes_by_id: Dict[str, dict] = {str(n["id"]): n for n in nodes}
    xs_nodes = [float(n["x_feet"]) * feet_to_m for n in nodes]
    ys_nodes = [float(n["y_feet"]) * feet_to_m for n in nodes]

    xmin, xmax = min(xs_nodes), max(xs_nodes)
    ymin, ymax = min(ys_nodes), max(ys_nodes)
    span = max(xmax - xmin, ymax - ymin) or 1.0
    pad = span * 0.05 + 2.0

    fig, ax = plt.subplots(figsize=(10, 10), dpi=220)
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    # Corridors / graph edges
    for edge in edges:
        start = nodes_by_id.get(edge["start"])
        end = nodes_by_id.get(edge["end"])
        if not start or not end:
            continue
        x1 = float(start["x_feet"]) * feet_to_m
        y1 = float(start["y_feet"]) * feet_to_m
        x2 = float(end["x_feet"]) * feet_to_m
        y2 = float(end["y_feet"]) * feet_to_m
        ax.plot([x1, x2], [y1, y2], color="#4B5563", linewidth=3.0, alpha=0.9, zorder=1)

    # Nodes
    for n in nodes:
        x = float(n["x_feet"]) * feet_to_m
        y = float(n["y_feet"]) * feet_to_m
        node_type = str(n.get("type", "Intersection"))
        if node_type == "Door":
            color = "#1F2937"
            size = 18
        elif node_type in ("Stairwell", "Elevator"):
            color = "#065F46"
            size = 30
        else:
            color = "#2563EB"
            size = 22
        ax.scatter([x], [y], s=size, c=color, zorder=2)

    # True north indicator: top of map is north
    arrow_x = xmax + pad * 0.45
    arrow_y_bottom = ymax - pad * 0.75
    arrow_y_top = ymax - pad * 0.15
    ax.annotate(
        "",
        xy=(arrow_x, arrow_y_top),
        xytext=(arrow_x, arrow_y_bottom),
        arrowprops=dict(arrowstyle="-|>", lw=2.2, color="#111827"),
        zorder=3,
    )
    ax.text(
        arrow_x,
        arrow_y_top + pad * 0.08,
        "N",
        ha="center",
        va="bottom",
        fontsize=13,
        fontweight="bold",
        color="#111827",
        zorder=3,
    )

    ax.set_xlim(xmin - pad, xmax + pad)
    ax.set_ylim(ymin - pad, ymax + pad)
    ax.set_aspect("equal", adjustable="box")
    ax.axis("off")

    out_path = Path(__file__).resolve().parent / "floor2_map.png"
    fig.savefig(out_path, dpi=220, bbox_inches="tight", pad_inches=0.02)
    plt.close(fig)
    print(f"Generated {out_path}")


if __name__ == "__main__":
    main()
