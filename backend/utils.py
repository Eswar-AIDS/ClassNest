import secrets
import string
from fastapi import HTTPException
from sqlalchemy.orm import Session
import models


def generate_join_code(db: Session) -> str:
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(7))
        if not db.query(models.Classroom).filter_by(join_code=code).first():
            return code


def membership(db: Session, classroom_id: int, user_id: int):
    return db.query(models.ClassMember).filter_by(classroom_id=classroom_id, user_id=user_id).first()


def require_member(db: Session, classroom_id: int, user_id: int):
    member = membership(db, classroom_id, user_id)
    if not member:
        raise HTTPException(403, "You are not a member of this classroom")
    return member


def require_teacher(db: Session, classroom_id: int, user_id: int):
    member = require_member(db, classroom_id, user_id)
    if member.role != "teacher":
        raise HTTPException(403, "Teacher access required")
    return member


def classroom_for_unit(db: Session, unit_id: int):
    unit = db.get(models.Unit, unit_id)
    if not unit:
        raise HTTPException(404, "Unit not found")
    return unit, unit.classroom_id


def classroom_for_test(db: Session, test_id: int):
    test = db.get(models.MCQTest, test_id)
    if not test:
        raise HTTPException(404, "Test not found")
    return test, test.unit.classroom_id


def classroom_for_assessment(db: Session, assessment_id: int):
    assessment = db.get(models.Assessment, assessment_id)
    if not assessment:
        raise HTTPException(404, "Assessment not found")
    return assessment, assessment.unit.classroom_id
