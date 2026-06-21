from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from utils import classroom_for_unit, require_member, require_teacher
from attachment_storage import remove_material_files
from assessment_excel import remove_excel_source
import models, schemas

router = APIRouter(tags=["Units"])


@router.post("/classrooms/{classroom_id}/units", response_model=schemas.UnitOut, status_code=201)
def create(classroom_id: int, data: schemas.UnitCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    require_teacher(db, classroom_id, user.id)
    unit = models.Unit(classroom_id=classroom_id, **data.model_dump()); db.add(unit); db.commit(); db.refresh(unit); return unit


@router.get("/classrooms/{classroom_id}/units", response_model=list[schemas.UnitOut])
def list_units(classroom_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    require_member(db, classroom_id, user.id)
    return db.query(models.Unit).filter_by(classroom_id=classroom_id).order_by(models.Unit.order_number).all()


@router.get("/units/{unit_id}", response_model=schemas.UnitOut)
def detail(unit_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    unit, classroom_id = classroom_for_unit(db, unit_id); require_member(db, classroom_id, user.id); return unit


@router.put("/units/{unit_id}", response_model=schemas.UnitOut)
def update(unit_id: int, data: schemas.UnitCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    unit, classroom_id = classroom_for_unit(db, unit_id); require_teacher(db, classroom_id, user.id)
    for key, value in data.model_dump().items(): setattr(unit, key, value)
    db.commit(); db.refresh(unit); return unit


@router.delete("/units/{unit_id}", status_code=204)
def delete(unit_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    unit, classroom_id = classroom_for_unit(db, unit_id); require_teacher(db, classroom_id, user.id)
    material_ids = [material.id for material in unit.materials]
    assessment_sources = [source for source, in db.query(models.Assessment.source_excel_file).filter_by(unit_id=unit.id).all()]
    db.delete(unit); db.commit()
    for material_id in material_ids:
        remove_material_files(material_id)
    for source in assessment_sources:
        remove_excel_source(source)
    return Response(status_code=204)
