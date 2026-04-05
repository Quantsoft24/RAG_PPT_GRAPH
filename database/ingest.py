"""
PRISM Analyst — Data Ingestion Pipeline
========================================
Reads extraction.json for all companies and loads EVERYTHING into PostgreSQL.
Generates citation references for every content block.

Usage:
    python database/ingest.py

AWS-ready: Change env vars to point to RDS when deploying.
"""

import json
import os
import sys
import time
from datetime import datetime

import psycopg2

# Add parent dir to path so we can import config
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DB_CONFIG, DATA_BASE_PATH, COMPANY_MAP


def get_connection():
    """Get PostgreSQL connection with retry logic."""
    max_retries = 5
    for attempt in range(max_retries):
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            conn.autocommit = False
            return conn
        except psycopg2.OperationalError as e:
            if attempt < max_retries - 1:
                wait = 2 ** attempt
                print(f"  ⏳ DB not ready, retrying in {wait}s... (attempt {attempt + 1}/{max_retries})")
                time.sleep(wait)
            else:
                raise e


def load_extraction_json(company_folder, results_folder):
    """Load and parse extraction.json for a company."""
    json_path = os.path.join(DATA_BASE_PATH, company_folder, results_folder, "extraction.json")
    
    if not os.path.exists(json_path):
        print(f"  ❌ File not found: {json_path}")
        return None
    
    file_size = os.path.getsize(json_path)
    print(f"  📄 Loading {json_path}")
    print(f"     Size: {file_size / 1024 / 1024:.1f} MB")
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    return data, file_size


def generate_citation_ref(nse_code, page_number, block_type, block_index):
    """Generate citation reference string.
    
    Format: NSECODE:AR:P{page}:{type}:{index}
    Example: MAHINDRA:AR:P7:chart:0
    """
    return f"{nse_code}:AR:P{page_number}:{block_type}:{block_index}"


def resolve_crop_path(crop_path, company_folder, results_folder):
    """Convert extraction crop_path to a relative path for storage."""
    if not crop_path:
        return None
    # The crop_path in JSON looks like: "results/75e47c82b981/charts/page_0007_chart_1.png"
    # We want: "companies_annual_report_and_results/<company_folder>/<results_folder>/charts/..."
    # Strip the "results/<hash>/" prefix and reconstruct
    parts = crop_path.split("/")
    if len(parts) >= 3 and parts[0] == "results":
        # Skip "results/<hash>/" prefix, keep "charts/page_XXXX_xxx.png"
        relative_part = "/".join(parts[2:])
    else:
        relative_part = crop_path
    
    return os.path.join(
        "companies_annual_report_and_results", company_folder, results_folder, relative_part
    ).replace("\\", "/")


def ingest_company(conn, company_folder, company_info):
    """Ingest ALL data for a single company."""
    
    ticker = company_info["ticker"]
    print(f"\n{'='*60}")
    print(f"🏢 Processing: {company_info['name']} ({ticker})")
    print(f"{'='*60}")
    
    cur = conn.cursor()
    
    # ------------------------------------------------------------------
    # 1. Insert company
    # ------------------------------------------------------------------
    cur.execute("""
        INSERT INTO master_companies (company_name, nse_code, sector, isin)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (nse_code) DO UPDATE SET company_name = EXCLUDED.company_name, updated_at = CURRENT_TIMESTAMP
        RETURNING company_id
    """, (company_info["name"], ticker, company_info["sector"], company_info.get("isin", "UNKNOWN")))
    company_id = cur.fetchone()[0]
    print(f"  ✅ Company ID: {company_id}")
    
    # ------------------------------------------------------------------
    # 2. Load extraction.json
    # ------------------------------------------------------------------
    result = load_extraction_json(company_folder, company_info["results_folder"])
    if result is None:
        return
    data, file_size = result
    
    # ------------------------------------------------------------------
    # 3. Insert document metadata
    # ------------------------------------------------------------------
    pdf_relative = os.path.join(
        "companies_annual_report_and_results", company_folder, company_info["pdf_file"]
    ).replace("\\", "/")
    
    extracted_at = None
    if data.get("extracted_at"):
        try:
            extracted_at = datetime.fromisoformat(data["extracted_at"])
        except (ValueError, TypeError):
            extracted_at = None
    
    cur.execute("""
        INSERT INTO documents (
            company_id, document_type, source_filename, pdf_storage_path, frequency, timestamp,
            total_pages, pages_processed, charts_found,
            total_time_sec, avg_sec_per_page, extracted_at, file_size_bytes
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING document_id
    """, (
        company_id, "annual_report",
        data.get("source", company_info["pdf_file"]),
        pdf_relative,
        "Annually", extracted_at,
        data.get("total_pages", 0),
        data.get("pages_processed", 0),
        data.get("charts_found", 0),
        data.get("total_time_sec"),
        data.get("avg_sec_per_page"),
        extracted_at, file_size
    ))
    document_id = cur.fetchone()[0]
    print(f"  ✅ Document ID: {document_id} | {data.get('total_pages', 0)} pages | {data.get('charts_found', 0)} charts")
    
    # ------------------------------------------------------------------
    # 4. Process EVERY page — insert page, then its blocks, charts, tables
    # ------------------------------------------------------------------
    pages = data.get("pages", [])
    counters = {"pages": 0, "blocks": 0, "text": 0, "table": 0, "chart": 0, "page_charts": 0, "page_tables": 0}
    results_folder = company_info["results_folder"]
    
    for page_data in pages:
        page_number = page_data.get("page", 0)
        page_size = page_data.get("page_size", [0, 0])
        page_width = page_size[0] if len(page_size) > 0 else 0
        page_height = page_size[1] if len(page_size) > 1 else 0
        
        # Insert page
        cur.execute("""
            INSERT INTO pages (document_id, page_number, page_width, page_height, ocr_text, has_chart, has_table)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING page_id
        """, (
            document_id, page_number, page_width, page_height,
            page_data.get("ocr_text", ""),
            page_data.get("has_chart", False),
            page_data.get("has_table", False)
        ))
        page_id = cur.fetchone()[0]
        counters["pages"] += 1
        
        # ---- Content Blocks ----
        for block in page_data.get("blocks", []):
            block_type = block.get("type", "text")
            block_index = block.get("index", 0)
            
            bbox = block.get("bbox")
            bbox_x1 = bbox_y1 = bbox_x2 = bbox_y2 = None
            if bbox and isinstance(bbox, list) and len(bbox) == 4:
                bbox_x1, bbox_y1, bbox_x2, bbox_y2 = bbox
            
            citation_ref = generate_citation_ref(ticker, page_number, block_type, block_index)
            crop_path = resolve_crop_path(block.get("crop_path"), company_folder, results_folder)
            
            cur.execute("""
                INSERT INTO content_blocks (
                    page_id, block_type, block_index, label, content,
                    bbox_x1, bbox_y1, bbox_x2, bbox_y2,
                    confidence, crop_image_path, citation_ref
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                page_id, block_type, block_index,
                block.get("label", block_type),
                block.get("content", ""),
                bbox_x1, bbox_y1, bbox_x2, bbox_y2,
                block.get("conf"),
                crop_path,
                citation_ref
            ))
            counters["blocks"] += 1
            counters[block_type] = counters.get(block_type, 0) + 1
        
        # ---- Page-Level Charts (from 'charts' array) ----
        for idx, chart in enumerate(page_data.get("charts", [])):
            bbox = chart.get("bbox", [])
            crop_path = resolve_crop_path(chart.get("crop_path"), company_folder, results_folder)
            
            cur.execute("""
                INSERT INTO page_charts (page_id, chart_index, bbox_x1, bbox_y1, bbox_x2, bbox_y2, confidence, crop_path, description)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                page_id, idx,
                bbox[0] if len(bbox) > 0 else None,
                bbox[1] if len(bbox) > 1 else None,
                bbox[2] if len(bbox) > 2 else None,
                bbox[3] if len(bbox) > 3 else None,
                chart.get("conf"),
                crop_path,
                chart.get("description", "")
            ))
            counters["page_charts"] += 1
        
        # ---- Page-Level Tables (from 'tables' array) ----
        for idx, table in enumerate(page_data.get("tables", [])):
            bbox = table.get("bbox", [])
            crop_path = resolve_crop_path(table.get("crop_path"), company_folder, results_folder)
            
            cur.execute("""
                INSERT INTO page_tables (page_id, table_index, bbox_x1, bbox_y1, bbox_x2, bbox_y2, confidence, crop_path, html_content)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                page_id, idx,
                bbox[0] if len(bbox) > 0 else None,
                bbox[1] if len(bbox) > 1 else None,
                bbox[2] if len(bbox) > 2 else None,
                bbox[3] if len(bbox) > 3 else None,
                table.get("conf"),
                crop_path,
                table.get("markdown", table.get("html_content", ""))
            ))
            counters["page_tables"] += 1
        
        # Progress indicator every 50 pages
        if counters["pages"] % 50 == 0:
            print(f"     ... processed {counters['pages']}/{len(pages)} pages")
    
    conn.commit()
    
    print(f"  ✅ Pages:          {counters['pages']}")
    print(f"  ✅ Content Blocks: {counters['blocks']} (text:{counters['text']}, table:{counters['table']}, chart:{counters['chart']})")
    print(f"  ✅ Chart Records:  {counters['page_charts']}")
    print(f"  ✅ Table Records:  {counters['page_tables']}")
    print(f"  🎉 {ticker} complete!")


def print_summary(conn):
    """Print final summary of all ingested data."""
    cur = conn.cursor()
    
    print(f"\n{'='*60}")
    print(f"📊 FINAL INGESTION SUMMARY")
    print(f"{'='*60}")
    
    # Overall counts
    tables_to_count = [
        ("master_companies", "Companies"),
        ("documents", "Documents"),
        ("pages", "Pages"),
        ("content_blocks", "Content Blocks"),
        ("page_charts", "Chart Records"),
        ("page_tables", "Table Records"),
    ]
    
    total_rows = 0
    for table_name, display_name in tables_to_count:
        cur.execute(f"SELECT COUNT(*) FROM {table_name}")
        count = cur.fetchone()[0]
        total_rows += count
        print(f"  {display_name:.<30} {count:>8,}")
    
    print(f"  {'TOTAL ROWS':.<30} {total_rows:>8,}")
    
    # Per-company breakdown
    print(f"\n{'─'*60}")
    print(f"📋 Per-Company Breakdown:")
    print(f"{'─'*60}")
    
    cur.execute("""
        SELECT 
            c.nse_code,
            c.company_name,
            d.total_pages,
            COUNT(DISTINCT p.page_id) AS pages_stored,
            COUNT(DISTINCT cb.block_id) AS blocks_stored,
            COUNT(DISTINCT cb.block_id) FILTER (WHERE cb.block_type = 'text') AS text_blocks,
            COUNT(DISTINCT cb.block_id) FILTER (WHERE cb.block_type = 'table') AS table_blocks,
            COUNT(DISTINCT cb.block_id) FILTER (WHERE cb.block_type = 'chart') AS chart_blocks
        FROM master_companies c
        JOIN documents d ON d.company_id = c.company_id
        JOIN pages p ON p.document_id = d.document_id
        LEFT JOIN content_blocks cb ON cb.page_id = p.page_id
        GROUP BY c.nse_code, c.company_name, d.total_pages
        ORDER BY c.nse_code
    """)
    
    for row in cur.fetchall():
        nse_code, name, total_pages, pages_stored, blocks, texts, tables, charts = row
        print(f"\n  🏢 {name} ({nse_code})")
        print(f"     Pages: {pages_stored}/{total_pages} | Total Blocks: {blocks}")
        print(f"     📝 Text: {texts} | 📊 Tables: {tables} | 📈 Charts: {charts}")
    
    # Sample citation references
    print(f"\n{'─'*60}")
    print(f"🔗 Sample Citation References:")
    print(f"{'─'*60}")
    
    cur.execute("""
        SELECT citation_ref, block_type, LEFT(content, 80) AS preview
        FROM content_blocks
        ORDER BY RANDOM()
        LIMIT 5
    """)
    
    for row in cur.fetchall():
        citation, btype, preview = row
        preview_clean = (preview or "").replace('\n', ' ')[:75]
        print(f"  [{citation}] ({btype}) {preview_clean}...")
    
    # Test search function
    print(f"\n{'─'*60}")
    print(f"🔍 Test Search: 'revenue growth'")
    print(f"{'─'*60}")
    
    cur.execute("SELECT * FROM search_content('revenue growth', NULL, NULL, 3)")
    results = cur.fetchall()
    if results:
        for r in results:
            ticker, name, page, btype, content, citation, relevance = r
            content_preview = (content or "").replace('\n', ' ')[:100]
            print(f"  [{citation}] (relevance: {relevance:.4f})")
            print(f"    {content_preview}...")
    else:
        print("  No results found (search index may need text with these terms)")


def main():
    """Main ingestion pipeline."""
    start_time = time.time()
    
    print(f"╔{'═'*58}╗")
    print(f"║  PRISM ANALYST — Data Ingestion Pipeline                 ║")
    print(f"║  Loading ALL extraction data into PostgreSQL              ║")
    print(f"╚{'═'*58}╝")
    print(f"\n📁 Data path: {DATA_BASE_PATH}")
    print(f"🗄️  Database: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}")
    
    # Connect to database
    print(f"\n🔌 Connecting to PostgreSQL...")
    conn = get_connection()
    print(f"  ✅ Connected!")
    
    try:
        # Process each company
        for folder_name, company_info in COMPANY_MAP.items():
            company_path = os.path.join(DATA_BASE_PATH, folder_name)
            if not os.path.exists(company_path):
                print(f"\n⚠️  Skipping {folder_name} — folder not found")
                continue
            
            ingest_company(conn, folder_name, company_info)
        
        # Print summary
        print_summary(conn)
        
    except Exception as e:
        conn.rollback()
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        conn.close()
    
    elapsed = time.time() - start_time
    print(f"\n⏱️  Total ingestion time: {elapsed:.1f} seconds")
    print(f"\n✅ ALL DONE!")
    print(f"   → Open pgAdmin at http://localhost:5050 to explore the data")
    print(f"   → Login: admin@prism.local / admin123")


if __name__ == "__main__":
    main()
