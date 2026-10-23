from sqlalchemy import Column, String, DateTime, Text, Enum as SQLEnum
from sqlalchemy.sql import func
import enum
from app.core.database import Base
import uuid


class JobStatus(str, enum.Enum):
    PENDING = "pending"
    CLEANING = "cleaning"
    VALIDATING = "validating"
    SCRAPING = "scraping"
    COMPLETED = "completed"
    FAILED = "failed"


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    status = Column(SQLEnum(JobStatus), default=JobStatus.PENDING, nullable=False)
    progress_message = Column(String(255), default="Job created")
    
    # File paths (relative or absolute)
    qc_file_path = Column(String(500), nullable=True)
    specs_file_path = Column(String(500), nullable=True)
    ulm_file_path = Column(String(500), nullable=True)
    last_working_file_path = Column(String(500), nullable=True)
    
    output_file_path = Column(String(500), nullable=True)
    stage_outputs = Column(Text, default="{}")
    target_stage = Column(String(50), default="all")
    logs = Column(Text, default="[]")
    
    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self):
        import json
        from pathlib import Path

        parsed_logs = []
        if self.logs:
            try:
                parsed_logs = json.loads(self.logs)
            except Exception:
                parsed_logs = [{"time": "", "level": "INFO", "message": self.logs}]

        parsed_stage_outputs = {}
        if self.stage_outputs:
            try:
                parsed_stage_outputs = json.loads(self.stage_outputs)
            except Exception:
                parsed_stage_outputs = {}

        return {
            "id": self.id,
            "status": self.status.value if self.status else None,
            "progress_message": self.progress_message,
            "output_file_path": self.output_file_path,
            "stage_outputs": parsed_stage_outputs,
            "target_stage": self.target_stage or "all",
            "error_message": self.error_message,
            "qc_file_name": Path(self.qc_file_path).name if self.qc_file_path else None,
            "specs_file_name": Path(self.specs_file_path).name if self.specs_file_path else None,
            "ulm_file_name": Path(self.ulm_file_path).name if self.ulm_file_path else None,
            "last_working_file_name": Path(self.last_working_file_path).name if self.last_working_file_path else None,
            "logs": parsed_logs,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }