from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from attachment_storage import (
    attachment_disk_path,
    remove_attachment_file,
    remove_material_files,
    save_upload,
    validate_uploads,
)
from auth import get_current_user
from database import get_db
from utils import classroom_for_unit, require_member, require_teacher
import models
import schemas

router = APIRouter(tags=["Materials"])


@router.post("/units/{unit_id}/materials", response_model=schemas.MaterialOut, status_code=201)
def create(unit_id: int, data: schemas.MaterialInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Keep the original JSON material endpoint for backward compatibility."""
    _, classroom_id = classroom_for_unit(db, unit_id)
    require_teacher(db, classroom_id, user.id)
    item = models.Material(unit_id=unit_id, created_by_user_id=user.id, **data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post("/materials/{unit_id}", response_model=schemas.MaterialOut, status_code=201)
async def create_with_attachments(
    unit_id: int,
    title: str = Form(...),
    content_markdown: str = Form(...),
    resource_url: str | None = Form(None),
    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _, classroom_id = classroom_for_unit(db, unit_id)
    require_teacher(db, classroom_id, user.id)
    clean_title = title.strip()
    if not clean_title or len(clean_title) > 200:
        raise HTTPException(400, "Material title must contain between 1 and 200 characters")
    if not content_markdown.strip():
        raise HTTPException(400, "Material description is required")
    uploads = validate_uploads(files)
    clean_url = resource_url.strip() if resource_url else None

    item = models.Material(
        unit_id=unit_id,
        title=clean_title,
        type="markdown",
        content_markdown=content_markdown,
        resource_url=clean_url or None,
        created_by_user_id=user.id,
    )
    db.add(item)
    db.flush()

    try:
        for upload in uploads:
            db.add(await save_upload(upload, item.id))
        db.commit()
        db.refresh(item)
        return item
    except Exception:
        db.rollback()
        remove_material_files(item.id)
        raise


@router.get("/units/{unit_id}/materials", response_model=list[schemas.MaterialOut])
def list_materials(unit_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _, classroom_id = classroom_for_unit(db, unit_id)
    require_member(db, classroom_id, user.id)
    return db.query(models.Material).filter_by(unit_id=unit_id).order_by(models.Material.created_at).all()


@router.get("/materials/{material_id}", response_model=schemas.MaterialOut)
def detail(material_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    item = db.get(models.Material, material_id)
    if not item:
        raise HTTPException(404, "Material not found")
    require_member(db, item.unit.classroom_id, user.id)
    return item


@router.get("/materials/{material_id}/attachments/{attachment_id}/download")
def download_attachment(material_id: int, attachment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    item = db.get(models.Material, material_id)
    if not item:
        raise HTTPException(404, "Material not found")
    require_member(db, item.unit.classroom_id, user.id)
    attachment = db.query(models.MaterialAttachment).filter_by(id=attachment_id, material_id=material_id).first()
    if not attachment:
        raise HTTPException(404, "Attachment not found")
    path = attachment_disk_path(attachment)
    if not path.is_file():
        raise HTTPException(404, "Attachment file not found")
    return FileResponse(
        path,
        media_type=attachment.mime_type,
        filename=attachment.file_name,
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.delete("/materials/{material_id}/attachments/{attachment_id}", status_code=204)
def delete_attachment(material_id: int, attachment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    item = db.get(models.Material, material_id)
    if not item:
        raise HTTPException(404, "Material not found")
    require_teacher(db, item.unit.classroom_id, user.id)
    attachment = db.query(models.MaterialAttachment).filter_by(id=attachment_id, material_id=material_id).first()
    if not attachment:
        raise HTTPException(404, "Attachment not found")
    remove_attachment_file(attachment)
    db.delete(attachment)
    db.commit()
    return Response(status_code=204)


@router.post("/materials/{material_id}/attachments", response_model=schemas.MaterialOut, status_code=201)
async def add_attachments(
    material_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    item = db.get(models.Material, material_id)
    if not item:
        raise HTTPException(404, "Material not found")
    require_teacher(db, item.unit.classroom_id, user.id)
    uploads = validate_uploads(files, existing_count=len(item.attachments))
    if not uploads:
        raise HTTPException(400, "Choose at least one attachment")
    saved = []
    try:
        for upload in uploads:
            attachment = await save_upload(upload, item.id)
            saved.append(attachment)
            db.add(attachment)
        db.commit()
        db.refresh(item)
        return item
    except Exception:
        db.rollback()
        for attachment in saved:
            remove_attachment_file(attachment)
        raise


@router.put("/materials/{material_id}", response_model=schemas.MaterialOut)
def update(material_id: int, data: schemas.MaterialInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    item = db.get(models.Material, material_id)
    if not item:
        raise HTTPException(404, "Material not found")
    require_teacher(db, item.unit.classroom_id, user.id)
    for key, value in data.model_dump().items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/materials/{material_id}", status_code=204)
def delete(material_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    item = db.get(models.Material, material_id)
    if not item:
        raise HTTPException(404, "Material not found")
    require_teacher(db, item.unit.classroom_id, user.id)
    db.delete(item)
    db.commit()
    remove_material_files(material_id)
    return Response(status_code=204)
