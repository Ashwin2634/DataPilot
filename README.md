# DataPilot

**QC Product Processor** — Full-stack pipeline for cleaning crawler (QC) data, enriching & validating against Specs Master / ULM / Last Working files, and scraping product details.

Built for high-volume product data workflows (especially garden hose / retail catalog data).

---

## Overview

DataPilot processes messy QC crawler exports through a multi-stage pipeline:

1. **Clean** – Normalize columns, fix data quality issues, prepare working file
2. **Validate / Enrich** – Match against Specs Master + ULM + Last Working using composite keys, detect new vs existing products, populate Part Number / Brand / Product
3. **Scrape** – Fetch missing product details using a robust multi-engine scraper (curl_cffi + Patchright/Playwright)
4. **Export** – Generate final enriched Excel/CSV

Jobs run in the background with live status, progress messages, stage-level file previews, and downloads.

---

## Tech Stack

| Layer       | Technology                                      |
|-------------|--------------------------------------------------|
| Backend     | FastAPI, SQLAlchemy (async), Pandas, openpyxl   |
| Scraper     | Playwright / Patchright, curl_cffi, BeautifulSoup, selectolax, extruct |
| Database    | SQLite (local) or PostgreSQL (production)       |
| Frontend    | React 18 + Vite + Tailwind CSS + Axios          |
| Storage     | Local filesystem (uploads / outputs / temp)     |
| Background  | FastAPI BackgroundTasks (Celery/Redis ready)    |

---

## Project Structure

```
DataPilot/
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI routers (jobs)
│   │   ├── core/           # Config & Database
│   │   ├── models/         # SQLAlchemy models (Job)
│   │   ├── services/       # cleaner, validator, scraper, exporter, job_service
│   │   └── workers/
│   ├── scraper_engine/     # Advanced multi-engine scraper (proxies, concurrency, parsers)
│   ├── storage/
│   │   ├── uploads/
│   │   ├── outputs/
│   │   └── temp/
│   ├── main.py
│   ├── requirements.txt
│   └── requirements-scraper.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   └── services/
│   ├── package.json
│   └── vite.config.js
├── data/                   # Sample / reference data (optional)
└── README.md
```

---

## Features

- Multi-file upload (QC + Specs Master + ULM + Last Working)
- Target stage selection (`all`, `cleaner`, `validator`, `scraper`, `exporter`)
- Background job processing with real-time status & progress
- Stage-level intermediate file previews (with search + pagination)
- Download cleaned / validated / scraped / final outputs as Excel or CSV
- ULM enrichment via composite key (`Merchant + Merchant SKU` ↔ `site + website part #`)
- Specs enrichment (Part Number, Brand, Product)
- New vs Existing product detection
- Robust scraper engine with rotating/sticky residential proxies, browser-first domains, high concurrency
- CORS-ready for local + production frontends

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- (Optional) Playwright browsers / Patchright

### 1. Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
pip install -r requirements-scraper.txt   # if using full scraper

# Install browser binaries
playwright install
# or
patchright install chromium
```

Create a `.env` file (optional but recommended):

```env
DATABASE_URL=sqlite+aiosqlite:///./storage/app.db
# or PostgreSQL: postgresql+asyncpg://user:pass@host/db

BACKEND_CORS_ORIGINS=http://localhost:5173,http://localhost:3000
UPLOAD_DIR=./storage/uploads
OUTPUT_DIR=./storage/outputs
TEMP_DIR=./storage/temp
```

Start the API:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- API docs → http://localhost:8000/docs
- Health check → http://localhost:8000/health

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at → http://localhost:5173

---

## API Endpoints

| Method | Endpoint                                      | Description                                      |
|--------|-----------------------------------------------|--------------------------------------------------|
| `POST` | `/api/v1/jobs/upload`                         | Upload files & start job (supports target_stage) |
| `GET`  | `/api/v1/jobs`                                | List recent jobs                                 |
| `GET`  | `/api/v1/jobs/{job_id}`                       | Get job status, progress & logs                  |
| `GET`  | `/api/v1/jobs/{job_id}/download`              | Download final output (xlsx/csv)                 |
| `GET`  | `/api/v1/jobs/{job_id}/stages/{stage}/download` | Download intermediate stage file               |
| `GET`  | `/api/v1/jobs/{job_id}/stages/{stage}/preview`  | Preview stage data (search + pagination)       |

**Upload form fields:**
- `qc_file`, `specs_file`, `ulm_file`, `last_working_file` (files)
- `target_stage` (optional): `all` | `cleaner` | `validator` | `scraper` | `exporter`

---

## Pipeline Stages

| Stage       | What it does                                                                 |
|-------------|------------------------------------------------------------------------------|
| **Cleaner** | Column normalization, data cleaning, prepares working Excel                  |
| **Validator** | ULM enrichment (composite key), Specs enrichment (Part # / Brand / Product), New vs Existing detection |
| **Scraper** | Fetches missing product details using multi-engine scraper + proxies         |
| **Exporter**| Final enriched Excel/CSV output                                              |

---

## Environment Variables

| Variable                  | Default                          | Description                          |
|---------------------------|----------------------------------|--------------------------------------|
| `DATABASE_URL`            | SQLite local                     | Async database URL                   |
| `BACKEND_CORS_ORIGINS`    | `http://localhost:5173,...`      | Comma-separated allowed origins      |
| `UPLOAD_DIR` / `OUTPUT_DIR` / `TEMP_DIR` | `./storage/...`             | Storage paths                        |
| Proxy-related (scraper)   | See `scraper_engine/config.py`   | ProxyScrape keys, residential gateway, concurrency |

---

## Current Status

- ✅ Project structure & FastAPI multi-file upload
- ✅ Job system with status tracking + background processing
- ✅ React UI (upload + live progress)
- ✅ Pandas cleaning pipeline
- ✅ Validation / matching logic (ULM + Specs + Last Working)
- ✅ Stage-level preview & download APIs
- ✅ Scraper Engine (curl_cffi + Patchright, proxy rotation, browser-first domains)
- 🔄 Production hardening & full end-to-end scraper integration
- 🔄 Optional Celery / Redis for heavier workloads

---

## Development Notes

- Intermediate files are stored under `storage/temp/{job_id}_working_*.xlsx`
- Final outputs go to `storage/outputs/`
- The scraper supports high concurrency and sticky sessions for anti-bot sites (Best Buy, Lowe’s, Costco, etc.)
- Validation is currently tuned for garden hose / similar retail catalog data but is designed to be extensible

---

## License

Private / Internal use (update as needed).

---

**Author:** [Ashwin Prajapati](https://github.com/Ashwin2634)
```
