"""
Populates the indoor navigation database with floor measurements.
Converts physical measurements (feet) to map coordinates and creates nodes, edges, and landmarks.

FIXED: All table/column names are CamelCase to match teammate's schema.
"""

import os
import json
import pg8000
import boto3
import logging
import math

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Configuration
FEET_TO_PIXELS = 10  # 1 foot = 10 pixels
ORIGIN_X = 0
ORIGIN_Y = 0

# Coordinate storage policy.
# COORDINATE_MIRROR_X:
#   - if true, persist map X coordinates mirrored (x := -x) before feet->pixels conversion
#   - default true to match current deployment orientation expectation
def _get_coordinate_mirror_x():
    v = os.environ.get("COORDINATE_MIRROR_X", "true").strip().lower()
    return v in ("1", "true", "yes")


def get_db_secret():
    """Retrieves database credentials from AWS Secrets Manager."""
    secret_arn = os.environ['DB_SECRET_ARN']
    client = boto3.client('secretsmanager')
    response = client.get_secret_value(SecretId=secret_arn)
    return json.loads(response['SecretString'])


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
    """Calculate Euclidean distance in pixels, then convert to meters."""
    pixel_distance = math.sqrt((x2 - x1)**2 + (y2 - y1)**2)
    feet_distance = pixel_distance / FEET_TO_PIXELS
    meters_distance = feet_distance * 0.3048  # 1 foot = 0.3048 meters
    return meters_distance


def feet_to_pixels(feet):
    """Convert feet to pixel coordinates."""
    return int(feet * FEET_TO_PIXELS)


def map_x_feet_for_storage(x_feet):
    """Apply deploy-time X mirroring policy before converting to pixels."""
    return -x_feet if _get_coordinate_mirror_x() else x_feet


def build_node_meta_for_storage(node):
    """
    Normalize per-node metadata payload for DB storage.

    Supports both legacy `node_meta` and v2 top-level semantic fields.
    """
    if node.get("node_meta") is not None:
        return node["node_meta"]

    semantic_meta = {}
    if "doors" in node:
        semantic_meta["doors"] = node.get("doors", [])
    if "intersections" in node:
        semantic_meta["intersections"] = node.get("intersections", [])
    return semantic_meta or None


def populate_database(conn, building_data):
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
                x_pixels = feet_to_pixels(map_x_feet_for_storage(node['x_feet']))
                y_pixels = feet_to_pixels(node['y_feet'])
                node_meta = build_node_meta_for_storage(node)
                
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
                        x_pixels,
                        y_pixels,
                        node['type'],
                        json.dumps(node_meta) if node_meta is not None else None,
                    )
                )
                node_coords[node['id']] = (x_pixels, y_pixels)
                logger.info(f"Upserted node {node['id']} at ({x_pixels}, {y_pixels})")
            
            # 4. Insert MapEdges (CamelCase)
            for edge in floor_data.get('edges', []):
                start_node_key = edge['start']
                end_node_key = edge['end']
                x1, y1 = node_coords[start_node_key]
                x2, y2 = node_coords[end_node_key]
                
                distance = calculate_distance(x1, y1, x2, y2)
                # Use authored edge bearings when provided; otherwise compute from geometry.
                bearing = edge.get("bearing_deg")
                if bearing is None:
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
                x_pixels = feet_to_pixels(map_x_feet_for_storage(landmark['x_feet']))
                y_pixels = feet_to_pixels(landmark['y_feet'])
                
                nearest_node_key = landmark.get('nearest_node')
                distance_to_node = None
                
                if nearest_node_key and nearest_node_key in node_coords:
                    # Calculate distance from landmark to nearest node using cached coordinates
                    nx, ny = node_coords[nearest_node_key]
                    pixel_dist = math.sqrt((x_pixels - nx)**2 + (y_pixels - ny)**2)
                    distance_to_node = (pixel_dist / FEET_TO_PIXELS) * 0.3048  # Convert to meters
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
                        x_pixels,
                        y_pixels
                    )
                )
                logger.info(f"Upserted landmark {landmark_id} {landmark['name']} at ({x_pixels}, {y_pixels})")
            
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