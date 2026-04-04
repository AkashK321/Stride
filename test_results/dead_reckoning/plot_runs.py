#!/usr/bin/env python3
"""
Plot dead-reckoning run CSVs produced by frontend/dev-logger-server.js.

Usage:
  python plot_runs.py
  python plot_runs.py --input-dir ../../test_results/dead_reckoning --output-dir ./plots
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional


def load_rows(csv_file: Path) -> List[dict]:
    with csv_file.open("r", newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def to_float(value: str, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def heading_path_points(rows: List[dict]) -> tuple[list[float], list[float]]:
    # Build a rough XY trace by applying each step_delta using heading_avg_deg.
    x = 0.0
    y = 0.0
    xs = [x]
    ys = [y]
    for row in rows:
        step_delta = to_float(row.get("step_delta", "0"))
        heading_avg_deg = to_float(row.get("heading_avg_deg", "0"))
        # Convert heading (0=north, clockwise) to XY where +Y is north.
        import math

        theta = math.radians(heading_avg_deg)
        dx = step_delta * 0.7 * math.sin(theta)
        dy = step_delta * 0.7 * math.cos(theta)
        x += dx
        y += dy
        xs.append(x)
        ys.append(y)
    return xs, ys


def ensure_matplotlib():
    try:
        import matplotlib.pyplot as plt
    except ImportError as exc:
        raise SystemExit("matplotlib is required. Install with `pip install matplotlib`.") from exc
    return plt


def load_nodes_by_id(nodes_json: Path) -> Dict[str, dict]:
    if not nodes_json.is_file():
        return {}
    data = json.loads(nodes_json.read_text(encoding="utf-8"))
    return {str(n["id"]): n for n in data}


def plot_file(
    csv_file: Path,
    output_dir: Path,
    *,
    nodes_json: Path,
    map_image: Optional[Path] = None,
) -> List[Path]:
    rows = load_rows(csv_file)
    if not rows:
        return []

    plt = ensure_matplotlib()

    timestamps = [to_float(r.get("timestamp_ms", "0")) for r in rows]
    t0 = timestamps[0]
    elapsed_s = [(t - t0) / 1000.0 for t in timestamps]
    heading_raw = [to_float(r.get("heading_raw_deg", "0")) for r in rows]
    heading_avg = [to_float(r.get("heading_avg_deg", "0")) for r in rows]
    est_dist = [to_float(r.get("estimated_distance_m", "0")) for r in rows]
    gt_dist = to_float(rows[0].get("ground_truth_distance_m", "0"))

    outputs: List[Path] = []
    stem = csv_file.stem

    # Plot 1: distance vs time
    fig1, ax1 = plt.subplots(figsize=(10, 4.5))
    ax1.plot(elapsed_s, est_dist, label="Estimated distance (m)")
    if gt_dist > 0:
        ax1.axhline(gt_dist, linestyle="--", label=f"Ground truth ({gt_dist:.2f} m)")
    ax1.set_title(f"{stem}: estimated distance")
    ax1.set_xlabel("Elapsed time (s)")
    ax1.set_ylabel("Distance (m)")
    ax1.grid(alpha=0.25)
    ax1.legend()
    out1 = output_dir / f"{stem}_distance.png"
    fig1.tight_layout()
    fig1.savefig(out1, dpi=180)
    plt.close(fig1)
    outputs.append(out1)

    # Plot 2: heading raw vs avg
    fig2, ax2 = plt.subplots(figsize=(10, 4.5))
    ax2.plot(elapsed_s, heading_raw, alpha=0.5, label="Heading raw")
    ax2.plot(elapsed_s, heading_avg, linewidth=2, label="Heading avg")
    ax2.set_title(f"{stem}: heading raw vs rolling average")
    ax2.set_xlabel("Elapsed time (s)")
    ax2.set_ylabel("Heading (deg)")
    ax2.set_ylim(0, 360)
    ax2.grid(alpha=0.25)
    ax2.legend()
    out2 = output_dir / f"{stem}_heading.png"
    fig2.tight_layout()
    fig2.savefig(out2, dpi=180)
    plt.close(fig2)
    outputs.append(out2)

    # Plot 3: reconstructed XY trace (relative), or map-aligned when start_node_id is set
    feet_to_m = 0.3048
    nodes_by_id = load_nodes_by_id(nodes_json)
    xs_dr, ys_dr = heading_path_points(rows)
    row0 = rows[0]
    start_id = (row0.get("start_node_id") or "").strip()
    end_id = (row0.get("end_node_id") or "").strip()
    start_node = nodes_by_id.get(start_id) if start_id else None

    if start_node:
        sx = float(start_node["xFeet"]) * feet_to_m
        sy = float(start_node["yFeet"]) * feet_to_m
        xs = [sx + x for x in xs_dr]
        ys = [sy + y for y in ys_dr]
        title_note = " (floor-2 graph, start node)"
        xlabel = "X (m, building)"
        ylabel = "Y (m, building)"
    else:
        xs, ys = xs_dr, ys_dr
        title_note = ""
        xlabel = "X (m, relative)"
        ylabel = "Y (m, relative)"

    fig3, ax3 = plt.subplots(figsize=(8, 8))
    has_bg = bool(
        map_image
        and map_image.is_file()
        and start_node
    )
    if has_bg and map_image is not None:
        img = plt.imread(str(map_image))
        # Keep image extent tied to floor graph bounds so background remains
        # geometrically aligned to node/world coordinates across runs.
        all_x = [float(n["xFeet"]) * feet_to_m for n in nodes_by_id.values()]
        all_y = [float(n["yFeet"]) * feet_to_m for n in nodes_by_id.values()]
        node_xmin, node_xmax = min(all_x), max(all_x)
        node_ymin, node_ymax = min(all_y), max(all_y)
        node_span = max(node_xmax - node_xmin, node_ymax - node_ymin) or 1.0
        node_pad = node_span * 0.05 + 2.0
        img_xmin = node_xmin - node_pad
        img_xmax = node_xmax + node_pad
        img_ymin = node_ymin - node_pad
        img_ymax = node_ymax + node_pad
        ax3.imshow(
            img,
            extent=(img_xmin, img_xmax, img_ymin, img_ymax),
            origin="upper",
            aspect="equal",
            zorder=0,
        )
        # Axis limits can expand to include DR/end markers without distorting image mapping.
        xmin = min(img_xmin, min(xs))
        xmax = max(img_xmax, max(xs))
        ymin = min(img_ymin, min(ys))
        ymax = max(img_ymax, max(ys))
        if end_id and end_id in nodes_by_id:
            en = nodes_by_id[end_id]
            ex = float(en["xFeet"]) * feet_to_m
            ey = float(en["yFeet"]) * feet_to_m
            xmin = min(xmin, ex)
            xmax = max(xmax, ex)
            ymin = min(ymin, ey)
            ymax = max(ymax, ey)
        span = max(xmax - xmin, ymax - ymin) or 1.0
        pad = span * 0.03 + 0.5
        ax3.set_xlim(xmin - pad, xmax + pad)
        ax3.set_ylim(ymin - pad, ymax + pad)
    elif start_node:
        all_x = [float(n["xFeet"]) * feet_to_m for n in nodes_by_id.values()]
        all_y = [float(n["yFeet"]) * feet_to_m for n in nodes_by_id.values()]
        xmin = min(min(all_x), min(xs))
        xmax = max(max(all_x), max(xs))
        ymin = min(min(all_y), min(ys))
        ymax = max(max(all_y), max(ys))
        if end_id and end_id in nodes_by_id:
            en = nodes_by_id[end_id]
            ex = float(en["xFeet"]) * feet_to_m
            ey = float(en["yFeet"]) * feet_to_m
            xmin = min(xmin, ex)
            xmax = max(xmax, ex)
            ymin = min(ymin, ey)
            ymax = max(ymax, ey)
        span = max(xmax - xmin, ymax - ymin) or 1.0
        pad = span * 0.05 + 2.0
        ax3.set_xlim(xmin - pad, xmax + pad)
        ax3.set_ylim(ymin - pad, ymax + pad)

    line_color = "cyan" if has_bg else "C0"
    ax3.plot(
        xs,
        ys,
        marker="o",
        markersize=2,
        linewidth=1.5,
        color=line_color,
        zorder=2,
        label="Dead reckoning",
    )
    if start_node:
        ax3.scatter(
            [xs[0]],
            [ys[0]],
            marker="s",
            s=70,
            c="lime",
            edgecolors="black",
            linewidths=0.5,
            zorder=4,
            label="Start (graph)",
        )
    else:
        ax3.scatter([xs[0]], [ys[0]], marker="s", zorder=3, label="Start")
    ax3.scatter([xs[-1]], [ys[-1]], marker="x", zorder=3, label="DR end")
    if end_id and end_id in nodes_by_id:
        en = nodes_by_id[end_id]
        ex = float(en["xFeet"]) * feet_to_m
        ey = float(en["yFeet"]) * feet_to_m
        ax3.scatter(
            [ex],
            [ey],
            marker="*",
            s=160,
            c="gold",
            edgecolors="black",
            linewidths=0.5,
            zorder=4,
            label="End (graph)",
        )
    ax3.set_title(f"{stem}: reconstructed path{title_note}")
    ax3.set_xlabel(xlabel)
    ax3.set_ylabel(ylabel)
    ax3.grid(alpha=0.25, zorder=1)
    ax3.set_aspect("equal", adjustable="box")
    ax3.legend(loc="best")
    out3 = output_dir / f"{stem}_path.png"
    fig3.tight_layout()
    fig3.savefig(out3, dpi=180)
    plt.close(fig3)
    outputs.append(out3)

    return outputs


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    default_nodes = repo_root / "frontend" / "data" / "floor2Nodes.json"

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input-dir",
        default=str(Path(__file__).resolve().parent),
        help="Directory containing dead-reckoning CSVs",
    )
    parser.add_argument(
        "--output-dir",
        default="",
        help="Directory for plots (defaults to <input-dir>/plots)",
    )
    parser.add_argument(
        "--nodes-json",
        default=str(default_nodes),
        help="Floor graph nodes (from frontend/data/floor2Nodes.json)",
    )
    parser.add_argument(
        "--map-image",
        nargs="?",
        const="auto",
        default=None,
        metavar="PATH",
        help="Optional floor-plan PNG/JPG (aligned to node coordinates in meters). "
        "Use --map-image alone to use <input-dir>/assets/floor2_map.png when present. "
        "If you omit the flag entirely, that same default file is used when present.",
    )
    args = parser.parse_args()

    input_dir = Path(args.input_dir).resolve()
    output_dir = Path(args.output_dir).resolve() if args.output_dir else input_dir / "plots"
    output_dir.mkdir(parents=True, exist_ok=True)

    nodes_json = Path(args.nodes_json).resolve()
    default_floor_plan = input_dir / "assets" / "floor2_map.png"
    map_image: Optional[Path] = None
    if args.map_image is None or args.map_image == "auto":
        if default_floor_plan.is_file():
            map_image = default_floor_plan
    else:
        map_image = Path(args.map_image).resolve()

    # Run CSVs: <test_id>-<YYYYMMDD-HHmmss-mmm>.csv (excludes responses-*.csv in same folder)
    csv_files = sorted(
        p
        for p in input_dir.glob("*.csv")
        if p.is_file() and not p.name.startswith("responses-")
    )
    if not csv_files:
        raise SystemExit(f"No run CSV files found in {input_dir}")

    generated: Dict[Path, List[Path]] = defaultdict(list)
    for csv_file in csv_files:
        generated[csv_file] = plot_file(
            csv_file,
            output_dir,
            nodes_json=nodes_json,
            map_image=map_image,
        )

    print("Generated plots:")
    for csv_file, paths in generated.items():
        print(f"- {csv_file.name}")
        for p in paths:
            print(f"  - {p}")


if __name__ == "__main__":
    main()
