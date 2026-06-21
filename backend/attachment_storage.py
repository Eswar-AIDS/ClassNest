"""
DEPRECATED: This module is kept for backward compatibility only.
New code should use services/storage_service.py instead.

This module remains for any legacy code that may still depend on it.
The storage service automatically handles Supabase Storage for production
and local storage fallback for development.
"""

import mimetypes
import shutil
from pathlib import Path
from uuid import uuid4

import aiofiles
from fastapi import HTTPException, UploadFile

import models
from services.storage_service import (
    upload_material_attachment,
    delete_material_attachment,
    delete_material_all_attachments,
    is_supabase_enabled,
)

# Local storage paths (fallback)
BACKEND_ROOT = Path(__file__).resolve().parent
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


async def save_upload(upload: UploadFile, material_id: int) -> models.MaterialAttachment:
    """DEPRECATED: Use storage_service.upload_material_attachment() instead."""
    return await upload_material_attachment(upload, material_id)


def attachment_disk_path(attachment: models.MaterialAttachment) -> Path:
    """
    Get the disk path for a local attachment.
    Returns the resolved path for local storage only.
    """
    file_path = attachment.local_path or attachment.file_path
    if not file_path:
        raise HTTPException(404, "Attachment file path is not set")
    
    path = (BACKEND_ROOT / file_path).resolve()
    root = UPLOAD_ROOT.resolve()
    try:
        path.relative_to(root)
    except ValueError:
        raise HTTPException(404, "Attachment file not found")
    return path


def remove_attachment_file(attachment: models.MaterialAttachment) -> None:
    """DEPRECATED: Use storage_service.delete_material_attachment() instead."""
    import asyncio
    try:
        asyncio.run(delete_material_attachment(attachment))
    except RuntimeError:
        # If already in async context, just do local cleanup
        path = (BACKEND_ROOT / (attachment.local_path or attachment.file_path or "")).resolve()
        try:
            path.unlink(missing_ok=True)
            path.parent.rmdir()
        except OSError:
            pass


def remove_material_files(material_id: int) -> None:
    """DEPRECATED: Use storage_service.delete_material_all_attachments() instead."""
    import asyncio
    try:
        asyncio.run(delete_material_all_attachments(material_id))
    except RuntimeError:
        # If already in async context, just do local cleanup
        directory = (UPLOAD_ROOT / str(material_id)).resolve()
        if directory.parent == UPLOAD_ROOT.resolve() and directory.exists():
            shutil.rmtree(directory)

