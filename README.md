# QC Product Processor

Full-stack application to clean crawler (QC) data, validate against Specs Master / ULM / Last Working files, and scrape new product details.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy (SQLite) + Pandas + Playwright + BeautifulSoup
- **Frontend**: React + Vite + Tailwind CSS + Axios
- **Storage**: Local filesystem

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI routers
│   │   ├── core/         # Config & Database
│   │   ├── models/       # SQLAlchemy models
│   │   ├── services/     # Business logic (cleaning, validation, scraping)
│   │   └── workers/      # Background task helpers
│   ├── storage/
│   │   ├── uploads/
│   │   ├── outputs/
│   │   └── temp/
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── services/
│   │   └── ...
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## Quick Start

### 1. Backend

```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt

# Install Playwright browsers
playwright install

# Run the API
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API docs will be available at: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend will run at: http://localhost:5173

## Current Status

- ✅ Project structure
- ✅ FastAPI multi-file upload endpoint
- ✅ Job system with SQLite + status tracking
- ✅ Background job skeleton (mock stages)
- ✅ React UI with multi-file upload + live progress
- ⏳ Pandas cleaning pipeline (next)
- ⏳ Validation / matching logic (next)
- ⏳ Playwright scraper engine (next)

## API Endpoints

| Method | Endpoint                         | Description                          |
|--------|----------------------------------|--------------------------------------|
| POST   | `/api/v1/jobs/upload`            | Upload files & start job             |
| GET    | `/api/v1/jobs`                   | List recent pipeline job runs        |
| GET    | `/api/v1/jobs/{job_id}`          | Get job status, progress & logs      |
| GET    | `/api/v1/jobs/{job_id}/download` | Download final enriched Excel file   |

## Next Steps

We will implement the real pipelines step-by-step:

1. Data Cleaning Pipeline (Pandas)
2. Data Validation / Matching against Specs + ULM + Last Working
3. Scraper Engine (Playwright + BeautifulSoup)
