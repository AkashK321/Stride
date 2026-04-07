"""
Interactive matplotlib plot for floor data objects.

Hover over nodes/edges/landmarks to inspect full record details.

Examples:
  python plot_floor_data_v2.py
  python plot_floor_data_v2.py --module floor_data.floor2_v2 --var FLOOR2_DATA_V2 --floor-number 2
"""

import argparse
import collections
import importlib
import json
import math

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
    return f"{title}\n" + json.dumps(record, indent=2, sort_keys=True)


def _spread_overlapping_points(x_vals, y_vals, radius=1.1):
    """Return display coordinates that fan out exact overlaps."""
    groups = collections.defaultdict(list)
    for idx, (x_val, y_val) in enumerate(zip(x_vals, y_vals)):
        groups[(x_val, y_val)].append(idx)

    spread_x = list(x_vals)
    spread_y = list(y_vals)
    overlap_groups = {}

    for (base_x, base_y), idxs in groups.items():
        if len(idxs) <= 1:
            continue
        overlap_groups[(base_x, base_y)] = len(idxs)
        for order, idx in enumerate(idxs):
            theta = (2 * math.pi * order) / len(idxs)
            spread_x[idx] = base_x + radius * math.cos(theta)
            spread_y[idx] = base_y + radius * math.sin(theta)

    return spread_x, spread_y, overlap_groups


def plot_floor(data_obj, floor_number, compare_data_obj=None):
    import matplotlib.pyplot as plt

    floor = next((f for f in data_obj["floors"] if f["floor_number"] == floor_number), None)
    if floor is None:
        raise ValueError(f"Floor {floor_number} not found")

    nodes = floor.get("nodes", [])
    edges = floor.get("edges", [])
    landmarks = floor.get("landmarks", [])
    node_lookup = {n["id"]: n for n in nodes}

    fig, ax = plt.subplots(figsize=(15, 10))
    ax.set_title(f"Map Graph - Floor {floor_number}")
    ax.set_xlabel("x_feet")
    ax.set_ylabel("y_feet")
    ax.grid(alpha=0.2)
    ax.set_aspect("equal", adjustable="box")

    node_x = [n["x_feet"] for n in nodes]
    node_y = [n["y_feet"] for n in nodes]
    plot_x, plot_y, _ = _spread_overlapping_points(node_x, node_y)
    node_scatter = ax.scatter(plot_x, plot_y, s=24, c="#111827", label="nodes", zorder=3)

    landmark_x = [l["x_feet"] for l in landmarks]
    landmark_y = [l["y_feet"] for l in landmarks]
    landmark_scatter = ax.scatter(landmark_x, landmark_y, s=30, c="#dc2626", marker="x", label="landmarks", zorder=4)

    for edge in edges:
        s = node_lookup.get(edge["start"])
        e = node_lookup.get(edge["end"])
        if not s or not e:
            continue
        ax.plot([s["x_feet"], e["x_feet"]], [s["y_feet"], e["y_feet"]], color="#2563eb", linewidth=1.8, alpha=0.8, zorder=1)

    if compare_data_obj is not None:
        compare_floor = next((f for f in compare_data_obj["floors"] if f["floor_number"] == floor_number), None)
        if compare_floor is not None:
            compare_nodes = {n["id"]: n for n in compare_floor.get("nodes", [])}
            for edge in compare_floor.get("edges", []):
                s = compare_nodes.get(edge["start"])
                e = compare_nodes.get(edge["end"])
                if not s or not e:
                    continue
                ax.plot(
                    [s["x_feet"], e["x_feet"]],
                    [s["y_feet"], e["y_feet"]],
                    color="#9ca3af",
                    linewidth=1.2,
                    alpha=0.6,
                    linestyle="--",
                    zorder=0,
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

    edge_hit_radius = 1.2

    def _show_annotation(event):
        if event.inaxes != ax or event.xdata is None or event.ydata is None:
            return False

        contains_node, node_info = node_scatter.contains(event)
        node_inds = node_info.get("ind", [])
        if contains_node and len(node_inds) > 0:
            idx = int(node_inds[0])
            rec = nodes[idx]
            annot.xy = (plot_x[idx], plot_y[idx])
            annot.set_text(_format_record("Node", rec))
            annot.set_visible(True)
            return True

        contains_landmark, landmark_info = landmark_scatter.contains(event)
        landmark_inds = landmark_info.get("ind", [])
        if contains_landmark and len(landmark_inds) > 0:
            idx = int(landmark_inds[0])
            rec = landmarks[idx]
            annot.xy = (rec["x_feet"], rec["y_feet"])
            annot.set_text(_format_record("Landmark", rec))
            annot.set_visible(True)
            return True

        best = None
        for edge in edges:
            s = node_lookup.get(edge["start"])
            e = node_lookup.get(edge["end"])
            if not s or not e:
                continue
            d, t, cx, cy = _distance_point_to_segment(
                event.xdata,
                event.ydata,
                s["x_feet"],
                s["y_feet"],
                e["x_feet"],
                e["y_feet"],
            )
            if d <= edge_hit_radius and (best is None or d < best[0]):
                best = (d, t, cx, cy, edge)
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
    ax.legend(loc="best")
    plt.tight_layout()
    plt.show()


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--module", default="floor_data.floor2_v2")
    parser.add_argument("--var", default="FLOOR2_DATA_V2")
    parser.add_argument("--compare-module", default=None)
    parser.add_argument("--compare-var", default="FLOOR2_DATA")
    parser.add_argument("--floor-number", type=int, default=2)


def run_from_args(args: argparse.Namespace) -> int:
    try:
        import matplotlib.pyplot as _  # noqa: F401
    except ImportError as exc:
        raise SystemExit("matplotlib is required. Install with: pip install matplotlib") from exc

    module = importlib.import_module(args.module)
    data_obj = getattr(module, args.var)
    compare_obj = None
    if args.compare_module:
        compare_module = importlib.import_module(args.compare_module)
        compare_obj = getattr(compare_module, args.compare_var)
    plot_floor(data_obj, args.floor_number, compare_obj)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    add_arguments(parser)
    args = parser.parse_args(argv)
    return run_from_args(args)


if __name__ == "__main__":
    raise SystemExit(main())

