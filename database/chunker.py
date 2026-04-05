"""
PRISM Analyst — Page-by-Page Semantic Chunking Engine
======================================================
Industry-grade document chunking for financial annual reports.

Architecture:
  - Page-by-page processing: each PDF page is processed independently
  - Block-type separation: text, tables, and charts get their own chunks
  - This gives the embedding model clean, focused content per vector
    while preserving page-level context for the LLM

Design principles:
  - Tables are NEVER split — always a single chunk
  - Charts are NEVER split — always a single chunk
  - Text blocks from the same page are merged into larger chunks
    (respecting paragraph boundaries and a ~1000 token target)
  - Each chunk is enriched with metadata prefix for embedding quality
  - Citation anchors link every chunk back to its exact source page

Usage:
    python database/chunker.py
"""

import re
import os
import sys
import time
from typing import Optional

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DB_CONFIG


# =============================================================================
# TOKENIZER — Fast approximate token counter
# =============================================================================

def count_tokens(text: str) -> int:
    """Approximate token count. English text averages ~1.3 tokens per word."""
    if not text:
        return 0
    words = re.findall(r'\S+', text)
    return max(1, int(len(words) * 1.3))


# =============================================================================
# METADATA PREFIX BUILDER
# =============================================================================

def build_metadata_prefix(nse_code: str, doc_type: str, page_number: int, chunk_type: str) -> str:
    """
    Build metadata prefix prepended to content before embedding.
    Format: [COMPANY] [Doc Type] [Page N] [TYPE]

    WHY: Prefixing metadata dramatically improves retrieval precision.
    The embedding model learns associations like "[MAHINDRA] [Page 42] revenue"
    which helps it distinguish between revenue data from different companies.
    """
    parts = [f"[{nse_code}]", f"[{doc_type}]", f"[Page {page_number}]"]
    if chunk_type != "text":
        parts.append(f"[{chunk_type.upper()}]")
    return " ".join(parts)


# =============================================================================
# PAGE-BY-PAGE CHUNKER
# =============================================================================

# Target token sizes for text merging
TARGET_TOKENS = 1000    # Ideal chunk size for embedding
MAX_TOKENS = 1500       # Hard cap before splitting


def chunk_page_blocks(nse_code: str, page_number: int, blocks: list) -> list:
    """
    Process all content blocks from a single page into chunks.

    Strategy:
      1. Tables → each table becomes exactly 1 chunk (never split)
      2. Charts → each chart becomes exactly 1 chunk (never split)
      3. Text blocks → merged together (respecting token limits),
         then split at paragraph/sentence boundaries if too large

    Returns a list of chunk dicts ready for DB insertion.
    """
    chunks = []
    text_buffer = []
    text_tokens = 0
    chunk_index = 0

    def flush_text_buffer():
        """Flush accumulated text blocks into one or more chunks."""
        nonlocal chunk_index
        if not text_buffer:
            return

        merged_text = "\n\n".join(text_buffer)
        merged_tokens = count_tokens(merged_text)

        if merged_tokens <= MAX_TOKENS:
            # Fits in one chunk
            prefix = build_metadata_prefix(nse_code, "Annual Report", page_number, "text")
            chunks.append({
                "chunk_index": chunk_index,
                "chunk_type": "text",
                "content": merged_text.strip(),
                "embedding_text": f"{prefix}\n{merged_text.strip()}",
                "token_count": merged_tokens,
                "has_table": False,
                "has_chart": False,
                "citation_ref": f"{nse_code}:AR:P{page_number}:text:{chunk_index}",
            })
            chunk_index += 1
        else:
            # Too large — split at paragraph boundaries
            paragraphs = re.split(r'\n\s*\n', merged_text)
            current_buf = []
            current_tok = 0

            for para in paragraphs:
                para = para.strip()
                if not para:
                    continue
                para_tok = count_tokens(para)

                if current_tok + para_tok > TARGET_TOKENS and current_buf:
                    # Flush current accumulation
                    content = "\n\n".join(current_buf)
                    prefix = build_metadata_prefix(nse_code, "Annual Report", page_number, "text")
                    chunks.append({
                        "chunk_index": chunk_index,
                        "chunk_type": "text",
                        "content": content.strip(),
                        "embedding_text": f"{prefix}\n{content.strip()}",
                        "token_count": count_tokens(content),
                        "has_table": False,
                        "has_chart": False,
                        "citation_ref": f"{nse_code}:AR:P{page_number}:text:{chunk_index}",
                    })
                    chunk_index += 1
                    current_buf = []
                    current_tok = 0

                current_buf.append(para)
                current_tok += para_tok

            # Flush remaining
            if current_buf:
                content = "\n\n".join(current_buf)
                prefix = build_metadata_prefix(nse_code, "Annual Report", page_number, "text")
                chunks.append({
                    "chunk_index": chunk_index,
                    "chunk_type": "text",
                    "content": content.strip(),
                    "embedding_text": f"{prefix}\n{content.strip()}",
                    "token_count": count_tokens(content),
                    "has_table": False,
                    "has_chart": False,
                    "citation_ref": f"{nse_code}:AR:P{page_number}:text:{chunk_index}",
                })
                chunk_index += 1

    for block in blocks:
        block_type = block["type"]
        content = block["content"]

        if not content or not content.strip():
            continue

        if block_type == "table":
            # Flush any accumulated text first (preserve reading order)
            flush_text_buffer()
            text_buffer = []
            text_tokens = 0

            # Table → always a single chunk
            prefix = build_metadata_prefix(nse_code, "Annual Report", page_number, "table")
            chunks.append({
                "chunk_index": chunk_index,
                "chunk_type": "table",
                "content": content.strip(),
                "embedding_text": f"{prefix}\n{content.strip()}",
                "token_count": count_tokens(content),
                "has_table": True,
                "has_chart": False,
                "citation_ref": f"{nse_code}:AR:P{page_number}:table:{chunk_index}",
            })
            chunk_index += 1

        elif block_type == "chart":
            # Flush text first
            flush_text_buffer()
            text_buffer = []
            text_tokens = 0

            # Chart → always a single chunk
            prefix = build_metadata_prefix(nse_code, "Annual Report", page_number, "chart")
            chunks.append({
                "chunk_index": chunk_index,
                "chunk_type": "chart",
                "content": content.strip(),
                "embedding_text": f"{prefix}\n{content.strip()}",
                "token_count": count_tokens(content),
                "has_table": False,
                "has_chart": True,
                "citation_ref": f"{nse_code}:AR:P{page_number}:chart:{chunk_index}",
            })
            chunk_index += 1

        else:
            # Text → accumulate into buffer
            block_tokens = count_tokens(content)

            # If adding this text would exceed the target, flush first
            if text_tokens + block_tokens > TARGET_TOKENS and text_buffer:
                flush_text_buffer()
                text_buffer = []
                text_tokens = 0

            text_buffer.append(content.strip())
            text_tokens += block_tokens

    # Final flush of any remaining text
    flush_text_buffer()

    return chunks


# =============================================================================
# MAIN PIPELINE
# =============================================================================

def run_chunking():
    """Run the page-by-page chunking pipeline for all companies on AWS."""
    start_time = time.time()

    print(f"╔{'═'*58}╗")
    print(f"║  PRISM ANALYST — Page-by-Page Chunking Pipeline          ║")
    print(f"║  Block-type separated • Optimized for Hybrid Search      ║")
    print(f"╚{'═'*58}╝")

    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False
    cur = conn.cursor()

    # Clear existing chunks for a clean run
    cur.execute("SELECT COUNT(*) FROM document_chunks")
    existing = cur.fetchone()[0]
    if existing > 0:
        print(f"\n⚠️  Found {existing} existing chunks. Clearing for fresh run...")
        cur.execute("DELETE FROM document_chunks")
        conn.commit()

    total_chunks = 0

    # Fetch all companies and their documents
    cur.execute("""
        SELECT c.nse_code, c.company_name, d.document_id, d.total_pages
        FROM master_companies c
        JOIN documents d ON d.company_id = c.company_id
        ORDER BY c.nse_code
    """)
    companies = cur.fetchall()

    for nse_code, company_name, doc_id, total_pages in companies:
        print(f"\n{'='*60}")
        print(f"🏢 {company_name} ({nse_code}) — {total_pages} pages")
        print(f"{'='*60}")

        company_chunks = 0

        # Get all pages for this document
        cur.execute("""
            SELECT p.page_id, p.page_number, p.ocr_text
            FROM pages p
            WHERE p.document_id = %s
            ORDER BY p.page_number
        """, (doc_id,))
        pages = cur.fetchall()

        for page_id, page_number, ocr_text in pages:
            # Get all content blocks for this page, ordered by reading sequence
            cur.execute("""
                SELECT block_type, content
                FROM content_blocks
                WHERE page_id = %s
                ORDER BY block_index
            """, (page_id,))
            blocks = [{"type": row[0], "content": row[1]} for row in cur.fetchall()]

            # If no blocks but we have OCR text, treat it as a single text block
            if not blocks and ocr_text and ocr_text.strip():
                blocks = [{"type": "text", "content": ocr_text}]

            if not blocks:
                continue

            # Generate chunks for this page
            page_chunks = chunk_page_blocks(nse_code, page_number, blocks)

            # Insert chunks into database
            for chunk in page_chunks:
                cur.execute("""
                    INSERT INTO document_chunks (
                        page_id, document_id, nse_code, page_number,
                        chunk_index, chunk_type, content, embedding_text,
                        token_count, has_table, has_chart, citation_ref
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    page_id, doc_id, nse_code, page_number,
                    chunk["chunk_index"], chunk["chunk_type"],
                    chunk["content"], chunk["embedding_text"],
                    chunk["token_count"], chunk["has_table"],
                    chunk["has_chart"], chunk["citation_ref"]
                ))
                company_chunks += 1

            # Progress indicator
            if page_number % 50 == 0:
                print(f"  ... page {page_number}/{total_pages} ({company_chunks} chunks so far)")

        conn.commit()
        total_chunks += company_chunks

        # Company summary
        avg_per_page = company_chunks / max(1, total_pages)
        print(f"  ✅ {company_chunks} chunks created ({avg_per_page:.1f} chunks/page)")

    # Print final stats
    print(f"\n{'='*60}")
    print(f"📊 CHUNKING SUMMARY")
    print(f"{'='*60}")

    cur.execute("SELECT * FROM v_chunk_stats")
    cols = [desc[0] for desc in cur.description]
    for row in cur.fetchall():
        data = dict(zip(cols, row))
        print(f"\n  🏢 {data['nse_code']}:")
        print(f"     Total: {data['total_chunks']} chunks")
        print(f"     Text: {data['text_chunks']} | Table: {data['table_chunks']} | "
              f"Chart: {data['chart_chunks']}")
        print(f"     Tokens: avg={data['avg_tokens']}, min={data['min_tokens']}, max={data['max_tokens']}")
        print(f"     Embedded: {data['embedded_count']} | Pending: {data['pending_embedding']}")

    conn.close()

    elapsed = time.time() - start_time
    print(f"\n⏱️  Chunking completed in {elapsed:.1f}s — {total_chunks} total chunks")
    return total_chunks


if __name__ == "__main__":
    run_chunking()
