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
            
            # 3. Insert MapNodes (CamelCase)
            # We treat the human-readable node ID string as the canonical ID.
            node_coords = {}  # Map from custom node IDs to their pixel coordinates
            
            for node in floor_data.get('nodes', []):
                x_pixels = feet_to_pixels(node['x_feet'])
                y_pixels = feet_to_pixels(node['y_feet'])
                
                cursor.execute(
                    """
                    INSERT INTO MapNodes (NodeIDString, FloorID, BuildingID, CoordinateX, CoordinateY, NodeType)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        node['id'],
                        floor_id,
                        building_data['building_id'],
                        x_pixels,
                        y_pixels,
                        node['type'],
                    )
                )
                node_coords[node['id']] = (x_pixels, y_pixels)
                logger.info(f"Inserted node {node['id']} at ({x_pixels}, {y_pixels})")
            
            # 4. Insert MapEdges (CamelCase)
            for edge in floor_data.get('edges', []):
                start_node_key = edge['start']
                end_node_key = edge['end']
                x1, y1 = node_coords[start_node_key]
                x2, y2 = node_coords[end_node_key]
                
                distance = calculate_distance(x1, y1, x2, y2)
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
            
            # 5. Insert Landmarks (CamelCase)
            for landmark in floor_data.get('landmarks', []):
                x_pixels = feet_to_pixels(landmark['x_feet'])
                y_pixels = feet_to_pixels(landmark['y_feet'])
                
                nearest_node_key = landmark.get('nearest_node')
                distance_to_node = None
                
                if nearest_node_key and nearest_node_key in node_coords:
                    # Calculate distance from landmark to nearest node using cached coordinates
                    nx, ny = node_coords[nearest_node_key]
                    pixel_dist = math.sqrt((x_pixels - nx)**2 + (y_pixels - ny)**2)
                    distance_to_node = (pixel_dist / FEET_TO_PIXELS) * 0.3048  # Convert to meters
                
                cursor.execute(
                    """
                    INSERT INTO Landmarks (FloorID, Name, NearestNodeID, DistanceToNode, BearingFromNode, MapCoordinateX, MapCoordinateY)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        floor_id,
                        landmark['name'],
                        nearest_node_key,
                        distance_to_node,
                        landmark.get('bearing'),
                        x_pixels,
                        y_pixels
                    )
                )
                logger.info(f"Inserted landmark: {landmark['name']} at ({x_pixels}, {y_pixels})")
        
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
                    {'name': 'Room 101', 'x_feet': 50, 'y_feet': 0, 'nearest_node': 'n1', 'bearing': 'East'},
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