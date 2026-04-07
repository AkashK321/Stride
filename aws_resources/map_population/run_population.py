"""
Main script to populate the database with floor data.
Run this after schema initialization is complete.
"""

import sys
import ssl
import logging

from dotenv import load_dotenv

load_dotenv()
# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from floor_data.registry import get_all_buildings_data

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
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        conn = pg8000.connect(
            user=creds['username'],
            password=creds['password'],
            host=creds['host'],
            port=int(creds['port']),
            database=creds['dbname'],
            ssl_context=ssl_context,
        )
        logger.info("✓ Connected to database successfully")
        
        # Populate all registered building/floor data.
        all_buildings_data = get_all_buildings_data()
        if not all_buildings_data:
            logger.error("❌ No map datasets registered. Update floor_data/registry.py")
            sys.exit(1)
        for building_data in all_buildings_data:
            logger.info("📊 Populating %s...", building_data.get("building_name", "<unknown building>"))
            populate_database(conn, building_data)
        logger.info("✓ Successfully populated registered map data!")
        
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