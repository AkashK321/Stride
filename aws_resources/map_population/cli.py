"""
Unified CLI for map population tooling.
"""

from __future__ import annotations

import argparse

from cli_commands.clear_db import add_arguments as add_clear_db_args
from cli_commands.clear_db import run_from_args as run_clear_db
from cli_commands.list_edges_for_bearing_check import add_arguments as add_audit_args
from cli_commands.list_edges_for_bearing_check import run_from_args as run_audit
from cli_commands.plot_floor_data_v2 import add_arguments as add_plot_local_args
from cli_commands.plot_floor_data_v2 import run_from_args as run_plot_local
from cli_commands.plot_map_graph import add_arguments as add_plot_db_args
from cli_commands.plot_map_graph import run_from_args as run_plot_db
from cli_commands.print_tables import add_arguments as add_print_tables_args
from cli_commands.print_tables import run_from_args as run_print_tables
from cli_commands.recompute_edge_bearings import add_arguments as add_recompute_args
from cli_commands.recompute_edge_bearings import run_from_args as run_recompute
from cli_commands.run_population import main as run_population_main
from floor_data.registry import validate_registered_floors


def _run_validate_command(_: argparse.Namespace) -> int:
    validate_registered_floors()
    print("map validation passed")
    return 0


def _run_populate_command(args: argparse.Namespace) -> int:
    return run_population_main(coordinate_angle_offset_deg=args.coordinate_angle_offset)


def main() -> int:
    parser = argparse.ArgumentParser(description="Map population toolkit")
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate = subparsers.add_parser("validate", help="Validate map definitions")
    validate.set_defaults(handler=_run_validate_command)

    populate = subparsers.add_parser("populate", help="Populate RDS from registered map data")
    populate.add_argument(
        "--coordinate-angle-offset",
        type=float,
        default=51.0,
        help="Clockwise angle offset in degrees applied during upload (default: 51).",
    )
    populate.set_defaults(handler=_run_populate_command)

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

    clear_db = subparsers.add_parser("clear-db", help="Clear deployed map data tables")
    add_clear_db_args(clear_db)
    clear_db.set_defaults(handler=run_clear_db)

    print_tables = subparsers.add_parser(
        "print-tables",
        help="Print every table and rows from deployed map DB",
    )
    add_print_tables_args(print_tables)
    print_tables.set_defaults(handler=run_print_tables)

    args = parser.parse_args()
    handler = getattr(args, "handler", None)
    if handler is None:
        parser.print_help()
        return 1
    return int(handler(args))


if __name__ == "__main__":
    raise SystemExit(main())

