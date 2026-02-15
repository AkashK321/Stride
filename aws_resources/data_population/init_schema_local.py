import pg8000

# Connect to local database
conn = pg8000.connect(
    user='feyremacbook',  # ← Put the username from SELECT current_user here
    password='',  # Leave empty
    host='localhost',
    port=5432,
    database='stride'
)

cursor = conn.cursor()

# Drop existing tables
cleanup_commands = [
    "DROP TABLE IF EXISTS landmarks CASCADE;",
    "DROP TABLE IF EXISTS mapedges CASCADE;",
    "DROP TABLE IF EXISTS mapnodes CASCADE;",
    "DROP TABLE IF EXISTS floors CASCADE;",
    "DROP TABLE IF EXISTS buildings CASCADE;"
]

# Create tables (lowercase column names)
create_commands = [
    """
    CREATE TABLE buildings (
        buildingid VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        gps_lat DOUBLE PRECISION,
        gps_long DOUBLE PRECISION
    );
    """,
    """
    CREATE TABLE floors (
        floorid SERIAL PRIMARY KEY,
        buildingid VARCHAR(50) REFERENCES buildings(buildingid) ON DELETE CASCADE,
        floornumber INT NOT NULL,
        mapimageurl TEXT,
        mapscaleratio DOUBLE PRECISION,
        UNIQUE(buildingid, floornumber)
    );
    """,
    """
    CREATE TABLE mapnodes (
        nodeid SERIAL PRIMARY KEY,
        floorid INT REFERENCES floors(floorid) ON DELETE CASCADE,
        buildingid VARCHAR(50) REFERENCES buildings(buildingid),
        coordinatex INT NOT NULL,
        coordinatey INT NOT NULL,
        nodetype VARCHAR(20) CHECK (nodetype IN ('Intersection', 'Corner', 'Elevator', 'Stairwell', 'Door'))
    );
    """,
    """
    CREATE TABLE mapedges (
        edgeid SERIAL PRIMARY KEY,
        floorid INT REFERENCES floors(floorid) ON DELETE CASCADE,
        startnodeid INT REFERENCES mapnodes(nodeid) ON DELETE CASCADE,
        endnodeid INT REFERENCES mapnodes(nodeid) ON DELETE CASCADE,
        distancemeters DOUBLE PRECISION NOT NULL,
        bearing DOUBLE PRECISION,
        isbidirectional BOOLEAN DEFAULT TRUE
    );
    """,
    """
    CREATE TABLE landmarks (
        landmarkid SERIAL PRIMARY KEY,
        floorid INT REFERENCES floors(floorid) ON DELETE CASCADE,
        name VARCHAR(50) NOT NULL,
        nearestnodeid INT REFERENCES mapnodes(nodeid),
        distancetonode DOUBLE PRECISION,
        bearingfromnode VARCHAR(10) CHECK (bearingfromnode IN ('North', 'South', 'East', 'West')),
        mapcoordinatex INT,
        mapcoordinatey INT
    );
    """
]

# Execute
for sql in cleanup_commands:
    cursor.execute(sql)

for sql in create_commands:
    cursor.execute(sql)

conn.commit()
print("✅ Schema created successfully!")
conn.close()