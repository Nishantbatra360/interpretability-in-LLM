from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, ForeignKey, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./interpretability.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    upload_time = Column(DateTime, default=datetime.utcnow)
    
    evaluations = relationship("CommentEvaluation", back_populates="file", cascade="all, delete-orphan")

class CommentEvaluation(Base):
    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, ForeignKey("uploaded_files.id"), nullable=False)
    text = Column(Text, nullable=False)

    # Ground truth — raw score from Civil Comments dataset (0.0–1.0)
    # Binarized at threshold 0.5 for classification comparison
    target = Column(Float, nullable=True)          # raw toxicity score (ground truth)

    # Civil Comments sub-scores (from the CSV)
    severe_toxicity  = Column(Float, nullable=True)
    obscene          = Column(Float, nullable=True)
    threat           = Column(Float, nullable=True)
    insult           = Column(Float, nullable=True)
    identity_attack  = Column(Float, nullable=True)
    sexual_explicit  = Column(Float, nullable=True)

    # Demographics (from Civil Comments identity columns)
    male    = Column(Float, default=0.0)
    female  = Column(Float, default=0.0)
    black   = Column(Float, default=0.0)
    white   = Column(Float, default=0.0)
    asian   = Column(Float, default=0.0)
    latino  = Column(Float, default=0.0)
    christian = Column(Float, default=0.0)
    jewish    = Column(Float, default=0.0)
    muslim    = Column(Float, default=0.0)
    psychiatric_or_mental_illness = Column(Float, default=0.0)
    identity_caste_religion = Column(Float, default=0.0)
    gender_based            = Column(Float, default=0.0)
    threat_group            = Column(Float, default=0.0)

    # LLM evaluation results
    status                   = Column(String, default="pending")  # "pending" | "evaluated"
    predicted_classification = Column(String, nullable=True)       # "Toxic" | "Non-Toxic"
    confidence               = Column(Float, nullable=True)
    tokens_json              = Column(Text, nullable=True)

    file = relationship("UploadedFile", back_populates="evaluations")


def _migrate():
    """
    Safe ALTER TABLE migration for SQLite — adds new columns to existing DBs
    without dropping any data.
    """
    inspector = inspect(engine)
    existing_cols = {c["name"] for c in inspector.get_columns("evaluations")}
    new_cols = {
        "severe_toxicity":  "REAL",
        "obscene":          "REAL",
        "threat":           "REAL",
        "insult":           "REAL",
        "identity_attack":  "REAL",
        "sexual_explicit":  "REAL",
        "christian":        "REAL",
        "jewish":           "REAL",
        "muslim":           "REAL",
        "psychiatric_or_mental_illness": "REAL",
        "identity_caste_religion": "REAL",
        "gender_based":            "REAL",
        "threat_group":            "REAL",
    }
    with engine.connect() as conn:
        for col, dtype in new_cols.items():
            if col not in existing_cols:
                conn.execute(
                    __import__("sqlalchemy").text(f"ALTER TABLE evaluations ADD COLUMN {col} {dtype}")
                )
        conn.commit()


Base.metadata.create_all(bind=engine)
_migrate()
