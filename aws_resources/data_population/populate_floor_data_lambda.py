"""
Lambda wrapper for floor-data population.
"""

import json
import logging
import traceback

import pg8000
from floor_data.floor2 import FLOOR2_DATA
from populate_floor_data import get_db_secret, populate_database

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    conn = None
    try:
        creds = get_db_secret()
        conn = pg8000.connect(
            user=creds["username"],
            password=creds["password"],
            host=creds["host"],
            port=int(creds["port"]),
            database=creds["dbname"],
        )
        populate_database(conn, FLOOR2_DATA)
        logger.info("Floor data population completed successfully.")
        return {"statusCode": 200, "body": json.dumps({"status": "success"})}
    except Exception as exc:
        logger.error("Floor data population failed: %s", exc)
        logger.error(traceback.format_exc())
        raise
    finally:
        if conn:
            conn.close()
