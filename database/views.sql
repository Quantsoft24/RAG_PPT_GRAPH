-- Create views and search function (run AFTER tables exist)

CREATE OR REPLACE VIEW v_blocks_with_context AS
SELECT 
    cb.id AS block_id, c.ticker, c.name AS company_name,
    d.document_type, d.source_filename, p.page_number,
    cb.block_type, cb.block_index, cb.content, cb.confidence,
    cb.crop_image_path, cb.citation_ref, d.pdf_storage_path
FROM content_blocks cb
JOIN pages p ON cb.page_id = p.id
JOIN documents d ON p.document_id = d.id
JOIN companies c ON d.company_id = c.id;

CREATE OR REPLACE VIEW v_document_stats AS
SELECT 
    c.ticker, c.name AS company_name,
    d.total_pages, d.pages_processed, d.charts_found,
    d.total_time_sec, d.extracted_at,
    COUNT(DISTINCT p.id) AS pages_in_db,
    COUNT(DISTINCT cb.id) AS total_blocks,
    COUNT(DISTINCT cb.id) FILTER (WHERE cb.block_type = 'text') AS text_blocks,
    COUNT(DISTINCT cb.id) FILTER (WHERE cb.block_type = 'table') AS table_blocks,
    COUNT(DISTINCT cb.id) FILTER (WHERE cb.block_type = 'chart') AS chart_blocks
FROM companies c
JOIN documents d ON d.company_id = c.id
JOIN pages p ON p.document_id = d.id
LEFT JOIN content_blocks cb ON cb.page_id = p.id
GROUP BY c.ticker, c.name, d.total_pages, d.pages_processed, d.charts_found, d.total_time_sec, d.extracted_at;

CREATE OR REPLACE VIEW v_all_tables AS
SELECT 
    c.ticker, c.name AS company_name, p.page_number,
    cb.content AS table_html, cb.confidence, cb.citation_ref,
    cb.crop_image_path, d.pdf_storage_path
FROM content_blocks cb
JOIN pages p ON cb.page_id = p.id
JOIN documents d ON p.document_id = d.id
JOIN companies c ON d.company_id = c.id
WHERE cb.block_type = 'table';

CREATE OR REPLACE VIEW v_all_charts AS
SELECT 
    c.ticker, c.name AS company_name, p.page_number,
    cb.content AS chart_description, cb.confidence, cb.citation_ref,
    cb.crop_image_path, d.pdf_storage_path
FROM content_blocks cb
JOIN pages p ON cb.page_id = p.id
JOIN documents d ON p.document_id = d.id
JOIN companies c ON d.company_id = c.id
WHERE cb.block_type = 'chart';

CREATE OR REPLACE FUNCTION search_content(
    search_query TEXT,
    company_ticker VARCHAR DEFAULT NULL,
    content_type VARCHAR DEFAULT NULL,
    max_results INTEGER DEFAULT 20
)
RETURNS TABLE (
    ticker VARCHAR,
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
        c.ticker, c.name, p.page_number,
        cb.block_type, cb.content, cb.citation_ref,
        ts_rank(to_tsvector('english', cb.content), plainto_tsquery('english', search_query))::FLOAT AS relevance
    FROM content_blocks cb
    JOIN pages p ON cb.page_id = p.id
    JOIN documents d ON p.document_id = d.id
    JOIN companies c ON d.company_id = c.id
    WHERE to_tsvector('english', cb.content) @@ plainto_tsquery('english', search_query)
        AND (company_ticker IS NULL OR c.ticker = company_ticker)
        AND (content_type IS NULL OR cb.block_type = content_type)
    ORDER BY relevance DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;
