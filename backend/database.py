import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DEFAULT_DATABASE_PATH = Path(__file__).resolve().parent / "classnest.db"
DATABASE_URL = os.getenv(
    "DATABASE_URL", f"sqlite:///{DEFAULT_DATABASE_PATH.as_posix()}"
)

# Convert postgres:// to postgresql:// for SQLAlchemy compatibility
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Only use connect_args for SQLite
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)

# Log database type on import
def get_db_type():
    if DATABASE_URL.startswith("sqlite"):
        return "SQLite (local)"
    elif DATABASE_URL.startswith("postgresql"):
        return "PostgreSQL"
    else:
        return "Unknown"

DB_TYPE = get_db_type()

@event.listens_for(engine, "connect")
def enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
    # Only enable PRAGMA for SQLite
    if DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_user_profile_columns():
    """Apply additive migration needed by existing v1 databases (works with SQLite and PostgreSQL)."""
    columns = {column["name"] for column in inspect(engine).get_columns("users")}
    with engine.begin() as connection:
        if "bio" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN bio TEXT"))
        if "avatar_url" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500)"))


def ensure_assessment_columns():
    """Keep existing databases compatible with assessment archiving (SQLite and PostgreSQL)."""
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
    """Keep existing databases compatible with timed attempts (SQLite and PostgreSQL)."""
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
    """Keep existing databases compatible with active-unit filtering (SQLite and PostgreSQL)."""
    inspector = inspect(engine)
    if "units" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("units")}
    with engine.begin() as connection:
        if "archived" not in columns:
            connection.execute(text("ALTER TABLE units ADD COLUMN archived BOOLEAN NOT NULL DEFAULT 0"))


def ensure_classroom_columns():
    """Keep existing databases compatible with classroom archiving (SQLite and PostgreSQL)."""
    inspector = inspect(engine)
    if "classrooms" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("classrooms")}
    with engine.begin() as connection:
        if "archived" not in columns:
            connection.execute(text("ALTER TABLE classrooms ADD COLUMN archived BOOLEAN NOT NULL DEFAULT 0"))
        if "archived_at" not in columns:
            connection.execute(text("ALTER TABLE classrooms ADD COLUMN archived_at DATETIME"))


def ensure_material_attachment_columns():
    """Migrate material_attachments for Supabase Storage support (SQLite and PostgreSQL)."""
    inspector = inspect(engine)
    if "material_attachments" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("material_attachments")}
    with engine.begin() as connection:
        # Make file_path nullable to support Supabase Storage uploads (storage_provider="supabase" has file_path=null)
        try:
            if DATABASE_URL.startswith("postgresql"):
                connection.execute(text("ALTER TABLE material_attachments ALTER COLUMN file_path DROP NOT NULL"))
            elif DATABASE_URL.startswith("sqlite"):
                # SQLite doesn't support ALTER COLUMN constraints, this is a schema limitation
                # But SQLite is flexible with NOT NULL, so we just warn
                pass
        except Exception as e:
            print(f"⚠️  Could not alter file_path constraint (may already be nullable): {e}")
        
        if "storage_provider" not in columns:
            connection.execute(text("ALTER TABLE material_attachments ADD COLUMN storage_provider VARCHAR(20) NOT NULL DEFAULT 'local'"))
        if "local_path" not in columns:
            connection.execute(text("ALTER TABLE material_attachments ADD COLUMN local_path VARCHAR(500)"))
        if "storage_path" not in columns:
            connection.execute(text("ALTER TABLE material_attachments ADD COLUMN storage_path VARCHAR(500)"))
        
        # Migrate existing file_path to local_path for backward compatibility
        try:
            existing_local_paths = connection.execute(
                text("SELECT COUNT(*) FROM material_attachments WHERE local_path IS NULL AND file_path IS NOT NULL")
            ).scalar()
            if existing_local_paths and existing_local_paths > 0:
                connection.execute(
                    text("UPDATE material_attachments SET local_path = file_path WHERE local_path IS NULL AND file_path IS NOT NULL")
                )
        except Exception as e:
            print(f"⚠️  Could not migrate existing file_path data: {e}")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
