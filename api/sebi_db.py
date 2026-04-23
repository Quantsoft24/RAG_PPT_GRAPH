"""
PRISM Analyst — SEBI Database Connection Pool
==============================================
Read-only connection pool for the SEBI regulatory content database.

Usage:
    from api.sebi_db import get_sebi_db, check_sebi_db_health

    with get_sebi_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT ...")
"""

import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
import psycopg2.pool
from dotenv import load_dotenv

load_dotenv()

# ── Configuration ──
SEBI_DB_CONFIG = {
    "host": os.getenv("SEBI_DB_HOST", "34.47.250.116"),
    "port": int(os.getenv("SEBI_DB_PORT", "15432")),
    "dbname": os.getenv("SEBI_DB_NAME", "sebi"),
    "user": os.getenv("SEBI_DB_USER", "frontend"),
    "password": os.getenv("SEBI_DB_PASSWORD", ""),
}

_pool: psycopg2.pool.SimpleConnectionPool | None = None


def init_sebi_pool(minconn: int = 1, maxconn: int = 10):
    """Initialize the SEBI connection pool."""
    global _pool
    if _pool is not None:
        return
    # Re-read env in case it was loaded after import
    load_dotenv(override=True)
    config = {
        "host": os.getenv("SEBI_DB_HOST", "34.47.250.116"),
        "port": int(os.getenv("SEBI_DB_PORT", "15432")),
        "dbname": os.getenv("SEBI_DB_NAME", "sebi"),
        "user": os.getenv("SEBI_DB_USER", "frontend"),
        "password": os.getenv("SEBI_DB_PASSWORD", "DlYG_tUf"),
        "connect_timeout": 10,
    }
    print(f"[SEBI DB] Connecting to {config['host']}:{config['port']}/{config['dbname']} as {config['user']}...")
    try:
        _pool = psycopg2.pool.SimpleConnectionPool(
            minconn, maxconn, **config
        )
        print(f"[SEBI DB] OK - Pool initialized ({minconn}-{maxconn} connections)")
    except Exception as e:
        print(f"[SEBI DB] FAILED - Pool init error: {e}")
        _pool = None


def close_sebi_pool():
    """Close all connections in the pool."""
    global _pool
    if _pool:
        _pool.closeall()
        _pool = None
        print("[SEBI DB] Pool closed")


@contextmanager
def get_sebi_db():
    """
    Context manager that yields a psycopg2 connection from the pool.
    Auto-returns it when done. Uses RealDictCursor by default.
    """
    if _pool is None:
        init_sebi_pool()
    if _pool is None:
        raise RuntimeError("SEBI database pool is not available")

    conn = _pool.getconn()
    try:
        yield conn
    finally:
        _pool.putconn(conn)


def check_sebi_db_health() -> dict:
    """Quick health check for the SEBI database."""
    try:
        with get_sebi_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM content")
            count = cur.fetchone()[0]
            cur.close()
            return {"status": "healthy", "total_documents": count}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
