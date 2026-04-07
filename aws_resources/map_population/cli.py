"""
Unified CLI for map population tooling.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from floor_data.floor2_v2.validate import validate_floor2_v2
from run_population import main as run_population_main


def _run_script(script_name: str, extra_args: list[str]) -> int:
    script_path = Path(__file__).with_name(script_name)
    cmd = [sys.executable, str(script_path), *extra_args]
    completed = subprocess.run(cmd, check=False)
    return int(completed.returncode)


def main() -> int:
    parser = argparse.ArgumentParser(description="Map population toolkit")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("validate", help="Validate map definitions")
    subparsers.add_parser("populate", help="Populate RDS from registered map data")

    plot_local = subparsers.add_parser("plot-local", help="Plot local floor data module")
    plot_local.add_argument("plot_args", nargs=argparse.REMAINDER)

    plot_db = subparsers.add_parser("plot-db", help="Plot deployed map data from DB")
    plot_db.add_argument("plot_args", nargs=argparse.REMAINDER)

    audit = subparsers.add_parser("audit-bearings", help="Print edge bearings for validation")
    audit.add_argument("audit_args", nargs=argparse.REMAINDER)

    recompute = subparsers.add_parser("recompute-bearings", help="Recompute DB edge bearings")
    recompute.add_argument("recompute_args", nargs=argparse.REMAINDER)

    args = parser.parse_args()

    if args.command == "validate":
        validate_floor2_v2()
        print("map validation passed")
        return 0
    if args.command == "populate":
        run_population_main()
        return 0
    if args.command == "plot-local":
        return _run_script("plot_floor_data_v2.py", args.plot_args)
    if args.command == "plot-db":
        return _run_script("plot_map_graph.py", args.plot_args)
    if args.command == "audit-bearings":
        return _run_script("list_edges_for_bearing_check.py", args.audit_args)
    if args.command == "recompute-bearings":
        return _run_script("recompute_edge_bearings.py", args.recompute_args)

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

