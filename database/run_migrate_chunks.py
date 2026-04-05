import sys
import os
import psycopg2

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "database"))
from config import DB_CONFIG

def main():
    print(f"Connecting to: {DB_CONFIG.get('host')}...")

    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False
    cur = conn.cursor()

    print("Reading migrate_chunks.sql...")
    with open("database/migrate_chunks.sql", "r", encoding="utf-8") as f:
        sql = f.read()

    print("Executing migrate_chunks.sql on AWS...")
    cur.execute(sql)
    conn.commit()
    print("✅ document_chunks table + indexes + functions created on AWS!")

    conn.close()

if __name__ == "__main__":
    main()
