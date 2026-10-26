from pydantic_settings import BaseSettings
from pathlib import Path
from typing import List
import os

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    APP_NAME: str = "QC Product Processor"
    API_V1_STR: str = "/api/v1"

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite+aiosqlite:///{BASE_DIR}/storage/app.db"
    )

    # Storage
    UPLOAD_DIR: Path = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "storage" / "uploads")))
    OUTPUT_DIR: Path = Path(os.getenv("OUTPUT_DIR", str(BASE_DIR / "storage" / "outputs")))
    TEMP_DIR: Path = Path(os.getenv("TEMP_DIR", str(BASE_DIR / "storage" / "temp")))

    # CORS - comma separated list in env
    # Example: "http://localhost:5173,https://datapilot-web.fly.dev"
    BACKEND_CORS_ORIGINS: str = os.getenv(
        "BACKEND_CORS_ORIGINS",
        "http://localhost:5173,http://localhost:3000"
    )

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.BACKEND_CORS_ORIGINS.split(",") if origin.strip()]

    class Config:
        case_sensitive = True
        env_file = ".env"


settings = Settings()

for path in [settings.UPLOAD_DIR, settings.OUTPUT_DIR, settings.TEMP_DIR]:
    path.mkdir(parents=True, exist_ok=True)