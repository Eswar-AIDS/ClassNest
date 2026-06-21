from statistics import mean

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from routes.test_routes import attempt_output
from utils import require_teacher
import models
import schemas

router = APIRouter(tags=["Results"])
SCORED_STATUSES = {"evaluated", "published"}
SUBMITTED_STATUSES = {"pending_evaluation", "evaluated", "published"}


def percentage(score, total):
    return round((score / total * 100), 2) if total else 0.0


def results_context(db, classroom_id, user_id):
    require_teacher(db, classroom_id, user_id)
    classroom = db.get(models.Classroom, classroom_id)
    if not classroom:
        raise HTTPException(404, "Classroom not found")
    units = (
        db.query(models.Unit)
        .filter(models.Unit.classroom_id == classroom_id, models.Unit.archived == False)
        .order_by(models.Unit.order_number, models.Unit.id)
        .all()
    )
    unit_ids = [unit.id for unit in units]
    assessments = [] if not unit_ids else (
        db.query(models.Assessment)
        .filter(
            models.Assessment.unit_id.in_(unit_ids),
            models.Assessment.archived == False,
            models.Assessment.is_published == True,
        )
        .order_by(models.Assessment.created_at, models.Assessment.id)
        .all()
    )
    assessment_ids = [assessment.id for assessment in assessments]
    attempts = [] if not assessment_ids else (
        db.query(models.AssessmentAttempt)
        .filter(
            models.AssessmentAttempt.assessment_id.in_(assessment_ids),
            models.AssessmentAttempt.status.in_(SUBMITTED_STATUSES),
        )
        .all()
    )
    members = (
        db.query(models.ClassMember)
        .filter_by(classroom_id=classroom_id, role="student")
        .order_by(models.ClassMember.joined_at)
        .all()
    )
    return classroom, units, assessments, attempts, members


def student_identity(member):
    return {
        "student_id": member.user_id,
        "student_name": member.user.name,
        "student_email": member.user.email,
        "joined_at": member.joined_at,
    }


def attempt_row(attempt):
    return {
        "attempt_id": attempt.id,
        "assessment_id": attempt.assessment_id,
        "student_id": attempt.student_id,
        "student_name": attempt.student.name,
        "student_email": attempt.student.email,
        "score": attempt.score,
        "total_marks": attempt.total_marks,
        "percentage": percentage(attempt.score, attempt.total_marks) if attempt.status in SCORED_STATUSES else None,
        "status": attempt.status,
        "publish_status": "published" if attempt.status == "published" else "not_published",
        "submitted_at": attempt.submitted_at,
        "evaluated_at": attempt.evaluated_at,
        "published_at": attempt.published_at,
    }


def aggregate_student_attempts(attempts):
    scored = [attempt for attempt in attempts if attempt.status in SCORED_STATUSES]
    score = sum(attempt.score for attempt in scored)
    total = sum(attempt.total_marks for attempt in scored)
    return {
        "score": round(score, 2),
        "total_marks": round(total, 2),
        "percentage": percentage(score, total) if scored else None,
        "pending_evaluation": sum(attempt.status == "pending_evaluation" for attempt in attempts),
        "published_count": sum(attempt.status == "published" for attempt in attempts),
        "evaluated_count": sum(attempt.status == "evaluated" for attempt in attempts),
    }


def unit_summary(unit, assessments, attempts):
    assessment_ids = {assessment.id for assessment in assessments if assessment.unit_id == unit.id}
    unit_attempts = [attempt for attempt in attempts if attempt.assessment_id in assessment_ids]
    by_student = {}
    for attempt in unit_attempts:
        by_student.setdefault(attempt.student_id, []).append(attempt)
    percentages = [
        summary["percentage"]
        for summary in (aggregate_student_attempts(items) for items in by_student.values())
        if summary["percentage"] is not None
    ]
    return {
        "unit_id": unit.id,
        "unit_title": unit.title,
        "assessment_count": len(assessment_ids),
        "attempt_count": len(unit_attempts),
        "students_attempted": len(by_student),
        "average_percentage": round(mean(percentages), 2) if percentages else 0.0,
        "highest_percentage": max(percentages, default=0.0),
        "lowest_percentage": min(percentages, default=0.0),
        "pending_evaluation": sum(attempt.status == "pending_evaluation" for attempt in unit_attempts),
        "published_count": sum(attempt.status == "published" for attempt in unit_attempts),
    }


@router.get("/results/mine", response_model=list[schemas.AttemptOut])
def mine(db: Session = Depends(get_db), user=Depends(get_current_user)):
    attempts = db.query(models.TestAttempt).filter_by(student_id=user.id).order_by(models.TestAttempt.submitted_at.desc()).all()
    return [attempt_output(item) for item in attempts]


@router.get("/results/attempts/{attempt_id}", response_model=schemas.AttemptOut)
def attempt(attempt_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    item = db.get(models.TestAttempt, attempt_id)
    if not item:
        raise HTTPException(404, "Attempt not found")
    member = db.query(models.ClassMember).filter_by(classroom_id=item.test.unit.classroom_id, user_id=user.id).first()
    if item.student_id != user.id and (not member or member.role != "teacher"):
        raise HTTPException(403, "You cannot view this result")
    return attempt_output(item)


@router.get("/results/classrooms/{classroom_id}", response_model=list[schemas.AttemptOut])
def legacy_classroom_results(classroom_id: int, unit_id: int | None = None, test_id: int | None = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    require_teacher(db, classroom_id, user.id)
    query = db.query(models.TestAttempt).join(models.MCQTest).join(models.Unit).filter(models.Unit.classroom_id == classroom_id)
    if unit_id is not None:
        query = query.filter(models.Unit.id == unit_id)
    if test_id is not None:
        query = query.filter(models.MCQTest.id == test_id)
    return [attempt_output(item) for item in query.order_by(models.TestAttempt.submitted_at.desc()).all()]


@router.get("/classrooms/{classroom_id}/results/overview")
def overview(classroom_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _, units, assessments, attempts, members = results_context(db, classroom_id, user.id)
    by_student = {member.user_id: [] for member in members}
    for attempt in attempts:
        by_student.setdefault(attempt.student_id, []).append(attempt)
    student_performance = []
    for member in members:
        summary = aggregate_student_attempts(by_student.get(member.user_id, []))
        missing = max(0, len(assessments) - len({item.assessment_id for item in by_student.get(member.user_id, [])}))
        student_performance.append({**student_identity(member), **summary, "missing_assessments": missing})
    measured = [item for item in student_performance if item["percentage"] is not None]
    percentages = [item["percentage"] for item in measured]
    attention = [item for item in student_performance if (item["percentage"] is not None and item["percentage"] < 40) or item["missing_assessments"] > 0 or item["pending_evaluation"] > 0]
    assessment_by_id = {item.id: item for item in assessments}
    unit_by_id = {item.id: item for item in units}
    pending_attempts = []
    for item in attempts:
        if item.status != "pending_evaluation":
            continue
        assessment = assessment_by_id[item.assessment_id]
        unit = unit_by_id[assessment.unit_id]
        pending_attempts.append({
            **attempt_row(item),
            "unit_id": unit.id,
            "unit_title": unit.title,
            "assessment_title": assessment.title,
        })
    return {
        "active_units": len(units),
        "total_assessments": len(assessments),
        "active_students": len(members),
        "submitted_attempts": len(attempts),
        "evaluated_attempts": sum(item.status == "evaluated" for item in attempts),
        "published_attempts": sum(item.status == "published" for item in attempts),
        "pending_evaluation": sum(item.status == "pending_evaluation" for item in attempts),
        "class_average_percentage": round(mean(percentages), 2) if percentages else 0.0,
        "highest_percentage": max(percentages, default=0.0),
        "lowest_percentage": min(percentages, default=0.0),
        "top_students": sorted(measured, key=lambda item: item["percentage"], reverse=True)[:5],
        "students_needing_attention": sorted(attention, key=lambda item: (item["percentage"] is None, item["percentage"] or 0))[:10],
        "pending_attempts": sorted(pending_attempts, key=lambda item: item["submitted_at"], reverse=True),
    }


@router.get("/classrooms/{classroom_id}/results/units")
def units_performance(classroom_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _, units, assessments, attempts, _ = results_context(db, classroom_id, user.id)
    return [unit_summary(unit, assessments, attempts) for unit in units]


@router.get("/classrooms/{classroom_id}/results/units/{unit_id}")
def selected_unit_performance(classroom_id: int, unit_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _, units, assessments, attempts, members = results_context(db, classroom_id, user.id)
    unit = next((item for item in units if item.id == unit_id), None)
    if not unit:
        raise HTTPException(404, "Active unit not found")
    unit_assessments = [item for item in assessments if item.unit_id == unit_id]
    ids = {item.id for item in unit_assessments}
    unit_attempts = [item for item in attempts if item.assessment_id in ids]
    students = []
    for member in members:
        items = [item for item in unit_attempts if item.student_id == member.user_id]
        aggregate = aggregate_student_attempts(items)
        if not items:
            status = "not_attempted"
        elif all(item.status == "pending_evaluation" for item in items):
            status = "pending_evaluation"
        elif any(item.status == "evaluated" for item in items):
            status = "evaluated"
        else:
            status = "published"
        students.append({
            **student_identity(member), **aggregate,
            "assessments_attempted": len({item.assessment_id for item in items}),
            "status": status,
            "last_submitted": max((item.submitted_at for item in items if item.submitted_at), default=None),
        })
    return {
        "unit": {"id": unit.id, "title": unit.title, "description": unit.description},
        "assessments": [{"id": item.id, "title": item.title, "total_marks": sum(question.marks for question in item.questions)} for item in unit_assessments],
        "summary": unit_summary(unit, assessments, attempts),
        "students": students,
    }


@router.get("/classrooms/{classroom_id}/results/assessments/{assessment_id}")
def assessment_performance(classroom_id: int, assessment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _, units, assessments, attempts, members = results_context(db, classroom_id, user.id)
    assessment = next((item for item in assessments if item.id == assessment_id), None)
    if not assessment:
        raise HTTPException(404, "Active published assessment not found")
    unit = next(item for item in units if item.id == assessment.unit_id)
    assessment_attempts = [item for item in attempts if item.assessment_id == assessment_id]
    attempt_by_student = {item.student_id: item for item in assessment_attempts}
    scored_percentages = [percentage(item.score, item.total_marks) for item in assessment_attempts if item.status in SCORED_STATUSES]
    rows = []
    for member in members:
        item = attempt_by_student.get(member.user_id)
        rows.append({**student_identity(member), **(attempt_row(item) if item else {
            "attempt_id": None, "assessment_id": assessment.id, "score": None, "total_marks": sum(question.marks for question in assessment.questions),
            "percentage": None, "status": "not_attempted", "publish_status": "not_published", "submitted_at": None,
            "evaluated_at": None, "published_at": None,
        })})
    return {
        "assessment": {"id": assessment.id, "title": assessment.title, "unit_id": unit.id, "unit_title": unit.title, "total_marks": sum(question.marks for question in assessment.questions)},
        "summary": {
            "attempt_count": len(assessment_attempts),
            "class_average_percentage": round(mean(scored_percentages), 2) if scored_percentages else 0.0,
            "highest_percentage": max(scored_percentages, default=0.0),
            "lowest_percentage": min(scored_percentages, default=0.0),
            "published_count": sum(item.status == "published" for item in assessment_attempts),
            "pending_evaluation": sum(item.status == "pending_evaluation" for item in assessment_attempts),
        },
        "attempts": rows,
    }


@router.get("/classrooms/{classroom_id}/results/students/{student_id}")
def student_performance(classroom_id: int, student_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _, units, assessments, attempts, members = results_context(db, classroom_id, user.id)
    member = next((item for item in members if item.user_id == student_id), None)
    if not member:
        raise HTTPException(404, "Student not found in this classroom")
    student_attempts = [item for item in attempts if item.student_id == student_id]
    overall = aggregate_student_attempts(student_attempts)
    unit_rows = []
    for unit in units:
        ids = {item.id for item in assessments if item.unit_id == unit.id}
        items = [item for item in student_attempts if item.assessment_id in ids]
        summary = aggregate_student_attempts(items)
        unit_rows.append({"unit_id": unit.id, "unit_title": unit.title, "assessments_attempted": len(items), **summary, "status": "not_attempted" if not items else "pending_evaluation" if not any(item.status in SCORED_STATUSES for item in items) else "evaluated"})
    assessment_rows = []
    unit_by_id = {item.id: item for item in units}
    for assessment in assessments:
        item = next((attempt for attempt in student_attempts if attempt.assessment_id == assessment.id), None)
        assessment_rows.append({
            "unit_id": assessment.unit_id, "unit_title": unit_by_id[assessment.unit_id].title,
            "assessment_id": assessment.id, "assessment_title": assessment.title,
            **(attempt_row(item) if item else {"attempt_id": None, "score": None, "total_marks": sum(question.marks for question in assessment.questions), "percentage": None, "status": "not_attempted", "publish_status": "not_published", "submitted_at": None, "evaluated_at": None, "published_at": None}),
        })
    return {
        "student": student_identity(member),
        "summary": {**overall, "units_attempted": len({item.assessment.unit_id for item in student_attempts}), "assessments_attempted": len(student_attempts)},
        "unit_breakdown": unit_rows,
        "assessment_breakdown": assessment_rows,
    }
