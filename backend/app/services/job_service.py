"""
Background job processor - Main Orchestrator
"""

import asyncio
import json
from datetime import datetime
from pathlib import Path
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.config import settings
from app.models.job import Job, JobStatus

# Import the pipelines
from app.services.cleaner import clean_data
from app.services.validator import validate_and_find_new_products
from app.services.scraper import scrape_new_products
from app.services.exporter import generate_final_excel


async def update_job_status(
    job_id: str,
    status: JobStatus,
    message: str,
    level: str = "INFO",
    output_path: str = None,
    error: str = None,
    stage_output: dict = None,
):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            return
        
        job.status = status
        job.progress_message = message
        if output_path:
            job.output_file_path = output_path
        if error:
            job.error_message = error
        if status == JobStatus.COMPLETED:
            job.completed_at = datetime.utcnow()
        
        # Merge stage_output dictionary
        if stage_output:
            try:
                stages = json.loads(job.stage_outputs) if job.stage_outputs else {}
            except Exception:
                stages = {}
            stage_key = stage_output.get("stage")
            if stage_key:
                stages[stage_key] = stage_output.get("data", {})
            job.stage_outputs = json.dumps(stages)

        now_str = datetime.now().strftime("%H:%M:%S")
        try:
            current_logs = json.loads(job.logs) if job.logs else []
        except Exception:
            current_logs = []
        
        current_logs.append({
            "time": now_str,
            "level": level,
            "message": message
        })
        job.logs = json.dumps(current_logs)
        
        await db.commit()


# Backward-compatible alias
append_job_log = update_job_status


async def process_job(job_id: str):
    """
    Main pipeline orchestrator with modular step-by-step stage execution
    """
    try:
        # Get job details (file paths & execution mode)
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Job).where(Job.id == job_id))
            job = result.scalar_one_or_none()
            if not job:
                return

            qc_path = job.qc_file_path
            specs_path = job.specs_file_path
            ulm_path = job.ulm_file_path
            last_working_path = job.last_working_file_path
            target_stage = (job.target_stage or "all").lower().strip()

        # Fallback if qc_path is not explicitly provided
        qc_path = qc_path or specs_path or ulm_path or last_working_path

        # ============================================
        # STAGE 1: DATA CLEANING
        # ============================================
        await update_job_status(
            job_id, 
            JobStatus.CLEANING, 
            "Cleaning data... removing duplicate URLs & mapping to schema",
            level="CLEAN"
        )

        cleaned_df, cleaned_file_path = await clean_data(
            qc_file_path=qc_path,
            job_id=job_id
        )

        cleaner_info = {
            "stage": "cleaner",
            "data": {
                "file_path": str(cleaned_file_path),
                "file_name": Path(cleaned_file_path).name,
                "row_count": len(cleaned_df),
                "col_count": len(cleaned_df.columns),
                "columns": list(cleaned_df.columns),
                "status": "completed",
                "completed_at": datetime.now().strftime("%H:%M:%S"),
            }
        }

        await update_job_status(
            job_id,
            JobStatus.CLEANING,
            f"Cleaned {len(cleaned_df):,} rows into standard schema. Saved {Path(cleaned_file_path).name}.",
            level="CLEAN",
            output_path=str(cleaned_file_path),
            stage_output=cleaner_info
        )

        # Early exit if user specified target_stage == "cleaner"
        if target_stage == "cleaner":
            await update_job_status(
                job_id,
                JobStatus.COMPLETED,
                f"Data Cleaning completed! Working file ready ({len(cleaned_df):,} rows).",
                output_path=str(cleaned_file_path),
                level="COMPLETE",
                stage_output=cleaner_info
            )
            return

        # ============================================
        # STAGE 2: DATA VALIDATION
        # ============================================
        await update_job_status(
            job_id, 
            JobStatus.VALIDATING, 
            "Validating against Specs Master, ULM & Last Working file...",
            level="VALIDATE"
        )

        validated_df, new_products_df = await validate_and_find_new_products(
            cleaned_df=cleaned_df,
            specs_file_path=specs_path,
            ulm_file_path=ulm_path,
            last_working_file_path=last_working_path
        )

        # Save validated working file
        settings.TEMP_DIR.mkdir(parents=True, exist_ok=True)
        validated_file_path = settings.TEMP_DIR / f"{job_id}_working_validated.xlsx"
        validated_csv_path = settings.TEMP_DIR / f"{job_id}_working_validated.csv"
        validated_df.to_excel(validated_file_path, index=False)
        validated_df.to_csv(validated_csv_path, index=False)

        validator_info = {
            "stage": "validator",
            "data": {
                "file_path": str(validated_file_path),
                "file_name": Path(validated_file_path).name,
                "row_count": len(validated_df),
                "col_count": len(validated_df.columns),
                "columns": list(validated_df.columns),
                "new_products_count": len(new_products_df),
                "existing_products_count": len(validated_df) - len(new_products_df),
                "status": "completed",
                "completed_at": datetime.now().strftime("%H:%M:%S"),
            }
        }

        await update_job_status(
            job_id,
            JobStatus.VALIDATING,
            f"Validation complete: {len(new_products_df)} new product(s) detected for scraping, {len(validated_df) - len(new_products_df)} existing.",
            level="VALIDATE",
            stage_output=validator_info
        )

        # Early exit if target_stage == "validator"
        if target_stage in ["validator", "validation"]:
            await update_job_status(
                job_id,
                JobStatus.COMPLETED,
                f"Validation completed! Working file ready ({len(new_products_df)} new products).",
                output_path=str(validated_file_path),
                level="COMPLETE",
                stage_output=validator_info
            )
            return

        # ============================================
        # STAGE 3: SCRAPING NEW PRODUCTS
        # ============================================
        await update_job_status(
            job_id, 
            JobStatus.SCRAPING, 
            f"Scraping {len(new_products_df)} new products with Playwright...",
            level="PLAYWRIGHT"
        )

        async def log_scrape(msg: str):
            await update_job_status(job_id, JobStatus.SCRAPING, msg, level="PLAYWRIGHT")

        final_df = await scrape_new_products(
            validated_df=validated_df,
            new_products_df=new_products_df,
            log_callback=log_scrape
        )

        scraped_file_path = settings.TEMP_DIR / f"{job_id}_working_scraped.xlsx"
        scraped_csv_path = settings.TEMP_DIR / f"{job_id}_working_scraped.csv"
        final_df.to_excel(scraped_file_path, index=False)
        final_df.to_csv(scraped_csv_path, index=False)

        scraper_info = {
            "stage": "scraper",
            "data": {
                "file_path": str(scraped_file_path),
                "file_name": Path(scraped_file_path).name,
                "row_count": len(final_df),
                "col_count": len(final_df.columns),
                "columns": list(final_df.columns),
                "status": "completed",
                "completed_at": datetime.now().strftime("%H:%M:%S"),
            }
        }

        if target_stage in ["scraper", "scraping"]:
            await update_job_status(
                job_id,
                JobStatus.COMPLETED,
                f"Scraping completed! Working file ready.",
                output_path=str(scraped_file_path),
                level="COMPLETE",
                stage_output=scraper_info
            )
            return

        # ============================================
        # STAGE 4: GENERATE FINAL OUTPUT
        # ============================================
        await update_job_status(
            job_id, 
            JobStatus.SCRAPING, 
            "Generating final Excel file...",
            level="EXPORT"
        )

        output_path = await generate_final_excel(
            final_df=final_df,
            job_id=job_id
        )

        final_csv_path = settings.OUTPUT_DIR / f"{job_id}_final_output.csv"
        final_df.to_csv(final_csv_path, index=False)

        exporter_info = {
            "stage": "exporter",
            "data": {
                "file_path": str(output_path),
                "file_name": Path(output_path).name,
                "row_count": len(final_df),
                "col_count": len(final_df.columns),
                "columns": list(final_df.columns),
                "status": "completed",
                "completed_at": datetime.now().strftime("%H:%M:%S"),
            }
        }

        # ============================================
        # COMPLETED
        # ============================================
        await update_job_status(
            job_id,
            JobStatus.COMPLETED,
            "Processing completed successfully!",
            output_path=output_path,
            level="COMPLETE",
            stage_output=exporter_info
        )

    except Exception as e:
        await update_job_status(
            job_id,
            JobStatus.FAILED,
            f"Job failed: {str(e)}",
            error=str(e),
            level="ERROR"
        )
        raise