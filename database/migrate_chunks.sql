-- =============================================================================
-- PRISM ANALYST — Phase 6: Page-by-Page Chunking + Vector Embeddings
-- Run AFTER schema.sql has been applied.
--
-- Architecture: Page-by-page chunking WITH block-type separation.
--   Each page produces multiple chunks (one per text/table/chart block),
--   preserving the visual structure of the original PDF while giving
--   the embedding model clean, focused content per vector.
-- =============================================================================

-- Ensure pgvector extension is available
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop old schema objects if they exist (clean migration)
DROP VIEW IF EXISTS v_chunk_stats CASCADE;
DROP FUNCTION IF EXISTS hybrid_search CASCADE;
DROP FUNCTION IF EXISTS semantic_search CASCADE;
DROP TABLE IF EXISTS document_chunks CASCADE;

-- =============================================================================
-- DOCUMENT_CHUNKS — One row per content block per page
--
-- WHY EACH FIELD EXISTS:
--   chunk_id         → Unique identifier for this chunk (renamed from 'id')
--   page_id          → FK to pages table; links chunk back to its source page
--   document_id      → FK to documents; denormalized to avoid JOIN in hot search path
--   nse_code         → Company NSE ticker; denormalized for fast WHERE filtering
--   page_number      → Page number in the PDF; denormalized for citation generation
--   chunk_index      → Order of this chunk within its page (0-based); critical for
--                       reconstructing the reading order when multiple chunks from
--                       the same page are retrieved
--   chunk_type       → 'text' | 'table' | 'chart'; enables type-specific filtering
--                       (e.g. "find only tables mentioning revenue")
--   content          → The raw content: markdown text, HTML table, or chart description
--   embedding_text   → Metadata-enriched version sent to the embedding model.
--                       Format: "[COMPANY] [Doc Type] [Page N] [TYPE]\n<content>"
--                       This prefix dramatically improves retrieval precision.
--   token_count      → Approximate token count; used for context-window budgeting
--                       when feeding chunks to the LLM
--   has_table        → TRUE if this chunk is a table; quick boolean filter
--   has_chart        → TRUE if this chunk is a chart; quick boolean filter
--   citation_ref     → Human-readable citation anchor, e.g. "MAHINDRA:AR:P7:table:0"
--                       Used by the frontend to link answers back to source pages
--   embedding        → 768-dim vector from Google Gemini text-embedding-004
--   created_at       → When the chunk was created
--   embedded_at      → When the embedding was generated (NULL = pending)
-- =============================================================================
CREATE TABLE document_chunks (
    chunk_id            SERIAL PRIMARY KEY,

    -- Source linking (foreign keys for data integrity)
    page_id             INTEGER NOT NULL REFERENCES pages(page_id) ON DELETE CASCADE,
    document_id         INTEGER NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,

    -- Denormalized fields (avoids expensive JOINs during vector search)
    nse_code            VARCHAR(50) NOT NULL,
    page_number         INTEGER NOT NULL,

    -- Chunk identity
    chunk_index         INTEGER NOT NULL,
    chunk_type          VARCHAR(20) NOT NULL CHECK (chunk_type IN ('text', 'table', 'chart')),

    -- Content
    content             TEXT NOT NULL,
    embedding_text      TEXT NOT NULL,
    token_count         INTEGER NOT NULL DEFAULT 0,

    -- Quick boolean filters for search optimization
    has_table           BOOLEAN DEFAULT FALSE,
    has_chart           BOOLEAN DEFAULT FALSE,

    -- Citation anchor for the frontend
    citation_ref        VARCHAR(150) NOT NULL,

    -- Vector embedding (768 dims — Google Gemini text-embedding-004)
    embedding           vector(768),

    -- Timestamps
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    embedded_at         TIMESTAMP
);

-- =============================================================================
-- INDEXES — Optimized for hybrid (BM25 + vector) search
-- =============================================================================

-- HNSW index for fast approximate nearest-neighbor vector search (cosine distance)
-- m=16: number of bi-directional links per node (higher = better recall, more memory)
-- ef_construction=200: search width during index build (higher = better quality)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
    ON document_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

-- B-tree indexes for metadata pre-filtering (applied BEFORE vector search)
CREATE INDEX IF NOT EXISTS idx_chunks_nse_code ON document_chunks(nse_code);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_page ON document_chunks(page_id);
CREATE INDEX IF NOT EXISTS idx_chunks_type ON document_chunks(chunk_type);
CREATE INDEX IF NOT EXISTS idx_chunks_citation ON document_chunks(citation_ref);

-- Composite index: most common filter pattern in financial RAG queries
CREATE INDEX IF NOT EXISTS idx_chunks_company_type ON document_chunks(nse_code, chunk_type);

-- Composite index: page-level grouping (retrieve all chunks from a page)
CREATE INDEX IF NOT EXISTS idx_chunks_company_page ON document_chunks(nse_code, page_number);

-- GIN full-text search index on chunk content (powers the BM25 search path)
CREATE INDEX IF NOT EXISTS idx_chunks_content_fts
    ON document_chunks USING GIN(to_tsvector('english', content));

-- Partial index: only un-embedded chunks (makes the resumable embedding pipeline O(1) lookup)
CREATE INDEX IF NOT EXISTS idx_chunks_not_embedded
    ON document_chunks(chunk_id) WHERE embedding IS NULL;

-- =============================================================================
-- HYBRID SEARCH FUNCTION — Combines BM25 keyword + Vector semantic with RRF
--
-- HOW IT WORKS:
--   1. BM25 path: Full-text search ranks chunks by keyword relevance
--   2. Semantic path: pgvector ranks chunks by cosine similarity to query embedding
--   3. Reciprocal Rank Fusion (RRF): Merges both ranked lists into one final ranking
--      Formula: score = 1/(k + rank_bm25) + 1/(k + rank_semantic)
--      where k=60 is a smoothing constant (standard in IR literature)
-- =============================================================================
CREATE OR REPLACE FUNCTION hybrid_search(
    query_text TEXT,
    query_embedding vector(768),
    company_filter VARCHAR DEFAULT NULL,
    chunk_type_filter VARCHAR DEFAULT NULL,
    rrf_k INTEGER DEFAULT 60,
    max_results INTEGER DEFAULT 20
)
RETURNS TABLE (
    chunk_id INTEGER,
    nse_code VARCHAR,
    page_number INTEGER,
    chunk_type VARCHAR,
    content TEXT,
    citation_ref VARCHAR,
    bm25_rank INTEGER,
    semantic_rank INTEGER,
    rrf_score FLOAT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    WITH
    -- Path 1: BM25 keyword search
    bm25_results AS (
        SELECT
            dc.chunk_id AS cid,
            ROW_NUMBER() OVER (
                ORDER BY ts_rank_cd(
                    to_tsvector('english', dc.content),
                    plainto_tsquery('english', query_text),
                    32
                ) DESC
            )::INTEGER AS rank
        FROM document_chunks dc
        WHERE to_tsvector('english', dc.content) @@ plainto_tsquery('english', query_text)
            AND (company_filter IS NULL OR dc.nse_code = company_filter)
            AND (chunk_type_filter IS NULL OR dc.chunk_type = chunk_type_filter)
        LIMIT 50
    ),
    -- Path 2: Semantic vector search
    semantic_results AS (
        SELECT
            dc.chunk_id AS cid,
            1 - (dc.embedding <=> query_embedding) AS cosine_sim,
            ROW_NUMBER() OVER (
                ORDER BY dc.embedding <=> query_embedding ASC
            )::INTEGER AS rank
        FROM document_chunks dc
        WHERE dc.embedding IS NOT NULL
            AND (company_filter IS NULL OR dc.nse_code = company_filter)
            AND (chunk_type_filter IS NULL OR dc.chunk_type = chunk_type_filter)
        ORDER BY dc.embedding <=> query_embedding ASC
        LIMIT 50
    ),
    -- Reciprocal Rank Fusion
    fused AS (
        SELECT
            COALESCE(b.cid, s.cid) AS fused_chunk_id,
            COALESCE(b.rank, 999) AS bm25_r,
            COALESCE(s.rank, 999) AS semantic_r,
            COALESCE(s.cosine_sim, 0) AS sim,
            (1.0 / (rrf_k + COALESCE(b.rank, 999))) +
            (1.0 / (rrf_k + COALESCE(s.rank, 999))) AS rrf
        FROM bm25_results b
        FULL OUTER JOIN semantic_results s ON b.cid = s.cid
    )
    SELECT
        f.fused_chunk_id,
        dc.nse_code,
        dc.page_number,
        dc.chunk_type,
        dc.content,
        dc.citation_ref,
        f.bm25_r,
        f.semantic_r,
        f.rrf,
        f.sim
    FROM fused f
    JOIN document_chunks dc ON dc.chunk_id = f.fused_chunk_id
    ORDER BY f.rrf DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SEMANTIC-ONLY SEARCH — For queries without strong keywords
-- =============================================================================
CREATE OR REPLACE FUNCTION semantic_search(
    query_embedding vector(768),
    company_filter VARCHAR DEFAULT NULL,
    chunk_type_filter VARCHAR DEFAULT NULL,
    max_results INTEGER DEFAULT 20
)
RETURNS TABLE (
    chunk_id INTEGER,
    nse_code VARCHAR,
    page_number INTEGER,
    chunk_type VARCHAR,
    content TEXT,
    citation_ref VARCHAR,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.chunk_id,
        dc.nse_code,
        dc.page_number,
        dc.chunk_type,
        dc.content,
        dc.citation_ref,
        (1 - (dc.embedding <=> query_embedding))::FLOAT AS similarity
    FROM document_chunks dc
    WHERE dc.embedding IS NOT NULL
        AND (company_filter IS NULL OR dc.nse_code = company_filter)
        AND (chunk_type_filter IS NULL OR dc.chunk_type = chunk_type_filter)
    ORDER BY dc.embedding <=> query_embedding ASC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- VIEW: Chunk statistics per company
-- =============================================================================
CREATE OR REPLACE VIEW v_chunk_stats AS
SELECT
    nse_code,
    COUNT(*) AS total_chunks,
    COUNT(*) FILTER (WHERE chunk_type = 'text') AS text_chunks,
    COUNT(*) FILTER (WHERE chunk_type = 'table') AS table_chunks,
    COUNT(*) FILTER (WHERE chunk_type = 'chart') AS chart_chunks,
    ROUND(AVG(token_count)) AS avg_tokens,
    MIN(token_count) AS min_tokens,
    MAX(token_count) AS max_tokens,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS embedded_count,
    COUNT(*) FILTER (WHERE embedding IS NULL) AS pending_embedding
FROM document_chunks
GROUP BY nse_code;
