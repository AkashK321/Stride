import os
import json
import pg8000
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def get_db_secret():
    """Retrieves database credentials from AWS Secrets Manager."""
    secret_arn = os.environ['DB_SECRET_ARN']
    client = boto3.client('secretsmanager')
    response = client.get_secret_value(SecretId=secret_arn)
    return json.loads(response['SecretString'])

def handler(event, context):
    logger.info("Starting Schema Initialization...")
    
    # 1. Get Credentials
    creds = get_db_secret()
    
    # 2. Connect to the Database
    try:
        conn = pg8000.connect(
            user=creds['username'],
            password=creds['password'],
            host=creds['host'],
            port=int(creds['port']),
            database=creds['dbname'] # This usually defaults to 'postgres' or the name you set in CDK
        )
        cursor = conn.cursor()
        logger.info("Connected to Database.")
        
        # 3. Define the SQL Schema
        # Note: We use DOUBLE PRECISION for coordinates to ensure accuracy for navigation.
        # We use VARCHAR with CHECK constraints instead of ENUMs for easier updates later.
        
        # ... inside handler() ...
        
        # Cleanup existing tables if they exist
        cleanup_commands = [
            "DROP TABLE IF EXISTS Rooms CASCADE;", 
            "DROP TABLE IF EXISTS Landmarks CASCADE;", # Drops the conflict source
            "DROP TABLE IF EXISTS MapEdges CASCADE;",
            "DROP TABLE IF EXISTS MapNodes CASCADE;",
            "DROP TABLE IF EXISTS Floors CASCADE;",
            "DROP TABLE IF EXISTS Buildings CASCADE;"
        ]

        # Create tables
        create_commands = [
            # Buildings
            """
            CREATE TABLE Buildings (
                BuildingID VARCHAR(50) PRIMARY KEY,
                Name VARCHAR(255) NOT NULL,
                GPS_Lat DOUBLE PRECISION,   -- Correct Name
                GPS_Long DOUBLE PRECISION   -- Correct Name
            );
            """,
            
            # Floors
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
            
            # MapNodes
            """
            CREATE TABLE MapNodes (
                NodeID SERIAL PRIMARY KEY,
                FloorID INT REFERENCES Floors(FloorID) ON DELETE CASCADE,
                BuildingID VARCHAR(50) REFERENCES Buildings(BuildingID),
                CoordinateX INT NOT NULL,
                CoordinateY INT NOT NULL,
                NodeType VARCHAR(20) CHECK (NodeType IN ('Intersection', 'Corner', 'Elevator', 'Stairwell', 'Door'))
            );
            """,
            
            # MapEdges
            """
            CREATE TABLE MapEdges (
                EdgeID SERIAL PRIMARY KEY,
                FloorID INT REFERENCES Floors(FloorID) ON DELETE CASCADE,
                StartNodeID INT REFERENCES MapNodes(NodeID) ON DELETE CASCADE,
                EndNodeID INT REFERENCES MapNodes(NodeID) ON DELETE CASCADE,
                DistanceMeters DOUBLE PRECISION NOT NULL,
                Bearing DOUBLE PRECISION,
                IsBidirectional BOOLEAN DEFAULT TRUE
            );
            """,
            
            # Landmarks
            """
            CREATE TABLE Landmarks (
                LandmarkID SERIAL PRIMARY KEY, -- Correct Name
                FloorID INT REFERENCES Floors(FloorID) ON DELETE CASCADE,
                Name VARCHAR(50) NOT NULL, -- e.g. "Room 205" or "Men's Restroom"
                NearestNodeID INT REFERENCES MapNodes(NodeID),
                DistanceToNode DOUBLE PRECISION,
                BearingFromNode VARCHAR(10) CHECK (BearingFromNode IN ('North', 'South', 'East', 'West')),
                MapCoordinateX INT,
                MapCoordinateY INT
            );
            """
        ]
        
        # Indexes for performance optimization
        index_commands = [
            "CREATE INDEX idx_mapnodes_floor ON MapNodes(FloorID);",
            "CREATE INDEX idx_mapedges_floor ON MapEdges(FloorID);",
            "CREATE INDEX idx_landmarks_floor ON Landmarks(FloorID);",
            "CREATE INDEX idx_landmarks_name ON Landmarks(Name);"
        ]

        # EXECUTION LOOP
        for sql in cleanup_commands:
            cursor.execute(sql)
            
        for sql in create_commands:
            cursor.execute(sql)
            
        for sql in index_commands:
            cursor.execute(sql)
            
        conn.commit()
        logger.info("Schema successfully initialized.")
        
    except Exception as e:
        logger.info(f"Error initializing schema: {e}")
        if conn:
            conn.rollback()
        raise e
    finally:
        if conn:
            conn.close()
            
    return {"status": "success"}