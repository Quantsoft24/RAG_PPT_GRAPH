import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg2
from config import DB_CONFIG

conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()

# List all tables
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
print("=== TABLES ===")
for r in cur.fetchall():
    print(f"  {r[0]}")

# Check if financial_metrics exists
cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='financial_metrics'")
exists = cur.fetchone()[0]
print(f"\nfinancial_metrics exists: {bool(exists)}")

# Check content_blocks count
try:
    cur.execute("SELECT COUNT(*) FROM content_blocks")
    print(f"content_blocks rows: {cur.fetchone()[0]}")
except:
    print("content_blocks: DOES NOT EXIST")
    conn.rollback()

# Check document_chunks count
try:
    cur.execute("SELECT COUNT(*) FROM document_chunks")
    print(f"document_chunks rows: {cur.fetchone()[0]}")
except:
    print("document_chunks: DOES NOT EXIST")
    conn.rollback()

# Check what chunk_types exist in document_chunks
try:
    cur.execute("SELECT chunk_type, COUNT(*) FROM document_chunks GROUP BY chunk_type ORDER BY chunk_type")
    print("\ndocument_chunks by type:")
    for r in cur.fetchall():
        print(f"  {r[0]}: {r[1]}")
except:
    conn.rollback()

# Check content_blocks types
try:
    cur.execute("SELECT block_type, COUNT(*) FROM content_blocks GROUP BY block_type ORDER BY block_type")
    print("\ncontent_blocks by type:")
    for r in cur.fetchall():
        print(f"  {r[0]}: {r[1]}")
except:
    conn.rollback()

conn.close()
