-- =============================================================================
-- PRISM ANALYST — Database Schema
-- Stores ALL extracted data from annual report PDFs
-- Designed for: PostgreSQL 17 + pgvector (AWS RDS compatible)
-- =============================================================================

-- Enable pgvector extension (for future embedding storage)
CREATE EXTENSION IF NOT EXISTS vector;

-- Enums
CREATE TYPE document_frequency AS ENUM ('Quarterly', 'Monthly', 'Annually', 'Custom');

-- =============================================================================
-- 1. MASTER_COMPANIES — Master company registry
-- =============================================================================
CREATE TABLE master_companies (
    company_id      SERIAL PRIMARY KEY,
    company_name    VARCHAR(255) NOT NULL,
    nse_code        VARCHAR(50) NOT NULL UNIQUE,
    sector          VARCHAR(100),
    isin            VARCHAR(20),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_master_companies_nse_code ON master_companies(nse_code);

-- =============================================================================
-- 2. DOCUMENTS — One row per annual report PDF
-- =============================================================================
CREATE TABLE documents (
    document_id         SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES master_companies(company_id) ON DELETE CASCADE,
    document_type       VARCHAR(50) DEFAULT 'annual_report',
    source_filename     VARCHAR(255) NOT NULL,
    pdf_storage_path    VARCHAR(500),           -- local path now, S3 URL later
    frequency           document_frequency DEFAULT 'Annually',
    timestamp           TIMESTAMP,               -- Published date
    total_pages         INTEGER NOT NULL,
    pages_processed     INTEGER NOT NULL,
    charts_found        INTEGER DEFAULT 0,
    total_time_sec      FLOAT,
    avg_sec_per_page    FLOAT,
    extracted_at        TIMESTAMP,
    file_size_bytes     BIGINT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_company ON documents(company_id);
CREATE INDEX idx_documents_type ON documents(document_type);

-- =============================================================================
-- 3. PAGES — One row per page of each document
-- =============================================================================
CREATE TABLE pages (
    page_id         SERIAL PRIMARY KEY,
    document_id     INTEGER NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    page_number     INTEGER NOT NULL,
    page_width      INTEGER,
    page_height     INTEGER,
    ocr_text        TEXT,                       -- Full OCR text (markdown formatted)
    has_chart       BOOLEAN DEFAULT FALSE,
    has_table       BOOLEAN DEFAULT FALSE,
    
    UNIQUE(document_id, page_number)
);

CREATE INDEX idx_pages_document ON pages(document_id);
CREATE INDEX idx_pages_has_chart ON pages(has_chart) WHERE has_chart = TRUE;
CREATE INDEX idx_pages_has_table ON pages(has_table) WHERE has_table = TRUE;

-- Full-text search index on OCR text
CREATE INDEX idx_pages_ocr_text_search ON pages USING GIN(to_tsvector('english', ocr_text));

-- =============================================================================
-- 4. CONTENT_BLOCKS — Every text/table/chart element extracted from pages
-- =============================================================================
CREATE TABLE content_blocks (
    block_id        SERIAL PRIMARY KEY,
    page_id         INTEGER NOT NULL REFERENCES pages(page_id) ON DELETE CASCADE,
    block_type      VARCHAR(20) NOT NULL CHECK (block_type IN ('text', 'table', 'chart')),
    block_index     INTEGER NOT NULL,           -- sequence within the page
    label           VARCHAR(50),                -- original label from extraction
    content         TEXT,                       -- markdown (text), HTML (table), description (chart)
    bbox_x1         INTEGER,                    -- bounding box coordinates (nullable for text)
    bbox_y1         INTEGER,
    bbox_x2         INTEGER,
    bbox_y2         INTEGER,
    confidence      FLOAT,                      -- detection confidence 0-1
    crop_image_path VARCHAR(500),               -- path to cropped PNG image
    citation_ref    VARCHAR(100) NOT NULL       -- e.g., MAHINDRA:AR:P7:chart:0
    
    -- No UNIQUE constraint: block_index values repeat across block types on same page
);

CREATE INDEX idx_blocks_page ON content_blocks(page_id);
CREATE INDEX idx_blocks_type ON content_blocks(block_type);
CREATE INDEX idx_blocks_citation ON content_blocks(citation_ref);

-- Full-text search index on block content
CREATE INDEX idx_blocks_content_search ON content_blocks USING GIN(to_tsvector('english', content));

-- =============================================================================
-- 5. PAGE_CHARTS — Chart-level metadata from the 'charts' array
-- =============================================================================
CREATE TABLE page_charts (
    page_chart_id   SERIAL PRIMARY KEY,
    page_id         INTEGER NOT NULL REFERENCES pages(page_id) ON DELETE CASCADE,
    chart_index     INTEGER NOT NULL DEFAULT 0,
    bbox_x1         INTEGER,
    bbox_y1         INTEGER,
    bbox_x2         INTEGER,
    bbox_y2         INTEGER,
    confidence      FLOAT,
    crop_path       VARCHAR(500),
    description     TEXT
);

CREATE INDEX idx_page_charts_page ON page_charts(page_id);

-- =============================================================================
-- 6. PAGE_TABLES — Table-level metadata from the 'tables' array
-- =============================================================================
CREATE TABLE page_tables (
    page_table_id   SERIAL PRIMARY KEY,
    page_id         INTEGER NOT NULL REFERENCES pages(page_id) ON DELETE CASCADE,
    table_index     INTEGER NOT NULL DEFAULT 0,
    bbox_x1         INTEGER,
    bbox_y1         INTEGER,
    bbox_x2         INTEGER,
    bbox_y2         INTEGER,
    confidence      FLOAT,
    crop_path       VARCHAR(500),
    html_content    TEXT                        -- full HTML table markup
);

CREATE INDEX idx_page_tables_page ON page_tables(page_id);

-- =============================================================================
-- 7. USEFUL VIEWS — Pre-built queries for the AI agent
-- =============================================================================

-- =============================================================================
-- 7. USEFUL VIEWS — Pre-built queries for the AI agent
-- =============================================================================

-- View: Complete block info with company and document context
CREATE VIEW v_blocks_with_context AS
SELECT 
    cb.block_id,
    c.nse_code,
    c.company_name,
    d.document_type,
    d.source_filename,
    p.page_number,
    cb.block_type,
    cb.block_index,
    cb.content,
    cb.confidence,
    cb.crop_image_path,
    cb.citation_ref,
    d.pdf_storage_path
FROM content_blocks cb
JOIN pages p ON cb.page_id = p.page_id
JOIN documents d ON p.document_id = d.document_id
JOIN master_companies c ON d.company_id = c.company_id;

-- View: Document statistics summary
CREATE VIEW v_document_stats AS
SELECT 
    c.nse_code,
    c.company_name,
    d.total_pages,
    d.pages_processed,
    d.charts_found,
    d.total_time_sec,
    d.extracted_at,
    COUNT(DISTINCT p.page_id) AS pages_in_db,
    COUNT(DISTINCT cb.block_id) AS total_blocks,
    COUNT(DISTINCT cb.block_id) FILTER (WHERE cb.block_type = 'text') AS text_blocks,
    COUNT(DISTINCT cb.block_id) FILTER (WHERE cb.block_type = 'table') AS table_blocks,
    COUNT(DISTINCT cb.block_id) FILTER (WHERE cb.block_type = 'chart') AS chart_blocks
FROM master_companies c
JOIN documents d ON d.company_id = c.company_id
JOIN pages p ON p.document_id = d.document_id
LEFT JOIN content_blocks cb ON cb.page_id = p.page_id
GROUP BY c.nse_code, c.company_name, d.total_pages, d.pages_processed, d.charts_found, d.total_time_sec, d.extracted_at;

-- View: All tables with company context (commonly queried by AI agent)
CREATE VIEW v_all_tables AS
SELECT 
    c.nse_code,
    c.company_name,
    p.page_number,
    cb.content AS table_html,
    cb.confidence,
    cb.citation_ref,
    cb.crop_image_path,
    d.pdf_storage_path
FROM content_blocks cb
JOIN pages p ON cb.page_id = p.page_id
JOIN documents d ON p.document_id = d.document_id
JOIN master_companies c ON d.company_id = c.company_id
WHERE cb.block_type = 'table';

-- View: All charts with company context
CREATE VIEW v_all_charts AS
SELECT 
    c.nse_code,
    c.company_name,
    p.page_number,
    cb.content AS chart_description,
    cb.confidence,
    cb.citation_ref,
    cb.crop_image_path,
    d.pdf_storage_path
FROM content_blocks cb
JOIN pages p ON cb.page_id = p.page_id
JOIN documents d ON p.document_id = d.document_id
JOIN master_companies c ON d.company_id = c.company_id
WHERE cb.block_type = 'chart';

-- =============================================================================
-- 8. FULL-TEXT SEARCH FUNCTION — For the AI agent to search content
-- =============================================================================
CREATE OR REPLACE FUNCTION search_content(
    search_query TEXT,
    company_nse_code VARCHAR DEFAULT NULL,
    content_type VARCHAR DEFAULT NULL,
    max_results INTEGER DEFAULT 20
)
RETURNS TABLE (
    nse_code VARCHAR,
    company_name VARCHAR,
    page_number INTEGER,
    block_type VARCHAR,
    content TEXT,
    citation_ref VARCHAR,
    relevance FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.nse_code,
        c.company_name,
        p.page_number,
        cb.block_type,
        cb.content,
        cb.citation_ref,
        ts_rank(to_tsvector('english', cb.content), plainto_tsquery('english', search_query))::FLOAT AS relevance
    FROM content_blocks cb
    JOIN pages p ON cb.page_id = p.page_id
    JOIN documents d ON p.document_id = d.document_id
    JOIN master_companies c ON d.company_id = c.company_id
    WHERE to_tsvector('english', cb.content) @@ plainto_tsquery('english', search_query)
        AND (company_nse_code IS NULL OR c.nse_code = company_nse_code)
        AND (content_type IS NULL OR cb.block_type = content_type)
    ORDER BY relevance DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;
