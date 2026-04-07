"""
Populate the database with registered floor/building map data.
Invoked by `python cli.py populate`.
"""

import logging
import ssl

import pg8000
from dotenv import load_dotenv

from floor_data.registry import get_all_buildings_data
from populate_floor_data import get_db_secret, populate_database

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def main(coordinate_angle_offset_deg: float = 51.0) -> int:
    """Main entry point for database population."""
    logger.info("Starting database population...")
    logger.info("Using coordinate angle offset: %.2f deg", float(coordinate_angle_offset_deg))

    conn = None
    try:
        logger.info("Connecting to database...")
        creds = get_db_secret()
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
        logger.info("Connected to database successfully")

        all_buildings_data = get_all_buildings_data()
        if not all_buildings_data:
            logger.error("No map datasets registered. Update floor_data/registry.py")
            return 1
        for building_data in all_buildings_data:
            logger.info("Populating %s...", building_data.get("building_name", "<unknown building>"))
            populate_database(conn, building_data, coordinate_angle_offset_deg=coordinate_angle_offset_deg)
        logger.info("Successfully populated registered map data")

        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM buildings")
        building_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM floors")
        floor_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM mapnodes")
        node_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM mapedges")
        edge_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM landmarks")
        landmark_count = cursor.fetchone()[0]

        logger.info("Database summary:")
        logger.info("  Buildings:  %s", building_count)
        logger.info("  Floors:     %s", floor_count)
        logger.info("  Nodes:      %s", node_count)
        logger.info("  Edges:      %s", edge_count)
        logger.info("  Landmarks:  %s", landmark_count)
    except Exception as exc:
        logger.error("Error during population: %s", exc)
        import traceback

        traceback.print_exc()
        return 1
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed")

    logger.info("Population completed successfully")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

