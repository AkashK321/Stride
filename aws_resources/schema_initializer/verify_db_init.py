'''
Script to verify database initialization.
'''

import pg8000
import os
from dotenv import load_dotenv

load_dotenv()

# FILL THESE IN FROM AWS SECRETS MANAGER
DB_HOST = os.environ.get("DB_HOST")  # e.g., "stridecore.abcdefg12345.us-east-1.rds.amazonaws.com"
DB_USER = "postgres" 
DB_PASS = os.environ.get("DB_PWD")
DB_NAME = "StrideCore" 

try:
    conn = pg8000.connect(
        user=DB_USER,
        password=DB_PASS,
        host=DB_HOST,
        database=DB_NAME
    )
    cursor = conn.cursor()

    # Query the internal catalog for your tables
    print(f"--- Checking Schema for {DB_NAME} ---")
    cursor.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name;
    """)
    
    tables = cursor.fetchall()
    
    if not tables:
        print("❌ Connection successful, but NO tables found.")
    else:
        print("✅ Success! Found the following tables:")
        for table in tables:
            table_name = table[0]
            print(f"\n- {table_name.upper()} -")
            
            # Print columns for each table to verify structure
            cursor.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table_name}'")
            cols = [row[0] for row in cursor.fetchall()]
            print(f"   └── Columns: {cols}")
            
            # Fetch the first 5 rows
            try:
                cursor.execute(f"SELECT * FROM {table_name} LIMIT 5")
                rows = cursor.fetchall()
                if rows:
                    print(f"   └── Data Head ({len(rows)} rows):")
                    for row in rows:
                        print(f"       {row}")
                else:
                    print("   └── Data Head: (Table is empty)")
            except Exception as row_e:
                # If there's a permissions issue or other error reading the table
                print(f"   └── Error reading data: {row_e}")

    conn.close()

except Exception as e:
    print("❌ Connection Failed.")
    print(f"Error: {e}")