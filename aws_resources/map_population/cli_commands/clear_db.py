"""
Clear map data tables from the target RDS database.
Invoked by `python cli.py clear-db --yes`.
"""

import argparse
import ssl

import pg8000

from populate_floor_data import get_db_secret


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Required confirmation flag. Without this, command exits without changes.",
    )


def run_from_args(args: argparse.Namespace) -> int:
    if not args.yes:
        print("Refusing to clear DB without explicit confirmation. Re-run with: python cli.py clear-db --yes")
        return 1

    creds = get_db_secret()
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    conn = None
    try:
        conn = pg8000.connect(
            user=creds["username"],
            password=creds["password"],
            host=creds["host"],
            port=int(creds["port"]),
            database=creds["dbname"],
            ssl_context=ssl_context,
        )
        cursor = conn.cursor()

        # Delete in dependency order to satisfy non-cascading FK constraints.
        cursor.execute("DELETE FROM MapEdges")
        cursor.execute("DELETE FROM Landmarks")
        cursor.execute("DELETE FROM MapNodes")
        cursor.execute("DELETE FROM Floors")
        cursor.execute("DELETE FROM Buildings")
        conn.commit()

        print("Database map data cleared successfully (Buildings/Floors/MapNodes/MapEdges/Landmarks).")
        return 0
    except Exception as exc:
        if conn:
            conn.rollback()
        raise SystemExit(f"Failed to clear map database: {exc}") from exc
    finally:
        if conn:
            conn.close()

