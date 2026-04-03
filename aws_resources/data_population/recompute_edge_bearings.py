"""
Recompute and optionally apply true-compass bearings for existing MapEdges rows.

Usage:
  python recompute_edge_bearings.py --dry-run
  python recompute_edge_bearings.py --apply
  python recompute_edge_bearings.py --apply --floor-id 2
"""

import argparse
import logging
import ssl

import pg8000
from dotenv import load_dotenv

from populate_floor_data import (
    align_bearing_to_true_north,
    calculate_bearing,
    get_db_secret,
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


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


def _fetch_edges(cursor, floor_id=None):
    sql = """
        SELECT
            e.EdgeID,
            e.FloorID,
            e.StartNodeID,
            e.EndNodeID,
            e.Bearing,
            start_node.CoordinateX AS StartX,
            start_node.CoordinateY AS StartY,
            end_node.CoordinateX AS EndX,
            end_node.CoordinateY AS EndY
        FROM MapEdges e
        JOIN MapNodes start_node ON start_node.NodeIDString = e.StartNodeID
        JOIN MapNodes end_node ON end_node.NodeIDString = e.EndNodeID
    """
    params = ()
    if floor_id is not None:
        sql += " WHERE e.FloorID = %s"
        params = (floor_id,)
    sql += " ORDER BY e.FloorID, e.EdgeID"
    cursor.execute(sql, params)
    return cursor.fetchall()


def _recompute_bearing(row):
    _, _, _, _, _, start_x, start_y, end_x, end_y = row
    raw = calculate_bearing(start_x, start_y, end_x, end_y)
    return align_bearing_to_true_north(raw)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--floor-id", type=int, default=None, help="Only recompute one floor")
    parser.add_argument("--apply", action="store_true", help="Write recomputed bearings to DB")
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.05,
        help="Only count as changed if abs(delta) exceeds tolerance",
    )
    args = parser.parse_args()

    conn = None
    try:
        conn = _connect()
        cursor = conn.cursor()
        rows = _fetch_edges(cursor, floor_id=args.floor_id)
        logger.info("Loaded %d edges", len(rows))

        changed = 0
        for row in rows:
            edge_id, floor_id, start_id, end_id, existing_bearing, *_ = row
            recomputed = _recompute_bearing(row)
            existing = float(existing_bearing) if existing_bearing is not None else None
            delta = None if existing is None else abs(recomputed - existing)
            if existing is None or delta > args.tolerance:
                changed += 1
                logger.info(
                    "edge=%s floor=%s %s->%s existing=%s recomputed=%.3f",
                    edge_id,
                    floor_id,
                    start_id,
                    end_id,
                    "NULL" if existing is None else f"{existing:.3f}",
                    recomputed,
                )
                if args.apply:
                    cursor.execute(
                        "UPDATE MapEdges SET Bearing = %s WHERE EdgeID = %s",
                        (recomputed, edge_id),
                    )

        if args.apply:
            conn.commit()
            logger.info("Applied bearing updates to %d edges", changed)
        else:
            logger.info("Dry run complete. %d edges would be updated", changed)
    except Exception as exc:
        logger.error("Failed to recompute edge bearings: %s", exc)
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    main()
