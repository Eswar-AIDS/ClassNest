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
    boolean_default = "FALSE" if DATABASE_URL.startswith("postgresql") else "0"
    with engine.begin() as connection:
        if "status" not in columns:
            connection.execute(text("ALTER TABLE assessment_attempts ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'not_started'"))
        if "started_at" not in columns:
            connection.execute(text("ALTER TABLE assessment_attempts ADD COLUMN started_at DATETIME"))
        if "expires_at" not in columns:
            connection.execute(text("ALTER TABLE assessment_attempts ADD COLUMN expires_at DATETIME"))
        if "submitted_at" not in columns:
            connection.execute(text("ALTER TABLE assessment_attempts ADD COLUMN submitted_at DATETIME"))
        if "auto_submit_reason" not in columns:
            connection.execute(text("ALTER TABLE assessment_attempts ADD COLUMN auto_submit_reason TEXT"))
        if "last_activity_at" not in columns:
            connection.execute(text("ALTER TABLE assessment_attempts ADD COLUMN last_activity_at DATETIME"))
        if "ended_at" not in columns:
            connection.execute(text("ALTER TABLE assessment_attempts ADD COLUMN ended_at DATETIME"))
        if "started_email_sent" not in columns:
            connection.execute(text(f"ALTER TABLE assessment_attempts ADD COLUMN started_email_sent BOOLEAN NOT NULL DEFAULT {boolean_default}"))
        if "submitted_email_sent" not in columns:
            connection.execute(text(f"ALTER TABLE assessment_attempts ADD COLUMN submitted_email_sent BOOLEAN NOT NULL DEFAULT {boolean_default}"))
        if "left_email_sent" not in columns:
            connection.execute(text(f"ALTER TABLE assessment_attempts ADD COLUMN left_email_sent BOOLEAN NOT NULL DEFAULT {boolean_default}"))


def ensure_assessment_attempt_events_table():
    """Create focus-mode event log table for existing databases."""
    inspector = inspect(engine)
    postgres = DATABASE_URL.startswith("postgresql")
    id_type = "SERIAL PRIMARY KEY" if postgres else "INTEGER PRIMARY KEY"
    metadata_type = "JSONB" if postgres else "JSON"
    timestamp_type = "TIMESTAMP" if postgres else "DATETIME"
    with engine.begin() as connection:
        if "assessment_attempt_events" not in inspector.get_table_names():
            connection.execute(text(f"""
                CREATE TABLE assessment_attempt_events (
                    id {id_type},
                    attempt_id INTEGER NOT NULL,
                    student_id INTEGER NOT NULL,
                    assessment_id INTEGER NOT NULL,
                    event_type VARCHAR(40) NOT NULL,
                    event_message TEXT NOT NULL,
                    event_metadata {metadata_type},
                    created_at {timestamp_type} NOT NULL,
                    FOREIGN KEY(attempt_id) REFERENCES assessment_attempts(id) ON DELETE CASCADE,
                    FOREIGN KEY(student_id) REFERENCES users(id),
                    FOREIGN KEY(assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
                )
            """))
            connection.execute(text("CREATE INDEX ix_assessment_attempt_events_attempt_id ON assessment_attempt_events (attempt_id)"))
            connection.execute(text("CREATE INDEX ix_assessment_attempt_events_student_id ON assessment_attempt_events (student_id)"))
            connection.execute(text("CREATE INDEX ix_assessment_attempt_events_assessment_id ON assessment_attempt_events (assessment_id)"))
            connection.execute(text("CREATE INDEX ix_assessment_attempt_events_created_at ON assessment_attempt_events (created_at)"))
        if postgres:
            connection.execute(text("ALTER TABLE assessment_attempt_events ENABLE ROW LEVEL SECURITY"))


def ensure_assessment_cascade_constraints():
    """Ensure existing PostgreSQL assessment child tables cascade at the database layer."""
    if not DATABASE_URL.startswith("postgresql"):
        return
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    required = [
        ("assessment_questions", "assessment_id", "assessments", "id"),
        ("assessment_answer_keys", "question_id", "assessment_questions", "id"),
        ("assessment_attempts", "assessment_id", "assessments", "id"),
        ("assessment_responses", "attempt_id", "assessment_attempts", "id"),
        ("assessment_responses", "question_id", "assessment_questions", "id"),
        ("assessment_attempt_events", "attempt_id", "assessment_attempts", "id"),
        ("assessment_attempt_events", "assessment_id", "assessments", "id"),
    ]
    with engine.begin() as connection:
        for table, column, referred_table, referred_column in required:
            if table not in tables or referred_table not in tables:
                continue
            constraint = connection.execute(text("""
                SELECT c.conname, c.confdeltype
                FROM pg_constraint c
                JOIN pg_class t ON t.oid = c.conrelid
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
                JOIN pg_class rt ON rt.oid = c.confrelid
                WHERE c.contype = 'f'
                  AND t.relname = :table
                  AND a.attname = :column
                  AND rt.relname = :referred_table
                LIMIT 1
            """), {"table": table, "column": column, "referred_table": referred_table}).mappings().first()
            if constraint and constraint["confdeltype"] == "c":
                continue
            if constraint:
                connection.execute(text(f'ALTER TABLE {table} DROP CONSTRAINT {constraint["conname"]}'))
            connection.execute(text(f"""
                ALTER TABLE {table}
                ADD CONSTRAINT fk_{table}_{column}_cascade
                FOREIGN KEY ({column}) REFERENCES {referred_table}({referred_column}) ON DELETE CASCADE
            """))
        if "email_notifications" in tables:
            constraint = connection.execute(text("""
                SELECT c.conname, c.confdeltype
                FROM pg_constraint c
                JOIN pg_class t ON t.oid = c.conrelid
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
                JOIN pg_class rt ON rt.oid = c.confrelid
                WHERE c.contype = 'f'
                  AND t.relname = 'email_notifications'
                  AND a.attname = 'assessment_id'
                  AND rt.relname = 'assessments'
                LIMIT 1
            """)).mappings().first()
            if constraint and constraint["confdeltype"] != "n":
                connection.execute(text(f'ALTER TABLE email_notifications DROP CONSTRAINT {constraint["conname"]}'))
                constraint = None
            if not constraint:
                connection.execute(text("""
                    ALTER TABLE email_notifications
                    ADD CONSTRAINT fk_email_notifications_assessment_id_set_null
                    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE SET NULL
                """))


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
