-- SQL Migration for ClassNest Supabase Storage
-- Run these commands in your PostgreSQL database to fix the schema

-- Make file_path nullable (required for Supabase Storage uploads)
ALTER TABLE material_attachments
ALTER COLUMN file_path DROP NOT NULL;

-- Add new columns for storage provider tracking
ALTER TABLE material_attachments
ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(20) DEFAULT 'local' NOT NULL;

ALTER TABLE material_attachments
ADD COLUMN IF NOT EXISTS local_path VARCHAR(500);

ALTER TABLE material_attachments
ADD COLUMN IF NOT EXISTS storage_path VARCHAR(500);

-- Migrate existing data: copy file_path to local_path for backward compatibility
UPDATE material_attachments
SET local_path = file_path,
    storage_provider = 'local'
WHERE local_path IS NULL AND file_path IS NOT NULL;

-- Verify the schema changes
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'material_attachments'
ORDER BY ordinal_position;
