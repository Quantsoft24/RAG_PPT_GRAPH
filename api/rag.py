"""
PRISM Analyst — Industry-Grade RAG Pipeline v2
===============================================
Multi-strategy retrieval + 3-tier LLM generation + anti-hallucination.

Pipeline:
  Question → Query Expansion → Query Type Detection → Multi-Strategy Retrieval
  → Context Assembly → LLM Generation (Gemini → OpenRouter → Ollama) → Answer + Citations

Key improvements over v1:
  - Financial synonym expansion for better retrieval
  - OpenRouter as resilient middle-tier LLM
  - Professional analyst system prompt
"""

import json
import os
import re
import sys
import time
from typing import Generator, List, Optional, Tuple

import psycopg2
import urllib.request
import urllib.error

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'database'))
from config import DB_CONFIG

# =============================================================================
# CONFIG
# =============================================================================

OLLAMA_BASE_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
LLM_MODEL = "gemini-3.1-flash-lite-preview"
FALLBACK_LLM = os.getenv("LLM_MODEL", "tinyllama")
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMS = 768
OPENROUTER_MODEL = "google/gemma-3-27b-it:free"
OPENROUTER_FALLBACK_MODELS = [
    "google/gemma-3-27b-it:free",          # Best quality free
    "nousresearch/hermes-3-llama-3.1-405b:free",  # 405B — huge but occasionally rate-limited
    "nvidia/nemotron-3-super-120b-a12b:free",    # NVIDIA 120B
    "google/gemma-3-12b-it:free",          # Smaller but reliable
]

from dotenv import load_dotenv
load_dotenv()

_GEMINI_KEYS_RAW = [
    os.getenv("GEMINI_API_KEY", ""),
    os.getenv("GEMINI_API_KEY_1", ""),
    os.getenv("GEMINI_API_KEY_2", ""),
    os.getenv("GEMINI_API_KEY_3", ""),
    os.getenv("GEMINI_API_KEY_4", "")
]
GEMINI_API_KEYS = [k for k in _GEMINI_KEYS_RAW if k]

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

OLLAMA_FALLBACK_MODELS = [
    "llama3.2:1b",
    "llama3:latest",
    "mistral:latest",
    "phi3:latest",
    "tinyllama:latest"
]


# =============================================================================
# SYSTEM PROMPT — Senior Financial Analyst (Industry-Grade)
# =============================================================================

SYSTEM_PROMPT = """You are PRISM, a senior AI financial analyst at a top-tier investment research firm. You analyze company annual reports and provide institutional-quality insights.

## ABSOLUTE RULES (Non-Negotiable)
1. Use ONLY the PROVIDED CONTEXT. Never use general knowledge or assumptions.
2. CITE every factual claim using the exact citation reference in brackets, e.g. [ADANIENT:AR:P45:text:0].
3. If context is insufficient, state: "Based on the available documents, I don't have enough data to fully answer this. Here's what I found:" and share whatever partial info exists.
4. NEVER fabricate numbers. Use EXACT figures from the source documents.
5. When STRUCTURED DATA is labeled, those are exact extracted values — prioritize them.

## RESPONSE FORMAT (Follow This Structure)

### For Financial/Quantitative Questions:
Start with a one-line executive summary, then present data clearly:

**Executive Summary:** [One-line answer with the key number]

**Financial Highlights:**
| Metric | Value | Period | Source |
|--------|-------|--------|--------|
| Revenue | ₹X,XXX Cr | FY2024 | [citation] |

**Analysis:**
- Key observation 1 [citation]
- Key observation 2 [citation]

### For Qualitative Questions (Management Commentary, Risks, Strategy):
**Executive Summary:** [One-line summary of the key finding]

**Key Points:**
1. **[Topic]** — Detail with supporting evidence [citation]
2. **[Topic]** — Detail with supporting evidence [citation]

### For Comparison Questions:
Present a comparison table, followed by analysis:

| Metric | Company A | Company B | Source |
|--------|-----------|-----------|--------|

## QUALITY STANDARDS
- Use proper Indian financial notation: ₹ Crore, ₹ Lakh (not $ unless source says $)
- Include year/period context for every number
- Be specific: "Revenue grew 15% YoY to ₹45,231 Cr" not "Revenue increased"
- Distinguish between standalone and consolidated figures when present
- For tables in source documents, preserve the data structure in your response
"""


# =============================================================================
# FINANCIAL QUERY EXPANSION (Synonym Dictionary)
# =============================================================================

FINANCIAL_SYNONYMS = {
    "revenue": "revenue turnover sales income from operations top line total income",
    "profit": "profit net income PAT profit after tax net profit bottom line earnings",
    "loss": "loss net loss deficit negative earnings",
    "management commentary": "management discussion analysis MD&A chairman letter director report management review CEO message",
    "risks": "risk factors key risks principal risks risk management uncertainties threats challenges",
    "assets": "total assets asset base gross assets net assets",
    "liabilities": "total liabilities debt obligations borrowings",
    "equity": "shareholders equity net worth shareholders funds share capital reserves",
    "cash flow": "cash flow operating cash free cash flow cash generated cash position liquidity",
    "dividend": "dividend payout dividend per share interim dividend final dividend",
    "ebitda": "EBITDA operating profit EBIT earnings before interest tax depreciation amortization",
    "margin": "margin profit margin operating margin EBITDA margin net margin gross margin",
    "eps": "EPS earnings per share basic EPS diluted EPS",
    "debt": "debt borrowings total debt gross debt net debt leverage",
    "capex": "capex capital expenditure CWIP capital work in progress investment in fixed assets",
    "roe": "ROE return on equity return on net worth",
    "roa": "ROA return on assets return on total assets",
    "roce": "ROCE return on capital employed return on invested capital",
    "strategy": "strategy strategic initiatives growth plan business plan future outlook forward looking",
    "governance": "corporate governance board of directors board composition independent directors",
    "esg": "ESG sustainability environmental social governance CSR corporate social responsibility",
    "segment": "segment business segment operating segment divisional revenue segment revenue",
    "subsidiary": "subsidiary joint venture associate group companies",
    "employee": "employee workforce human resources human capital people headcount",
    "audit": "auditor audit report statutory auditor audit opinion qualified opinion",
    "tax": "tax income tax deferred tax tax rate effective tax rate",
    "depreciation": "depreciation amortization D&A useful life impairment",
    "inventory": "inventory stock raw materials work in progress finished goods",
    "receivables": "receivables trade receivables debtors accounts receivable",
    "payables": "payables trade payables creditors accounts payable",
}


def expand_query(question: str) -> str:
    """
    Expand a financial query with synonym terms for better retrieval.
    e.g., "management commentary" → includes "MD&A", "chairman letter", etc.
    """
    q_lower = question.lower()
    expansions = []

    for key, synonyms in FINANCIAL_SYNONYMS.items():
        if key in q_lower:
            expansions.append(synonyms)

    if expansions:
        expanded = question + " " + " ".join(expansions)
        print(f"[RAG] Query expanded: '{question}' → +{len(expansions)} synonym groups")
        return expanded
    return question


# =============================================================================
# QUERY EMBEDDING
# =============================================================================

def embed_query(text: str) -> Optional[List[float]]:
    """Generate embedding for a search query via Google Gemini with key rotation, falls back to local Ollama."""
    # Tier 1: Gemini Cloud Embeddings
    if GEMINI_API_KEYS:
        for api_key in GEMINI_API_KEYS:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={api_key}"
                payload = json.dumps({
                    "model": "models/gemini-embedding-001",
                    "content": {"parts": [{"text": text}]},
                    "outputDimensionality": EMBEDDING_DIMS
                }).encode("utf-8")

                req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = json.loads(resp.read())
                    values = data.get("embedding", {}).get("values", [])
                    if values:
                        return values
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    continue
            except Exception as e:
                print(f"[RAG] Embedding failed: {e}")
                continue
        print("[RAG] All Gemini embedding keys exhausted, trying local Ollama...")

    # Tier 2: Local Ollama Embeddings (nomic-embed-text)
    try:
        url = f"{OLLAMA_BASE_URL}/api/embeddings"
        payload = json.dumps({"model": "nomic-embed-text", "prompt": text}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            values = data.get("embedding", [])
            if values:
                # Truncate/pad to match EMBEDDING_DIMS if needed
                if len(values) > EMBEDDING_DIMS:
                    values = values[:EMBEDDING_DIMS]
                print(f"[RAG] Local Ollama embedding OK ({len(values)} dims)")
                return values
    except Exception as e:
        print(f"[RAG] Ollama embedding also failed: {e}")

    return None


# =============================================================================
# QUERY TYPE DETECTION
# =============================================================================

QUANTITATIVE_KEYWORDS = [
    "revenue", "profit", "loss", "income", "expense", "ebitda", "margin",
    "eps", "earnings per share", "dividend", "turnover", "sales", "assets",
    "liabilities", "equity", "cash flow", "operating", "net worth",
    "debt", "borrowing", "capex", "capital expenditure", "depreciation",
    "tax", "interest", "roe", "roa", "roce", "pat", "pbt", "ebit",
    "how much", "what was the", "total", "growth rate", "percentage"
]


def detect_query_type(question: str) -> str:
    """Detect if a question is quantitative or qualitative."""
    q_lower = question.lower()
    for kw in QUANTITATIVE_KEYWORDS:
        if kw in q_lower:
            return "quantitative"
    return "qualitative"


# =============================================================================
# RETRIEVAL STRATEGY 1: SQL (Structured Financial Metrics)
# =============================================================================

def retrieve_structured_metrics(
    conn,
    query: str,
    company_ticker: str,
    limit: int = 10
) -> List[dict]:
    """Query the financial_metrics table for exact numbers."""
    cur = conn.cursor()

    q_lower = query.lower()
    matching_keywords = [kw for kw in QUANTITATIVE_KEYWORDS if kw in q_lower]

    if not matching_keywords:
        return []

    conditions = " OR ".join(["metric_name ILIKE %s" for _ in matching_keywords])
    params = [f"%{kw}%" for kw in matching_keywords]
    params.append(company_ticker)

    sql = f"""
        SELECT DISTINCT ON (metric_name)
               metric_name, raw_value, unit, period, year, page_number, citation_ref,
               metric_category, nse_code
        FROM financial_metrics
        WHERE ({conditions})
          AND nse_code = %s
        ORDER BY metric_name, year DESC NULLS LAST
        LIMIT {limit}
    """

    try:
        cur.execute(sql, params)
        columns = [desc[0] for desc in cur.description]
        results = [dict(zip(columns, row)) for row in cur.fetchall()]
        return results
    except Exception as e:
        print(f"[RAG] SQL retrieval failed: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return []


# =============================================================================
# RETRIEVAL STRATEGY 2: Multi-Tier Search (Hybrid → Vector → BM25)
# =============================================================================

def retrieve_context(
    conn,
    query: str,
    company_ticker: Optional[str] = None,
    max_chunks: int = 5,
    prefer_tables: bool = False
) -> List[dict]:
    """
    Retrieve relevant chunks using a 3-tier fallback:
      1. hybrid_search() SQL function (BM25 + semantic, fused via RRF)
      2. Direct cosine similarity via pgvector <=> operator
      3. BM25 keyword-only search
    """
    cur = conn.cursor()

    # Expand query with financial synonyms for better embedding
    expanded_query = expand_query(query)
    query_vec = embed_query(expanded_query)
    results = []

    # ── TIER 1: hybrid_search SQL function ──
    if query_vec:
        vec_str = "[" + ",".join(str(v) for v in query_vec) + "]"
        fetch_limit = max_chunks * 2 if prefer_tables else max_chunks
        try:
            cur.execute("SAVEPOINT hybrid_attempt")
            cur.execute("""
                SELECT * FROM hybrid_search(%s, %s::vector, %s, NULL, 60, %s)
            """, (query, vec_str, company_ticker, fetch_limit))
            columns = [desc[0] for desc in cur.description]
            results = [dict(zip(columns, row)) for row in cur.fetchall()]
            cur.execute("RELEASE SAVEPOINT hybrid_attempt")
            print(f"[RAG] Tier 1 (hybrid_search): {len(results)} results")
        except Exception as e:
            print(f"[RAG] Tier 1 (hybrid_search) failed: {e}")
            try:
                cur.execute("ROLLBACK TO SAVEPOINT hybrid_attempt")
            except Exception:
                pass

    # ── TIER 2: Direct vector similarity (cosine) ──
    if not results and query_vec:
        vec_str = "[" + ",".join(str(v) for v in query_vec) + "]"
        try:
            sql = """
                SELECT
                    dc.chunk_id, dc.nse_code, dc.page_number, dc.chunk_type,
                    dc.content, dc.citation_ref,
                    1 - (dc.embedding <=> %s::vector) AS similarity
                FROM document_chunks dc
                WHERE dc.embedding IS NOT NULL
            """
            params: list = [vec_str]

            if company_ticker:
                sql += " AND dc.nse_code = %s"
                params.append(company_ticker)

            sql += " ORDER BY dc.embedding <=> %s::vector ASC LIMIT %s"
            params.append(vec_str)
            fetch_limit = max_chunks * 2 if prefer_tables else max_chunks
            params.append(fetch_limit)

            cur.execute(sql, params)
            columns = [desc[0] for desc in cur.description]
            results = [dict(zip(columns, row)) for row in cur.fetchall()]
            # Filter low-quality matches (similarity < 0.3)
            results = [r for r in results if (r.get("similarity") or 0) > 0.3]
            print(f"[RAG] Tier 2 (direct vector): {len(results)} results")
        except Exception as e:
            print(f"[RAG] Tier 2 (direct vector) failed: {e}")

    # ── TIER 3: BM25 keyword-only search ──
    if not results:
        sql = """
            SELECT
                dc.chunk_id, dc.nse_code, dc.page_number, dc.chunk_type,
                dc.content, dc.citation_ref,
                ts_rank_cd(
                    to_tsvector('english', dc.content),
                    plainto_tsquery('english', %s), 32
                ) AS relevance
            FROM document_chunks dc
            WHERE to_tsvector('english', dc.content) @@ plainto_tsquery('english', %s)
        """
        params3: list = [query, query]

        if company_ticker:
            sql += " AND dc.nse_code = %s"
            params3.append(company_ticker)

        sql += " ORDER BY relevance DESC LIMIT %s"
        params3.append(max_chunks)

        cur.execute(sql, params3)
        columns = [desc[0] for desc in cur.description]
        results = [dict(zip(columns, row)) for row in cur.fetchall()]
        print(f"[RAG] Tier 3 (BM25 keyword): {len(results)} results")

    # ── Broader fallback via content_blocks table ──
    if not results:
        sql2 = """
            SELECT
                cb.block_id AS chunk_id, c.nse_code, p.page_number,
                cb.block_type AS chunk_type, cb.content, cb.citation_ref,
                ts_rank_cd(
                    to_tsvector('english', cb.content),
                    plainto_tsquery('english', %s), 32
                ) AS relevance
            FROM content_blocks cb
            JOIN pages p ON p.page_id = cb.page_id
            JOIN documents d ON d.document_id = p.document_id
            JOIN master_companies c ON c.company_id = d.company_id
            WHERE to_tsvector('english', cb.content) @@ plainto_tsquery('english', %s)
        """
        params4: list = [query, query]
        if company_ticker:
            sql2 += " AND c.nse_code = %s"
            params4.append(company_ticker)
        sql2 += " ORDER BY relevance DESC LIMIT %s"
        params4.append(max_chunks)
        cur.execute(sql2, params4)
        columns = [desc[0] for desc in cur.description]
        results = [dict(zip(columns, row)) for row in cur.fetchall()]
        print(f"[RAG] Tier 4 (content_blocks): {len(results)} results")

    # ── Post-processing: boost tables for quantitative queries ──
    if results and prefer_tables:
        tables = [r for r in results if r.get("chunk_type") == "table"]
        non_tables = [r for r in results if r.get("chunk_type") != "table"]
        results = (tables + non_tables)[:max_chunks]
    elif results:
        results = results[:max_chunks]

    return results


# =============================================================================
# CONTEXT BUILDING
# =============================================================================

def build_rag_context(
    chunks: List[dict],
    structured_metrics: Optional[List[dict]] = None
) -> Tuple[str, List[dict]]:
    """Build the context string for the LLM prompt."""
    context_parts = []
    citations = []

    # Part 1: Structured financial data (from SQL)
    if structured_metrics:
        context_parts.append("═══ STRUCTURED FINANCIAL DATA (exact values from financial tables) ═══")
        for m in structured_metrics:
            line = f"  • {m['metric_name']}: {m['raw_value']}"
            if m.get('unit'):
                line += f" {m['unit']}"
            if m.get('year'):
                line += f" (Year: {m['year']})"
            if m.get('period'):
                line += f" [{m['period']}]"
            cref = m.get('citation_ref', 'N/A')
            line += f"  [Citation: {cref}]"
            context_parts.append(line)

            nse = m.get('nse_code', '?')
            citations.append({
                "ref": cref,
                "nse_code": nse,
                "page": m.get('page_number', 0),
                "chunk_type": "table",
                "preview": f"{m['metric_name']}: {m['raw_value']} {m.get('unit', '')}"
            })
        context_parts.append("")

    # Part 2: Document chunks (from vector/BM25 search)
    if chunks:
        context_parts.append("═══ SOURCE DOCUMENTS FROM ANNUAL REPORTS ═══")
        for i, chunk in enumerate(chunks, 1):
            nse_code = chunk.get("nse_code", "?")
            page = chunk.get("page_number", "?")
            ctype = chunk.get("chunk_type", "text")
            content = chunk.get("content", "")
            citation = chunk.get("citation_ref", f"source_{i}")

            header = f"[Source {i}] Company: {nse_code} | Page: {page} | Type: {ctype}"
            header += f"\nCitation: {citation}"
            context_parts.append(f"{header}\n{content}\n")

            citations.append({
                "ref": citation,
                "nse_code": nse_code,
                "page": page,
                "chunk_type": ctype,
                "preview": content[:200] if content else ""
            })

    context_str = "\n".join(context_parts)
    return context_str, citations


# =============================================================================
# LLM GENERATION — Gemini → OpenRouter → Ollama (3-tier resilience)
# =============================================================================

def _call_gemini_generate(prompt: str, system: str) -> Optional[str]:
    """Generate answer using Gemini 2.0 Flash with key rotation."""
    if not GEMINI_API_KEYS:
        return None
    for api_key in GEMINI_API_KEYS:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{LLM_MODEL}:generateContent?key={api_key}"
            payload = json.dumps({
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 4096,
                    "topP": 0.9
                }
            }).encode("utf-8")

            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
                candidates = data.get("candidates", [])
                if candidates:
                    return candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        except urllib.error.HTTPError as e:
            print(f"[RAG] Gemini generate HTTP Error {e.code} for key {api_key[:10]}...")
            if e.code == 429:
                continue
        except Exception as e:
            print(f"[RAG] Gemini generation failed for key {api_key[:10]}: {e}")
            continue
    
    print("[RAG] All Gemini keys exhausted for generation.")
    return None


def _call_gemini_stream(prompt: str, system: str) -> Optional[Generator[str, None, None]]:
    """Stream answer from Gemini 2.0 Flash with key rotation."""
    if not GEMINI_API_KEYS:
        return None
    for api_key in GEMINI_API_KEYS:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{LLM_MODEL}:streamGenerateContent?alt=sse&key={api_key}"
            payload = json.dumps({
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 4096,
                    "topP": 0.9
                }
            }).encode("utf-8")

            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            resp = urllib.request.urlopen(req, timeout=120)

            def gemini_token_gen(resp=resp):
                buffer = b""
                for raw_line in resp:
                    buffer += raw_line
                    while b"\n" in buffer:
                        line, buffer = buffer.split(b"\n", 1)
                        line_str = line.decode("utf-8").strip()
                        if line_str.startswith("data: "):
                            json_str = line_str[6:]
                            try:
                                data = json.loads(json_str)
                                candidates = data.get("candidates", [])
                                if candidates:
                                    parts = candidates[0].get("content", {}).get("parts", [])
                                    for part in parts:
                                        text = part.get("text", "")
                                        if text:
                                            yield text
                            except json.JSONDecodeError:
                                continue
                resp.close()

            print(f"[RAG] Gemini stream connected via key {api_key[:10]}...")
            return gemini_token_gen()
        except urllib.error.HTTPError as e:
            print(f"[RAG] Gemini stream HTTP Error {e.code} for key {api_key[:10]}...")
            if e.code == 429:
                continue
        except Exception as e:
            print(f"[RAG] Gemini streaming failed for key {api_key[:10]}: {e}")
            continue
            
    print("[RAG] All Gemini keys exhausted for streaming.")
    return None


def _call_openrouter_stream(prompt: str, system: str) -> Optional[Generator[str, None, None]]:
    """Stream answer from OpenRouter with model fallback rotation."""
    if not OPENROUTER_API_KEY:
        return None

    for model in OPENROUTER_FALLBACK_MODELS:
        try:
            print(f"[RAG] Trying OpenRouter model: {model}")
            url = "https://openrouter.ai/api/v1/chat/completions"
            payload = json.dumps({
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.1,
                "max_tokens": 4096,
                "stream": True
            }).encode("utf-8")

            req = urllib.request.Request(url, data=payload, headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "HTTP-Referer": "https://prism-analyst.local",
                "X-Title": "PRISM Analyst"
            })
            resp = urllib.request.urlopen(req, timeout=120)

            def openrouter_token_gen(resp=resp):
                buffer = b""
                for raw_line in resp:
                    buffer += raw_line
                    while b"\n" in buffer:
                        line, buffer = buffer.split(b"\n", 1)
                        line_str = line.decode("utf-8").strip()
                        if line_str.startswith("data: "):
                            json_str = line_str[6:]
                            if json_str.strip() == "[DONE]":
                                break
                            try:
                                data = json.loads(json_str)
                                choices = data.get("choices", [])
                                if choices:
                                    delta = choices[0].get("delta", {})
                                    text = delta.get("content", "")
                                    if text:
                                        yield text
                            except json.JSONDecodeError:
                                continue
                resp.close()

            print(f"[RAG] OpenRouter connected via {model}")
            return openrouter_token_gen()
        except urllib.error.HTTPError as e:
            print(f"[RAG] OpenRouter {model} failed: HTTP {e.code}")
            if e.code == 429:
                continue  # Rate limited, try next model
            if e.code == 404:
                continue  # Model not available, try next
        except Exception as e:
            print(f"[RAG] OpenRouter {model} failed: {e}")
            continue

    print("[RAG] All OpenRouter models exhausted")
    return None


def _call_openrouter_generate(prompt: str, system: str) -> Optional[str]:
    """Non-streaming generation via OpenRouter."""
    if not OPENROUTER_API_KEY:
        return None
    for model in OPENROUTER_FALLBACK_MODELS:
        try:
            url = "https://openrouter.ai/api/v1/chat/completions"
            payload = json.dumps({
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.1,
                "max_tokens": 4096
            }).encode("utf-8")

            req = urllib.request.Request(url, data=payload, headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "HTTP-Referer": "https://prism-analyst.local",
                "X-Title": "PRISM Analyst"
            })
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
                choices = data.get("choices", [])
                if choices:
                    return choices[0].get("message", {}).get("content", "")
        except urllib.error.HTTPError as e:
            print(f"[RAG] OpenRouter {model} generate failed: HTTP {e.code}")
            if e.code in (429, 404):
                continue
        except Exception as e:
            print(f"[RAG] OpenRouter {model} generate failed: {e}")
            continue
    return None


def _call_ollama_stream(prompt: str, system: str) -> Generator[str, None, None]:
    """Fallback: Stream answer from local Ollama rotating through models."""
    for model in OLLAMA_FALLBACK_MODELS:
        try:
            print(f"[RAG] Trying Ollama model: {model}")
            url = f"{OLLAMA_BASE_URL}/api/generate"
            payload = json.dumps({
                "model": model,
                "system": system,
                "prompt": prompt,
                "stream": True,
                "options": {"temperature": 0.1, "top_p": 0.9, "num_predict": 2048}
            }).encode("utf-8")

            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            resp = urllib.request.urlopen(req, timeout=600)
            
            def ollama_token_gen(resp=resp):
                for line in resp:
                    if line:
                        try:
                            data = json.loads(line)
                            token = data.get("response", "")
                            if token:
                                yield token
                            if data.get("done", False):
                                break
                        except json.JSONDecodeError:
                            continue
                resp.close()
            yield from ollama_token_gen()
            return
        except urllib.error.HTTPError as e:
            print(f"[RAG] Ollama {model} HTTP Error: {e.code}")
            continue
        except Exception as e:
            print(f"[RAG] Ollama {model} failed: {e}")
            continue
    yield "\n\n❌ **Error:** All local edge models failed or timed out. Please try your request again in a few minutes when Cloud rate-limits reset."


def _build_user_prompt(question: str, context: str) -> str:
    """Build the user prompt with context."""
    return f"""CONTEXT FROM ANNUAL REPORTS:
{context}

QUESTION: {question}

Provide a thorough, well-structured financial analysis based ONLY on the above context. Use the exact response format specified in your instructions. Cite every claim using [citation_ref] markers."""


def _fetch_tavily_results(query: str) -> List[dict]:
    """Fetch live web search results from Tavily API and format as RAG citations."""
    if not TAVILY_API_KEY:
        print("[RAG] Web Search requested but TAVILY_API_KEY is missing/empty.")
        return []
        
    print(f"[RAG] Executing live Tavily web search for: '{query}'")
    try:
        url = "https://api.tavily.com/search"
        payload = json.dumps({
            "api_key": TAVILY_API_KEY,
            "query": query,
            "search_depth": "basic",
            "include_answer": False,
            "include_images": False,
            "include_raw_content": False,
            "max_results": 4,
            "include_domains": []
        }).encode("utf-8")
        
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            results = data.get("results", [])
            
            citations = []
            for i, r in enumerate(results):
                citations.append({
                    "ref": f"WEB-{i+1}",
                    "nse_code": "WEB SEARCH",
                    "page": 1,
                    "chunk_type": "article",
                    "preview": r.get("content", "")[:350] + "..." if r.get("content") else "",
                    "url": r.get("url", "")
                })
            return citations
    except Exception as e:
        print(f"[RAG] Tavily API failed: {e}")
        return []


# =============================================================================
# FULL RAG PIPELINE (3-tier LLM resilience)
# =============================================================================

def ask(
    conn,
    question: str,
    company_ticker: Optional[str] = None,
    max_chunks: int = 5,
    stream: bool = False,
    use_web_search: bool = False
):
    """
    Full industry-grade RAG pipeline:
      1. Detect query type (quantitative vs qualitative)
      2. Multi-strategy retrieval (SQL + vector with query expansion)
      3. Context assembly (structured data + document chunks)
      4. LLM generation: Gemini → OpenRouter → Ollama

    Returns:
        If stream=False: (answer_text, citations_list, elapsed_ms)
        If stream=True: (generator, citations_list)
    """
    start = time.time()
    query_type = detect_query_type(question)
    print(f"[RAG] Query type: {query_type} | Company: {company_ticker}")

    # Step 1: Multi-strategy retrieval
    structured_metrics = []
    if query_type == "quantitative" and company_ticker:
        structured_metrics = retrieve_structured_metrics(conn, question, company_ticker)
        print(f"[RAG] SQL metrics found: {len(structured_metrics)}")

    # Step 2: Vector/BM25 search (table-preferred for quantitative)
    chunks = retrieve_context(
        conn, question, company_ticker, max_chunks,
        prefer_tables=(query_type == "quantitative")
    )
    print(f"[RAG] Vector chunks found: {len(chunks)}")

    # Step 3: Build internal context
    context, citations = build_rag_context(chunks, structured_metrics)
    
    # Optional Step 3b: Augment with Web Search
    if use_web_search:
        web_results = _fetch_tavily_results(question)
        if web_results:
            context += "\n\nCONTEXT FROM LIVE WEB SEARCH:\n"
            for w in web_results:
                context += f"\n- [{w['ref']}] {w['preview']}"
                citations.append(w)

    if not context:
        no_info = "I don't have sufficient information in the provided documents to answer this question. Please try a different query or specify a company."
        if stream:
            def empty_gen():
                yield no_info
            return empty_gen(), []
        else:
            elapsed = (time.time() - start) * 1000
            return no_info, [], elapsed

    # Step 4: Generate answer (3-tier: Gemini → OpenRouter → Ollama)
    prompt = _build_user_prompt(question, context)

    if stream:
        def orchestrate_stream():
            yield {"type": "status", "text": "Querying primary Gemini cognitive engine..."}
            gen = _call_gemini_stream(prompt, SYSTEM_PROMPT)
            if gen is not None:
                yield from gen
                return
                
            yield {"type": "status", "text": "Gemini rate limits active. Rerouting to OpenRouter fallback..."}
            gen = _call_openrouter_stream(prompt, SYSTEM_PROMPT)
            if gen is not None:
                yield from gen
                return
                
            yield {"type": "status", "text": "Cloud modules exhausted. Initializing local Ollama edge inference (This will take a moment)..."}
            gen = _call_ollama_stream(prompt, SYSTEM_PROMPT)
            if gen is not None:
                yield from gen
            
        return orchestrate_stream(), citations
    else:
        answer = _call_gemini_generate(prompt, SYSTEM_PROMPT)
        if answer is None:
            print("[RAG] Gemini generate failed, trying OpenRouter...")
            answer = _call_openrouter_generate(prompt, SYSTEM_PROMPT)
        if answer is None:
            print("[RAG] OpenRouter generate failed, falling back to Ollama...")
            full_text = ""
            for token in _call_ollama_stream(prompt, SYSTEM_PROMPT):
                full_text += token
            answer = full_text
        elapsed = (time.time() - start) * 1000
        return answer, citations, elapsed


# =============================================================================
# UTILITY
# =============================================================================

def check_ollama_health() -> dict:
    """Check if Ollama and Gemini are available."""
    try:
        url = f"{OLLAMA_BASE_URL}/api/tags"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            models = [m["name"] for m in data.get("models", [])]

            gemini_ok = bool(GEMINI_API_KEY)
            openrouter_ok = bool(OPENROUTER_API_KEY)

            return {
                "status": "healthy",
                "models": models + [EMBEDDING_MODEL],
                "llm_available": gemini_ok or openrouter_ok or any(FALLBACK_LLM in m for m in models),
                "embedding_available": gemini_ok
            }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
