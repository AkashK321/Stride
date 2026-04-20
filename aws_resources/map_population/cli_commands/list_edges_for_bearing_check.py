"""
List edges from MapEdges for on-site bearing validation.
Invoked by `python cli.py audit-bearings`.
"""

import argparse
import ssl

import pg8000
from dotenv import load_dotenv

from populate_floor_data import get_db_secret

load_dotenv()


def _connect():
    creds = get_db_secret()
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    return pg8000.connect(
        user=creds["username"],
        password=creds["password"],
        host=creds["host"],
        port=int(creds["port"]),
        database=creds["dbname"],
        ssl_context=ssl_context,
    )


def _query_rows(cursor, floor_id=None, limit=10):
    sql = """
        SELECT
            e.EdgeID,
            e.FloorID,
            e.StartNodeID,
            e.EndNodeID,
            e.Bearing
        FROM MapEdges e
    """
    params = []
    if floor_id is not None:
        sql += " WHERE e.FloorID = %s"
        params.append(floor_id)
    sql += " ORDER BY e.FloorID, e.EdgeID"
    if limit is not None:
        sql += " LIMIT %s"
        params.append(limit)
    cursor.execute(sql, tuple(params))
    return cursor.fetchall()


def _print_markdown_table(rows):
    print("| # | Floor | StartNodeID (stand here) | EndNodeID (face this) | DB bearing (deg) | True bearing (deg) |")
    print("|---|-------|---------------------------|------------------------|------------------|--------------------|")
    for idx, row in enumerate(rows, start=1):
        _, floor_id, start_node, end_node, bearing = row
        bearing_cell = "" if bearing is None else f"{float(bearing):.1f}"
        print(f"| {idx} | {floor_id} | {start_node} | {end_node} | {bearing_cell} | |")


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--floor-id", type=int, default=None, help="Filter by floor ID")
    parser.add_argument("--all", action="store_true", help="List all edges (no row limit)")
    parser.add_argument("--limit", type=int, default=10, help="Maximum rows if --all not set")


def run_from_args(args: argparse.Namespace) -> int:
    row_limit = None if args.all else args.limit
    conn = _connect()
    try:
        cursor = conn.cursor()
        rows = _query_rows(cursor, floor_id=args.floor_id, limit=row_limit)
        _print_markdown_table(rows)
    finally:
        conn.close()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    add_arguments(parser)
    args = parser.parse_args(argv)
    return run_from_args(args)


if __name__ == "__main__":
    raise SystemExit(main())

