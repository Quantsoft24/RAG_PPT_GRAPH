import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
import psycopg2
from config import DB_CONFIG

conn = psycopg2.connect(**DB_CONFIG)
conn.autocommit = True
cur = conn.cursor()

sql_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'migrate_financials.sql')
with open(sql_path, 'r', encoding='utf-8') as f:
    sql = f.read()

try:
    cur.execute(sql)
    print("migrate_financials.sql executed successfully!")
except Exception as e:
    print(f"Error: {e}")

# Verify table exists
cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='financial_metrics'")
print(f"financial_metrics table exists: {bool(cur.fetchone()[0])}")

conn.close()
