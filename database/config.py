"""
PRISM Analyst — Database Configuration
Loads from environment variables with local dev defaults.
AWS-ready: just change the env vars when deploying to RDS.
"""
import os
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    "host": os.getenv("PRISM_DB_HOST", "localhost"),
    "port": int(os.getenv("PRISM_DB_PORT", "5432")),
    "dbname": os.getenv("PRISM_DB_NAME", "prism_analyst"),
    "user": os.getenv("PRISM_DB_USER", "prism"),
    "password": os.getenv("PRISM_DB_PASSWORD", "prism_secret_2026"),
}

# AWS RDS enforces SSL Connections
if os.getenv("PRISM_DB_SSLMODE"):
    DB_CONFIG["sslmode"] = os.getenv("PRISM_DB_SSLMODE")
    if os.getenv("PRISM_DB_SSLROOTCERT"):
        DB_CONFIG["sslrootcert"] = os.getenv("PRISM_DB_SSLROOTCERT")

# Base path for company data
DATA_BASE_PATH = os.getenv(
    "PRISM_DATA_PATH",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "companies_annual_report_and_results")
)

# Company folder mapping: folder_name → (company_name, ticker, sector)
COMPANY_MAP = {
    "mahindra_annual_report_and_results": {
        "name": "Mahindra & Mahindra Limited",
        "ticker": "MAHINDRA",
        "sector": "Automotive & Farm Equipment",
        "isin": "INE101A01026",
        "results_folder": "mahindra_results",
        "pdf_file": "MAHINDRA.pdf",
    },
    "adani_annual_report_and_results": {
        "name": "Adani Enterprises Limited",
        "ticker": "ADANIENT",
        "sector": "Diversified Conglomerate",
        "isin": "INE423B01027",
        "results_folder": "adanient_results",
        "pdf_file": "ADANIENT.pdf",
    },
    "icici_annual_report_and_results": {
        "name": "ICICI Bank Limited",
        "ticker": "ICICI",
        "sector": "Banking & Financial Services",
        "isin": "INE090A01021",
        "results_folder": "icici_results",
        "pdf_file": "ICICI.pdf",
    },
    "infosys_annual_report_and_results": {
        "name": "Infosys Limited",
        "ticker": "INFOSYS",
        "sector": "Information Technology",
        "isin": "INE009A01021",
        "results_folder": "infosys_results",
        "pdf_file": "INFOSYS.pdf",
    },
}
