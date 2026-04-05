-- =============================================================================
-- PRISM ANALYST — Financial Metrics Extraction Schema (Phase 8)
-- Stores structured financial data parsed from HTML tables in content_blocks
-- Updated for Phase 5/6 schema: nse_code, document_id
-- =============================================================================

CREATE TABLE IF NOT EXISTS financial_metrics (
    id                  SERIAL PRIMARY KEY,
    nse_code            VARCHAR(50) NOT NULL,
    document_id         INTEGER NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    
    -- Metric identification
    metric_name         VARCHAR(255) NOT NULL,       -- e.g. "Revenue from Operations", "Net Profit"
    metric_category     VARCHAR(100),                -- e.g. "Income Statement", "Balance Sheet", "Ratios"
    
    -- Values
    value               NUMERIC,                     -- Normalized numeric value
    raw_value           VARCHAR(255) NOT NULL,        -- Original text (e.g. "1,23,456.78")
    unit                VARCHAR(50),                  -- "₹ Crores", "₹ Lakhs", "%", "x"
    period              VARCHAR(100),                 -- "FY 2023-24", "Q3 FY2024"
    year                INTEGER,                      -- Extracted year (e.g. 2024)
    
    -- Source traceability
    page_number         INTEGER NOT NULL,
    citation_ref        VARCHAR(150) NOT NULL,
    
    -- Timestamps
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_fin_nse_code ON financial_metrics(nse_code);
CREATE INDEX IF NOT EXISTS idx_fin_metric ON financial_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_fin_category ON financial_metrics(metric_category) WHERE metric_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_year ON financial_metrics(year) WHERE year IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_nse_metric ON financial_metrics(nse_code, metric_name);
CREATE INDEX IF NOT EXISTS idx_fin_citation ON financial_metrics(citation_ref);

-- View: Financial summary per company
CREATE OR REPLACE VIEW v_financial_summary AS
SELECT 
    nse_code,
    metric_category,
    metric_name,
    period,
    value,
    raw_value,
    unit,
    citation_ref,
    page_number
FROM financial_metrics
ORDER BY nse_code, metric_category, metric_name, year DESC;

-- View: Key metrics comparison across companies
CREATE OR REPLACE VIEW v_key_metrics AS
SELECT 
    nse_code,
    metric_name,
    value,
    unit,
    period,
    citation_ref
FROM financial_metrics
WHERE metric_name IN (
    'Revenue from Operations', 'Revenue', 'Total Income', 'Total Revenue',
    'Net Profit', 'Profit After Tax', 'PAT', 'Net Income',
    'EBITDA', 'Operating Profit',
    'Total Assets', 'Net Worth', 'Total Equity',
    'Earnings Per Share', 'EPS', 'Basic EPS',
    'Return on Equity', 'ROE', 'Return on Assets', 'ROA',
    'Dividend Per Share', 'Book Value Per Share'
)
ORDER BY metric_name, nse_code, year DESC;
