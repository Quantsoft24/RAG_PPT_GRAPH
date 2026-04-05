"""
PRISM Analyst — Hybrid Search Engine
========================================
Combines BM25 keyword search + semantic vector search with Reciprocal Rank Fusion.

Features:
- Hybrid search (BM25 + semantic with RRF fusion)
- Semantic-only search for conceptual queries
- Keyword-only search fallback
- Company/type filtering
- Citation-enriched results
- Interactive CLI for testing

Usage:
    python database/search.py                    # Interactive mode
    python database/search.py "revenue growth"   # Direct query
"""

import json
import os
import sys
import time
from typing import List, Optional

import psycopg2
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DB_CONFIG


# =============================================================================
# CONFIG
# =============================================================================

OLLAMA_BASE_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
EMBEDDING_DIMS = 768


# =============================================================================
# QUERY EMBEDDING
# =============================================================================

def embed_query(text: str) -> Optional[List[float]]:
    """Generate embedding for a search query via Ollama."""
    try:
        # Prefix for search queries (nomic-embed-text convention)
        prefixed = f"search_query: {text}"
        
        url = f"{OLLAMA_BASE_URL}/api/embed"
        payload = json.dumps({
            "model": EMBEDDING_MODEL,
            "input": prefixed
        }).encode("utf-8")
        
        req = urllib.request.Request(
            url, data=payload,
            headers={"Content-Type": "application/json"}
        )
        
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            embeddings = data.get("embeddings", [])
            if embeddings:
                return embeddings[0]
    except Exception as e:
        print(f"  ❌ Query embedding failed: {e}")
    return None


# =============================================================================
# SEARCH FUNCTIONS
# =============================================================================

def hybrid_search(
    conn,
    query: str,
    company_ticker: Optional[str] = None,
    chunk_type: Optional[str] = None,
    max_results: int = 5,
    rrf_k: int = 60
) -> list:
    """
    Hybrid search combining BM25 keyword + semantic vector search.
    Uses Reciprocal Rank Fusion to merge results.
    """
    cur = conn.cursor()
    
    # Generate query embedding
    query_vec = embed_query(query)
    if not query_vec:
        print("  ⚠️  Could not generate query embedding, falling back to keyword-only")
        return keyword_search(conn, query, company_ticker, chunk_type, max_results)
    
    # Convert to pgvector format
    vec_str = "[" + ",".join(str(v) for v in query_vec) + "]"
    
    # Call the hybrid_search SQL function
    cur.execute("""
        SELECT * FROM hybrid_search(
            %s, %s::vector, %s, %s, %s, %s
        )
    """, (query, vec_str, company_ticker, chunk_type, rrf_k, max_results))
    
    columns = [desc[0] for desc in cur.description]
    results = [dict(zip(columns, row)) for row in cur.fetchall()]
    
    return results


def semantic_search(
    conn,
    query: str,
    company_ticker: Optional[str] = None,
    chunk_type: Optional[str] = None,
    max_results: int = 5
) -> list:
    """
    Semantic-only search. Best for conceptual queries like
    "What is the company's EV strategy?" or "environmental initiatives"
    """
    cur = conn.cursor()
    
    query_vec = embed_query(query)
    if not query_vec:
        return []
    
    vec_str = "[" + ",".join(str(v) for v in query_vec) + "]"
    
    cur.execute("""
        SELECT * FROM semantic_search(%s::vector, %s, %s, %s)
    """, (vec_str, company_ticker, chunk_type, max_results))
    
    columns = [desc[0] for desc in cur.description]
    return [dict(zip(columns, row)) for row in cur.fetchall()]


def keyword_search(
    conn,
    query: str,
    company_ticker: Optional[str] = None,
    chunk_type: Optional[str] = None,
    max_results: int = 5
) -> list:
    """BM25 keyword-only search. Best for exact term matching."""
    cur = conn.cursor()
    
    sql = """
        SELECT 
            dc.id AS chunk_id,
            dc.company_ticker AS ticker,
            dc.page_number,
            dc.chunk_type,
            dc.section_name,
            dc.content,
            dc.citation_ref,
            ts_rank_cd(
                to_tsvector('english', dc.content),
                plainto_tsquery('english', %s),
                32
            ) AS relevance
        FROM document_chunks dc
        WHERE to_tsvector('english', dc.content) @@ plainto_tsquery('english', %s)
    """
    params = [query, query]
    
    if company_ticker:
        sql += " AND dc.company_ticker = %s"
        params.append(company_ticker)
    if chunk_type:
        sql += " AND dc.chunk_type = %s"
        params.append(chunk_type)
    
    sql += " ORDER BY relevance DESC LIMIT %s"
    params.append(max_results)
    
    cur.execute(sql, params)
    columns = [desc[0] for desc in cur.description]
    return [dict(zip(columns, row)) for row in cur.fetchall()]


# =============================================================================
# RESULT FORMATTING
# =============================================================================

def format_results(results: list, search_type: str = "hybrid", elapsed: float = 0):
    """Pretty-print search results."""
    print(f"\n{'─'*70}")
    print(f"🔍 {search_type.upper()} SEARCH — {len(results)} results ({elapsed:.2f}s)")
    print(f"{'─'*70}")
    
    if not results:
        print("  No results found.")
        return
    
    for i, r in enumerate(results, 1):
        ticker = r.get("ticker", "?")
        page = r.get("page_number", "?")
        ctype = r.get("chunk_type", "?")
        section = r.get("section_name", "")
        citation = r.get("citation_ref", "?")
        content = r.get("content", "")
        
        # Truncate content for display
        preview = content.replace("\n", " ")[:200]
        
        # Score info
        score_parts = []
        if "rrf_score" in r and r["rrf_score"]:
            score_parts.append(f"RRF: {r['rrf_score']:.4f}")
        if "similarity" in r and r["similarity"]:
            score_parts.append(f"Sim: {r['similarity']:.3f}")
        if "bm25_rank" in r and r["bm25_rank"]:
            score_parts.append(f"BM25: #{r['bm25_rank']}")
        if "semantic_rank" in r and r["semantic_rank"]:
            score_parts.append(f"Sem: #{r['semantic_rank']}")
        if "relevance" in r and r["relevance"]:
            score_parts.append(f"Rel: {r['relevance']:.4f}")
        score_str = " | ".join(score_parts) if score_parts else ""
        
        print(f"\n  [{i}] 🏢 {ticker} | 📄 Page {page} | 📦 {ctype}", end="")
        if section:
            print(f" | 📑 {section}", end="")
        print()
        print(f"      🔗 {citation}")
        if score_str:
            print(f"      📊 {score_str}")
        print(f"      {preview}...")


# =============================================================================
# INTERACTIVE CLI
# =============================================================================

def interactive_mode():
    """Interactive search CLI for testing and demo."""
    print(f"\n╔{'═'*58}╗")
    print(f"║  PRISM ANALYST — Search Engine                            ║")
    print(f"║  Hybrid (BM25 + Semantic) | Powered by Ollama             ║")
    print(f"╚{'═'*58}╝")
    
    conn = psycopg2.connect(**DB_CONFIG)
    
    # Show available data
    cur = conn.cursor()
    cur.execute("SELECT company_ticker, COUNT(*) FROM document_chunks GROUP BY company_ticker")
    companies = cur.fetchall()
    
    print(f"\n📊 Available data:")
    for ticker, count in companies:
        print(f"   {ticker}: {count} chunks")
    
    print(f"\n💡 Commands:")
    print(f"   Just type a query: hybrid search (default)")
    print(f"   /semantic <query>: semantic-only search")
    print(f"   /keyword <query>: keyword-only search")
    print(f"   /company <TICKER> <query>: filter by company")
    print(f"   /quit: exit")
    
    while True:
        try:
            user_input = input(f"\n🔍 Search: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        
        if not user_input:
            continue
        if user_input.lower() in ("/quit", "/exit", "/q"):
            break
        
        # Parse commands
        company_filter = None
        search_fn = hybrid_search
        search_type = "hybrid"
        query = user_input
        
        if user_input.startswith("/semantic "):
            query = user_input[10:]
            search_fn = semantic_search
            search_type = "semantic"
        elif user_input.startswith("/keyword "):
            query = user_input[9:]
            search_fn = keyword_search
            search_type = "keyword"
        elif user_input.startswith("/company "):
            parts = user_input[9:].split(" ", 1)
            if len(parts) == 2:
                company_filter = parts[0].upper()
                query = parts[1]
            else:
                print("  Usage: /company TICKER query text")
                continue
        
        # Execute search
        start = time.time()
        results = search_fn(conn, query, company_ticker=company_filter)
        elapsed = time.time() - start
        
        format_results(results, search_type, elapsed)
    
    conn.close()
    print("\n👋 Goodbye!")


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Direct query mode
        query = " ".join(sys.argv[1:])
        conn = psycopg2.connect(**DB_CONFIG)
        start = time.time()
        results = hybrid_search(conn, query)
        elapsed = time.time() - start
        format_results(results, "hybrid", elapsed)
        conn.close()
    else:
        # Interactive mode
        interactive_mode()
