import psycopg2;

conn = psycopg2.connect(
    host="postgresql1.cnc0qs0c6liv.ap-south-1.rds.amazonaws.com",
    dbname="postgres",
    user="postgres",
    password="Dhananjayraj75$",
    port=5432
)

cur = conn.cursor()