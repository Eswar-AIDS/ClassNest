import os
import mimetypes
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timedelta

import aiofiles
from fastapi import HTTPException, UploadFile
from fastapi.responses import StreamingResponse

import models

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "classnest-uploads")

# Local fallback
BACKEND_ROOT = Path(__file__).resolve().parent.parent
UPLOAD_ROOT = BACKEND_ROOT / "uploads" / "materials"
MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_ATTACHMENTS = 5
CHUNK_SIZE = 1024 * 1024

ALLOWED_EXTENSIONS = {
    ".pdf": "pdf",
    ".doc": "word",
    ".docx": "word",
    ".xls": "excel",
    ".xlsx": "excel",
    ".csv": "excel",
    ".jpg": "image",
    ".jpeg": "image",
    ".png": "image",
    ".webp": "image",
}

# Lazy load Supabase client
_supabase_client = None


def get_supabase_client():
    """Get or create Supabase client. Returns None if Supabase is not configured."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None
    
    try:
        from supabase import create_client
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        return _supabase_client
    except Exception as e:
        print(f"⚠️  Failed to initialize Supabase client: {e}")
        return None


def is_supabase_enabled() -> bool:
    """Check if Supabase is properly configured."""
    return get_supabase_client() is not None


def original_file_name(upload: UploadFile) -> str:
    """Extract and validate original filename from upload."""
    name = Path((upload.filename or "").replace("\\", "/")).name.strip()
    if not name:
        raise HTTPException(400, "Every attachment must have a file name")
    return name


def validate_uploads(files: list[UploadFile], existing_count: int = 0) -> list[UploadFile]:
    """Validate file uploads before processing."""
    uploads = [upload for upload in files if upload.filename]
    if existing_count + len(uploads) > MAX_ATTACHMENTS:
        raise HTTPException(400, f"A material can have at most {MAX_ATTACHMENTS} attachments")
    for upload in uploads:
        extension = Path(original_file_name(upload)).suffix.lower()
        if extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(400, f"Unsupported attachment type: {extension or 'no extension'}")
    return uploads


def _make_storage_path_safe(filename: str) -> str:
    """Convert filename to safe format for storage path."""
    import re
    # Remove/replace unsafe characters, keep only alphanumeric, dots, dashes, underscores
    safe_name = re.sub(r'[^\w\-.]', '_', filename)
    # Replace multiple underscores with single underscore
    safe_name = re.sub(r'_+', '_', safe_name)
    return safe_name.strip('_')


async def upload_material_attachment(upload: UploadFile, material_id: int) -> models.MaterialAttachment:
    """
    Upload a material attachment file.
    
    If Supabase is configured: Upload to Supabase Storage
    Otherwise: Save locally for development
    """
    file_name = original_file_name(upload)
    extension = Path(file_name).suffix.lower()
    file_type = ALLOWED_EXTENSIONS[extension]
    stored_file_name = f"{uuid4().hex}{extension}"
    file_size = 0
    
    # Derive MIME type from extension
    mime_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
    
    # Read file content into memory
    file_content = BytesIO()
    try:
        while chunk := await upload.read(CHUNK_SIZE):
            file_size += len(chunk)
            if file_size > MAX_FILE_SIZE:
                raise HTTPException(413, f"{file_name} exceeds the 10 MB file-size limit")
            file_content.write(chunk)
    finally:
        await upload.close()
    
    file_content.seek(0)
    file_bytes = file_content.getvalue()
    
    # Determine storage provider and upload
    supabase = get_supabase_client()
    
    if supabase is not None:
        # Upload to Supabase Storage
        try:
            safe_filename = _make_storage_path_safe(file_name)
            storage_path = f"materials/{material_id}/{uuid4().hex}_{safe_filename}"
            
            # Upload with content-type metadata for proper MIME type handling
            supabase.storage.from_(SUPABASE_BUCKET).upload(
                storage_path,
                file_bytes,
                file_options={"content-type": mime_type}
            )
            
            # For backward compatibility, set file_path to storage_path
            # This way older code that reads file_path will work
            return models.MaterialAttachment(
                material_id=material_id,
                file_name=file_name,
                stored_file_name=stored_file_name,
                file_type=file_type,
                mime_type=mime_type,
                file_size=file_size,
                storage_provider="supabase",
                file_path=storage_path,  # For backward compatibility
                storage_path=storage_path,
            )
        except Exception as e:
            raise HTTPException(500, f"Failed to upload file to Supabase Storage: {str(e)}")
    else:
        # Fallback to local storage for development
        directory = UPLOAD_ROOT / str(material_id)
        directory.mkdir(parents=True, exist_ok=True)
        disk_path = directory / stored_file_name
        
        try:
            async with aiofiles.open(disk_path, "wb") as destination:
                await destination.write(file_bytes)
        except Exception:
            disk_path.unlink(missing_ok=True)
            raise
        
        relative_path = disk_path.relative_to(BACKEND_ROOT).as_posix()
        
        return models.MaterialAttachment(
            material_id=material_id,
            file_name=file_name,
            stored_file_name=stored_file_name,
            file_path=relative_path,
            file_type=file_type,
            mime_type=mime_type,
            file_size=file_size,
            storage_provider="local",
            local_path=relative_path,
        )


async def download_material_attachment(attachment: models.MaterialAttachment):
    """
    Download or stream a material attachment.
    
    If Supabase: Return signed URL or stream bytes
    If local: Return FileResponse or stream bytes
    """
    if attachment.storage_provider == "supabase":
        return await _download_from_supabase(attachment)
    else:
        return await _download_from_local(attachment)


async def _download_from_supabase(attachment: models.MaterialAttachment):
    """Download from Supabase Storage and return streaming response."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(500, "Supabase Storage is not configured")
    
    if not attachment.storage_path:
        raise HTTPException(404, "Attachment storage path is not set")
    
    try:
        # Try to get signed URL for download
        try:
            url = supabase.storage.from_(SUPABASE_BUCKET).create_signed_url(
                attachment.storage_path,
                expires_in=300  # 5 minutes
            )
            # Return redirect to signed URL (Supabase includes content-type from metadata)
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url=url["signedURL"])
        except Exception:
            # If signed URL fails, download bytes and stream
            response = supabase.storage.from_(SUPABASE_BUCKET).download(attachment.storage_path)
            # Use inline for PDFs/images so they open in browser, attachment for others to force download
            disposition = "inline" if attachment.file_type in ("pdf", "image") else "attachment"
            return StreamingResponse(
                iter([response]),
                media_type=attachment.mime_type,
                headers={
                    "Content-Disposition": f'{disposition}; filename="{attachment.file_name}"',
                    "X-Content-Type-Options": "nosniff",
                },
            )
    except Exception as e:
        raise HTTPException(500, f"Failed to download file from Supabase Storage: {str(e)}")


async def _download_from_local(attachment: models.MaterialAttachment):
    """Download from local filesystem."""
    if not attachment.local_path and not attachment.file_path:
        raise HTTPException(404, "Attachment file path is not set")
    
    file_path = attachment.local_path or attachment.file_path
    disk_path = (BACKEND_ROOT / file_path).resolve()
    
    # Security check: ensure path is within upload root
    upload_root = UPLOAD_ROOT.resolve()
    try:
        disk_path.relative_to(upload_root)
    except ValueError:
        raise HTTPException(404, "Attachment file not found")
    
    if not disk_path.is_file():
        raise HTTPException(
            404,
            "File not found on local storage. It may have been lost after deployment. Re-upload the file."
        )
    
    # Stream the file
    async def file_generator():
        async with aiofiles.open(disk_path, "rb") as f:
            while chunk := await f.read(CHUNK_SIZE):
                yield chunk
    
    # Use inline for PDFs/images so they open in browser, attachment for others to force download
    disposition = "inline" if attachment.file_type in ("pdf", "image") else "attachment"
    
    return StreamingResponse(
        file_generator(),
        media_type=attachment.mime_type,
        headers={
            "Content-Disposition": f'{disposition}; filename="{attachment.file_name}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


async def delete_material_attachment(attachment: models.MaterialAttachment) -> None:
    """
    Delete a material attachment from storage.
    
    If Supabase: Delete from Supabase Storage
    If local: Delete local file
    """
    if attachment.storage_provider == "supabase":
        await _delete_from_supabase(attachment)
    else:
        await _delete_from_local(attachment)


async def _delete_from_supabase(attachment: models.MaterialAttachment) -> None:
    """Delete attachment from Supabase Storage."""
    if not attachment.storage_path:
        return  # No path to delete
    
    supabase = get_supabase_client()
    if not supabase:
        return  # Supabase not configured, skip deletion
    
    try:
        supabase.storage.from_(SUPABASE_BUCKET).remove([attachment.storage_path])
    except Exception as e:
        print(f"⚠️  Failed to delete file from Supabase Storage: {str(e)}")
        # Don't raise; allow database record deletion even if file deletion fails


async def _delete_from_local(attachment: models.MaterialAttachment) -> None:
    """Delete attachment from local filesystem."""
    file_path = attachment.local_path or attachment.file_path
    if not file_path:
        return
    
    disk_path = (BACKEND_ROOT / file_path).resolve()
    try:
        disk_path.unlink(missing_ok=True)
        # Try to remove directory if empty
        disk_path.parent.rmdir()
    except Exception:
        pass  # Directory may not be empty or already deleted


async def delete_material_all_attachments(material_id: int) -> None:
    """Delete all attachments for a material."""
    import shutil
    
    # Delete local files
    directory = (UPLOAD_ROOT / str(material_id)).resolve()
    if directory.parent == UPLOAD_ROOT.resolve() and directory.exists():
        try:
            shutil.rmtree(directory)
        except Exception as e:
            print(f"⚠️  Failed to delete local material directory: {str(e)}")
    
    # Supabase objects will be cleaned up when database records are deleted
    # (via cascade delete if attachment records are removed first)
