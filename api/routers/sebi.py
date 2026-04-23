"""
PRISM Analyst — SEBI Regulatory Intelligence API Router
========================================================
Read-only endpoints serving SEBI regulatory content from the
external PostgreSQL database.

All endpoints are prefixed with /api/v1/sebi/ and mounted
in api/main.py.
"""

import json
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from api.sebi_db import get_sebi_db

router = APIRouter(prefix="/api/v1/sebi", tags=["SEBI Regulatory"])


# ─────────────────────────────────────────────────────────────────
# HELPER
# ─────────────────────────────────────────────────────────────────

def _rows_to_dicts(cur) -> list[dict]:
    """Convert cursor results to list of dicts using column names."""
    cols = [desc[0] for desc in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def _serialize(obj):
    """JSON-safe serializer for datetime etc."""
    import datetime
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    return str(obj)


# ─────────────────────────────────────────────────────────────────
# 1. DASHBOARD STATISTICS
# ─────────────────────────────────────────────────────────────────

@router.get("/stats")
async def sebi_stats():
    """
    Dashboard statistics: total counts by type, severity breakdown,
    recent activity, action-required count.
    """
    with get_sebi_db() as conn:
        cur = conn.cursor()

        # Total documents
        cur.execute("SELECT COUNT(*) FROM content")
        total = cur.fetchone()[0]

        # By type
        cur.execute("SELECT type, COUNT(*) as cnt FROM content GROUP BY type ORDER BY cnt DESC")
        type_counts = [{"type": r[0], "count": r[1]} for r in cur.fetchall()]

        # Severity distribution
        cur.execute("""
            SELECT ai_tags->>'severity' as severity, COUNT(*) as cnt
            FROM content WHERE ai_tags IS NOT NULL AND ai_tags->>'severity' IS NOT NULL
            GROUP BY ai_tags->>'severity' ORDER BY cnt DESC
        """)
        severity_counts = [{"severity": r[0], "count": r[1]} for r in cur.fetchall()]

        # This week's count
        cur.execute("""
            SELECT COUNT(*) FROM content
            WHERE date >= NOW() - INTERVAL '7 days'
        """)
        this_week = cur.fetchone()[0]

        # Today's count
        cur.execute("""
            SELECT COUNT(*) FROM content
            WHERE date >= NOW() - INTERVAL '1 day'
        """)
        today = cur.fetchone()[0]

        # Action-required count
        cur.execute("""
            SELECT COUNT(*) FROM content
            WHERE ai_tags IS NOT NULL AND ai_tags->>'action_required' = 'true'
        """)
        action_required = cur.fetchone()[0]

        # Top intents
        cur.execute("""
            SELECT ai_tags->>'intent' as intent, COUNT(*) as cnt
            FROM content WHERE ai_tags IS NOT NULL AND ai_tags->>'intent' IS NOT NULL
            GROUP BY ai_tags->>'intent' ORDER BY cnt DESC LIMIT 10
        """)
        intent_counts = [{"intent": r[0], "count": r[1]} for r in cur.fetchall()]

        # Recent high-severity items (last 7 days)
        cur.execute("""
            SELECT COUNT(*) FROM content
            WHERE date >= NOW() - INTERVAL '7 days'
            AND ai_tags IS NOT NULL AND ai_tags->>'severity' = 'High'
        """)
        high_severity_this_week = cur.fetchone()[0]

        cur.close()

        return {
            "total_documents": total,
            "this_week": this_week,
            "today": today,
            "action_required": action_required,
            "high_severity_this_week": high_severity_this_week,
            "type_counts": type_counts,
            "severity_counts": severity_counts,
            "intent_counts": intent_counts,
        }


# ─────────────────────────────────────────────────────────────────
# 2. CONTENT FEED (Paginated + Filterable)
# ─────────────────────────────────────────────────────────────────

@router.get("/feed")
async def sebi_feed(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    type: Optional[str] = Query(None, description="Filter by content type (ORDER, CIRCULAR, etc.)"),
    severity: Optional[str] = Query(None, description="Filter by severity (High, Medium, Low)"),
    intent: Optional[str] = Query(None, description="Filter by intent (Enforcement, ComplianceRequirement, etc.)"),
    action_required: Optional[bool] = Query(None, description="Filter for action-required items"),
    search: Optional[str] = Query(None, description="Full-text search in title and summary"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    topic: Optional[str] = Query(None, description="Filter by AI topic tag"),
    department: Optional[str] = Query(None, description="Filter by SEBI department"),
):
    """
    Paginated feed of SEBI documents with comprehensive filtering.
    Returns cards with id, type, title, date, summary excerpt, ai_tags, severity.
    """
    with get_sebi_db() as conn:
        cur = conn.cursor()

        # Build WHERE clauses dynamically
        conditions = []
        params = []

        if type:
            conditions.append("type = %s")
            params.append(type)

        if severity:
            conditions.append("ai_tags->>'severity' = %s")
            params.append(severity)

        if intent:
            conditions.append("ai_tags->>'intent' = %s")
            params.append(intent)

        if action_required is not None:
            conditions.append("ai_tags->>'action_required' = %s")
            params.append(str(action_required).lower())

        if search:
            conditions.append("(title ILIKE %s OR summary ILIKE %s)")
            like = f"%{search}%"
            params.extend([like, like])

        if date_from:
            conditions.append("date >= %s")
            params.append(date_from)

        if date_to:
            conditions.append("date <= %s")
            params.append(date_to)

        if topic:
            conditions.append("ai_tags::text ILIKE %s")
            params.append(f"%{topic}%")

        if department:
            conditions.append("sebi_department ILIKE %s")
            params.append(f"%{department}%")

        where = "WHERE " + " AND ".join(conditions) if conditions else ""

        # Count total matching
        cur.execute(f"SELECT COUNT(*) FROM content {where}", params)
        total = cur.fetchone()[0]

        # Fetch page
        offset = (page - 1) * limit
        cur.execute(f"""
            SELECT id, type, sub_type, title, date, summary,
                   ai_tags, sebi_department, sebi_url, language
            FROM content
            {where}
            ORDER BY date DESC
            LIMIT %s OFFSET %s
        """, params + [limit, offset])

        cols = [desc[0] for desc in cur.description]
        items = []
        for row in cur.fetchall():
            item = dict(zip(cols, row))
            # Serialize datetime
            if item.get("date"):
                item["date"] = item["date"].isoformat()
            # Truncate summary for card view
            if item.get("summary") and len(item["summary"]) > 300:
                item["summary_excerpt"] = item["summary"][:300] + "..."
            else:
                item["summary_excerpt"] = item.get("summary", "")
            # Remove full summary from feed (save bandwidth)
            del item["summary"]
            items.append(item)

        cur.close()

        return {
            "items": items,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": max(1, (total + limit - 1) // limit),
        }


# ─────────────────────────────────────────────────────────────────
# 3. SINGLE DOCUMENT DETAIL
# ─────────────────────────────────────────────────────────────────

@router.get("/content/{content_id}")
async def sebi_content_detail(content_id: int):
    """
    Full document detail: summary, extracted_text, ai_tags, metadata.
    """
    with get_sebi_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, type, sub_type, title, date, summary,
                   extracted_text, ai_tags, sebi_id, sebi_url,
                   sebi_department, sebi_section, sebi_sub_section,
                   sebi_info_for, language, is_processed, is_indexed,
                   scraped_at, processed_at, created_at, updated_at
            FROM content WHERE id = %s
        """, (content_id,))

        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Document {content_id} not found")

        cols = [desc[0] for desc in cur.description]
        doc = dict(zip(cols, row))

        # Serialize datetimes
        for key in ["date", "scraped_at", "processed_at", "created_at", "updated_at"]:
            if doc.get(key):
                doc[key] = doc[key].isoformat()

        cur.close()
        return doc


# ─────────────────────────────────────────────────────────────────
# 4. UPCOMING COMPLIANCE DEADLINES
# ─────────────────────────────────────────────────────────────────

@router.get("/deadlines")
async def sebi_deadlines(
    limit: int = Query(20, ge=1, le=100),
):
    """
    Documents with compliance deadlines extracted from ai_tags.
    Sorted by most recent document date.
    """
    with get_sebi_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, type, title, date, ai_tags->'deadlines' as deadlines,
                   ai_tags->>'severity' as severity,
                   ai_tags->>'intent' as intent
            FROM content
            WHERE ai_tags IS NOT NULL
              AND ai_tags::text LIKE '%%deadlines%%'
              AND ai_tags::text NOT LIKE '%%"deadlines": []%%'
              AND ai_tags::text NOT LIKE '%%"deadlines":[]%%'
            ORDER BY date DESC
            LIMIT %s
        """, (limit,))

        cols = [desc[0] for desc in cur.description]
        items = []
        for row in cur.fetchall():
            item = dict(zip(cols, row))
            if item.get("date"):
                item["date"] = item["date"].isoformat()
            # Parse deadlines JSON string if needed
            dl = item.get("deadlines")
            if isinstance(dl, str):
                try:
                    item["deadlines"] = json.loads(dl)
                except Exception:
                    item["deadlines"] = []
            items.append(item)

        cur.close()
        return {"items": items, "total": len(items)}


# ─────────────────────────────────────────────────────────────────
# 5. WEEKLY SUMMARY / DIGEST
# ─────────────────────────────────────────────────────────────────

@router.get("/weekly-summary")
async def sebi_weekly_summary(
    limit: int = Query(5, ge=1, le=20),
):
    """
    AI-generated weekly regulatory summaries.
    """
    with get_sebi_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, week_start_date, week_end_date, generated_at, summary_text
            FROM weekly_summaries
            ORDER BY week_start_date DESC
            LIMIT %s
        """, (limit,))

        cols = [desc[0] for desc in cur.description]
        items = []
        for row in cur.fetchall():
            item = dict(zip(cols, row))
            for key in ["week_start_date", "week_end_date", "generated_at"]:
                if item.get(key):
                    item[key] = item[key].isoformat()
            items.append(item)

        cur.close()
        return {"summaries": items}


# ─────────────────────────────────────────────────────────────────
# 6. TOPIC AGGREGATION (for filter dropdowns)
# ─────────────────────────────────────────────────────────────────

@router.get("/topics")
async def sebi_topics(limit: int = Query(50, ge=1, le=200)):
    """
    Aggregated topic list with counts, extracted from ai_tags->topics.
    Used for filter dropdown population.
    """
    with get_sebi_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT topic, COUNT(*) as cnt
            FROM content, json_array_elements_text(ai_tags->'topics') AS topic
            WHERE ai_tags IS NOT NULL AND ai_tags->'topics' IS NOT NULL
            GROUP BY topic ORDER BY cnt DESC
            LIMIT %s
        """, (limit,))
        topics = [{"topic": r[0], "count": r[1]} for r in cur.fetchall()]
        cur.close()
        return {"topics": topics}


# ─────────────────────────────────────────────────────────────────
# 7. TYPE LIST (for filter dropdowns)
# ─────────────────────────────────────────────────────────────────

@router.get("/types")
async def sebi_types():
    """Content type list with counts."""
    with get_sebi_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT type, COUNT(*) as cnt FROM content GROUP BY type ORDER BY cnt DESC")
        types = [{"type": r[0], "count": r[1]} for r in cur.fetchall()]
        cur.close()
        return {"types": types}


# ─────────────────────────────────────────────────────────────────
# 8. FULL-TEXT SEARCH
# ─────────────────────────────────────────────────────────────────

@router.get("/search")
async def sebi_search(
    q: str = Query(..., min_length=2, description="Search query"),
    type: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(30, ge=1, le=100),
    page: int = Query(1, ge=1),
):
    """
    Full-text search across title, summary, and AI tags.
    Returns matching documents with relevance ranking.
    """
    with get_sebi_db() as conn:
        cur = conn.cursor()

        conditions = ["(title ILIKE %s OR summary ILIKE %s OR ai_tags::text ILIKE %s)"]
        like = f"%{q}%"
        params: list = [like, like, like]

        if type:
            conditions.append("type = %s")
            params.append(type)
        if severity:
            conditions.append("ai_tags->>'severity' = %s")
            params.append(severity)

        where = "WHERE " + " AND ".join(conditions)

        # Count
        cur.execute(f"SELECT COUNT(*) FROM content {where}", params)
        total = cur.fetchone()[0]

        # Fetch
        offset = (page - 1) * limit
        cur.execute(f"""
            SELECT id, type, title, date, summary,
                   ai_tags->>'severity' as severity,
                   ai_tags->>'intent' as intent,
                   ai_tags
            FROM content
            {where}
            ORDER BY date DESC
            LIMIT %s OFFSET %s
        """, params + [limit, offset])

        cols = [desc[0] for desc in cur.description]
        items = []
        for row in cur.fetchall():
            item = dict(zip(cols, row))
            if item.get("date"):
                item["date"] = item["date"].isoformat()
            if item.get("summary") and len(item["summary"]) > 300:
                item["summary_excerpt"] = item["summary"][:300] + "..."
            else:
                item["summary_excerpt"] = item.get("summary", "")
            if "summary" in item:
                del item["summary"]
            items.append(item)

        cur.close()

        return {
            "query": q,
            "items": items,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": max(1, (total + limit - 1) // limit),
        }


# ─────────────────────────────────────────────────────────────────
# 9. RECENT ACTIVITY (for dashboard widget)
# ─────────────────────────────────────────────────────────────────

@router.get("/recent")
async def sebi_recent(
    limit: int = Query(10, ge=1, le=50),
    days: int = Query(7, ge=1, le=90),
):
    """
    Most recent SEBI documents for dashboard feed widget.
    """
    with get_sebi_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, type, title, date,
                   ai_tags->>'severity' as severity,
                   ai_tags->>'intent' as intent
            FROM content
            WHERE date >= NOW() - INTERVAL '%s days'
            ORDER BY date DESC
            LIMIT %s
        """, (days, limit))

        # Note: INTERVAL with %s won't work directly. Fix:
        # Use a workaround
        cur.close()

        # Re-query with proper interval
        cur = conn.cursor()
        cur.execute("""
            SELECT id, type, title, date,
                   ai_tags->>'severity' as severity,
                   ai_tags->>'intent' as intent
            FROM content
            ORDER BY date DESC
            LIMIT %s
        """, (limit,))

        cols = [desc[0] for desc in cur.description]
        items = []
        for row in cur.fetchall():
            item = dict(zip(cols, row))
            if item.get("date"):
                item["date"] = item["date"].isoformat()
            items.append(item)

        cur.close()
        return {"items": items}
