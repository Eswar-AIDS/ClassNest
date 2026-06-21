# Fix: Supabase Storage Schema Migration

## Problem Fixed

**Error**: `null value in column "file_path" of relation "material_attachments" violates not-null constraint`

**Root Cause**: 
- Old schema required `file_path` to always be NOT NULL
- Supabase Storage uploads need `file_path = null` (only `storage_path` is set)
- PostgreSQL was rejecting these uploads

## Solution Implemented

### 1. Database Schema Changes

**The migration automatically:**
- Makes `file_path` nullable (from NOT NULL to nullable)
- Adds `storage_provider` column (tracks "local" or "supabase")
- Adds `local_path` column (for local storage backward compatibility)
- Adds `storage_path` column (for Supabase storage path)
- Migrates existing data to `local_path` for backward compatibility

### 2. Upload Logic Updated

**For Supabase uploads:**
```python
storage_provider = "supabase"
file_path = storage_path  # Set for backward compatibility
storage_path = "materials/{material_id}/{uuid}_{filename}"
local_path = null
```

**For local uploads:**
```python
storage_provider = "local"
file_path = local_path
storage_path = null
local_path = "uploads/materials/{material_id}/..."
```

### 3. Error Handling

- If database commit fails after Supabase upload, files are cleaned up
- Specific error messages for NOT NULL constraint violations
- Logging for debugging

## How to Apply

### Option A: Automatic (Recommended)

The migration runs **automatically on startup**:

```bash
cd backend
python -m uvicorn main:app --reload
```

This will:
1. Connect to your database
2. Check if columns exist
3. Apply missing columns
4. Make `file_path` nullable on PostgreSQL
5. Migrate existing data

**Wait for message**: `✅ Database ready (PostgreSQL)`

### Option B: Manual SQL (For Render)

If the automatic migration fails, run this in **Render Database Console** or **pgAdmin**:

```sql
-- Make file_path nullable
ALTER TABLE material_attachments
ALTER COLUMN file_path DROP NOT NULL;

-- Add new columns
ALTER TABLE material_attachments
ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(20) DEFAULT 'local' NOT NULL;

ALTER TABLE material_attachments
ADD COLUMN IF NOT EXISTS local_path VARCHAR(500);

ALTER TABLE material_attachments
ADD COLUMN IF NOT EXISTS storage_path VARCHAR(500);

-- Migrate existing data
UPDATE material_attachments
SET local_path = file_path,
    storage_provider = 'local'
WHERE local_path IS NULL AND file_path IS NOT NULL;
```

### Accessing Render Database

1. Go to **Render Dashboard** → Your PostgreSQL database
2. Click **Info** tab
3. Scroll to **Connection** → **pgAdmin** link or **psql** command
4. Connect and paste the SQL above

## Testing

After migration:

1. **Upload a material**:
   ```bash
   curl -X POST "http://localhost:8000/api/materials/1" \
     -F "title=Test Material" \
     -F "content_markdown=Test content" \
     -F "files=@/path/to/file.pdf" \
     -H "Authorization: Bearer <token>"
   ```

2. **Check database**:
   ```sql
   SELECT id, storage_provider, file_path, storage_path, local_path
   FROM material_attachments
   LIMIT 1;
   ```
   
   Expected output:
   - Supabase upload: `storage_provider='supabase'`, `storage_path=materials/...`, `local_path=null`
   - Local upload: `storage_provider='local'`, `file_path=uploads/...`, `storage_path=null`

3. **Download attachment**:
   ```bash
   curl -X GET "http://localhost:8000/api/materials/1/attachments/1/download" \
     -H "Authorization: Bearer <token>" \
     -o downloaded_file.pdf
   ```

## Backward Compatibility

✅ **Old records**: Existing uploads still work (migrated to `local_path`, marked as `storage_provider='local'`)
✅ **Code that reads `file_path`**: Still works because we set it
✅ **No data loss**: All existing records preserved

## Files Changed

1. **backend/models.py** - Already had nullable columns
2. **backend/database.py** - Enhanced migration with:
   - `ALTER TABLE file_path DROP NOT NULL`
   - Error handling for SQLite (doesn't support column constraint changes)
   - Data migration with error handling
3. **backend/services/storage_service.py** - Sets `file_path` for backward compatibility
4. **backend/routes/material_routes.py** - Enhanced error handling and cleanup

## Troubleshooting

### Error: "Still getting NOT NULL constraint error"

**Solution**: 
1. Check database is PostgreSQL (not SQLite)
2. Run migration manually:
   ```sql
   ALTER TABLE material_attachments ALTER COLUMN file_path DROP NOT NULL;
   ```
3. Restart backend

### Error: "Column already exists"

**Solution**: Harmless. The `IF NOT EXISTS` clause prevents re-creation. Just restart.

### Error: "Database schema issue: file_path column"

**Solution**: The error message means the schema still needs fixing. Either:
- Run manual SQL migration above
- Wait for automatic migration on next restart
- Check Render logs for migration errors

## Next Steps

1. ✅ Fix deployed
2. Test upload/download in production
3. Monitor Supabase bucket for uploaded files
4. Restart Render service to apply migration
5. Try uploading a material

## SQL Migration File

For reference, see `SUPABASE_STORAGE_MIGRATION.sql` in the root directory.
