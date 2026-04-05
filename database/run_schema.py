import sys
import os
import psycopg2
from config import DB_CONFIG

def main():
    print(f"Connecting to AWS host: {DB_CONFIG.get('host')}...")
    
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = False
        cur = conn.cursor()
        
        print("Reading schema.sql...")
        with open("database/schema.sql", "r", encoding="utf-8") as f:
            sql = f.read()
            
        print("Executing schema on AWS...")
        cur.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        cur.execute(sql)
        conn.commit()
        print("✅ Schema successfully created on AWS RDS!")
        
    except Exception as e:
        print(f"❌ Error executing schema: {e}")
        if 'conn' in locals():
            conn.rollback()
        sys.exit(1)
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    main()
