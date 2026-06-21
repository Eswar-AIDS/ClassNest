import os
from pathlib import Path

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

DEFAULT_DATABASE_PATH = Path(__file__).resolve().parent / "classnest.db"
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL", f"sqlite:///{DEFAULT_DATABASE_PATH.as_posix()}"
)
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_user_profile_columns():
    """Apply the small additive SQLite migration needed by existing v1 databases."""
    columns = {column["name"] for column in inspect(engine).get_columns("users")}
    with engine.begin() as connection:
        if "bio" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN bio TEXT"))
        if "avatar_url" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500)"))


def ensure_assessment_columns():
    """Keep existing SQLite databases compatible with assessment archiving."""
    inspector = inspect(engine)
    if "assessments" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("assessments")}
    with engine.begin() as connection:
        if "archived" not in columns:
            connection.execute(text("ALTER TABLE assessments ADD COLUMN archived BOOLEAN NOT NULL DEFAULT 0"))
        if "timing_mode" not in columns:
            connection.execute(text("ALTER TABLE assessments ADD COLUMN timing_mode VARCHAR(20) NOT NULL DEFAULT 'timed'"))
        if "starts_at" not in columns:
            connection.execute(text("ALTER TABLE assessments ADD COLUMN starts_at DATETIME"))
        if "ends_at" not in columns:
            connection.execute(text("ALTER TABLE assessments ADD COLUMN ends_at DATETIME"))


def ensure_assessment_attempt_columns():
    """Keep existing SQLite databases compatible with timed attempts."""
    inspector = inspect(engine)
    if "assessment_attempts" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("assessment_attempts")}
    with engine.begin() as connection:
        if "started_at" not in columns:
            connection.execute(text("ALTER TABLE assessment_attempts ADD COLUMN started_at DATETIME"))
        if "expires_at" not in columns:
            connection.execute(text("ALTER TABLE assessment_attempts ADD COLUMN expires_at DATETIME"))


def ensure_unit_columns():
    """Keep existing SQLite databases compatible with active-unit filtering."""
    inspector = inspect(engine)
    if "units" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("units")}
    with engine.begin() as connection:
        if "archived" not in columns:
            connection.execute(text("ALTER TABLE units ADD COLUMN archived BOOLEAN NOT NULL DEFAULT 0"))


def ensure_classroom_columns():
    """Keep existing SQLite databases compatible with classroom archiving."""
    inspector = inspect(engine)
    if "classrooms" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("classrooms")}
    with engine.begin() as connection:
        if "archived" not in columns:
            connection.execute(text("ALTER TABLE classrooms ADD COLUMN archived BOOLEAN NOT NULL DEFAULT 0"))
        if "archived_at" not in columns:
            connection.execute(text("ALTER TABLE classrooms ADD COLUMN archived_at DATETIME"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
