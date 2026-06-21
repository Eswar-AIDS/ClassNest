# ClassNest Material Attachment Storage Migration

## Overview

ClassNest material attachment uploads have been migrated from local Render filesystem to Supabase Storage. This ensures files persist across deployments in production, while maintaining local storage as a fallback for development environments.

## Problem Solved

- **Before**: Uploaded files were stored locally on Render's ephemeral filesystem and disappeared after restart/redeploy
- **After**: Files are uploaded to Supabase Storage in production; local storage is used only in development
- **Result**: All uploaded material attachments now persist permanently across deployments

## Architecture

### Storage Providers

1. **Supabase Storage** (Production)
   - Used when `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are configured
   - Files stored in bucket: `classnest-uploads`
   - Path format: `materials/{material_id}/{uuid}_{safe_filename}`
   - Example: `materials/2/550e8400_python_notes.pdf`

2. **Local Filesystem** (Development / Fallback)
   - Used when Supabase env vars are missing
   - Files stored in: `backend/uploads/materials/{material_id}/`
   - Useful for local development and testing

### Database Schema Changes

Updated `MaterialAttachment` model with:

```python
storage_provider = Column(String(20), default="local", nullable=False)  # "local" or "supabase"
local_path = Column(String(500), nullable=True)                         # Path for local storage
storage_path = Column(String(500), nullable=True)                       # Path for Supabase storage
```

**Backward Compatibility**: Existing `file_path` column is preserved and migrated to `local_path` automatically.

## Environment Variables Required

Add to your `.env` file in the `backend/` directory:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
SUPABASE_BUCKET=classnest-uploads
```

### How to Get These Values

1. **SUPABASE_URL**: Go to Supabase Project Settings → API → Project URL
2. **SUPABASE_SERVICE_KEY**: Go to Supabase Project Settings → API → Service role secret
   - ⚠️ **CRITICAL**: Keep this key SECRET. Never expose it to frontend or version control.
3. **SUPABASE_BUCKET**: Already set to `classnest-uploads` in storage_service.py

## Installation

### 1. Update Dependencies

The Supabase Python client has been added to `requirements.txt`:

```bash
cd backend
pip install -r requirements.txt
```

### 2. Supabase Setup

Create the storage bucket in Supabase:

```sql
-- In Supabase SQL Editor:
INSERT INTO storage.buckets (id, name, public)
VALUES ('classnest-uploads', 'classnest-uploads', false);
```

Or via Supabase Dashboard:
1. Go to **Storage** → **New Bucket**
2. Name: `classnest-uploads`
3. Set to **Private** (not public)
4. Click **Create**

### 3. Database Migration

The migration runs automatically on startup:

```python
# In main.py, called during app lifespan:
ensure_material_attachment_columns()
```

This adds the new columns to existing databases without data loss:
- `storage_provider` (defaults to "local")
- `local_path` (populated from existing `file_path`)
- `storage_path` (for new Supabase uploads)

**No manual action needed** if using Render or managed hosting.

## How It Works

### Upload Flow

When a teacher uploads a material attachment:

```
1. File validation (format, size, etc.)
2. Check if SUPABASE_URL and SUPABASE_SERVICE_KEY are set
3a. If YES (Production):
    - Upload file bytes to Supabase Storage
    - Store storage_provider="supabase"
    - Store storage_path (e.g., "materials/2/550e8400_python_notes.pdf")
    - DO NOT store to local filesystem
3b. If NO (Development):
    - Save file to local folder: backend/uploads/materials/{material_id}/
    - Store storage_provider="local"
    - Store local_path (relative path from backend root)
4. Create database record with attachment metadata
```

### Download Flow

When a student downloads an attachment:

```
1. Verify user is a member of the classroom (authorization)
2. Fetch attachment record from database
3. Check storage_provider:
   a. If "supabase":
      - Generate signed URL with 5-minute expiry
      - Return 307 redirect to signed URL (preferred)
      - OR download bytes and stream (fallback)
   b. If "local":
      - Verify local file exists
      - If missing: Return 404 with message:
        "File not found on local storage. It may have been lost 
         after deployment. Re-upload the file."
      - If exists: Stream file bytes to client
4. Set proper content-type and filename headers
```

### Delete Flow

When a teacher deletes an attachment:

```
1. Fetch attachment from database
2. Check storage_provider:
   a. If "supabase":
      - Delete object from Supabase bucket
   b. If "local":
      - Delete local file if it exists
3. Delete attachment record from database
4. If storage deletion fails, still delete database record
   (avoids orphaned database records)
```

## Security

✅ **Service Role Key**: Only used on backend; never exposed to frontend
✅ **Authorization**: Downloads require membership verification before granting access
✅ **Signed URLs**: Short expiry (300 seconds / 5 minutes) prevents long-term link sharing
✅ **Private Bucket**: Supabase bucket is private by default
✅ **File Validation**: Extensions and size limits enforced before upload

## Files Changed

### Backend

| File | Change |
|------|--------|
| `backend/requirements.txt` | Added `supabase==2.10.0` |
| `backend/models.py` | Updated `MaterialAttachment` with storage_provider, local_path, storage_path |
| `backend/database.py` | Added `ensure_material_attachment_columns()` migration |
| `backend/main.py` | Added migration call to lifespan |
| `backend/services/storage_service.py` | **NEW** - Core storage abstraction layer |
| `backend/routes/material_routes.py` | Updated to use storage service |
| `backend/attachment_storage.py` | Marked deprecated; delegates to storage service for backward compatibility |

### Frontend

**No changes needed** - Upload and download endpoints work the same way. Existing UI continues to work without modification.

## Testing

### 1. Local Development (Without Supabase)

Leave `.env` without Supabase credentials:

```bash
# backend/.env (no SUPABASE_URL or SUPABASE_SERVICE_KEY)
```

Then:
```bash
cd backend
python -m uvicorn main:app --reload
```

Upload a material and attachment:
- File should be saved to `backend/uploads/materials/{material_id}/`
- Database record should have `storage_provider="local"`
- Download should work from local filesystem

### 2. Production (With Supabase)

Set environment variables:

```bash
# backend/.env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_BUCKET=classnest-uploads
```

Then:
```bash
cd backend
python -m uvicorn main:app --reload
```

Upload a material and attachment:
- File should be uploaded to Supabase Storage
- Database record should have `storage_provider="supabase"`
- Check Supabase Dashboard → Storage → classnest-uploads → See files there
- Download should work via signed URL (may redirect to Supabase or stream bytes)

### 3. Test Cases

#### Test 1: Upload & Download in Development

```bash
# Prerequisites:
# - No Supabase env vars
# - Teacher creates material with attachment

curl -X GET "http://localhost:8000/api/materials/1/attachments/1/download" \
  -H "Authorization: Bearer <token>"
# Should return file bytes
```

#### Test 2: Upload & Download in Production

```bash
# Prerequisites:
# - Supabase env vars configured
# - Teacher creates material with attachment

# Check Supabase console:
# - Go to Storage → classnest-uploads
# - Should see file at materials/1/{uuid}_filename.pdf

curl -X GET "http://localhost:8000/api/materials/1/attachments/1/download" \
  -H "Authorization: Bearer <token>"
# Should return 307 redirect or file bytes
```

#### Test 3: Delete Attachment

```bash
# Teacher deletes attachment
curl -X DELETE "http://localhost:8000/api/materials/1/attachments/1" \
  -H "Authorization: Bearer <token>"

# Check Supabase or local filesystem - file should be gone
```

#### Test 4: Missing File Handling

```bash
# Manually delete file from local filesystem or Supabase
# Then try to download
curl -X GET "http://localhost:8000/api/materials/1/attachments/1/download" \
  -H "Authorization: Bearer <token>"
# Local: Should return 404 with "File not found on local storage..." message
# Supabase: Should return 500 with error message
```

### 4. Render Deployment

1. **Add Render Environment Variables**:
   - Go to Render Dashboard → Service → Environment
   - Add:
     ```
     SUPABASE_URL=https://your-project.supabase.co
     SUPABASE_SERVICE_KEY=your-service-role-key
     SUPABASE_BUCKET=classnest-uploads
     ```
   - Save and re-deploy

2. **Verify on Deployment**:
   - Check Render logs for "✅ Database ready" message
   - Upload a material with attachment
   - Check Supabase Storage Dashboard → classnest-uploads bucket
   - File should appear in `materials/{id}/` folder
   - Download should work
   - Restart Render service
   - Download should still work (file persists!)

## Troubleshooting

### Issue: "Failed to initialize Supabase client"

**Solution**: Check that `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set correctly. The service will fall back to local storage if these are missing.

### Issue: Upload Fails with "500 Internal Server Error"

**Possible Causes**:
- Supabase bucket doesn't exist or isn't named `classnest-uploads`
- Service role key is invalid or expired
- Network connection issue

**Solution**:
1. Verify Supabase bucket exists (Storage → classnest-uploads)
2. Verify service role key is valid (Project Settings → API)
3. Check backend logs for detailed error message
4. Fall back to local storage by unsetting Supabase env vars

### Issue: Download Returns 404

**If using Supabase**:
- File may not have been uploaded successfully
- Storage path may be corrupted in database
- Check Supabase Storage directly: Storage → classnest-uploads

**If using Local Storage**:
- File was lost after deployment (expected on Render free tier)
- Users should re-upload the file
- Message shown: "File not found on local storage. It may have been lost after deployment. Re-upload the file."

### Issue: Signed URL Generation Fails

**Solution**: The system will fall back to streaming file bytes directly instead. Downloads will still work, just slightly slower.

## Migration from Old System

### Existing Attachments

Existing attachments uploaded before this migration:
- Database records are automatically migrated (file_path → local_path)
- `storage_provider` field defaults to "local"
- **On Render**: Files are lost if deployment restarts (expected behavior)
- **Solution**: Teachers must re-upload materials after migration

### No Data Loss

- All database records are preserved
- Historical data is not deleted
- Teachers can see list of old attachments but won't be able to download them if local files are gone

## Performance Notes

- **Supabase Uploads**: ~100ms-500ms depending on file size and network
- **Supabase Downloads**: Instant redirect to signed URL (300 seconds valid)
- **Local Uploads**: ~50ms-200ms (faster, no network)
- **Local Downloads**: ~50ms-200ms streaming (no network latency)

## Future Improvements

- [ ] Batch delete operation for cleanup
- [ ] Supabase CDN caching for faster downloads
- [ ] Bandwidth monitoring and reporting
- [ ] Automatic cleanup of old signed URLs
- [ ] Encryption at rest in Supabase

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review logs in Render or local terminal
3. Verify Supabase bucket and credentials
4. Ensure database migration ran successfully

## API Reference

### Upload Attachment

```http
POST /api/materials/{material_id}/attachments
Content-Type: multipart/form-data

files: [binary file data]
```

### Download Attachment

```http
GET /api/materials/{material_id}/attachments/{attachment_id}/download
Authorization: Bearer {token}
```

### Delete Attachment

```http
DELETE /api/materials/{material_id}/attachments/{attachment_id}
Authorization: Bearer {token}
```

## Summary

✅ Files now persist across Render deployments
✅ Automatic fallback to local storage in development
✅ No UI changes needed
✅ Full backward compatibility
✅ Secure (service key not exposed to frontend)
✅ Easy setup (just add env vars and restart)
