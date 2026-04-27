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
├── api/                            # FastAPI backend (Python)
├── frontend/                       # Next.js PRISM web app
├── thequantsoft/                   # Express.js landing page (thequantsoft.co.in)
│   ├── components/                 # React JSX components (Nav, Hero, Research, Sections)
│   ├── styles/tokens.css           # CSS design system
│   ├── screenshots/                # Design reference images
│   ├── Home.html                   # Landing page
│   ├── Prism.html                  # PRISM product page
│   ├── Labs.html                   # Labs page
│   ├── Blog.html / BlogPost.html   # Blog pages
│   ├── Contact.html                # Contact form
│   ├── Privacy.html / Terms.html   # Legal pages
│   ├── server.js                   # Express server (serves HTML + /api/contact)
│   └── package.json
├── database/                       # DB schema, migrations, ingestion scripts
├── docker-compose.yml              # Local dev (PostgreSQL + pgAdmin)
├── docker-compose.prod.yml         # Production (4 services: frontend, backend, landing, nginx)
├── Dockerfile.frontend             # Next.js standalone build
├── Dockerfile.backend              # FastAPI with Python deps
├── Dockerfile.landing              # Express.js landing page
├── nginx.conf                      # Nginx reverse proxy (domain-based routing + SSL)
├── .github/workflows/deploy.yml    # CI/CD (auto-deploy on push to production)
├── .env                            # Secrets (gitignored)
├── .env.landing                    # Landing page secrets (gitignored)
└── README.md                       # This file
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

## 🌐 AWS Production Deployment & CI/CD Guide

### Production Architecture

The platform runs on a single **AWS EC2** instance (`t3.medium`, `ap-south-1`) with 4 Docker containers behind an Nginx reverse proxy:

```
                     ┌──────────────────────────────────────────┐
                     │        EC2 · 15.207.146.145              │
                     │                                          │
 thequantsoft.co.in ─┤    nginx (port 80/443)                   │
 www.thequantsoft.co.in ─┤    ├── landing   :3002  (Express)    │
                     │    ├── frontend  :3001  (Next.js)        │
 prism.thequantsoft  │    ├── backend   :8000  (FastAPI)        │
   .co.in ───────────┤    └── (SSL via Let's Encrypt)           │
                     └──────────────────────────────────────────┘
```

| Domain | Routes To | Container |
|--------|-----------|-----------|
| `thequantsoft.co.in` | Landing page | `prism_landing` (Express.js, port 3002) |
| `www.thequantsoft.co.in` | 301 redirect → `thequantsoft.co.in` | nginx |
| `prism.thequantsoft.co.in` | PRISM AI app | `prism_frontend` (port 3001) + `prism_backend` (port 8000) |

### Files That Control Deployment

| File | Purpose |
|------|---------|
| `docker-compose.prod.yml` | Defines all 4 services (frontend, backend, landing, nginx) |
| `Dockerfile.frontend` | Next.js standalone build |
| `Dockerfile.backend` | FastAPI with Python deps |
| `Dockerfile.landing` | Express.js landing page |
| `nginx.conf` | Domain-based routing, SSL termination, proxy rules |
| `.github/workflows/deploy.yml` | CI/CD — auto-deploys on push to `production` branch |

### Environment Files (gitignored — live on server only)

| File | Used By | Key Variables |
|------|---------|---------------|
| `.env` | `frontend` + `backend` | API keys, DB credentials, SEBI DB, LLM config |
| `.env.landing` | `landing` | SMTP credentials, PRISM_APP_URL, company config |

> ⚠️ **These files are gitignored.** They must be manually created on the EC2 server. If the server is rebuilt, you must recreate them.

---

### Phase 1: GitHub Secrets

Configure in **Settings > Secrets and variables > Actions**:

| Secret Name | Value |
|---|---|
| `EC2_HOST` | `15.207.146.145` |
| `EC2_USERNAME` | `ubuntu` |
| `EC2_SSH_KEY` | Contents of `prism-analyst.pem` private key |

### Phase 2: Server Provisioning (First-Time Only)

```bash
# SSH into server
ssh -i prism-analyst.pem ubuntu@15.207.146.145

# Install Docker, Git, Certbot
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && newgrp docker
sudo apt install -y docker-compose-plugin git certbot
```

### Phase 3: DNS Configuration

Add these **A Records** in your domain registrar (GoDaddy):

| Type | Name | Data | TTL |
|------|------|------|-----|
| A | `prism` | `15.207.146.145` | 600s |
| A | `@` | `15.207.146.145` | 600s |
| A | `www` | `15.207.146.145` | 600s |

### Phase 4: SSL Certificates

```bash
# On the EC2 server
mkdir -p certbot/www

# PRISM subdomain
sudo certbot certonly --webroot -w ./certbot/www \
  -d prism.thequantsoft.co.in \
  --email praveen.kumar@thequantsoft.co.in --agree-tos

# Landing page root domain
sudo certbot certonly --webroot -w ./certbot/www \
  -d thequantsoft.co.in -d www.thequantsoft.co.in \
  --email praveen.kumar@thequantsoft.co.in --agree-tos
```

> **Auto-Renewal**: Add to `sudo crontab -e`:
> ```cron
> 0 */12 * * * certbot renew --quiet && docker restart prism_nginx
> ```

### Phase 5: Create Server Environment Files

```bash
# SSH into server
ssh -i prism-analyst.pem ubuntu@15.207.146.145
cd ~/PRISM_ANALYST

# 1. Create .env (for PRISM frontend + backend)
#    Copy all variables from your local .env, including:
#    - GEMINI_API_KEY, OPENROUTER_API_KEY
#    - SEBI_DB_HOST, SEBI_DB_PORT, SEBI_DB_NAME, SEBI_DB_USER, SEBI_DB_PASSWORD
#    - NEXT_PUBLIC_API_URL, NEXT_PUBLIC_NEWS_API_URL
nano .env

# 2. Create .env.landing (for landing page)
cat > .env.landing << 'EOF'
PORT=3002
TARGET_EMAIL=praveen.kumar@thequantsoft.co.in
SMTP_SERVICE=gmail
SMTP_USER=dhananjayraj75@gmail.com
SMTP_PASS=<APP_PASSWORD>
COMPANY_NAME=QUANTSOFT
LINKEDIN_URL=https://www.linkedin.com/company/quantsoft252
LINKEDIN_HANDLE=quantsoft252
PRISM_APP_URL=https://prism.thequantsoft.co.in/chat
LOCATION_MAIN=India · remote-first
LOCATION_SEC=Mumbai · Bangalore
COPYRIGHT_YEAR=2026
COPYRIGHT_DOMAIN=thequantsoft.co.in
EOF
```

### Phase 6: Build & Deploy

```bash
cd ~/PRISM_ANALYST

# Build all containers
docker compose -f docker-compose.prod.yml build --no-cache frontend
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml build landing

# Start everything
docker compose -f docker-compose.prod.yml up -d

# Verify all 4 containers are running
docker compose -f docker-compose.prod.yml ps
```

### Phase 7: CI/CD Workflow (Automated Deployments)

The project auto-deploys on every push to the `production` branch:

1. Push code to `feat/*` branch
2. Create PR → `main` → merge
3. Create PR → `production` → merge
4. GitHub Actions SSH into EC2, pulls latest, rebuilds, restarts

**Workflow**: `.github/workflows/deploy.yml`

### Phase 8: Monitoring & Maintenance

| Task | Command |
|---|---|
| **View Live Logs** | `docker compose -f docker-compose.prod.yml logs -f` |
| **Logs for One Service** | `docker compose -f docker-compose.prod.yml logs -f landing` |
| **Check Container Status** | `docker compose -f docker-compose.prod.yml ps` |
| **Rebuild a Single Service** | `docker compose -f docker-compose.prod.yml build --no-cache landing` |
| **Restart a Service** | `docker compose -f docker-compose.prod.yml restart landing` |
| **Clean Disk Space** | `docker image prune -f` |
| **Check SSL Expiry** | `sudo certbot certificates` |

### Adding a New Feature to Production

```bash
# 1. Create feature branch
git checkout -b feat/rk/my-feature

# 2. Make changes, commit, push
git add . && git commit -m "feat: description" && git push origin feat/rk/my-feature

# 3. Create PR: feat branch → main → merge
# 4. Create PR: main → production → merge
# 5. CI/CD auto-deploys. If env vars changed, SSH and update .env on server.
```

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

By adopting this multi-model routing strategy, the system's daily conversational quota jumps from barely **~6 heavy queries** to **over 500 complex RAG interactions per day**, operating at maximum resilience.
