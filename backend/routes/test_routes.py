from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from utils import classroom_for_test, classroom_for_unit, membership, require_member, require_teacher
import models, schemas

router = APIRouter(tags=["MCQ Tests"])


def visible_test(test, db, user_id):
    member = require_member(db, test.unit.classroom_id, user_id)
    if member.role != "teacher" and not test.is_published:
        raise HTTPException(404, "Test not found")
    return member


def serialize_test(test, teacher: bool):
    data = schemas.TestOut.model_validate(test).model_dump()
    if not teacher:
        for question in data["questions"]:
            question["correct_option"] = None
            question["explanation"] = None
    return data


@router.post("/units/{unit_id}/tests", response_model=schemas.TestOut, status_code=201)
def create(unit_id: int, data: schemas.TestInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _, classroom_id = classroom_for_unit(db, unit_id); require_teacher(db, classroom_id, user.id)
    test = models.MCQTest(unit_id=unit_id, created_by_user_id=user.id, **data.model_dump()); db.add(test); db.commit(); db.refresh(test); return test


@router.get("/units/{unit_id}/tests", response_model=list[schemas.TestOut])
def list_tests(unit_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _, classroom_id = classroom_for_unit(db, unit_id); member = require_member(db, classroom_id, user.id)
    query = db.query(models.MCQTest).filter_by(unit_id=unit_id)
    if member.role != "teacher": query = query.filter_by(is_published=True)
    return [serialize_test(test, member.role == "teacher") for test in query.order_by(models.MCQTest.created_at).all()]


@router.get("/tests/{test_id}", response_model=schemas.TestOut)
def detail(test_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    test, _ = classroom_for_test(db, test_id); member = visible_test(test, db, user.id)
    return serialize_test(test, member.role == "teacher")


@router.put("/tests/{test_id}", response_model=schemas.TestOut)
def update(test_id: int, data: schemas.TestInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    test, classroom_id = classroom_for_test(db, test_id); require_teacher(db, classroom_id, user.id)
    for key, value in data.model_dump().items(): setattr(test, key, value)
    db.commit(); db.refresh(test); return test


@router.delete("/tests/{test_id}", status_code=204)
def delete(test_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    test, classroom_id = classroom_for_test(db, test_id); require_teacher(db, classroom_id, user.id)
    db.delete(test); db.commit(); return Response(status_code=204)


@router.post("/tests/{test_id}/questions", response_model=schemas.QuestionOut, status_code=201)
def add_question(test_id: int, data: schemas.QuestionInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _, classroom_id = classroom_for_test(db, test_id); require_teacher(db, classroom_id, user.id)
    question = models.MCQQuestion(test_id=test_id, **data.model_dump()); db.add(question); db.commit(); db.refresh(question); return question


@router.put("/questions/{question_id}", response_model=schemas.QuestionOut)
def update_question(question_id: int, data: schemas.QuestionInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    question = db.get(models.MCQQuestion, question_id)
    if not question: raise HTTPException(404, "Question not found")
    require_teacher(db, question.test.unit.classroom_id, user.id)
    for key, value in data.model_dump().items(): setattr(question, key, value)
    db.commit(); db.refresh(question); return question


@router.delete("/questions/{question_id}", status_code=204)
def delete_question(question_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    question = db.get(models.MCQQuestion, question_id)
    if not question: raise HTTPException(404, "Question not found")
    require_teacher(db, question.test.unit.classroom_id, user.id); db.delete(question); db.commit(); return Response(status_code=204)


@router.post("/tests/{test_id}/submit", response_model=schemas.AttemptOut, status_code=201)
def submit(test_id: int, data: schemas.AttemptInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    test, classroom_id = classroom_for_test(db, test_id)
    member = require_member(db, classroom_id, user.id)
    if member.role != "student": raise HTTPException(403, "Only students can submit tests")
    if not test.is_published: raise HTTPException(403, "This test is not published")
    submitted = {answer.question_id: answer.selected_option for answer in data.answers}
    valid_ids = {q.id for q in test.questions}
    if not set(submitted).issubset(valid_ids): raise HTTPException(400, "An answer does not belong to this test")
    total = sum(q.marks for q in test.questions); score = sum(q.marks for q in test.questions if submitted.get(q.id) == q.correct_option)
    attempt = models.TestAttempt(test_id=test.id, student_id=user.id, score=score, total_marks=total); db.add(attempt); db.flush()
    for q in test.questions:
        selected = submitted.get(q.id)
        db.add(models.TestAnswer(attempt_id=attempt.id, question_id=q.id, selected_option=selected, is_correct=selected == q.correct_option))
    db.commit(); db.refresh(attempt)
    return attempt_output(attempt)


def attempt_output(attempt):
    return {"id": attempt.id, "test_id": attempt.test_id, "test_title": attempt.test.title, "student_id": attempt.student_id, "student_name": attempt.student.name, "score": attempt.score, "total_marks": attempt.total_marks, "submitted_at": attempt.submitted_at, "answers": [{"question_id": a.question_id, "question": a.question.question, "selected_option": a.selected_option, "correct_option": a.question.correct_option, "is_correct": a.is_correct, "explanation": a.question.explanation} for a in attempt.answers]}
