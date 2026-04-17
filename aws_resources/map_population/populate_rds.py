"""
Initializes relational schema for shared Postgres.

This script is intentionally destructive while migration tooling is pending.
Map data seeding remains separate via `python cli.py populate`.
"""

import json
import logging
import os
import ssl
import sys

import boto3
import pg8000

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DESTRUCTIVE_RESET_FLAG = "SCHEMA_INIT_ALLOW_DESTRUCTIVE_RESET"


def get_db_secret():
    """Retrieve database credentials from AWS Secrets Manager."""
    secret_arn = os.environ.get("DB_SECRET_ARN")
    if not secret_arn:
        logger.error("DB_SECRET_ARN environment variable is not set.")
        sys.exit(1)

    client = boto3.client("secretsmanager")
    response = client.get_secret_value(SecretId=secret_arn)
    return json.loads(response["SecretString"])


def ensure_destructive_reset_is_explicit():
    """
    Guardrail: schema init currently drops and recreates map tables.
    Require explicit operator opt-in to avoid accidental data loss.
    """
    allow_reset = os.environ.get(DESTRUCTIVE_RESET_FLAG, "").strip().lower()
    if allow_reset not in ("1", "true", "yes"):
        logger.error(
            "Refusing destructive schema reset. Set %s=true to continue.",
            DESTRUCTIVE_RESET_FLAG,
        )
        logger.error("Run map_population/cli.py populate separately for map seed data.")
        sys.exit(1)


def main():
    print("Starting Schema Initialization...")
    ensure_destructive_reset_is_explicit()

    creds = get_db_secret()
    conn = None
    try:
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE

        conn = pg8000.connect(
            user=creds["username"],
            password=creds["password"],
            host=creds["host"],
            port=int(creds["port"]),
            database=creds["dbname"],
            ssl_context=ssl_context,
        )
        cursor = conn.cursor()
        logger.info("Connected to Database.")

        cleanup_commands = [
            "DROP TABLE IF EXISTS Rooms CASCADE;",
            "DROP TABLE IF EXISTS Landmarks CASCADE;",
            "DROP TABLE IF EXISTS MapEdges CASCADE;",
            "DROP TABLE IF EXISTS MapNodes CASCADE;",
            "DROP TABLE IF EXISTS Floors CASCADE;",
            "DROP TABLE IF EXISTS Buildings CASCADE;",
        ]

        create_commands = [
            """
            CREATE TABLE Buildings (
                BuildingID VARCHAR(50) PRIMARY KEY,
                Name VARCHAR(255) NOT NULL,
                GPS_Lat DOUBLE PRECISION,
                GPS_Long DOUBLE PRECISION
            );
            """,
            """
            CREATE TABLE Floors (
                FloorID SERIAL PRIMARY KEY,
                BuildingID VARCHAR(50) REFERENCES Buildings(BuildingID) ON DELETE CASCADE,
                FloorNumber INT NOT NULL,
                MapImageURL TEXT,
                MapScaleRatio DOUBLE PRECISION,
                UNIQUE(BuildingID, FloorNumber)
            );
            """,
            """
            CREATE TABLE MapNodes (
                NodeIDString VARCHAR(255) PRIMARY KEY,
                NodeID SERIAL UNIQUE,
                FloorID INT REFERENCES Floors(FloorID) ON DELETE CASCADE,
                BuildingID VARCHAR(50) REFERENCES Buildings(BuildingID),
                CoordinateX INT NOT NULL,
                CoordinateY INT NOT NULL,
                NodeType VARCHAR(32) CHECK (NodeType IN ('Intersection', 'Corner', 'Elevator', 'Stairwell', 'Door', 'HallwayPoint')),
                NodeMeta JSONB
            );
            """,
            """
            CREATE TABLE MapEdges (
                EdgeID SERIAL PRIMARY KEY,
                FloorID INT REFERENCES Floors(FloorID) ON DELETE CASCADE,
                StartNodeID VARCHAR(255) REFERENCES MapNodes(NodeIDString) ON DELETE CASCADE,
                EndNodeID VARCHAR(255) REFERENCES MapNodes(NodeIDString) ON DELETE CASCADE,
                DistanceMeters DOUBLE PRECISION NOT NULL,
                Bearing DOUBLE PRECISION,
                IsBidirectional BOOLEAN DEFAULT TRUE
            );
            """,
            """
            CREATE TABLE Landmarks (
                LandmarkID SERIAL PRIMARY KEY,
                FloorID INT REFERENCES Floors(FloorID) ON DELETE CASCADE,
                Name VARCHAR(50) NOT NULL,
                NearestNodeID VARCHAR(255) REFERENCES MapNodes(NodeIDString),
                DoorID VARCHAR(255),
                DistanceToNode DOUBLE PRECISION,
                BearingFromNode VARCHAR(32),
                MapCoordinateX INT,
                MapCoordinateY INT
            );
            """,
        ]

        index_commands = [
            "CREATE INDEX idx_mapnodes_floor ON MapNodes(FloorID);",
            "CREATE INDEX idx_mapedges_floor ON MapEdges(FloorID);",
            "CREATE INDEX idx_landmarks_floor ON Landmarks(FloorID);",
            "CREATE INDEX idx_landmarks_name ON Landmarks(Name);",
        ]

        for sql in cleanup_commands:
            cursor.execute(sql)
        for sql in create_commands:
            cursor.execute(sql)
        for sql in index_commands:
            cursor.execute(sql)

        conn.commit()
        print("Schema successfully initialized.")
    except Exception as exc:
        logger.error("Error initializing schema: %s", exc)
        print(f"Error initializing schema: {exc}")
        if conn:
            conn.rollback()
        sys.exit(1)
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    main()

