"""
Print each table in the live map RDS database.
Invoked by `python cli.py print-tables`.
"""

from __future__ import annotations

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


def _list_public_tables(cursor) -> list[str]:
    cursor.execute(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
        """
    )
    return [row[0] for row in cursor.fetchall()]


def _print_table_rows(cursor, table_name: str, limit: int | None) -> None:
    cursor.execute(
        f'SELECT * FROM "{table_name}" ORDER BY 1' + (" LIMIT %s" if limit is not None else ""),
        (() if limit is None else (limit,)),
    )
    rows = cursor.fetchall()
    columns = [desc[0] for desc in cursor.description]

    print(f"\n=== {table_name} ===")
    print(f"columns: {', '.join(columns)}")
    print(f"rows returned: {len(rows)}")
    for row in rows:
        print(row)


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--all",
        action="store_true",
        help="Print all rows from each table (no row limit).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=25,
        help="Maximum rows to print per table when --all is not set.",
    )


def run_from_args(args: argparse.Namespace) -> int:
    limit = None if args.all else args.limit
    conn = _connect()
    try:
        cursor = conn.cursor()
        tables = _list_public_tables(cursor)
        if not tables:
            print("No tables found in public schema.")
            return 0

        print(f"Found {len(tables)} table(s) in public schema.")
        for table in tables:
            _print_table_rows(cursor, table, limit=limit)
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
