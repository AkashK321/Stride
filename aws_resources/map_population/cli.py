"""
Unified CLI for map population tooling.
"""

from __future__ import annotations

import argparse

from cli_commands.list_edges_for_bearing_check import add_arguments as add_audit_args
from cli_commands.list_edges_for_bearing_check import run_from_args as run_audit
from cli_commands.plot_floor_data_v2 import add_arguments as add_plot_local_args
from cli_commands.plot_floor_data_v2 import run_from_args as run_plot_local
from cli_commands.plot_map_graph import add_arguments as add_plot_db_args
from cli_commands.plot_map_graph import run_from_args as run_plot_db
from cli_commands.recompute_edge_bearings import add_arguments as add_recompute_args
from cli_commands.recompute_edge_bearings import run_from_args as run_recompute
from cli_commands.run_population import main as run_population_main
from floor_data.registry import validate_registered_floors


def _run_validate_command(_: argparse.Namespace) -> int:
    validate_registered_floors()
    print("map validation passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Map population toolkit")
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate = subparsers.add_parser("validate", help="Validate map definitions")
    validate.set_defaults(handler=_run_validate_command)

    populate = subparsers.add_parser("populate", help="Populate RDS from registered map data")
    populate.set_defaults(handler=lambda _: run_population_main())

    plot_local = subparsers.add_parser("plot-local", help="Plot local floor data module")
    add_plot_local_args(plot_local)
    plot_local.set_defaults(handler=run_plot_local)

    plot_db = subparsers.add_parser("plot-db", help="Plot deployed map data from DB")
    add_plot_db_args(plot_db)
    plot_db.set_defaults(handler=run_plot_db)

    audit = subparsers.add_parser("audit-bearings", help="Print edge bearings for validation")
    add_audit_args(audit)
    audit.set_defaults(handler=run_audit)

    recompute = subparsers.add_parser("recompute-bearings", help="Recompute DB edge bearings")
    add_recompute_args(recompute)
    recompute.set_defaults(handler=run_recompute)

    args = parser.parse_args()
    handler = getattr(args, "handler", None)
    if handler is None:
        parser.print_help()
        return 1
    return int(handler(args))


if __name__ == "__main__":
    raise SystemExit(main())

