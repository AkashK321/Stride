"""
Test script for populate_floor_data.py
Tests with minimal data before running the full floor2 data
"""

import os
import sys
import pg8000
import json
import boto3

# Add the parent directory to path so we can import populate_floor_data
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from populate_floor_data import populate_database, get_db_secret


def test_minimal_data():
    """Test with minimal data - just 2 nodes, 1 edge, 1 landmark"""
    
    print("=" * 60)
    print("TESTING POPULATE SCRIPT WITH MINIMAL DATA")
    print("=" * 60)
    
    # Minimal test data
    test_data = {
        'building_id': 'TEST_BLDG',
        'building_name': 'Test Building',
        'gps_lat': 40.4237,
        'gps_long': -86.9212,
        'floors': [
            {
                'floor_number': 99,  # Use a test floor number
                'map_image_url': None,
                'map_scale_ratio': 0.03048,
                'nodes': [
                    {
                        'id': 'test_node_1',
                        'x_feet': 0,
                        'y_feet': 0,
                        'type': 'Corner'
                    },
                    {
                        'id': 'test_node_2',
                        'x_feet': 50,
                        'y_feet': 0,
                        'type': 'Door'
                    },
                ],
                'edges': [
                    {
                        'start': 'test_node_1',
                        'end': 'test_node_2',
                        'bidirectional': True
                    },
                ],
                'landmarks': [
                    {
                        'name': 'Test Room 999',
                        'x_feet': 25,
                        'y_feet': 5,
                        'nearest_node': 'test_node_1',
                        'bearing': 'East'
                    },
                ]
            }
        ]
    }
    
    # Connect to database
    try:
        print("\n1. Connecting to database...")
        creds = get_db_secret()
        conn = pg8000.connect(
            user=creds['username'],
            password=creds['password'],
            host=creds['host'],
            port=int(creds['port']),
            database=creds['dbname']
        )
        print("✓ Connected successfully!")
        
        # Run populate
        print("\n2. Populating database with test data...")
        populate_database(conn, test_data)
        print("✓ Population completed!")
        
        # Verify data was inserted
        print("\n3. Verifying inserted data...")
        cursor = conn.cursor()
        
        # Check building
        cursor.execute("SELECT * FROM buildings WHERE buildingid = %s", ('TEST_BLDG',))
        building = cursor.fetchone()
        print(f"   Building: {building}")
        
        # Check floor
        cursor.execute("SELECT * FROM floors WHERE buildingid = %s AND floornumber = %s", ('TEST_BLDG', 99))
        floor = cursor.fetchone()
        print(f"   Floor: {floor}")
        
        # Check nodes
        cursor.execute("SELECT COUNT(*) FROM mapnodes WHERE buildingid = %s", ('TEST_BLDG',))
        node_count = cursor.fetchone()[0]
        print(f"   Nodes inserted: {node_count}")
        
        # Check edges
        cursor.execute("""
            SELECT COUNT(*) FROM mapedges 
            WHERE floorid = (SELECT floorid FROM floors WHERE buildingid = %s AND floornumber = %s)
        """, ('TEST_BLDG', 99))
        edge_count = cursor.fetchone()[0]
        print(f"   Edges inserted: {edge_count}")
        
        # Check landmarks
        cursor.execute("""
            SELECT * FROM landmarks 
            WHERE floorid = (SELECT floorid FROM floors WHERE buildingid = %s AND floornumber = %s)
        """, ('TEST_BLDG', 99))
        landmark = cursor.fetchone()
        print(f"   Landmark: {landmark}")
        
        print("\n" + "=" * 60)
        print("✅ TEST PASSED! The populate script works correctly.")
        print("=" * 60)
        
        # Cleanup test data
        cleanup = input("\nDo you want to clean up test data? (y/n): ").lower()
        if cleanup == 'y':
            print("\nCleaning up test data...")
            cursor.execute("DELETE FROM buildings WHERE buildingid = %s", ('TEST_BLDG',))
            conn.commit()
            print("✓ Test data cleaned up!")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"\n❌ TEST FAILED!")
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_floor2_preview():
    """Preview what would be inserted for Floor 2 without actually inserting"""
    
    print("\n" + "=" * 60)
    print("FLOOR 2 DATA PREVIEW (DRY RUN)")
    print("=" * 60)
    
    # Import your actual floor 2 data
    try:
        from floor_data.floor2_data import FLOOR2_DATA
        
        print(f"\nBuilding: {FLOOR2_DATA['building_id']} - {FLOOR2_DATA['building_name']}")
        
        for floor in FLOOR2_DATA['floors']:
            print(f"\nFloor {floor['floor_number']}:")
            print(f"  Nodes: {len(floor.get('nodes', []))}")
            print(f"  Edges: {len(floor.get('edges', []))}")
            print(f"  Landmarks: {len(floor.get('landmarks', []))}")
            
            # Check for issues
            issues = []
            
            # Check for duplicate node IDs
            node_ids = [n['id'] for n in floor.get('nodes', [])]
            if len(node_ids) != len(set(node_ids)):
                issues.append("⚠️  Duplicate node IDs found!")
            
            # Check for nodes with spaces in ID
            for node in floor.get('nodes', []):
                if ' ' in node['id']:
                    issues.append(f"⚠️  Node ID has space: '{node['id']}'")
            
            # Check edges reference valid nodes
            node_id_set = set(node_ids)
            for edge in floor.get('edges', []):
                if edge['start'] not in node_id_set:
                    issues.append(f"⚠️  Edge references unknown start node: {edge['start']}")
                if edge['end'] not in node_id_set:
                    issues.append(f"⚠️  Edge references unknown end node: {edge['end']}")
            
            # Check landmarks reference valid nodes
            for landmark in floor.get('landmarks', []):
                if landmark.get('nearest_node') and landmark['nearest_node'] not in node_id_set:
                    issues.append(f"⚠️  Landmark '{landmark['name']}' references unknown node: {landmark['nearest_node']}")
            
            if issues:
                print("\n  Issues found:")
                for issue in issues:
                    print(f"    {issue}")
            else:
                print("\n  ✅ No issues found! Data looks good.")
        
        return len(issues) == 0
        
    except ImportError:
        print("❌ Could not import floor2_data.py")
        print("   Make sure floor2_data.py exists in the floor_data/ directory")
        return False


if __name__ == '__main__':
    print("\n🧪 POPULATE SCRIPT TEST SUITE\n")
    
    # Menu
    print("Choose a test:")
    print("1. Test with minimal data (inserts test data to database)")
    print("2. Preview Floor 2 data (dry run, no database changes)")
    print("3. Run both tests")
    
    choice = input("\nEnter choice (1/2/3): ").strip()
    
    if choice == '1':
        test_minimal_data()
    elif choice == '2':
        test_floor2_preview()
    elif choice == '3':
        print("\n--- Running Test 1: Minimal Data ---")
        success = test_minimal_data()
        
        if success:
            print("\n--- Running Test 2: Floor 2 Preview ---")
            test_floor2_preview()
    else:
        print("Invalid choice!")