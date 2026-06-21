import mimetypes
import shutil
from pathlib import Path
from uuid import uuid4

import aiofiles
from fastapi import HTTPException, UploadFile

import models

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
    name = Path((upload.filename or "").replace("\\", "/")).name.strip()
    if not name:
        raise HTTPException(400, "Every attachment must have a file name")
    return name


def validate_uploads(files: list[UploadFile], existing_count: int = 0) -> list[UploadFile]:
    uploads = [upload for upload in files if upload.filename]
    if existing_count + len(uploads) > MAX_ATTACHMENTS:
        raise HTTPException(400, f"A material can have at most {MAX_ATTACHMENTS} attachments")
    for upload in uploads:
        extension = Path(original_file_name(upload)).suffix.lower()
        if extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(400, f"Unsupported attachment type: {extension or 'no extension'}")
    return uploads


async def save_upload(upload: UploadFile, material_id: int) -> models.MaterialAttachment:
    file_name = original_file_name(upload)
    extension = Path(file_name).suffix.lower()
    file_type = ALLOWED_EXTENSIONS[extension]
    stored_file_name = f"{uuid4().hex}{extension}"
    directory = UPLOAD_ROOT / str(material_id)
    directory.mkdir(parents=True, exist_ok=True)
    disk_path = directory / stored_file_name
    file_size = 0

    try:
        async with aiofiles.open(disk_path, "wb") as destination:
            while chunk := await upload.read(CHUNK_SIZE):
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE:
                    raise HTTPException(413, f"{file_name} exceeds the 10 MB file-size limit")
                await destination.write(chunk)
    except Exception:
        disk_path.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()

    relative_path = disk_path.relative_to(BACKEND_ROOT).as_posix()
    # Derive the served MIME type from the validated extension instead of trusting
    # the client-provided Content-Type header.
    mime_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
    return models.MaterialAttachment(
        material_id=material_id,
        file_name=file_name,
        stored_file_name=stored_file_name,
        file_path=relative_path,
        file_type=file_type,
        mime_type=mime_type,
        file_size=file_size,
    )


def attachment_disk_path(attachment: models.MaterialAttachment) -> Path:
    path = (BACKEND_ROOT / attachment.file_path).resolve()
    root = UPLOAD_ROOT.resolve()
    if root not in path.parents:
        raise HTTPException(404, "Attachment file not found")
    return path


def remove_attachment_file(attachment: models.MaterialAttachment) -> None:
    path = attachment_disk_path(attachment)
    path.unlink(missing_ok=True)
    try:
        path.parent.rmdir()
    except OSError:
        pass


def remove_material_files(material_id: int) -> None:
    directory = (UPLOAD_ROOT / str(material_id)).resolve()
    if directory.parent == UPLOAD_ROOT.resolve() and directory.exists():
        shutil.rmtree(directory)
