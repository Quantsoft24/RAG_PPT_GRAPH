# PRISM ANALYST — Database & AI Pipeline

> **Annual Report Intelligence System** — Stores extracted data from 4 companies' annual reports (Mahindra, Adani, ICICI, Infosys) in PostgreSQL with citation referencing for an AI analyst agent.

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Docker Desktop | Installed & running | `docker --version` |
| Python | 3.10+ | `python --version` |
| Ollama | Installed | `ollama --version` |

---

## 🚀 Quick Start (Step by Step)

### Step 1: Start the Database

```powershell
cd C:\Users\DELL\Desktop\PRISM_ANALYST
docker-compose up -d
```

This starts:
- **PostgreSQL 17** (port `5432`) — primary database with pgvector
- **pgAdmin 4** (port `5050`) — visual database browser

Wait ~15 seconds for PostgreSQL health check to pass.

### Step 2: Create the Schema

```powershell
docker cp database/schema.sql prism_postgres:/tmp/schema.sql
docker exec prism_postgres psql -U prism -d prism_analyst -f /tmp/schema.sql
```

Then create views & search function:
```powershell
docker cp database/views.sql prism_postgres:/tmp/views.sql
docker exec prism_postgres psql -U prism -d prism_analyst -f /tmp/views.sql
```

### Step 3: Install Python Dependencies

```powershell
pip install psycopg2-binary python-dotenv
```

### Step 4: Run Data Ingestion

```powershell
python database/ingest.py
```

You should see all 4 companies processed with a summary showing **5,800+ rows** inserted.

### Step 5: Pull Embedding Model (one-time)

```powershell
ollama pull nomic-embed-text
```

### Step 6: Run Schema Migration (Phase 2 — Vector Search)

```powershell
docker cp database/migrate_chunks.sql prism_postgres:/tmp/migrate_chunks.sql
docker exec prism_postgres psql -U prism -d prism_analyst -f /tmp/migrate_chunks.sql
```

### Step 7: Run Semantic Chunking

```powershell
python database/chunker.py
```

This creates ~5,000 semantic chunks with section detection, table preservation, and metadata enrichment.

### Step 8: Generate Vector Embeddings

```powershell
python database/embedder.py
```

> ⚠️ This takes ~45-60 minutes on CPU (nomic-embed-text). The pipeline is **resumable** — if interrupted, just run it again and it picks up where it left off.

---

## 📊 Demo: Exploring Data in pgAdmin

### Open pgAdmin

1. Go to **http://localhost:5050** in your browser
2. Login:
   - **Email:** `admin@example.com`
   - **Password:** `admin123`

### Connect to the Database

3. In the left panel, expand: **Servers** → **PRISM Analyst DB**
4. If asked for password, enter: `prism_secret_2026` (check "Save Password")
5. Expand: **Databases** → **prism_analyst** → **Schemas** → **public** → **Tables**

### Phase 1 Demo Queries (via pgAdmin Query Tool)

Right-click on **prism_analyst** → **Query Tool**, then run:

#### 📋 See All Companies
```sql
SELECT * FROM companies;
```

#### 📊 Document Statistics (great for demo!)
```sql
SELECT * FROM v_document_stats;
```

#### 🔍 Search for "revenue growth" across all reports
```sql
SELECT * FROM search_content('revenue growth');
```

#### 🔗 View content with citations (filterable by company)
```sql
SELECT citation_ref, block_type, LEFT(content, 200) AS preview, page_number
FROM v_blocks_with_context
WHERE ticker = 'MAHINDRA'
ORDER BY page_number
LIMIT 20;
```

#### 📈 All charts extracted
```sql
SELECT * FROM v_all_charts;
```

#### 📊 All tables extracted
```sql
SELECT * FROM v_all_tables LIMIT 10;
```

### Phase 2 Demo Queries (Semantic Chunks + Vector Search)

#### 📊 Chunk Statistics per Company
```sql
SELECT * FROM v_chunk_stats;
```

#### 🔍 Hybrid Search (BM25 + Semantic + RRF Fusion)
```sql
-- First generate a query embedding via Ollama, then:
-- Or use the interactive search CLI:
-- python database/search.py
```

#### 📦 View Chunks with Sections
```sql
SELECT company_ticker, page_number, chunk_type, section_name, 
       token_count, LEFT(content, 150) AS preview, citation_ref
FROM document_chunks
WHERE company_ticker = 'MAHINDRA'
ORDER BY chunk_index
LIMIT 20;
```

#### 📑 See Detected Sections
```sql
SELECT DISTINCT section_name, COUNT(*) AS chunk_count
FROM document_chunks 
WHERE section_name IS NOT NULL
GROUP BY section_name 
ORDER BY chunk_count DESC;
```

#### 📊 Financial Content (chunks with numbers)
```sql
SELECT company_ticker, page_number, section_name, LEFT(content, 200) AS preview
FROM document_chunks 
WHERE has_numbers = TRUE AND chunk_type = 'text'
ORDER BY company_ticker, page_number
LIMIT 20;
```

### Interactive Search CLI (Best for Demo!)

```powershell
python database/search.py
```

Then type queries like:
- `revenue growth strategy`
- `/semantic What is the company's approach to sustainability?`
- `/company MAHINDRA electric vehicle plans`
- `/keyword profit after tax`

---

## 📁 Project Structure

```
PRISM_ANALYST/
├── docker-compose.yml          # PostgreSQL + pgAdmin containers
├── pgadmin_servers.json        # Auto-connects pgAdmin to DB
├── README.md                   # This file
├── database/
│   ├── schema.sql              # Phase 1: 6 tables + indexes
│   ├── views.sql               # Phase 1: 4 views + search function
│   ├── migrate_chunks.sql      # Phase 2: chunks table + HNSW index
│   ├── ingest.py               # Phase 1: data ingestion pipeline
│   ├── chunker.py              # Phase 2: semantic chunking engine
│   ├── embedder.py             # Phase 2: embedding generation (Ollama)
│   ├── search.py               # Phase 2: hybrid search CLI
│   ├── config.py               # DB config (env-var overridable)
│   └── requirements.txt        # Python dependencies
├── companies_annual_report_and_results/
│   ├── mahindra_.../            # Mahindra annual report + extraction
│   ├── adani_.../               # Adani annual report + extraction
│   ├── icici_.../               # ICICI annual report + extraction
│   └── infosys_.../             # Infosys annual report + extraction
└── docs/                        # Project documentation
```

---

## 🔑 Connection Details

| Service | URL / Host | Credentials |
|---------|-----------|-------------|
| **pgAdmin** | http://localhost:5050 | `admin@example.com` / `admin123` |
| **PostgreSQL** | `localhost:5432` | DB: `prism_analyst`, User: `prism`, Pass: `prism_secret_2026` |

---

## ⚡ Common Commands

```powershell
# Start containers
docker-compose up -d

# Stop containers (data persists)
docker-compose down

# Stop and DELETE all data
docker-compose down -v

# Check container status
docker ps

# View PostgreSQL logs
docker logs prism_postgres

# Quick row count check (all tables)
docker exec prism_postgres psql -U prism -d prism_analyst -c "SELECT 'companies' AS tbl, COUNT(*) FROM companies UNION ALL SELECT 'documents', COUNT(*) FROM documents UNION ALL SELECT 'pages', COUNT(*) FROM pages UNION ALL SELECT 'content_blocks', COUNT(*) FROM content_blocks UNION ALL SELECT 'page_charts', COUNT(*) FROM page_charts UNION ALL SELECT 'page_tables', COUNT(*) FROM page_tables UNION ALL SELECT 'document_chunks', COUNT(*) FROM document_chunks;"

# Check embedding progress
docker exec prism_postgres psql -U prism -d prism_analyst -c "SELECT * FROM v_chunk_stats;"

# Run interactive search
python database/search.py
```

---

## 🌐 AWS Migration (Future)

Everything is AWS-ready. When deploying to AWS:

1. Replace PostgreSQL container with **Amazon RDS** (PostgreSQL 17 + pgvector)
2. Set environment variables:
   ```
   PRISM_DB_HOST=your-rds-endpoint.amazonaws.com
   PRISM_DB_PASSWORD=your-production-password
   ```
3. PDF storage paths can be swapped to **S3 URLs**
5. For scale: migrate vector search to **Qdrant** (already specified in tech stack)

---

## 🤖 AI Model Routing Architecture (RAG Generation)

To provide an industry-grade, highly responsive RAG experience without hitting API rate limits on the free tier (like the devastating 20 Requests Per Day cap on `Gemini 2.5 Flash`), the PRISM Analyst employs **LLM Routing**. 

Different models are assigned to different stages of the pipeline strictly based on their Request Per Minute (RPM), Tokens Per Minute (TPM), and Request Per Day (RPD) thresholds:

### 1. Intent Classification & Query Expansion (Pre-processing)
*   **Model**: `Gemma 3 27B` (or equivalent Gemma 3)
*   **Available Limits**: `30 RPM` | `15K TPM` | `14,400 RPD`
*   **Why**: These are rapid, high-frequency steps executed the moment a user hits "Send". They require very few tokens (only reading the user's short question) so the 15K TPM limit is not an issue. The massive 14,400 RPD ensures that pre-processing never throttles the system, acting as an extremely fast, high-volume "bouncer".

### 2. Vectorization (Embedding search)
*   **Model**: `Gemini Embedding 2` (`text-embedding-004`)
*   **Available Limits**: `100 RPM` | `30K TPM` | `1,000 RPD`
*   **Why**: A reliable, dedicated embedding endpoint. The 100 RPM allowance is highly generous and guarantees the semantic retrieval step will not be a bottleneck.

### 3. Final Answer Synthesis (Heavy RAG context)
*   **Model**: `Gemini 3.1 Flash Lite` (Alternative Fallback: `Gemma 4 31B`)
*   **Available Limits**: `15 RPM` | `250,000 TPM` | `500 RPD`
*   **Why**: This is the most demanding step. The LLM must read up to 15 large document chunks (thousands of words) retrieved from PostgreSQL to formulate an intelligent answer. 
    *   **The TPM Requirement**: `Gemini 3.1 Flash Lite` provides a massive 250,000 TPM, allowing it to easily digest large contexts. (`Gemma 4 31B` offers Unlimited TPM).
    *   **The RPD Requirement**: With a generous 500 requests per day, it gracefully handles heavy continuous chat workloads without triggering a `429 Too Many Requests` error, completely side-stepping the artificial limits placed on legacy models like `Gemini 2.5 Flash`.

By adopting this multi-model routing strategy, the system’s daily conversational quota jumps from barely **~6 heavy queries** to **over 500 complex RAG interactions per day**, operating at maximum resilience.
