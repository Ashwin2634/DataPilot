from pathlib import Path
from app.core.config import settings


async def generate_final_excel(final_df, job_id: str) -> str:
    """
    Generate the final output Excel and CSV files
    """
    settings.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = settings.OUTPUT_DIR / f"{job_id}_final_output.xlsx"
    csv_path = settings.OUTPUT_DIR / f"{job_id}_final_output.csv"
    final_df.to_excel(output_path, index=False)
    final_df.to_csv(csv_path, index=False)
    return str(output_path)
