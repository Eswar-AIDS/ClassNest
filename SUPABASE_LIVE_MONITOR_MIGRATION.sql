ALTER TABLE assessment_attempts
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS auto_submit_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS started_email_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS submitted_email_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS left_email_sent BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE assessment_attempts
  ALTER COLUMN status SET DEFAULT 'not_started';

CREATE TABLE IF NOT EXISTS assessment_attempt_events (
  id SERIAL PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id),
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  event_message TEXT NOT NULL,
  event_metadata JSONB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_assessment_attempt_events_attempt_id ON assessment_attempt_events (attempt_id);
CREATE INDEX IF NOT EXISTS ix_assessment_attempt_events_student_id ON assessment_attempt_events (student_id);
CREATE INDEX IF NOT EXISTS ix_assessment_attempt_events_assessment_id ON assessment_attempt_events (assessment_id);
CREATE INDEX IF NOT EXISTS ix_assessment_attempt_events_created_at ON assessment_attempt_events (created_at);

ALTER TABLE assessment_attempt_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
  JOIN pg_class rt ON rt.oid = c.confrelid
  WHERE c.contype = 'f'
    AND t.relname = 'assessment_attempt_events'
    AND a.attname = 'assessment_id'
    AND rt.relname = 'assessments'
    AND c.confdeltype <> 'c'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE assessment_attempt_events DROP CONSTRAINT %I', constraint_name);
    ALTER TABLE assessment_attempt_events
      ADD CONSTRAINT fk_assessment_attempt_events_assessment_id_cascade
      FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE;
  END IF;
END $$;
