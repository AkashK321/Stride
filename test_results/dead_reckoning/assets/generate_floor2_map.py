#!/usr/bin/env python3
"""
Generate a floor-2 graph map image in a true-north-aligned frame.

Modeled after aws_resources/data_population/plot_map_graph.py
but without dense edge-bearing text labels.
"""

from __future__ import annotations

import argparse
import importlib.util
import math
from pathlib import Path
from typing import Dict, List, Tuple


def _load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, str(path))
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not import module at {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _parse_bool(val: str) -> bool:
    return str(val).strip().lower() in ("1", "true", "yes", "on")


def _transform_for_true_north(
    x_feet: float,
    y_feet: float,
    true_north_offset_deg: float,
    mirror_x: bool,
) -> Tuple[float, float]:
    x = -x_feet if mirror_x else x_feet
    y = -y_feet
    angle = math.radians(-true_north_offset_deg)
    x_rot = (x * math.cos(angle)) - (y * math.sin(angle))
    y_rot = (x * math.sin(angle)) + (y * math.cos(angle))
    return x_rot, y_rot


def _load_floor2_graph(repo_root: Path, floor_number: int = 2) -> Tuple[List[dict], List[dict]]:
    floor2_py = repo_root / "aws_resources" / "data_population" / "floor_data" / "floor2.py"
    mod = _load_module(floor2_py, "floor2_data_module")
    for floor in mod.FLOOR2_DATA.get("floors", []):
        if floor.get("floor_number") == floor_number:
            return list(floor.get("nodes", [])), list(floor.get("edges", []))
    raise SystemExit(f"Floor {floor_number} not found in {floor2_py}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--floor-number", type=int, default=2)
    parser.add_argument("--offset", type=float, default=51.0)
    parser.add_argument("--mirror-x", default="false")
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parent / "floor2_map.png"),
    )
    args = parser.parse_args()

    try:
        import matplotlib.pyplot as plt
    except ImportError as exc:
        raise SystemExit("matplotlib is required. Install with `pip install matplotlib`.") from exc

    repo_root = Path(__file__).resolve().parents[3]
    feet_to_m = 0.3048
    nodes, edges = _load_floor2_graph(repo_root, floor_number=args.floor_number)
    nodes_by_id: Dict[str, dict] = {str(n["id"]): n for n in nodes}

    transformed = {
        node_id: _transform_for_true_north(
            x_feet=float(node["x_feet"]),
            y_feet=float(node["y_feet"]),
            true_north_offset_deg=args.offset,
            mirror_x=_parse_bool(args.mirror_x),
        )
        for node_id, node in nodes_by_id.items()
    }

    fig, ax = plt.subplots(figsize=(11, 9), dpi=220)
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    for edge in edges:
        sid = edge.get("start")
        eid = edge.get("end")
        p1 = transformed.get(str(sid))
        p2 = transformed.get(str(eid))
        if not p1 or not p2:
            continue
        x1, y1 = p1[0] * feet_to_m, p1[1] * feet_to_m
        x2, y2 = p2[0] * feet_to_m, p2[1] * feet_to_m
        ax.plot([x1, x2], [y1, y2], color="#4B5563", linewidth=2.6, alpha=0.9, zorder=1)

    for n in nodes:
        tx, ty = transformed[str(n["id"])]
        x = tx * feet_to_m
        y = ty * feet_to_m
        node_type = str(n.get("type", "Intersection"))
        if node_type == "Door":
            color, size = "#1F2937", 16
        elif node_type in ("Stairwell", "Elevator"):
            color, size = "#065F46", 28
        elif node_type == "Corner":
            color, size = "#7C3AED", 24
        else:
            color, size = "#2563EB", 20
        ax.scatter([x], [y], s=size, c=color, zorder=2)

    x_vals = [pt[0] * feet_to_m for pt in transformed.values()]
    y_vals = [pt[1] * feet_to_m for pt in transformed.values()]
    x_min, x_max = min(x_vals), max(x_vals)
    y_min, y_max = min(y_vals), max(y_vals)
    span_x = max(1.0, x_max - x_min)
    span_y = max(1.0, y_max - y_min)
    nx = x_min + 0.06 * span_x
    ny = y_max - 0.07 * span_y
    ax.annotate(
        "",
        xy=(nx, ny + 0.11 * span_y),
        xytext=(nx, ny),
        arrowprops={"arrowstyle": "->", "lw": 2.2, "color": "#DC2626"},
    )
    ax.text(nx, ny + 0.12 * span_y, "N", color="#DC2626", fontsize=11, ha="center", fontweight="bold")

    ax.set_aspect("equal", adjustable="box")
    ax.axis("off")
    ax.margins(0.05)

    out_path = Path(args.output).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    plt.tight_layout()
    plt.savefig(out_path, dpi=220, bbox_inches="tight", pad_inches=0.02)
    plt.close(fig)
    print(f"Generated {out_path}")


if __name__ == "__main__":
    main()
