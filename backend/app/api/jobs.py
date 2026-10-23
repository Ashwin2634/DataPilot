from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
import uuid
import aiofiles
from pathlib import Path

import json
import math
from datetime import datetime
import pandas as pd

from app.core.database import get_db
from app.core.config import settings
from app.models.job import Job, JobStatus
from app.services.job_service import process_job

router = APIRouter(prefix="/jobs", tags=["jobs"])


def resolve_stage_file_path(job: Job, stage_name: str, file_ext: str = "xlsx") -> Optional[Path]:
    """Helper to locate the intermediate or final working file for a specific stage strictly without cross-contamination."""
    stage_key = stage_name.lower().strip()
    ext = file_ext.lower().replace(".", "").strip() or "xlsx"
    
    # 1. Check registered stage_outputs in Job
    if job.stage_outputs:
        try:
            outputs = json.loads(job.stage_outputs)
            if stage_key in outputs:
                stage_data = outputs[stage_key]
                base_path_str = stage_data.get("file_path")
                if base_path_str:
                    base_p = Path(base_path_str)
                    target_p = base_p.with_suffix(f".{ext}")
                    if target_p.exists():
                        return target_p
                    if base_p.exists():
                        return base_p
        except Exception:
            pass

    # 2. Check canonical naming conventions on disk strictly by stage
    candidates = []
    if stage_key in ["cleaner", "cleaning"]:
        candidates = [
            settings.TEMP_DIR / f"{job.id}_working_cleaned.{ext}",
            settings.TEMP_DIR / f"{job.id}_cleaned.{ext}",
        ]
    elif stage_key in ["validator", "validating", "validation"]:
        candidates = [
            settings.TEMP_DIR / f"{job.id}_working_validated.{ext}",
        ]
    elif stage_key in ["scraper", "scraping"]:
        candidates = [
            settings.TEMP_DIR / f"{job.id}_working_scraped.{ext}",
        ]
    elif stage_key in ["exporter", "final", "output"]:
        candidates = [
            settings.OUTPUT_DIR / f"{job.id}_final_output.{ext}",
        ]

    for c in candidates:
        if c.exists():
            return c

    # Fallback to alternate extension (e.g. if csv was requested but only xlsx exists or vice-versa)
    alt_ext = "csv" if ext == "xlsx" else "xlsx"
    for c in candidates:
        alt_c = c.with_suffix(f".{alt_ext}")
        if alt_c.exists():
            return alt_c

    return None


@router.post("/upload")
async def upload_files(
    background_tasks: BackgroundTasks,
    qc_file: Optional[UploadFile] = File(None),
    specs_file: Optional[UploadFile] = File(None),
    ulm_file: Optional[UploadFile] = File(None),
    last_working_file: Optional[UploadFile] = File(None),
    target_stage: Optional[str] = Form("all"),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload one or more files (QC, Specs Master, ULM, Last Working).
    Returns a Job ID immediately and starts background processing.
    target_stage options: 'all', 'cleaner', 'validator', 'scraper', 'exporter'
    """
    if not any([qc_file, specs_file, ulm_file, last_working_file]):
        raise HTTPException(status_code=400, detail="At least one file must be uploaded")

    job_id = str(uuid.uuid4())
    job_dir = settings.UPLOAD_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    file_paths = {}

    async def save_file(upload: UploadFile, name: str) -> str:
        if not upload:
            return None
        dest = job_dir / f"{name}_{upload.filename}"
        async with aiofiles.open(dest, "wb") as f:
            content = await upload.read()
            await f.write(content)
        return str(dest)

    file_paths["qc"] = await save_file(qc_file, "qc")
    file_paths["specs"] = await save_file(specs_file, "specs")
    file_paths["ulm"] = await save_file(ulm_file, "ulm")
    file_paths["last_working"] = await save_file(last_working_file, "last_working")

    clean_target = (target_stage or "all").lower().strip()

    # Create job record
    job = Job(
        id=job_id,
        status=JobStatus.PENDING,
        progress_message="Files uploaded. Waiting to start...",
        qc_file_path=file_paths["qc"],
        specs_file_path=file_paths["specs"],
        ulm_file_path=file_paths["ulm"],
        last_working_file_path=file_paths["last_working"],
        target_stage=clean_target,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Trigger background processing
    background_tasks.add_task(process_job, job_id)

    return {
        "job_id": job_id,
        "status": job.status.value,
        "target_stage": clean_target,
        "message": f"Job created successfully. Processing started (Mode: {clean_target}).",
    }


@router.get("")
async def list_jobs(limit: int = 20, db: AsyncSession = Depends(get_db)):
    """List recent pipeline job runs."""
    result = await db.execute(select(Job).order_by(Job.created_at.desc()).limit(limit))
    jobs = result.scalars().all()
    return [job.to_dict() for job in jobs]


@router.get("/{job_id}")
async def get_job_status(job_id: str, db: AsyncSession = Depends(get_db)):
    """Get current status and progress of a job."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return job.to_dict()


@router.get("/{job_id}/stages/{stage_name}/download")
async def download_stage_output(
    job_id: str,
    stage_name: str,
    format: str = "xlsx",
    db: AsyncSession = Depends(get_db)
):
    """Download the working file (Excel or CSV) for a specific stage (cleaner, validator, scraper, exporter)."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    path = resolve_stage_file_path(job, stage_name, file_ext=format)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail=f"Working file for stage '{stage_name}' ({format.upper()}) not ready or missing on disk")
    
    media_type = "text/csv" if path.suffix.lower() == ".csv" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    
    return FileResponse(
        path=path,
        filename=path.name,
        media_type=media_type,
    )


@router.get("/{job_id}/stages/{stage_name}/preview")
async def preview_stage_output(
    job_id: str,
    stage_name: str,
    page: int = 1,
    page_size: int = 50,
    search: Optional[str] = None,
    all_rows: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """
    Inspect and preview the working Excel dataset for a specific pipeline stage.
    Supports search query across all columns, pagination, and full schema metadata.
    """
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    path = resolve_stage_file_path(job, stage_name)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail=f"Working file for stage '{stage_name}' not available yet")

    try:
        if path.suffix.lower() == ".csv":
            df = pd.read_csv(path)
        else:
            df = pd.read_excel(path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")

    total_rows = len(df)
    columns = [str(c) for c in df.columns]

    # Global search filter across all columns if search term provided
    if search and search.strip():
        term = search.strip().lower()
        mask = df.astype(str).apply(lambda row: row.str.lower().str.contains(term, regex=False)).any(axis=1)
        df_filtered = df[mask]
    else:
        df_filtered = df

    filtered_count = len(df_filtered)

    if all_rows:
        rows_df = df_filtered
        curr_page = 1
        curr_page_size = filtered_count
        total_pages = 1
    else:
        curr_page = max(1, page)
        curr_page_size = max(1, min(page_size, 500))
        total_pages = max(1, math.ceil(filtered_count / curr_page_size))
        start_idx = (curr_page - 1) * curr_page_size
        end_idx = start_idx + curr_page_size
        rows_df = df_filtered.iloc[start_idx:end_idx]

    # Format cleanly for JSON serialization without NaN/NaT
    clean_records = []
    for record in rows_df.to_dict(orient="records"):
        clean_row = {}
        for k, v in record.items():
            if pd.isna(v):
                clean_row[str(k)] = ""
            elif isinstance(v, (datetime, pd.Timestamp)):
                clean_row[str(k)] = v.strftime("%Y-%m-%d %H:%M:%S")
            else:
                clean_row[str(k)] = v
        clean_records.append(clean_row)

    return {
        "job_id": job_id,
        "stage": stage_name,
        "file_name": path.name,
        "total_rows": total_rows,
        "filtered_rows": filtered_count,
        "total_columns": len(columns),
        "columns": columns,
        "page": curr_page,
        "page_size": curr_page_size,
        "total_pages": total_pages,
        "data": clean_records,
    }


@router.get("/{job_id}/download")
async def download_output(
    job_id: str,
    format: str = "xlsx",
    db: AsyncSession = Depends(get_db)
):
    """Download the output file (Excel or CSV) based on executed target_stage."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    target = (job.target_stage or "all").lower().strip()
    path = None

    if target in ["all", "exporter"]:
        path = resolve_stage_file_path(job, "exporter", file_ext=format)
    elif target in ["cleaner", "cleaning"]:
        path = resolve_stage_file_path(job, "cleaner", file_ext=format)
    elif target in ["validator", "validating", "validation"]:
        path = resolve_stage_file_path(job, "validator", file_ext=format)
    elif target in ["scraper", "scraping"]:
        path = resolve_stage_file_path(job, "scraper", file_ext=format)

    if not path:
        if job.output_file_path:
            p = Path(job.output_file_path)
            target_ext = format.lower().replace(".", "").strip() or "xlsx"
            if p.with_suffix(f".{target_ext}").exists():
                path = p.with_suffix(f".{target_ext}")
            elif p.exists():
                path = p

    if not path or not path.exists():
        raise HTTPException(status_code=400, detail="Output file not ready yet or missing on disk")
    
    media_type = "text/csv" if path.suffix.lower() == ".csv" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    return FileResponse(
        path=path,
        filename=path.name,
        media_type=media_type,
    )