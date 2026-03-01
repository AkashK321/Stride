"""
Post-deploy verification for shared RDS schema + seed data.
"""

import json
import os
import sys
from typing import Dict, List

import boto3
import pg8000


REQUIRED_TABLES: List[str] = [
    "buildings",
    "floors",
    "mapnodes",
    "mapedges",
    "landmarks",
]

MIN_ROW_COUNTS: Dict[str, int] = {
    "buildings": 1,
    "floors": 1,
    "mapnodes": 1,
    "mapedges": 1,
    "landmarks": 1,
}


def get_db_secret() -> Dict[str, str]:
    secret_arn = os.environ.get("DB_SECRET_ARN")
    if not secret_arn:
        raise RuntimeError("DB_SECRET_ARN environment variable is required.")

    client = boto3.client("secretsmanager")
    response = client.get_secret_value(SecretId=secret_arn)
    return json.loads(response["SecretString"])


def verify_required_tables(cursor: pg8000.dbapi.Cursor) -> None:
    cursor.execute(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        """
    )
    existing = {row[0].lower() for row in cursor.fetchall()}

    missing = [name for name in REQUIRED_TABLES if name not in existing]
    if missing:
        raise RuntimeError(f"Missing required tables: {', '.join(missing)}")


def verify_minimum_rows(cursor: pg8000.dbapi.Cursor) -> None:
    for table_name, minimum in MIN_ROW_COUNTS.items():
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        count = int(cursor.fetchone()[0])
        if count < minimum:
            raise RuntimeError(
                f"Table '{table_name}' has {count} rows; expected at least {minimum}."
            )
        print(f"Verified {table_name}: {count} rows")


def main() -> None:
    creds = get_db_secret()
    conn = pg8000.connect(
        user=creds["username"],
        password=creds["password"],
        host=creds["host"],
        port=int(creds["port"]),
        database=creds["dbname"],
    )

    try:
        cursor = conn.cursor()
        verify_required_tables(cursor)
        verify_minimum_rows(cursor)
        print("Shared DB verification passed.")
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"Shared DB verification failed: {exc}", file=sys.stderr)
        sys.exit(1)
