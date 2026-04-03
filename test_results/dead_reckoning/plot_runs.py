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
from collections import defaultdict
from pathlib import Path
from typing import Dict, List


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


def plot_file(csv_file: Path, output_dir: Path) -> List[Path]:
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

    # Plot 3: reconstructed XY trace
    xs, ys = heading_path_points(rows)
    fig3, ax3 = plt.subplots(figsize=(6.5, 6.5))
    ax3.plot(xs, ys, marker="o", markersize=2, linewidth=1.5)
    ax3.scatter([xs[0]], [ys[0]], marker="s", label="Start")
    ax3.scatter([xs[-1]], [ys[-1]], marker="x", label="End")
    ax3.set_title(f"{stem}: reconstructed path")
    ax3.set_xlabel("X (m, relative)")
    ax3.set_ylabel("Y (m, relative)")
    ax3.grid(alpha=0.25)
    ax3.set_aspect("equal", adjustable="box")
    ax3.legend()
    out3 = output_dir / f"{stem}_path.png"
    fig3.tight_layout()
    fig3.savefig(out3, dpi=180)
    plt.close(fig3)
    outputs.append(out3)

    return outputs


def main() -> None:
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
    args = parser.parse_args()

    input_dir = Path(args.input_dir).resolve()
    output_dir = Path(args.output_dir).resolve() if args.output_dir else input_dir / "plots"
    output_dir.mkdir(parents=True, exist_ok=True)

    csv_files = sorted(input_dir.glob("dead-reckoning-*.csv"))
    if not csv_files:
        raise SystemExit(f"No run CSV files found in {input_dir}")

    generated: Dict[Path, List[Path]] = defaultdict(list)
    for csv_file in csv_files:
        generated[csv_file] = plot_file(csv_file, output_dir)

    print("Generated plots:")
    for csv_file, paths in generated.items():
        print(f"- {csv_file.name}")
        for p in paths:
            print(f"  - {p}")


if __name__ == "__main__":
    main()
