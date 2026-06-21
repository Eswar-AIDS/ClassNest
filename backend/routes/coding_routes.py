from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from coding_runner import run_python_code
from database import get_db
from utils import require_member
import models
import schemas

router = APIRouter(tags=["Coding"])


@router.post("/coding/run", response_model=schemas.CodingRunOut)
def run_code(data: schemas.CodingRunInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    question = db.get(models.AssessmentQuestion, data.question_id)
    if not question or question.question_type != "CODING":
        raise HTTPException(404, "Coding question not found")
    assessment = question.assessment
    member = require_member(db, assessment.unit.classroom_id, user.id)
    if member.role != "teacher" and (not assessment.is_published or assessment.archived):
        raise HTTPException(404, "Coding question not found")
    return run_python_code(data.code, question.visible_test_cases)
