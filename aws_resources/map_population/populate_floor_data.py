"""
Populates the indoor navigation database with floor measurements.
Converts physical measurements (feet) to map coordinates and creates nodes, edges, and landmarks.

FIXED: All table/column names are CamelCase to match teammate's schema.
"""

import json
import os
import pg8000
import boto3
import logging
import math

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Configuration
FEET_TO_METERS = 0.3048
DEFAULT_COORDINATE_ANGLE_OFFSET_DEG = 141.0
DEFAULT_SIDE_BY_BEARING_OFFSET_DEG = 0.0


def get_db_secret():
    """Retrieve DB credentials from Secrets Manager with env var fallback."""
    env_fallback = {
        "host": os.environ.get("DB_HOST"),
        "port": os.environ.get("DB_PORT"),
        "dbname": os.environ.get("DB_NAME"),
        "username": os.environ.get("DB_USER"),
        "password": os.environ.get("DB_PASSWORD"),
    }

    secret_arn = os.environ.get("DB_SECRET_ARN")
    if not secret_arn:
        missing = [key for key, value in env_fallback.items() if not value]
        if missing:
            raise RuntimeError(
                "DB_SECRET_ARN is not set and fallback env vars are missing: "
                + ", ".join(sorted(missing))
            )
        logger.info("DB_SECRET_ARN not set, using DB_* environment fallback credentials.")
        return env_fallback

    try:
        client = boto3.client("secretsmanager")
        response = client.get_secret_value(SecretId=secret_arn)
        return json.loads(response["SecretString"])
    except Exception as exc:
        missing = [key for key, value in env_fallback.items() if not value]
        if missing:
            raise RuntimeError(
                "Failed to retrieve DB secret from Secrets Manager and fallback env vars are "
                f"missing: {', '.join(sorted(missing))}"
            ) from exc
        logger.warning(
            "Failed to retrieve DB secret from Secrets Manager (%s). Falling back to DB_* env vars.",
            exc,
        )
        return env_fallback


def calculate_bearing(x1, y1, x2, y2):
    """
    Calculate bearing in degrees from point 1 to point 2.
    0° = North (up), 90° = East (right), 180° = South (down), 270° = West (left)
    """
    dx = x2 - x1
    dy = y1 - y2  # Inverted because Y increases downward in screen coordinates
    
    angle = math.degrees(math.atan2(dx, dy))
    bearing = (angle + 360) % 360  # Normalize to 0-360
    return bearing


def calculate_distance(x1, y1, x2, y2):
    """Calculate Euclidean distance in feet, then convert to meters."""
    feet_distance = math.sqrt((x2 - x1)**2 + (y2 - y1)**2)
    return feet_distance * FEET_TO_METERS


def rotate_coords_for_storage(x_feet, y_feet, angle_offset_deg):
    """
    Rotate authored screen-style feet coordinates into DB storage frame.
    This is the only coordinate transform applied during upload.
    """
    angle = math.radians(-angle_offset_deg)
    x_math = float(x_feet)
    y_math = -float(y_feet)
    x_rot_math = (x_math * math.cos(angle)) - (y_math * math.sin(angle))
    y_rot_math = (x_math * math.sin(angle)) + (y_math * math.cos(angle))
    return int(round(x_rot_math)), int(round(-y_rot_math))


def _apply_angle_offset_to_doors(doors, side_by_bearing_offset_deg):
    """Rotate door side_by_bearing headings into DB storage frame."""
    adjusted_doors = []
    for door in doors or []:
        adjusted_door = dict(door)
        adjusted_side_entries = []
        for entry in door.get("side_by_bearing", []) or []:
            adjusted_entry = dict(entry)
            if "bearing_deg" in adjusted_entry:
                adjusted_entry["bearing_deg"] = (
                    float(adjusted_entry["bearing_deg"]) + float(side_by_bearing_offset_deg)
                ) % 360.0
            adjusted_side_entries.append(adjusted_entry)
        if "side_by_bearing" in adjusted_door:
            adjusted_door["side_by_bearing"] = adjusted_side_entries
        adjusted_doors.append(adjusted_door)
    return adjusted_doors


def build_node_meta_for_storage(
    node,
    side_by_bearing_offset_deg=DEFAULT_SIDE_BY_BEARING_OFFSET_DEG,
):
    """
    Normalize per-node metadata payload for DB storage.

    Supports both legacy `node_meta` and v2 top-level semantic fields.
    """
    if node.get("node_meta") is not None:
        legacy_meta = dict(node["node_meta"])
        if "doors" in legacy_meta:
            legacy_meta["doors"] = _apply_angle_offset_to_doors(
                legacy_meta.get("doors", []),
                side_by_bearing_offset_deg,
            )
        return legacy_meta

    semantic_meta = {}
    if "doors" in node:
        semantic_meta["doors"] = _apply_angle_offset_to_doors(
            node.get("doors", []),
            side_by_bearing_offset_deg,
        )
    if "intersections" in node:
        semantic_meta["intersections"] = node.get("intersections", [])
    return semantic_meta or None


def populate_database(
    conn,
    building_data,
    coordinate_angle_offset_deg=DEFAULT_COORDINATE_ANGLE_OFFSET_DEG,
    side_by_bearing_offset_deg=DEFAULT_SIDE_BY_BEARING_OFFSET_DEG,
):
    """Main function to populate all tables with building data."""
    cursor = conn.cursor()
    
    try:
        # 1. Insert Building (CamelCase table/columns)
        cursor.execute(
            """
            INSERT INTO Buildings (BuildingID, Name, GPS_Lat, GPS_Long)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (BuildingID) DO UPDATE 
            SET Name = EXCLUDED.Name, 
                GPS_Lat = EXCLUDED.GPS_Lat, 
                GPS_Long = EXCLUDED.GPS_Long
            """,
            (
                building_data['building_id'],
                building_data['building_name'],
                building_data.get('gps_lat'),
                building_data.get('gps_long')
            )
        )
        logger.info(f"Inserted building: {building_data['building_name']}")
        
        # 2. Process each floor
        angle_offset_deg = float(coordinate_angle_offset_deg)
        side_bearing_offset = float(side_by_bearing_offset_deg)
        logger.info("Applying coordinate angle offset: %.2f deg", angle_offset_deg)
        if side_bearing_offset != 0.0:
            logger.info("Applying door side_by_bearing offset: %.2f deg", side_bearing_offset)
        for floor_data in building_data['floors']:
            # Insert Floor (CamelCase)
            cursor.execute(
                """
                INSERT INTO Floors (BuildingID, FloorNumber, MapImageURL, MapScaleRatio)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (BuildingID, FloorNumber) DO UPDATE
                SET MapImageURL = EXCLUDED.MapImageURL,
                    MapScaleRatio = EXCLUDED.MapScaleRatio
                RETURNING FloorID
                """,
                (
                    building_data['building_id'],
                    floor_data['floor_number'],
                    floor_data.get('map_image_url'),
                    floor_data.get('map_scale_ratio', 0.03048)
                )
            )
            floor_id = cursor.fetchone()[0]
            logger.info(f"Inserted floor {floor_data['floor_number']}, FloorID: {floor_id}")
            
            # Remove existing edges and landmarks for this floor so re-runs replace data cleanly
            cursor.execute("DELETE FROM MapEdges WHERE FloorID = %s", (floor_id,))
            cursor.execute("DELETE FROM Landmarks WHERE FloorID = %s", (floor_id,))
            
            # 3. Insert MapNodes (CamelCase) — upsert so re-run does not violate unique constraint
            node_coords = {}  # Map from custom node IDs to their pixel coordinates
            
            for node in floor_data.get('nodes', []):
                x_stored, y_stored = rotate_coords_for_storage(
                    node['x_feet'],
                    node['y_feet'],
                    angle_offset_deg,
                )
                node_meta = build_node_meta_for_storage(
                    node,
                    side_by_bearing_offset_deg=side_bearing_offset,
                )
                cursor.execute(
                    """
                    INSERT INTO MapNodes (NodeIDString, FloorID, BuildingID, CoordinateX, CoordinateY, NodeType, NodeMeta)
                    VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
                    ON CONFLICT (NodeIDString) DO UPDATE SET
                        FloorID = EXCLUDED.FloorID,
                        BuildingID = EXCLUDED.BuildingID,
                        CoordinateX = EXCLUDED.CoordinateX,
                        CoordinateY = EXCLUDED.CoordinateY,
                        NodeType = EXCLUDED.NodeType,
                        NodeMeta = EXCLUDED.NodeMeta
                    """,
                    (
                        node['id'],
                        floor_id,
                        building_data['building_id'],
                        x_stored,
                        y_stored,
                        node['type'],
                        json.dumps(node_meta) if node_meta is not None else None,
                    )
                )
                node_coords[node['id']] = (x_stored, y_stored)
                logger.info(f"Upserted node {node['id']} at ({x_stored}, {y_stored})")

            # Remove nodes that were deleted from authored floor data so stale DB nodes
            # cannot influence nearest-node lookups or downstream routing behavior.
            current_node_ids = list(node_coords.keys())
            if current_node_ids:
                placeholders = ", ".join(["%s"] * len(current_node_ids))
                cursor.execute(
                    f"DELETE FROM MapNodes WHERE FloorID = %s AND NodeIDString NOT IN ({placeholders})",
                    [floor_id, *current_node_ids],
                )
            else:
                cursor.execute("DELETE FROM MapNodes WHERE FloorID = %s", (floor_id,))
            
            # 4. Insert MapEdges (CamelCase)
            for edge in floor_data.get('edges', []):
                start_node_key = edge['start']
                end_node_key = edge['end']
                x1, y1 = node_coords[start_node_key]
                x2, y2 = node_coords[end_node_key]
                
                distance = calculate_distance(x1, y1, x2, y2)
                # Always derive DB bearing from stored (already-rotated) coordinates
                # so geometry and persisted heading remain in the same frame.
                bearing = calculate_bearing(x1, y1, x2, y2)
                cursor.execute(
                    """
                    INSERT INTO MapEdges (FloorID, StartNodeID, EndNodeID, DistanceMeters, Bearing, IsBidirectional)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        floor_id,
                        start_node_key,
                        end_node_key,
                        distance,
                        bearing,
                        edge.get('bidirectional', True)
                    )
                )
                logger.info(f"Inserted edge: {edge['start']} -> {edge['end']}, distance: {distance:.2f}m, bearing: {bearing:.1f}°")
            
            # 5. Insert Landmarks (CamelCase) with stable IDs so re-runs give same landmark_id
            # LandmarkID = floor_id * 10000 + (1-based index) so e.g. floor 1 -> 10001,10002,...; floor 2 -> 20001,20002,...
            landmarks_list = floor_data.get('landmarks', [])
            for idx, landmark in enumerate(landmarks_list):
                landmark_id = floor_id * 10000 + (idx + 1)
                x_stored, y_stored = rotate_coords_for_storage(
                    landmark['x_feet'],
                    landmark['y_feet'],
                    angle_offset_deg,
                )
                
                nearest_node_key = landmark.get('nearest_node')
                distance_to_node = None
                
                if nearest_node_key and nearest_node_key in node_coords:
                    # Calculate distance from landmark to nearest node using cached coordinates
                    nx, ny = node_coords[nearest_node_key]
                    feet_dist = math.sqrt((x_stored - nx)**2 + (y_stored - ny)**2)
                    distance_to_node = feet_dist * FEET_TO_METERS
                # Landmark cardinal bearings are no longer part of map authoring contract.
                # Keep DB column as nullable/legacy for backend compatibility.
                bearing_from_node = landmark.get("bearing_from_node")
                
                cursor.execute(
                    """
                    INSERT INTO Landmarks (LandmarkID, FloorID, Name, NearestNodeID, DistanceToNode, BearingFromNode, MapCoordinateX, MapCoordinateY)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (LandmarkID) DO UPDATE SET
                        FloorID = EXCLUDED.FloorID,
                        Name = EXCLUDED.Name,
                        NearestNodeID = EXCLUDED.NearestNodeID,
                        DistanceToNode = EXCLUDED.DistanceToNode,
                        BearingFromNode = EXCLUDED.BearingFromNode,
                        MapCoordinateX = EXCLUDED.MapCoordinateX,
                        MapCoordinateY = EXCLUDED.MapCoordinateY
                    """,
                    (
                        landmark_id,
                        floor_id,
                        landmark['name'],
                        nearest_node_key,
                        distance_to_node,
                        bearing_from_node,
                        x_stored,
                        y_stored
                    )
                )
                logger.info(f"Upserted landmark {landmark_id} {landmark['name']} at ({x_stored}, {y_stored})")
            
            # Advance the LandmarkID sequence so future SERIAL inserts don't reuse our explicit IDs
            # Use lowercase identifiers: PostgreSQL folds unquoted names to lowercase
            if landmarks_list:
                cursor.execute(
                    "SELECT setval(pg_get_serial_sequence('landmarks', 'landmarkid'), (SELECT COALESCE(MAX(landmarkid), 1) FROM landmarks))"
                )
        
        conn.commit()
        logger.info("Successfully populated database!")
        
    except Exception as e:
        logger.error(f"Error populating database: {e}")
        conn.rollback()
        raise


def main():
    """Example usage"""
    sample_data = {
        'building_id': 'TEST',
        'building_name': 'Test Building',
        'gps_lat': 40.4237,
        'gps_long': -86.9212,
        'floors': [
            {
                'floor_number': 1,
                'map_image_url': None,
                'map_scale_ratio': 0.03048,
                'nodes': [
                    {'id': 'n1', 'x_feet': 0, 'y_feet': 0, 'type': 'Corner'},
                    {'id': 'n2', 'x_feet': 100, 'y_feet': 0, 'type': 'Corner'},
                ],
                'edges': [
                    {'start': 'n1', 'end': 'n2', 'bidirectional': True},
                ],
                'landmarks': [
                    {'name': 'Room 101', 'x_feet': 50, 'y_feet': 0, 'nearest_node': 'n1', 'door_id': 'room_101'},
                ]
            }
        ]
    }
    
    creds = get_db_secret()
    conn = pg8000.connect(
        user=creds['username'],
        password=creds['password'],
        host=creds['host'],
        port=int(creds['port']),
        database=creds['dbname']
    )
    
    try:
        populate_database(conn, sample_data)
    finally:
        conn.close()


if __name__ == '__main__':
    main()