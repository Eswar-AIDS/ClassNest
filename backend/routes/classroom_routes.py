from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from assessment_excel import remove_excel_source
from attachment_storage import remove_material_files
from database import get_db
from auth import get_current_user
from utils import generate_join_code, require_member, require_teacher
import models, schemas

router = APIRouter(prefix="/classrooms", tags=["Classrooms"])


def classroom_dict(row, role):
    return {**schemas.ClassroomOut.model_validate(row).model_dump(), "role": role}


@router.post("", response_model=schemas.ClassroomOut, status_code=201)
def create(data: schemas.ClassroomCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    room = models.Classroom(**data.model_dump(), join_code=generate_join_code(db), created_by_user_id=user.id)
    db.add(room); db.flush()
    db.add(models.ClassMember(classroom_id=room.id, user_id=user.id, role="teacher"))
    db.commit(); db.refresh(room)
    return classroom_dict(room, "teacher")


@router.post("/join", response_model=schemas.ClassroomOut)
def join(data: schemas.JoinClass, db: Session = Depends(get_db), user=Depends(get_current_user)):
    room = db.query(models.Classroom).filter_by(join_code=data.join_code.strip().upper()).first()
    if not room: raise HTTPException(404, "No classroom uses that join code")
    if room.archived: raise HTTPException(404, "No classroom uses that join code")
    existing = db.query(models.ClassMember).filter_by(classroom_id=room.id, user_id=user.id).first()
    if existing: raise HTTPException(409, "You are already in this class")
    db.add(models.ClassMember(classroom_id=room.id, user_id=user.id, role="student")); db.commit()
    return classroom_dict(room, "student")


@router.get("")
def list_classes(db: Session = Depends(get_db), user=Depends(get_current_user)):
    rows = db.query(models.Classroom, models.ClassMember.role).join(models.ClassMember).filter(models.ClassMember.user_id == user.id, models.Classroom.archived == False).order_by(models.Classroom.created_at.desc()).all()
    classes = [classroom_dict(room, role) for room, role in rows]
    return {
        "teaching": [classroom for classroom in classes if classroom["role"] == "teacher"],
        "learning": [classroom for classroom in classes if classroom["role"] == "student"],
    }


@router.get("/{classroom_id}", response_model=schemas.ClassroomOut)
def detail(classroom_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    room = db.get(models.Classroom, classroom_id)
    if not room: raise HTTPException(404, "Classroom not found")
    member = require_member(db, classroom_id, user.id)
    if room.archived and member.role != "teacher":
        raise HTTPException(404, "Classroom not found")
    return classroom_dict(room, member.role)


@router.put("/{classroom_id}", response_model=schemas.ClassroomOut)
def update(classroom_id: int, data: schemas.ClassroomUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    room = db.get(models.Classroom, classroom_id)
    if not room:
        raise HTTPException(404, "Classroom not found")
    require_teacher(db, classroom_id, user.id)
    if room.archived:
        raise HTTPException(409, "Archived classrooms cannot be edited")
    room.name = data.name.strip()
    room.subject = data.subject.strip()
    room.description = data.description.strip() if data.description else ""
    db.commit()
    db.refresh(room)
    return classroom_dict(room, "teacher")


def classroom_has_attempts(db: Session, classroom_id: int) -> bool:
    test_attempt = (
        db.query(models.TestAttempt.id)
        .join(models.MCQTest)
        .join(models.Unit)
        .filter(models.Unit.classroom_id == classroom_id)
        .first()
    )
    if test_attempt:
        return True
    assessment_attempt = (
        db.query(models.AssessmentAttempt.id)
        .join(models.Assessment)
        .join(models.Unit)
        .filter(models.Unit.classroom_id == classroom_id)
        .first()
    )
    return assessment_attempt is not None


def classroom_material_ids(db: Session, classroom_id: int) -> list[int]:
    return [
        material_id
        for (material_id,) in (
            db.query(models.Material.id)
            .join(models.Unit)
            .filter(models.Unit.classroom_id == classroom_id)
            .all()
        )
    ]


def classroom_assessment_source_files(db: Session, classroom_id: int) -> list[str]:
    return [
        source
        for (source,) in (
            db.query(models.Assessment.source_excel_file)
            .join(models.Unit)
            .filter(models.Unit.classroom_id == classroom_id, models.Assessment.source_excel_file.isnot(None))
            .all()
        )
        if source
    ]


@router.delete("/{classroom_id}")
def delete(classroom_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    room = db.get(models.Classroom, classroom_id)
    if not room:
        raise HTTPException(404, "Classroom not found")
    require_teacher(db, classroom_id, user.id)
    if classroom_has_attempts(db, classroom_id):
        room.archived = True
        room.archived_at = datetime.utcnow()
        db.commit()
        return {"deleted": False, "archived": True}

    material_ids = classroom_material_ids(db, classroom_id)
    source_files = classroom_assessment_source_files(db, classroom_id)
    db.delete(room)
    db.commit()
    for material_id in material_ids:
        remove_material_files(material_id)
    for source in source_files:
        remove_excel_source(source)
    return {"deleted": True, "archived": False}


@router.get("/{classroom_id}/members", response_model=list[schemas.MemberOut])
def members(classroom_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    current_member = require_member(db, classroom_id, user.id)
    rows = db.query(models.ClassMember, models.User).join(models.User).filter(models.ClassMember.classroom_id == classroom_id).all()
    return [{"id": m.id, "user_id": u.id, "name": u.name, "email": u.email if current_member.role == "teacher" or u.id == user.id else "", "role": m.role, "joined_at": m.joined_at} for m, u in rows]


@router.delete("/{classroom_id}/members/{member_id}", status_code=204)
def remove_member(classroom_id: int, member_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    require_teacher(db, classroom_id, user.id)
    member = db.query(models.ClassMember).filter_by(id=member_id, classroom_id=classroom_id).first()
    if not member:
        raise HTTPException(404, "Class member not found")
    if member.user_id == user.id:
        raise HTTPException(400, "You cannot remove yourself from the class")
    db.delete(member)
    db.commit()
    return Response(status_code=204)
