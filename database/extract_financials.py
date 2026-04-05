"""
PRISM Analyst — Financial Data Extraction
=============================================
Parses HTML tables from content_blocks/page_tables into structured financial metrics.

Strategy:
1. Read all table-type content_blocks
2. Parse HTML tables → extract rows/columns
3. Identify financial metric rows (Revenue, Profit, etc.)
4. Normalize values (remove commas, handle Indian numbering)
5. Store in financial_metrics table with citation refs

Usage:
    python database/extract_financials.py
"""

import os
import re
import sys
import time
from html.parser import HTMLParser
from typing import List, Optional, Tuple

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DB_CONFIG, COMPANY_MAP


# =============================================================================
# HTML TABLE PARSER
# =============================================================================

class TableParser(HTMLParser):
    """Parse HTML table into rows and cells."""

    def __init__(self):
        super().__init__()
        self.rows: List[List[str]] = []
        self._current_row: List[str] = []
        self._current_cell: str = ""
        self._in_cell = False
        self._in_row = False

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._in_row = True
            self._current_row = []
        elif tag in ("td", "th"):
            self._in_cell = True
            self._current_cell = ""

    def handle_endtag(self, tag):
        if tag in ("td", "th"):
            self._in_cell = False
            self._current_row.append(self._current_cell.strip())
        elif tag == "tr":
            self._in_row = False
            if self._current_row:
                self.rows.append(self._current_row)

    def handle_data(self, data):
        if self._in_cell:
            self._current_cell += data


def parse_html_table(html: str) -> List[List[str]]:
    """Parse HTML table into list of rows."""
    parser = TableParser()
    try:
        parser.feed(html)
    except Exception:
        pass
    return parser.rows


# =============================================================================
# VALUE PARSING — Indian financial format
# =============================================================================

# Common financial metric patterns
METRIC_PATTERNS = {
    # Income Statement
    r"(?i)revenue\s*(?:from\s+)?operations?": ("Revenue from Operations", "Income Statement"),
    r"(?i)total\s+(?:income|revenue)": ("Total Income", "Income Statement"),
    r"(?i)other\s+income": ("Other Income", "Income Statement"),
    r"(?i)cost\s+of\s+(?:materials?|goods?\s+sold|revenue)": ("Cost of Materials", "Income Statement"),
    r"(?i)employee\s*(?:benefit)?\s*expense": ("Employee Expenses", "Income Statement"),
    r"(?i)depreciation\s+(?:and|&)\s+amortis?ation": ("Depreciation & Amortisation", "Income Statement"),
    r"(?i)finance\s+cost": ("Finance Costs", "Income Statement"),
    r"(?i)(?:profit|income)\s+before\s+(?:exceptional|tax)": ("Profit Before Tax", "Income Statement"),
    r"(?i)tax\s+expense": ("Tax Expense", "Income Statement"),
    r"(?i)(?:net\s+)?profit\s+(?:after\s+tax|for\s+the\s+(?:year|period))": ("Net Profit", "Income Statement"),
    r"(?i)(?:profit|loss)\s+for\s+the\s+(?:year|period)": ("Net Profit", "Income Statement"),
    r"(?i)(?:total\s+)?comprehensive\s+income": ("Total Comprehensive Income", "Income Statement"),
    r"(?i)ebitda": ("EBITDA", "Income Statement"),
    r"(?i)operating\s+profit": ("Operating Profit", "Income Statement"),

    # Balance Sheet
    r"(?i)total\s+assets?": ("Total Assets", "Balance Sheet"),
    r"(?i)total\s+(?:equity|net\s*worth)": ("Total Equity", "Balance Sheet"),
    r"(?i)(?:share|equity)\s+capital": ("Share Capital", "Balance Sheet"),
    r"(?i)reserves?\s+(?:and|&)\s+surplus": ("Reserves & Surplus", "Balance Sheet"),
    r"(?i)total\s+(?:non.?current|long.?term)\s+(?:liabilit|borrow)": ("Long-term Borrowings", "Balance Sheet"),
    r"(?i)total\s+(?:current)\s+(?:liabilit|borrow)": ("Current Liabilities", "Balance Sheet"),
    r"(?i)(?:total\s+)?(?:non.?current)\s+assets?": ("Non-Current Assets", "Balance Sheet"),
    r"(?i)(?:total\s+)?current\s+assets?": ("Current Assets", "Balance Sheet"),
    r"(?i)(?:goodwill)": ("Goodwill", "Balance Sheet"),
    r"(?i)inventori?e?s?$": ("Inventories", "Balance Sheet"),
    r"(?i)trade\s+receivable": ("Trade Receivables", "Balance Sheet"),
    r"(?i)cash\s+(?:and|&)\s+(?:cash\s+)?equivalents?": ("Cash & Cash Equivalents", "Balance Sheet"),

    # Cash Flow
    r"(?i)(?:net\s+)?cash\s+(?:from|generated|used)\s+(?:in\s+)?operat": ("Cash from Operations", "Cash Flow"),
    r"(?i)(?:net\s+)?cash\s+(?:from|used)\s+(?:in\s+)?invest": ("Cash from Investing", "Cash Flow"),
    r"(?i)(?:net\s+)?cash\s+(?:from|used)\s+(?:in\s+)?financ": ("Cash from Financing", "Cash Flow"),

    # Per Share
    r"(?i)(?:basic\s+)?(?:earnings?|eps)\s+per\s+share": ("Earnings Per Share", "Per Share"),
    r"(?i)(?:diluted\s+)?(?:earnings?|eps)\s+per\s+share": ("Diluted EPS", "Per Share"),
    r"(?i)dividend?\s+per\s+share": ("Dividend Per Share", "Per Share"),
    r"(?i)book\s+value\s+per\s+share": ("Book Value Per Share", "Per Share"),

    # Ratios
    r"(?i)return\s+on\s+equity": ("Return on Equity", "Ratios"),
    r"(?i)return\s+on\s+(?:capital\s+employed|assets?)": ("Return on Assets", "Ratios"),
    r"(?i)debt.?(?:to.?)?equity\s+ratio": ("Debt-to-Equity Ratio", "Ratios"),
    r"(?i)current\s+ratio": ("Current Ratio", "Ratios"),
    r"(?i)net\s+(?:profit|income)\s+margin": ("Net Profit Margin", "Ratios"),
    r"(?i)operating\s+(?:profit\s+)?margin": ("Operating Margin", "Ratios"),
}


def identify_metric(text: str) -> Optional[Tuple[str, str]]:
    """Try to match a row label to a known financial metric."""
    if not text:
        return None
    clean = text.strip()
    for pattern, (metric_name, category) in METRIC_PATTERNS.items():
        if re.search(pattern, clean):
            return (metric_name, category)
    return None


def parse_indian_number(text: str) -> Optional[float]:
    """
    Parse Indian-format financial numbers.
    Examples: "1,23,456.78" → 123456.78, "(5,432)" → -5432, "1,234 Cr" → 1234
    """
    if not text:
        return None

    clean = text.strip()

    # Remove currency symbols and unit suffixes
    clean = re.sub(r'[₹$€£]', '', clean)
    clean = re.sub(r'\s*(Cr(?:ore)?s?|Lakhs?|Mn|Bn|Million|Billion|Thousand)\s*', '', clean, flags=re.IGNORECASE)

    # Handle parentheses = negative
    negative = False
    if clean.startswith('(') and clean.endswith(')'):
        negative = True
        clean = clean[1:-1]

    # Handle minus
    if clean.startswith('-'):
        negative = True
        clean = clean[1:]

    # Remove commas
    clean = clean.replace(',', '')

    # Remove spaces
    clean = clean.strip()

    # Try to parse
    try:
        value = float(clean)
        return -value if negative else value
    except (ValueError, TypeError):
        return None


def detect_unit(text: str, header_row: List[str] = None) -> str:
    """Detect the unit from value text or table headers."""
    combined = text
    if header_row:
        combined = " ".join(header_row) + " " + text

    if re.search(r'(?i)crore', combined):
        return "₹ Crores"
    if re.search(r'(?i)lakh', combined):
        return "₹ Lakhs"
    if re.search(r'(?i)million|mn', combined):
        return "Millions"
    if re.search(r'(?i)billion|bn', combined):
        return "Billions"
    if re.search(r'%', text):
        return "%"
    if re.search(r'(?i)per\s+share', combined):
        return "Per Share"
    return "₹ Crores"  # Default for Indian companies


def detect_period(header_row: List[str], col_index: int) -> Optional[str]:
    """Try to extract period from the column header."""
    if not header_row or col_index >= len(header_row):
        return None

    text = header_row[col_index]

    # Look for fiscal year patterns
    fy_match = re.search(r'(?:FY\s*)?(\d{4})\s*[-–]\s*(\d{2,4})', text)
    if fy_match:
        year1 = fy_match.group(1)
        year2 = fy_match.group(2)
        if len(year2) == 2:
            year2 = year1[:2] + year2
        return f"FY {year1}-{year2[-2:]}"

    # Look for year only
    year_match = re.search(r'(20\d{2})', text)
    if year_match:
        return f"FY {year_match.group(1)}"

    # Look for quarter patterns
    q_match = re.search(r'Q([1-4])\s*(?:FY\s*)?(\d{4})', text, re.IGNORECASE)
    if q_match:
        return f"Q{q_match.group(1)} FY{q_match.group(2)}"

    return None


def extract_year(period: str) -> Optional[int]:
    """Extract numeric year from a period string."""
    if not period:
        return None
    match = re.search(r'(20\d{2})', period)
    if match:
        return int(match.group(1))
    return None


# =============================================================================
# MAIN EXTRACTION PIPELINE
# =============================================================================

def run_extraction():
    """Extract financial metrics from all HTML tables."""
    start_time = time.time()

    print(f"╔{'═'*58}╗")
    print(f"║  PRISM ANALYST — Financial Data Extraction                ║")
    print(f"║  Parsing HTML tables → structured metrics                 ║")
    print(f"╚{'═'*58}╝")

    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False
    cur = conn.cursor()

    # Clear existing metrics for fresh run
    cur.execute("SELECT COUNT(*) FROM financial_metrics")
    existing = cur.fetchone()[0]
    if existing > 0:
        print(f"\n⚠️  Found {existing} existing metrics. Clearing for fresh run...")
        cur.execute("DELETE FROM financial_metrics")
        conn.commit()

    total_metrics = 0
    tables_processed = 0
    tables_skipped = 0

    # Process each company
    cur.execute("""
        SELECT c.nse_code, c.company_name, d.document_id
        FROM master_companies c
        JOIN documents d ON d.company_id = c.company_id
        ORDER BY c.nse_code
    """)
    companies = cur.fetchall()

    for nse_code, name, doc_id in companies:
        print(f"\n{'='*60}")
        print(f"🏢 {name} ({nse_code})")
        print(f"{'='*60}")

        company_metrics = 0

        # Get all table-type content blocks
        cur.execute("""
            SELECT cb.block_id, cb.content, p.page_number, cb.citation_ref
            FROM content_blocks cb
            JOIN pages p ON p.page_id = cb.page_id
            WHERE p.document_id = %s AND cb.block_type = 'table'
            ORDER BY p.page_number, cb.block_index
        """, (doc_id,))
        tables = cur.fetchall()

        print(f"  📊 Found {len(tables)} HTML tables")

        for table_id, html_content, page_num, citation_ref in tables:
            if not html_content or "<t" not in html_content.lower():
                tables_skipped += 1
                continue

            # Parse HTML table
            rows = parse_html_table(html_content)
            if len(rows) < 2:
                tables_skipped += 1
                continue

            tables_processed += 1

            # Detect header row (first row or row with year patterns)
            header_row = rows[0] if rows else []

            # Detect unit from headers
            unit = detect_unit(html_content, header_row)

            # Process each data row
            for row in rows[1:]:
                if not row or len(row) < 2:
                    continue

                # First cell is usually the metric label
                label = row[0].strip()
                if not label:
                    continue

                # Try to identify as a known financial metric
                metric_info = identify_metric(label)
                if not metric_info:
                    continue

                metric_name, category = metric_info

                # Extract values from remaining columns
                for col_idx in range(1, len(row)):
                    raw_val = row[col_idx].strip()
                    if not raw_val or raw_val == '-' or raw_val == '—':
                        continue

                    numeric_val = parse_indian_number(raw_val)
                    period = detect_period(header_row, col_idx)
                    year = extract_year(period)

                    # Detect unit from value if needed
                    val_unit = unit
                    if '%' in raw_val:
                        val_unit = "%"

                    metric_citation = f"{citation_ref}:{metric_name.replace(' ', '_')}"

                    try:
                        cur.execute("""
                            INSERT INTO financial_metrics (
                                nse_code, document_id, metric_name, metric_category,
                                value, raw_value, unit, period, year,
                                page_number, citation_ref
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """, (
                            nse_code, doc_id, metric_name, category,
                            numeric_val, raw_val, val_unit, period, year,
                            page_num, metric_citation
                        ))
                        company_metrics += 1
                    except Exception as e:
                        print(f"  ⚠️  Insert error: {e}")
                        conn.rollback()

        conn.commit()
        total_metrics += company_metrics
        print(f"  ✅ {company_metrics} financial metrics extracted")

    # Print summary
    print(f"\n{'='*60}")
    print(f"📊 EXTRACTION SUMMARY")
    print(f"{'='*60}")
    print(f"  Tables processed: {tables_processed}")
    print(f"  Tables skipped:   {tables_skipped}")
    print(f"  Metrics extracted: {total_metrics}")

    # Show per-category breakdown
    cur.execute("""
        SELECT nse_code, metric_category, COUNT(*) AS count
        FROM financial_metrics
        WHERE metric_category IS NOT NULL
        GROUP BY nse_code, metric_category
        ORDER BY nse_code, metric_category
    """)

    print(f"\n  Per-Company Breakdown:")
    current_nse = None
    for nse_code, category, count in cur.fetchall():
        if nse_code != current_nse:
            current_nse = nse_code
            print(f"\n  🏢 {nse_code}:")
        print(f"     {category}: {count} metrics")

    # Show sample metrics
    cur.execute("""
        SELECT nse_code, metric_name, value, unit, period, citation_ref
        FROM financial_metrics
        WHERE value IS NOT NULL
        ORDER BY nse_code, metric_name
        LIMIT 15
    """)

    print(f"\n  📋 Sample Metrics:")
    for nse_code, metric, value, unit_val, period, citation in cur.fetchall():
        val_str = f"{value:,.2f}" if value else "N/A"
        print(f"     {nse_code} | {metric}: {val_str} {unit_val or ''} ({period or 'N/A'}) [{citation}]")

    conn.close()

    elapsed = time.time() - start_time
    print(f"\n⏱️  Extraction completed in {elapsed:.1f}s")
    print(f"✅ Total metrics: {total_metrics}")


if __name__ == "__main__":
    run_extraction()
