from pydantic_settings import BaseSettings
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent.parent

class Settings(BaseSettings):
    APP_NAME: str = "QC Product Processor"
    API_V1_STR: str = "/api/v1"
    
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        f"sqlite+aiosqlite:///{BASE_DIR}/storage/app.db"
    )
    
    UPLOAD_DIR: Path = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "storage" / "uploads")))
    OUTPUT_DIR: Path = Path(os.getenv("OUTPUT_DIR", str(BASE_DIR / "storage" / "outputs")))
    TEMP_DIR: Path = Path(os.getenv("TEMP_DIR", str(BASE_DIR / "storage" / "temp")))
    
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "https://datapilot-frontend-93bn.onrender.com",   # <-- your exact frontend URL
    ]

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()

for path in [settings.UPLOAD_DIR, settings.OUTPUT_DIR, settings.TEMP_DIR]:
    path.mkdir(parents=True, exist_ok=True)