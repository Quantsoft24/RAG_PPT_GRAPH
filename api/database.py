"""
PRISM Analyst — Database Connection Pool
============================================
Thread-safe connection pooling for FastAPI.
"""

import os
import sys
from contextlib import contextmanager

import psycopg2
from psycopg2 import pool

# Import config from database module
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'database'))
from config import DB_CONFIG


# =============================================================================
# CONNECTION POOL
# =============================================================================

_pool = None


def init_pool(min_conn: int = 2, max_conn: int = 10):
    """Initialize the database connection pool."""
    global _pool
    if _pool is None:
        _pool = pool.ThreadedConnectionPool(
            min_conn, max_conn, **DB_CONFIG
        )
    return _pool


def close_pool():
    """Close all connections in the pool."""
    global _pool
    if _pool:
        _pool.closeall()
        _pool = None


@contextmanager
def get_db():
    """
    Get a database connection from the pool.
    Usage:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(...)
    """
    p = init_pool()
    conn = p.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        # Reset connection state before returning to pool
        # This prevents "current transaction is aborted" errors
        try:
            conn.reset()
        except Exception:
            pass
        p.putconn(conn)



def check_db_health() -> dict:
    """Check database connectivity and return status."""
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
            return {"status": "healthy"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
