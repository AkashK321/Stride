"""
Main script to populate the database with floor data.
Run this after schema initialization is complete.
"""

import os
import sys
import logging

from dotenv import load_dotenv

load_dotenv('../.env')
# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import your floor data
try:
    from floor_data.floor2 import FLOOR2_DATA
except ImportError:
    logger.error("❌ Could not import floor data. Make sure floor_data/floor2.py exists!")
    sys.exit(1)

# Import populate function
from populate_floor_data import populate_database, get_db_secret
import pg8000


def main():
    """Main entry point for database population."""
    
    logger.info("🚀 Starting database population...")
    
    conn = None
    
    try:
        # Connect to database
        logger.info("📡 Connecting to database...")
        creds = get_db_secret()
        conn = pg8000.connect(
            user=creds['username'],
            password=creds['password'],
            host=creds['host'],
            port=int(creds['port']),
            database=creds['dbname']
        )
        logger.info("✓ Connected to database successfully")
        
        # Populate with Floor 2 data
        logger.info("📊 Populating Floor 2 data...")
        populate_database(conn, FLOOR2_DATA)
        logger.info("✓ Successfully populated Floor 2 data!")
        
        # Print summary
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
        
        logger.info("\n" + "="*50)
        logger.info("📈 DATABASE SUMMARY")
        logger.info("="*50)
        logger.info(f"  Buildings:  {building_count}")
        logger.info(f"  Floors:     {floor_count}")
        logger.info(f"  Nodes:      {node_count}")
        logger.info(f"  Edges:      {edge_count}")
        logger.info(f"  Landmarks:  {landmark_count}")
        logger.info("="*50)
        
    except Exception as e:
        logger.error(f"❌ Error during population: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
        
    finally:
        if conn:
            conn.close()
            logger.info("✓ Database connection closed")
    
    logger.info("\n🎉 Population completed successfully!")


if __name__ == '__main__':
    main()