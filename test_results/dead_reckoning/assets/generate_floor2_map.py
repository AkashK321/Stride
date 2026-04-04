#!/usr/bin/env python3
"""
Draw a true-north-aligned floor-2 graph map for dead-reckoning overlays.

Modeled after aws_resources/data_population/plot_map_graph.py, but without
per-edge bearing text labels.
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
    """
    Convert floor-data coordinates to true-north plotting coordinates.
    """
    x = -x_feet if mirror_x else x_feet
    y = -y_feet
    angle = math.radians(-true_north_offset_deg)
    x_rot = (x * math.cos(angle)) - (y * math.sin(angle))
    y_rot = (x * math.sin(angle)) + (y * math.cos(angle))
    return x_rot, y_rot


def _load_floor2_data(repo_root: Path, floor_number: int) -> Tuple[List[dict], List[dict]]:
    floor2_path = repo_root / "aws_resources" / "data_population" / "floor_data" / "floor2.py"
    floor2_mod = _load_module(floor2_path, "floor2_data_module")
    for floor in floor2_mod.FLOOR2_DATA.get("floors", []):
        if floor.get("floor_number") == floor_number:
            return floor.get("nodes", []), floor.get("edges", [])
    raise ValueError(f"Floor {floor_number} not found in FLOOR2_DATA")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--floor-number", type=int, default=2)
    parser.add_argument("--offset", type=float, default=51.0)
    parser.add_argument("--flip", default="true")
    parser.add_argument("--flip-mode", choices=["bands", "cones"], default="bands")
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
    pop_path = repo_root / "aws_resources" / "data_population" / "populate_floor_data.py"
    pop = _load_module(pop_path, "populate_floor_data_module")
    nodes, edges = _load_floor2_data(repo_root, args.floor_number)
    nodes_by_id: Dict[str, dict] = {str(n["id"]): n for n in nodes}

    transformed = {
        nid: _transform_for_true_north(
            x_feet=node["x_feet"],
            y_feet=node["y_feet"],
            true_north_offset_deg=args.offset,
            mirror_x=_parse_bool(args.mirror_x),
        )
        for nid, node in nodes_by_id.items()
    }

    fig, ax = plt.subplots(figsize=(12, 10), dpi=220)
    ax.set_facecolor("#FAFAFA")

    apply_flip = _parse_bool(args.flip)

    # Draw edges and heading arrows (no text labels).
    for edge in edges:
        sid = edge["start"]
        eid = edge["end"]
        if sid not in transformed or eid not in transformed:
            continue
        x1, y1 = transformed[sid]
        x2, y2 = transformed[eid]
        ax.plot([x1, x2], [y1, y2], color="#2563EB", linewidth=2.2, alpha=0.85, zorder=1)

        raw = pop.calculate_bearing(
            nodes_by_id[sid]["x_feet"],
            nodes_by_id[sid]["y_feet"],
            nodes_by_id[eid]["x_feet"],
            nodes_by_id[eid]["y_feet"],
        )
        heading_true = pop.align_bearing_to_true_north(
            raw_bearing_deg=raw,
            offset_deg=args.offset,
            apply_horizontal_flip=apply_flip,
            horizontal_mode=args.flip_mode,
        )
        theta = math.radians(heading_true)
        xm, ym = (x1 + x2) / 2.0, (y1 + y2) / 2.0
        dx, dy = math.sin(theta) * 1.0, math.cos(theta) * 1.0
        ax.arrow(
            xm,
            ym,
            dx,
            dy,
            width=0.02,
            head_width=0.28,
            head_length=0.38,
            length_includes_head=True,
            color="#0EA5E9",
            alpha=0.9,
            zorder=2,
        )

    # Draw nodes + compact labels.
    x_vals = [pt[0] for pt in transformed.values()]
    y_vals = [pt[1] for pt in transformed.values()]
    ax.scatter(x_vals, y_vals, color="#111827", s=16, zorder=3)
    for node_id, (x, y) in transformed.items():
        ax.text(x + 0.5, y + 0.5, node_id, fontsize=6, color="#111827")

    # True north indicator.
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
        arrowprops={"arrowstyle": "->", "lw": 2, "color": "#DC2626"},
    )
    ax.text(nx, ny + 0.13 * span_y, "N (True North)", color="#DC2626", fontsize=10, ha="center")

    ax.set_title(
        f"Floor {args.floor_number} Map Graph (True-North Aligned)\n"
        f"offset={args.offset}°, flip={apply_flip}, flip_mode={args.flip_mode}, mirror_x={args.mirror_x}"
    )
    ax.set_xlabel("X (feet, rotated/aligned)")
    ax.set_ylabel("Y (feet, up = true north)")
    ax.grid(True, alpha=0.2)
    ax.set_aspect("equal", adjustable="box")
    ax.margins(0.05)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    plt.tight_layout()
    plt.savefig(out_path, dpi=220)
    plt.close(fig)
    print(f"Generated {out_path}")


if __name__ == "__main__":
    main()
