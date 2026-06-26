import logging
import time
from datetime import datetime, timedelta, timezone
from html import escape
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import delete
from sqlalchemy.orm import Session, joinedload, selectinload

from assessment_answerkey_import import (
    import_answer_key_for_assessment,
    parse_answer_key_workbook,
    read_answer_key_upload,
)
from assessment_excel import parse_workbook, read_excel_upload, remove_excel_source, store_excel_source
from auth import get_current_user
from database import get_db
from services.email_service import send_email
from utils import classroom_for_assessment, classroom_for_unit, require_member, require_teacher
import models
import schemas

router = APIRouter(tags=["Assessments"])
logger = logging.getLogger(__name__)

NON_WARNING_EVENT_TYPES = {"assessment_started", "assessment_submitted", "auto_submitted_on_leave", "fullscreen_enabled", "returned_to_assessment"}
IMPORTANT_EMAIL_EVENTS = {
    "assessment_started": ("started_email_sent", "Student started assessment: {assessment_title}"),
    "assessment_submitted": ("submitted_email_sent", "Student submitted assessment: {assessment_title}"),
    "auto_submitted_on_leave": ("left_email_sent", "Student left assessment halfway: {assessment_title}"),
}


def cleanup_assessment_source(source, assessment_id):
    if not source:
        logger.info("Assessment delete storage cleanup skipped assessment_id=%s reason=no_source", assessment_id)
        return
    cleanup_start = time.perf_counter()
    try:
        remove_excel_source(source)
        elapsed_ms = round((time.perf_counter() - cleanup_start) * 1000, 2)
        logger.info("Assessment delete storage cleanup completed assessment_id=%s elapsed_ms=%s", assessment_id, elapsed_ms)
    except Exception:
        elapsed_ms = round((time.perf_counter() - cleanup_start) * 1000, 2)
        logger.exception("Assessment delete storage cleanup failed assessment_id=%s elapsed_ms=%s", assessment_id, elapsed_ms)


def base_output(assessment, question_count=None):
    uses_duration = assessment.timing_mode in {"timed", "timed_deadline"}
    return {
        "id": assessment.id, "unit_id": assessment.unit_id, "title": assessment.title,
        "description": assessment.description,
        "timing_mode": assessment.timing_mode,
        "duration_minutes": assessment.duration_minutes if uses_duration else None,
        "starts_at": assessment.starts_at,
        "ends_at": assessment.ends_at,
        "is_published": assessment.is_published,
        "is_accepting_responses": assessment.is_accepting_responses,
        "results_published": assessment.results_published,
        "archived": assessment.archived,
        "question_count": question_count if question_count is not None else len(assessment.questions),
        "created_at": assessment.created_at,
    }


def dashboard_stats(db, assessment):
    classroom_id = assessment.unit.classroom_id
    total_students = db.query(models.ClassMember).filter_by(classroom_id=classroom_id, role="student").count()
    attempts = db.query(models.AssessmentAttempt.status).filter(
        models.AssessmentAttempt.assessment_id == assessment.id,
        models.AssessmentAttempt.status != "in_progress",
    ).all()
    statuses = [status for (status,) in attempts]
    return {
        "total_students": total_students,
        "submitted_count": len(statuses),
        "pending_count": sum(status == "pending_evaluation" for status in statuses),
        "evaluated_count": sum(status == "evaluated" for status in statuses),
        "published_count": sum(status == "published" for status in statuses),
    }


def question_output(question):
    return schemas.AssessmentQuestionOut.model_validate(question).model_dump()


def teacher_question_output(question):
    return {
        **question_output(question),
        "case_sensitive": question.case_sensitive,
        "answer_key": (
            schemas.AssessmentAnswerKeyOut.model_validate(question.answer_key).model_dump()
            if question.answer_key else None
        ),
    }


def response_status(response):
    question = response.question
    has_answer = any(
        value is not None and str(value).strip()
        for value in (response.selected_option, response.text_answer, response.code_answer)
    )
    if not has_answer:
        return "not_answered"
    if question.question_type == "MCQ":
        correct_answer = (
            (question.answer_key.correct_answer or "").strip().upper()
            if question.answer_key else ""
        )
        if correct_answer not in {"A", "B", "C", "D"}:
            return "answer_key_missing"
    elif question.question_type == "FILLUP":
        if not question.answer_key or not (question.answer_key.correct_answer or "").strip():
            return "answer_key_missing"
    elif (
        response.is_correct is None
        and response.feedback in {
            None,
            "",
            "Coding answer requires teacher review.",
            "Manual coding review required",
        }
    ):
        return "needs_review"
    if response.is_correct is True:
        return "correct"
    if response.is_correct is False:
        return "incorrect"
    return "needs_review"


def evaluation_blocking_statuses(attempt):
    return [
        response_status(response)
        for response in attempt.responses
        if response_status(response) in {"needs_review", "answer_key_missing"}
    ]


def attempt_can_publish(attempt):
    return attempt.status != "published" and not evaluation_blocking_statuses(attempt)


def attempt_is_fully_evaluated(attempt):
    return attempt.status == "published" or not evaluation_blocking_statuses(attempt)


def response_output(response, include_hidden_test_cases=False):
    output = {
        "id": response.id, "question_id": response.question_id,
        "question_type": response.question.question_type,
        "question_text": response.question.question_text,
        "selected_option": response.selected_option, "text_answer": response.text_answer,
        "code_answer": response.code_answer, "awarded_marks": response.awarded_marks,
        "max_marks": response.question.marks, "is_correct": response.is_correct,
        "response_status": response_status(response),
        "feedback": response.feedback,
        "correct_answer": response.question.answer_key.correct_answer if response.question.answer_key else None,
        "accepted_answers": response.question.answer_key.accepted_answers if response.question.answer_key else None,
        "explanation": response.question.answer_key.explanation if response.question.answer_key else None,
    }
    if include_hidden_test_cases:
        output["hidden_test_cases"] = (
            response.question.answer_key.hidden_test_cases if response.question.answer_key else None
        )
    return output


def attempt_output(attempt):
    remaining_count = len(evaluation_blocking_statuses(attempt))
    warning_events = [
        event for event in attempt.events
        if event.event_type not in NON_WARNING_EVENT_TYPES
    ]
    warning_count = len(warning_events)
    last_warning_at = max((event.created_at for event in warning_events), default=None)
    return {
        "id": attempt.id, "student_id": attempt.student_id, "student_name": attempt.student.name,
        "student_email": attempt.student.email,
        "status": attempt.status,
        "can_publish_result": attempt_can_publish(attempt),
        "evaluation_remaining_count": remaining_count,
        "score": attempt.score, "total_marks": attempt.total_marks,
        "started_at": attempt.started_at, "expires_at": attempt.expires_at,
        "submitted_at": attempt.submitted_at, "evaluated_at": attempt.evaluated_at,
        "published_at": attempt.published_at,
        "auto_submit_reason": attempt.auto_submit_reason,
        "warning_count": warning_count,
        "last_warning_at": last_warning_at,
        "focus_status": "suspicious" if warning_count >= 3 else "warnings" if warning_count else "clean",
        "responses": [response_output(response, include_hidden_test_cases=True) for response in attempt.responses],
    }


def student_assessment_output(assessment, attempt=None):
    return {
        **base_output(assessment),
        "questions": [question_output(question) for question in assessment.questions],
        "attempt_id": attempt.id if attempt else None,
        "attempt_status": attempt.status if attempt else None,
        "attempt_started_at": attempt.started_at if attempt else None,
        "attempt_expires_at": final_attempt_deadline(assessment, attempt) if attempt else None,
    }


def event_output(event):
    return {
        "id": event.id,
        "attempt_id": event.attempt_id,
        "student_id": event.student_id,
        "assessment_id": event.assessment_id,
        "event_type": event.event_type,
        "event_message": event.event_message,
        "metadata": event.event_metadata,
        "created_at": event.created_at,
    }


def create_attempt_event(db, attempt, event_type, event_message, metadata=None):
    attempt.last_activity_at = datetime.utcnow()
    event = models.AssessmentAttemptEvent(
        attempt_id=attempt.id,
        student_id=attempt.student_id,
        assessment_id=attempt.assessment_id,
        event_type=event_type,
        event_message=event_message,
        event_metadata=metadata,
    )
    db.add(event)
    return event


def teacher_recipient_for_assessment(db, assessment):
    teacher = db.get(models.User, assessment.created_by_user_id)
    if teacher and teacher.email:
        return teacher
    member = (
        db.query(models.ClassMember)
        .filter_by(classroom_id=assessment.unit.classroom_id, role="teacher")
        .join(models.User, models.ClassMember.user_id == models.User.id)
        .first()
    )
    return member.user if member and member.user and member.user.email else None


def send_attempt_event_email(recipient_email, subject, plain_text):
    html_body = (
        '<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">'
        f"<p>{escape(plain_text)}</p>"
        '<p style="color:#64748b;font-size:13px;">Open ClassNest to review the live monitor and activity log.</p>'
        "</div>"
    )
    success, error, provider_id = send_email(recipient_email, subject, plain_text, html_body=html_body)
    if success:
        logger.info("Assessment event email sent recipient=%s provider_id=%s subject=%s", recipient_email, provider_id, subject)
    else:
        logger.warning("Assessment event email skipped_or_failed recipient=%s subject=%s error=%s", recipient_email, subject, error)


def maybe_queue_attempt_email(db, background_tasks, attempt, assessment, event_type):
    config = IMPORTANT_EMAIL_EVENTS.get(event_type)
    if not config:
        return
    flag, subject_template = config
    if getattr(attempt, flag, False):
        return
    recipient = teacher_recipient_for_assessment(db, assessment)
    if not recipient or not recipient.email:
        logger.warning("Assessment event email skipped assessment_id=%s attempt_id=%s event_type=%s reason=no_teacher_email", assessment.id, attempt.id, event_type)
        return
    classroom = assessment.unit.classroom
    student = attempt.student
    subject = subject_template.format(assessment_title=assessment.title)
    if event_type == "assessment_started":
        message = f"{student.name} has started {assessment.title} in {classroom.name}."
    elif event_type == "assessment_submitted":
        message = f"{student.name} has submitted {assessment.title}."
    else:
        message = f"{student.name} left {assessment.title}. The attempt was auto-submitted and needs review."
    setattr(attempt, flag, True)
    background_tasks.add_task(send_attempt_event_email, recipient.email, subject, message)


def update_assessment_publish_summary(assessment):
    publishable_attempts = [
        attempt for attempt in assessment.attempts
        if attempt.status in {"evaluated", "published"}
    ]
    assessment.results_published = bool(publishable_attempts) and all(
        attempt.status == "published" for attempt in publishable_attempts
    )


def normalize_assessment_timing(data):
    values = data.model_dump(exclude_unset=True)
    mode = values.get("timing_mode")
    if not mode:
        return values
    timed = mode in {"timed", "timed_deadline"}
    deadline = mode in {"deadline", "timed_deadline"}
    if not timed:
        values["duration_minutes"] = 0
    elif not values.get("duration_minutes"):
        raise HTTPException(400, "Duration minutes is required for timed assessments")
    if not deadline:
        values["starts_at"] = None
        values["ends_at"] = None
    elif not values.get("ends_at"):
        raise HTTPException(400, "End deadline is required for deadline assessments")
    starts_at = values.get("starts_at")
    ends_at = values.get("ends_at")
    if starts_at:
        starts_at = utc_naive(starts_at)
        values["starts_at"] = starts_at
    if ends_at:
        ends_at = utc_naive(ends_at)
        values["ends_at"] = ends_at
    if starts_at and ends_at and starts_at >= ends_at:
        raise HTTPException(400, "Start time must be before end deadline")
    return values


def utc_naive(value):
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def assessment_access_error(assessment, now=None):
    now = now or datetime.utcnow()
    if assessment.archived:
        return "This assessment is archived"
    if not assessment.is_published or not assessment.is_accepting_responses:
        return "Assessment is not open."
    if assessment.starts_at and now < assessment.starts_at:
        return "Assessment has not started yet."
    if assessment.ends_at and now > assessment.ends_at:
        return "Assessment deadline has passed."
    return None


def final_attempt_deadline(assessment, attempt):
    deadlines = [deadline for deadline in (attempt.expires_at, assessment.ends_at) if deadline]
    return min(deadlines) if deadlines else None


@router.post("/units/{unit_id}/assessments", response_model=schemas.AssessmentOut, status_code=201)
def create_assessment(unit_id: int, data: schemas.AssessmentCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _, classroom_id = classroom_for_unit(db, unit_id)
    require_teacher(db, classroom_id, user.id)
    assessment = models.Assessment(unit_id=unit_id, created_by_user_id=user.id, **normalize_assessment_timing(data))
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    return base_output(assessment)


@router.get("/units/{unit_id}/assessments", response_model=list[schemas.AssessmentOut])
def list_assessments(unit_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _, classroom_id = classroom_for_unit(db, unit_id)
    member = require_member(db, classroom_id, user.id)
    query = db.query(models.Assessment).filter_by(unit_id=unit_id)
    if member.role != "teacher":
        query = query.filter_by(is_published=True, archived=False)
    return [base_output(assessment) for assessment in query.order_by(models.Assessment.created_at).all()]


@router.post("/assessments/{assessment_id}/upload-excel", response_model=schemas.AssessmentTeacherOut)
async def upload_excel(assessment_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    require_teacher(db, classroom_id, user.id)
    if assessment.archived:
        raise HTTPException(409, "Archived assessments cannot be edited")
    if assessment.attempts:
        raise HTTPException(409, "This assessment already has submissions. To change questions, duplicate this assessment or create a new one.")
    content = await read_excel_upload(file)
    parsed = parse_workbook(content)
    old_source = assessment.source_excel_file
    new_source = await store_excel_source(content, assessment.id)
    try:
        assessment.questions.clear()
        db.flush()
        for item in parsed:
            question = models.AssessmentQuestion(assessment_id=assessment.id, **item["question"])
            question.answer_key = models.AssessmentAnswerKey(**item["answer_key"])
            db.add(question)
        assessment.source_excel_file = new_source
        db.commit()
        db.refresh(assessment)
    except Exception:
        db.rollback()
        remove_excel_source(new_source)
        raise
    remove_excel_source(old_source)
    return teacher_detail_output(db, assessment)


@router.post("/assessments/{assessment_id}/replace-excel", response_model=schemas.AssessmentTeacherOut)
async def replace_excel(assessment_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), user=Depends(get_current_user)):
    return await upload_excel(assessment_id, file, db, user)


@router.post(
    "/assessments/{assessment_id}/import-answer-key",
    response_model=schemas.AnswerKeyImportSummary,
)
async def import_answer_key(
    assessment_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    require_teacher(db, classroom_id, user.id)
    if assessment.archived:
        raise HTTPException(409, "Archived assessments cannot be edited")
    content = await read_answer_key_upload(file)
    rows = parse_answer_key_workbook(content)
    summary = import_answer_key_for_assessment(db, assessment, rows)
    if not missing_objective_answer_keys(assessment):
        evaluate_pending_attempts(assessment)
        db.commit()
    return summary


@router.get("/assessments/{assessment_id}/attempt-count")
def attempt_count(assessment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    require_teacher(db, classroom_id, user.id)
    return {"attempt_count": len(assessment.attempts)}


@router.put("/assessments/{assessment_id}", response_model=schemas.AssessmentOut)
def update_status(assessment_id: int, data: schemas.AssessmentStatusUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    require_teacher(db, classroom_id, user.id)
    if assessment.archived:
        raise HTTPException(409, "Archived assessments cannot be edited")
    changes = normalize_assessment_timing(data)
    active_attempts = [attempt for attempt in assessment.attempts if attempt.status == "in_progress"]
    if assessment.attempts and changes.get("timing_mode", assessment.timing_mode) != assessment.timing_mode:
        raise HTTPException(409, "Timing mode cannot be changed after an attempt has started")
    if active_attempts and "duration_minutes" in changes and changes["duration_minutes"] != assessment.duration_minutes:
        raise HTTPException(409, "Duration cannot be changed while students have active attempts")
    if active_attempts and changes.get("ends_at"):
        if changes["ends_at"] <= datetime.utcnow():
            raise HTTPException(400, "Deadline cannot be moved into the past while attempts are active")
        if assessment.ends_at and changes["ends_at"] < assessment.ends_at:
            raise HTTPException(409, "Deadline cannot be shortened while students have active attempts")
    if "title" in changes and not changes["title"].strip():
        raise HTTPException(400, "Assessment title is required")
    published = changes.get("is_published", assessment.is_published)
    accepting = changes.get("is_accepting_responses", assessment.is_accepting_responses)
    if published and not assessment.questions:
        raise HTTPException(409, "Upload assessment questions before publishing")
    if accepting and not published:
        raise HTTPException(400, "An unpublished assessment cannot accept responses")
    for key, value in changes.items():
        setattr(assessment, key, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(assessment)
    return base_output(assessment)


@router.get("/assessments/{assessment_id}", response_model=schemas.AssessmentStudentOut)
def student_detail(assessment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    member = require_member(db, classroom_id, user.id)
    if member.role != "teacher" and (not assessment.is_published or assessment.archived):
        raise HTTPException(404, "Assessment not found")
    attempt = db.query(models.AssessmentAttempt).filter_by(assessment_id=assessment.id, student_id=user.id).first()
    return student_assessment_output(assessment, attempt)


def teacher_detail_output(db, assessment):
    source = Path(assessment.source_excel_file).name if assessment.source_excel_file else None
    return {**base_output(assessment), "source_excel_file": source, "questions": [teacher_question_output(question) for question in assessment.questions], "stats": dashboard_stats(db, assessment)}


@router.get("/assessments/{assessment_id}/teacher-summary")
def teacher_summary(assessment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    require_teacher(db, classroom_id, user.id)
    source = Path(assessment.source_excel_file).name if assessment.source_excel_file else None
    question_count = db.query(models.AssessmentQuestion).filter_by(assessment_id=assessment.id).count()
    return {**base_output(assessment, question_count=question_count), "source_excel_file": source, "stats": dashboard_stats(db, assessment)}


@router.get("/assessments/{assessment_id}/teacher", response_model=schemas.AssessmentTeacherOut)
def teacher_detail(assessment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    require_teacher(db, classroom_id, user.id)
    return teacher_detail_output(db, assessment)


@router.get("/assessments/{assessment_id}/preview", response_model=schemas.AssessmentPreviewOut)
def teacher_preview(assessment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    require_teacher(db, classroom_id, user.id)
    return {**base_output(assessment), "questions": [question_output(question) for question in assessment.questions]}


@router.get("/assessments/{assessment_id}/attempts", response_model=list[schemas.AssessmentAttemptOut])
def attempts(
    assessment_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    require_teacher(db, classroom_id, user.id)
    submitted_attempts = db.query(models.AssessmentAttempt).options(
        joinedload(models.AssessmentAttempt.student),
        selectinload(models.AssessmentAttempt.events),
        selectinload(models.AssessmentAttempt.responses)
            .joinedload(models.AssessmentResponse.question)
            .joinedload(models.AssessmentQuestion.answer_key),
    ).filter(
        models.AssessmentAttempt.assessment_id == assessment.id,
        models.AssessmentAttempt.status != "in_progress",
    ).order_by(
        models.AssessmentAttempt.submitted_at.desc(),
        models.AssessmentAttempt.started_at.desc(),
        models.AssessmentAttempt.id.desc(),
    ).offset(offset).limit(limit).all()
    return [attempt_output(attempt) for attempt in submitted_attempts]


@router.get("/assessments/{assessment_id}/live-monitor")
def live_monitor(assessment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    require_teacher(db, classroom_id, user.id)
    members = (
        db.query(models.ClassMember)
        .options(joinedload(models.ClassMember.user))
        .filter_by(classroom_id=classroom_id, role="student")
        .order_by(models.ClassMember.joined_at, models.ClassMember.id)
        .all()
    )
    attempts = (
        db.query(models.AssessmentAttempt)
        .options(
            joinedload(models.AssessmentAttempt.student),
            selectinload(models.AssessmentAttempt.events),
        )
        .filter(models.AssessmentAttempt.assessment_id == assessment.id)
        .all()
    )
    attempts_by_student = {attempt.student_id: attempt for attempt in attempts}
    summary = {
        "total_students": len(members),
        "not_started": 0,
        "in_progress": 0,
        "submitted": 0,
        "left_halfway": 0,
        "suspicious": 0,
    }
    students = []
    for member in members:
        attempt = attempts_by_student.get(member.user_id)
        warning_count = 0
        last_event = None
        status = "not_started"
        if attempt:
            events = sorted(attempt.events, key=lambda event: (event.created_at or datetime.min, event.id))
            warning_count = sum(event.event_type not in NON_WARNING_EVENT_TYPES for event in events)
            last_event = events[-1] if events else None
            status = attempt.status or "not_started"
        left_halfway = status == "auto_submitted_on_leave"
        suspicious = warning_count >= 3
        if status == "in_progress":
            summary["in_progress"] += 1
        elif left_halfway:
            summary["left_halfway"] += 1
        elif status in {"submitted", "pending_evaluation", "evaluated", "published"}:
            summary["submitted"] += 1
        else:
            summary["not_started"] += 1
        if suspicious:
            summary["suspicious"] += 1
        students.append({
            "student_id": member.user_id,
            "student_name": member.user.name,
            "email": member.user.email,
            "attempt_id": attempt.id if attempt else None,
            "status": "left_halfway" if left_halfway else status,
            "started_at": attempt.started_at if attempt else None,
            "ended_at": attempt.ended_at if attempt else None,
            "last_activity_at": attempt.last_activity_at if attempt else None,
            "warning_count": warning_count,
            "focus_status": "suspicious" if suspicious else "warnings" if warning_count else "clean",
            "last_event_type": last_event.event_type if last_event else None,
            "last_event_at": last_event.created_at if last_event else None,
        })
    return {"assessment_id": assessment.id, "summary": summary, "students": students}


@router.delete("/assessments/{assessment_id}")
def delete_assessment(assessment_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), user=Depends(get_current_user)):
    started = time.perf_counter()
    logger.info("Assessment delete started assessment_id=%s teacher_id=%s", assessment_id, user.id)
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    require_teacher(db, classroom_id, user.id)
    source = assessment.source_excel_file
    try:
        result = db.execute(
            delete(models.Assessment)
            .where(models.Assessment.id == assessment_id)
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            raise HTTPException(404, "Assessment not found")
        db.commit()
        db_elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.info("Assessment delete DB completed assessment_id=%s teacher_id=%s elapsed_ms=%s", assessment_id, user.id, db_elapsed_ms)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.exception("Assessment delete failed assessment_id=%s teacher_id=%s elapsed_ms=%s", assessment_id, user.id, elapsed_ms)
        raise HTTPException(500, f"Could not delete assessment: {exc}") from exc
    background_tasks.add_task(cleanup_assessment_source, source, assessment_id)
    total_ms = round((time.perf_counter() - started) * 1000, 2)
    logger.info("Assessment delete response ready assessment_id=%s teacher_id=%s total_ms=%s", assessment_id, user.id, total_ms)
    return {"deleted": True, "archived": False}


@router.post("/assessments/{assessment_id}/start-attempt", response_model=schemas.AssessmentStudentOut)
def start_attempt(assessment_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    member = require_member(db, classroom_id, user.id)
    if member.role != "student":
        raise HTTPException(403, "Only students can start assessments")
    now = datetime.utcnow()
    blocked = assessment_access_error(assessment, now)
    if blocked:
        raise HTTPException(403, blocked)
    attempt = db.query(models.AssessmentAttempt).filter_by(assessment_id=assessment.id, student_id=user.id).first()
    if attempt and attempt.status != "in_progress":
        raise HTTPException(409, "You have already submitted this assessment")
    if not attempt:
        attempt = models.AssessmentAttempt(
            assessment_id=assessment.id,
            student_id=user.id,
            status="in_progress",
            started_at=now,
            last_activity_at=now,
            # Existing SQLite databases may still enforce NOT NULL here.
            # The value is replaced with the real submission time on submit.
            submitted_at=now,
            total_marks=sum(question.marks for question in assessment.questions),
        )
        if assessment.timing_mode in {"timed", "timed_deadline"}:
            attempt.expires_at = now + timedelta(minutes=assessment.duration_minutes or 0)
        db.add(attempt)
        db.flush()
        create_attempt_event(db, attempt, "assessment_started", "Assessment started", {"source": "start_attempt"})
        maybe_queue_attempt_email(db, background_tasks, attempt, assessment, "assessment_started")
        update_assessment_publish_summary(assessment)
        db.commit()
        db.refresh(attempt)
    return student_assessment_output(assessment, attempt)


@router.post("/assessments/{assessment_id}/attempt/start", response_model=schemas.AssessmentAttemptStartOut)
def start_attempt_status(assessment_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    member = require_member(db, classroom_id, user.id)
    if member.role != "student":
        raise HTTPException(403, "Only students can start assessments")
    now = datetime.utcnow()
    blocked = assessment_access_error(assessment, now)
    if blocked:
        raise HTTPException(403, blocked)
    attempt = db.query(models.AssessmentAttempt).filter_by(assessment_id=assessment.id, student_id=user.id).first()
    if attempt and attempt.status != "in_progress":
        return {
            "can_start": False,
            "attempt_id": attempt.id,
            "status": attempt.status,
            "message": "Assessment already submitted. Only one attempt is allowed.",
            "assessment": student_assessment_output(assessment, attempt),
        }
    if not attempt:
        attempt = models.AssessmentAttempt(
            assessment_id=assessment.id,
            student_id=user.id,
            status="in_progress",
            started_at=now,
            last_activity_at=now,
            submitted_at=now,
            total_marks=sum(question.marks for question in assessment.questions),
        )
        if assessment.timing_mode in {"timed", "timed_deadline"}:
            attempt.expires_at = now + timedelta(minutes=assessment.duration_minutes or 0)
        db.add(attempt)
        db.flush()
        create_attempt_event(db, attempt, "assessment_started", "Assessment started", {"source": "attempt_start"})
        maybe_queue_attempt_email(db, background_tasks, attempt, assessment, "assessment_started")
        update_assessment_publish_summary(assessment)
        db.commit()
        db.refresh(attempt)
    return {
        "can_start": True,
        "attempt_id": attempt.id,
        "status": attempt.status,
        "message": "Assessment attempt started.",
        "assessment": student_assessment_output(assessment, attempt),
    }


@router.post("/assessment-attempts/{attempt_id}/events", response_model=schemas.AssessmentAttemptEventOut, status_code=201)
def log_attempt_event(attempt_id: int, data: schemas.AssessmentAttemptEventCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    attempt = db.get(models.AssessmentAttempt, attempt_id)
    if not attempt:
        raise HTTPException(404, "Assessment attempt not found")
    if attempt.student_id != user.id:
        raise HTTPException(403, "Students can only log events for their own attempts")
    event = create_attempt_event(db, attempt, data.event_type, data.event_message.strip(), data.metadata)
    db.commit()
    db.refresh(event)
    return event_output(event)


@router.get("/assessment-attempts/{attempt_id}/events", response_model=list[schemas.AssessmentAttemptEventOut])
def list_attempt_events(
    attempt_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    attempt = db.get(models.AssessmentAttempt, attempt_id)
    if not attempt:
        raise HTTPException(404, "Assessment attempt not found")
    if attempt.student_id != user.id:
        require_teacher(db, attempt.assessment.unit.classroom_id, user.id)
    events = db.query(models.AssessmentAttemptEvent).filter_by(attempt_id=attempt.id).order_by(
        models.AssessmentAttemptEvent.created_at,
        models.AssessmentAttemptEvent.id,
    ).offset(offset).limit(limit).all()
    return [event_output(event) for event in events]


def ensure_student_attempt(db, assessment, user, now):
    attempt = db.query(models.AssessmentAttempt).filter_by(assessment_id=assessment.id, student_id=user.id).first()
    if attempt and attempt.status != "in_progress":
        raise HTTPException(409, "You have already submitted this assessment")
    if not attempt:
        attempt = models.AssessmentAttempt(
            assessment_id=assessment.id,
            student_id=user.id,
            status="in_progress",
            started_at=now,
            last_activity_at=now,
            submitted_at=now,
            total_marks=sum(question.marks for question in assessment.questions),
        )
        if assessment.timing_mode in {"timed", "timed_deadline"}:
            attempt.expires_at = now + timedelta(minutes=assessment.duration_minutes or 0)
        db.add(attempt)
        db.flush()
    return attempt


def upsert_attempt_responses(db, attempt, assessment, responses):
    submitted = {response.question_id: response for response in responses}
    valid_ids = {question.id for question in assessment.questions}
    if not set(submitted).issubset(valid_ids):
        raise HTTPException(400, "A response does not belong to this assessment")
    existing = {response.question_id: response for response in attempt.responses}
    for question in assessment.questions:
        answer = submitted.get(question.id)
        response = existing.get(question.id)
        if not response:
            response = models.AssessmentResponse(attempt_id=attempt.id, question_id=question.id)
            db.add(response)
        response.selected_option = answer.selected_option if answer else None
        response.text_answer = answer.text_answer if answer else None
        response.code_answer = answer.code_answer if answer else None


def finalize_attempt_submission(db, attempt, assessment, responses, status, auto_submit_reason=None):
    now = datetime.utcnow()
    if attempt.status != "in_progress":
        return False
    upsert_attempt_responses(db, attempt, assessment, responses)
    attempt.status = status
    attempt.submitted_at = now
    attempt.ended_at = now
    attempt.last_activity_at = now
    attempt.auto_submit_reason = auto_submit_reason
    attempt.total_marks = sum(question.marks for question in assessment.questions)
    update_assessment_publish_summary(assessment)
    return True


@router.post("/assessments/{assessment_id}/save-draft", response_model=schemas.AssessmentSubmissionOut)
def save_draft(assessment_id: int, data: schemas.AssessmentSubmitInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    member = require_member(db, classroom_id, user.id)
    if member.role != "student":
        raise HTTPException(403, "Only students can save assessment drafts")
    now = datetime.utcnow()
    blocked = assessment_access_error(assessment, now)
    if blocked:
        raise HTTPException(403, blocked)
    attempt = ensure_student_attempt(db, assessment, user, now)
    deadline = final_attempt_deadline(assessment, attempt)
    if deadline and now > deadline:
        raise HTTPException(403, "Assessment time has expired.")
    upsert_attempt_responses(db, attempt, assessment, data.responses)
    attempt.last_activity_at = now
    db.commit()
    return {"attempt_id": attempt.id, "status": attempt.status, "message": "Draft saved."}


@router.post("/assessments/{assessment_id}/submit", response_model=schemas.AssessmentSubmissionOut, status_code=201)
def submit(assessment_id: int, data: schemas.AssessmentSubmitInput, background_tasks: BackgroundTasks, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    member = require_member(db, classroom_id, user.id)
    if member.role != "student":
        raise HTTPException(403, "Only students can submit assessments")
    now = datetime.utcnow()
    blocked = assessment_access_error(assessment, now)
    if blocked:
        raise HTTPException(403, blocked)
    attempt = db.query(models.AssessmentAttempt).filter_by(assessment_id=assessment.id, student_id=user.id).first()
    if attempt and attempt.status != "in_progress":
        raise HTTPException(409, "You have already submitted this assessment")
    if not attempt and assessment.timing_mode in {"timed", "timed_deadline"}:
        raise HTTPException(403, "Start the timed assessment before submitting")
    if not attempt:
        attempt = ensure_student_attempt(db, assessment, user, now)
    deadline = final_attempt_deadline(assessment, attempt)
    if deadline and now > deadline:
        raise HTTPException(403, "Assessment time has expired.")
    finalized = finalize_attempt_submission(db, attempt, assessment, data.responses, "submitted")
    if finalized:
        create_attempt_event(db, attempt, "assessment_submitted", "Assessment submitted", {"source": "manual_submit"})
        maybe_queue_attempt_email(db, background_tasks, attempt, assessment, "assessment_submitted")
    db.commit()
    return {"attempt_id": attempt.id, "status": "submitted", "message": "Submitted successfully. Pending evaluation."}


@router.post("/assessment-attempts/{attempt_id}/auto-submit", response_model=schemas.AssessmentSubmissionOut)
def auto_submit_attempt(attempt_id: int, data: schemas.AssessmentAutoSubmitInput, background_tasks: BackgroundTasks, db: Session = Depends(get_db), user=Depends(get_current_user)):
    attempt = db.get(models.AssessmentAttempt, attempt_id)
    if not attempt:
        raise HTTPException(404, "Assessment attempt not found")
    if attempt.student_id != user.id:
        raise HTTPException(403, "Students can only auto-submit their own attempts")
    assessment = attempt.assessment
    finalized = finalize_attempt_submission(
        db,
        attempt,
        assessment,
        data.responses,
        "auto_submitted_on_leave",
        data.auto_submit_reason,
    )
    if finalized:
        create_attempt_event(
            db,
            attempt,
            "auto_submitted_on_leave",
            "Student left the assessment page. Attempt auto-submitted.",
            {"reason": data.auto_submit_reason},
        )
        maybe_queue_attempt_email(db, background_tasks, attempt, assessment, "auto_submitted_on_leave")
    db.commit()
    return {"attempt_id": attempt.id, "status": attempt.status, "message": "Attempt auto-submitted."}


def normalized(value, case_sensitive):
    value = (value or "").strip()
    value = " ".join(value.split())
    return value if case_sensitive else value.casefold()


def missing_objective_answer_keys(assessment):
    return [
        question.question_id_from_excel
        for question in assessment.questions
        if (
            question.question_type == "MCQ"
            and (
                not question.answer_key
                or (question.answer_key.correct_answer or "").strip().upper() not in {"A", "B", "C", "D"}
            )
        ) or (
            question.question_type == "FILLUP"
            and (not question.answer_key or not (question.answer_key.correct_answer or "").strip())
        )
    ]


def evaluate_pending_attempts(assessment):
    now = datetime.utcnow()
    total_marks = sum(question.marks for question in assessment.questions)
    for attempt in assessment.attempts:
        if attempt.status not in {"submitted", "pending_evaluation", "auto_submitted_on_leave"}:
            continue
        attempt.total_marks = total_marks
        requires_manual_review = False
        for response in attempt.responses:
            question = response.question
            key = question.answer_key
            if question.question_type == "MCQ":
                correct_answer = (key.correct_answer or "").strip().upper() if key else ""
                if correct_answer not in {"A", "B", "C", "D"}:
                    requires_manual_review = True
                    response.is_correct = None
                    response.awarded_marks = 0
                    response.feedback = "Answer key missing"
                    continue
                response.is_correct = (response.selected_option or "").strip().upper() == correct_answer
                response.awarded_marks = question.marks if response.is_correct else 0
                response.feedback = key.explanation
            elif question.question_type == "FILLUP":
                if not key or not (key.correct_answer or "").strip():
                    requires_manual_review = True
                    response.is_correct = None
                    response.awarded_marks = 0
                    response.feedback = "Answer key missing"
                    continue
                answers = [key.correct_answer] + (key.accepted_answers or "").split("|")
                accepted = {normalized(answer, question.case_sensitive) for answer in answers if answer}
                response.is_correct = normalized(response.text_answer, question.case_sensitive) in accepted
                response.awarded_marks = question.marks if response.is_correct else 0
                response.feedback = key.explanation
            else:
                manually_reviewed = (
                    response.is_correct is not None
                    or response.feedback not in {None, "", "Coding answer requires teacher review.", "Manual coding review required"}
                )
                if not manually_reviewed:
                    requires_manual_review = True
                    response.is_correct = None
                    response.awarded_marks = response.awarded_marks or 0
                    response.feedback = "Coding answer requires teacher review."
        attempt.score = sum(response.awarded_marks for response in attempt.responses)
        attempt.status = "pending_evaluation" if requires_manual_review else "evaluated"
        attempt.evaluated_at = now


@router.post("/assessments/{assessment_id}/evaluate", response_model=list[schemas.AssessmentAttemptOut])
def evaluate(assessment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    require_teacher(db, classroom_id, user.id)
    if missing_objective_answer_keys(assessment):
        raise HTTPException(
            409,
            "Some MCQ/FILLUP questions are missing answer keys. Import answer key before evaluation.",
        )
    evaluate_pending_attempts(assessment)
    update_assessment_publish_summary(assessment)
    db.commit()
    return [attempt_output(attempt) for attempt in assessment.attempts]


def apply_response_marks(response, data):
    if data.awarded_marks > response.question.marks:
        raise HTTPException(400, "Awarded marks cannot exceed the question marks")
    response.awarded_marks = data.awarded_marks
    response.feedback = data.feedback.strip() if data.feedback else None
    response.is_correct = (
        data.is_correct
        if data.is_correct is not None
        else True
        if data.awarded_marks == response.question.marks
        else False
        if data.awarded_marks == 0
        else None
    )


def refresh_attempt_after_marking(attempt):
    attempt.score = sum(item.awarded_marks for item in attempt.responses)
    attempt.status = "pending_evaluation" if evaluation_blocking_statuses(attempt) else "evaluated"
    attempt.evaluated_at = attempt.evaluated_at or datetime.utcnow()
    update_assessment_publish_summary(attempt.assessment)


@router.put("/attempts/{attempt_id}/responses/{response_id}/marks", response_model=schemas.AssessmentAttemptOut)
def update_marks(attempt_id: int, response_id: int, data: schemas.AssessmentMarksUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    attempt = db.get(models.AssessmentAttempt, attempt_id)
    if not attempt:
        raise HTTPException(404, "Assessment attempt not found")
    require_teacher(db, attempt.assessment.unit.classroom_id, user.id)
    if attempt.status == "published":
        raise HTTPException(409, "Published results cannot be edited")
    response = db.query(models.AssessmentResponse).filter_by(id=response_id, attempt_id=attempt.id).first()
    if not response:
        raise HTTPException(404, "Assessment response not found")
    apply_response_marks(response, data)
    refresh_attempt_after_marking(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt_output(attempt)


@router.put("/attempts/{attempt_id}/marks", response_model=schemas.AssessmentAttemptOut)
def update_all_marks(attempt_id: int, data: schemas.AssessmentMarksBatchUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    attempt = db.get(models.AssessmentAttempt, attempt_id)
    if not attempt:
        raise HTTPException(404, "Assessment attempt not found")
    require_teacher(db, attempt.assessment.unit.classroom_id, user.id)
    if attempt.status == "published":
        raise HTTPException(409, "Published results cannot be edited")
    responses_by_id = {response.id: response for response in attempt.responses}
    seen = set()
    for item in data.responses:
        response = responses_by_id.get(item.response_id)
        if not response:
            raise HTTPException(404, "Assessment response not found")
        if item.response_id in seen:
            raise HTTPException(400, "Duplicate response in marks update")
        seen.add(item.response_id)
        apply_response_marks(response, item)
    refresh_attempt_after_marking(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt_output(attempt)


@router.post("/attempts/{attempt_id}/publish-result", response_model=schemas.AssessmentAttemptOut)
def publish_attempt_result(
    attempt_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    attempt = db.get(models.AssessmentAttempt, attempt_id)
    if not attempt:
        raise HTTPException(404, "Assessment attempt not found")
    require_teacher(db, attempt.assessment.unit.classroom_id, user.id)
    if not attempt_can_publish(attempt):
        raise HTTPException(400, "All questions in this attempt must be marked before publishing this result.")
    attempt.status = "published"
    attempt.evaluated_at = attempt.evaluated_at or datetime.utcnow()
    attempt.published_at = datetime.utcnow()
    update_assessment_publish_summary(attempt.assessment)
    db.commit()
    db.refresh(attempt)
    return attempt_output(attempt)


@router.post("/attempts/{attempt_id}/unpublish-result", response_model=schemas.AssessmentAttemptOut)
def unpublish_attempt_result(
    attempt_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    attempt = db.get(models.AssessmentAttempt, attempt_id)
    if not attempt:
        raise HTTPException(404, "Assessment attempt not found")
    require_teacher(db, attempt.assessment.unit.classroom_id, user.id)
    if attempt.status != "published":
        raise HTTPException(400, "Only published results can be unpublished.")
    attempt.status = "evaluated"
    attempt.published_at = None
    update_assessment_publish_summary(attempt.assessment)
    db.commit()
    db.refresh(attempt)
    return attempt_output(attempt)


@router.post(
    "/assessments/{assessment_id}/publish-results",
    response_model=schemas.AssessmentBulkPublishSummary,
)
def publish_results(assessment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    require_teacher(db, classroom_id, user.id)
    if assessment.archived:
        raise HTTPException(409, "Archived assessments cannot be changed")
    not_ready_attempts = [
        attempt for attempt in assessment.attempts
        if not attempt_is_fully_evaluated(attempt)
    ]
    if not_ready_attempts:
        raise HTTPException(
            409,
            "Publish all results is available only after every submitted student has been fully evaluated.",
        )
    now = datetime.utcnow()
    published = 0
    skipped_attempts = []
    for attempt in assessment.attempts:
        if attempt_can_publish(attempt):
            attempt.status = "published"
            attempt.evaluated_at = attempt.evaluated_at or now
            attempt.published_at = now
            published += 1
        elif attempt.status != "published":
            reason = (
                "Pending evaluation"
                if attempt.status in {"submitted", "pending_evaluation"}
                else f"Status: {attempt.status.replace('_', ' ')}"
            )
            skipped_attempts.append({
                "attempt_id": attempt.id,
                "student_name": attempt.student.name,
                "reason": reason,
            })
    update_assessment_publish_summary(assessment)
    db.commit()
    return {
        "published": published,
        "skipped": len(skipped_attempts),
        "skipped_attempts": skipped_attempts,
    }


@router.post("/assessments/{assessment_id}/unpublish-results")
def unpublish_results(
    assessment_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    require_teacher(db, classroom_id, user.id)
    unpublished = 0
    for attempt in assessment.attempts:
        if attempt.status == "published":
            attempt.status = "evaluated"
            attempt.published_at = None
            unpublished += 1
    update_assessment_publish_summary(assessment)
    db.commit()
    return {"unpublished": unpublished}


@router.get("/assessments/{assessment_id}/my-result")
def my_result(assessment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    member = require_member(db, classroom_id, user.id)
    if member.role != "student":
        raise HTTPException(403, "Only students have assessment results")
    if assessment.archived:
        raise HTTPException(404, "Assessment not found")
    attempt = db.query(models.AssessmentAttempt).filter_by(assessment_id=assessment.id, student_id=user.id).first()
    if not attempt:
        return {
            "status": "not_attempted",
            "message": "You have not attempted this assessment yet.",
        }
    if attempt.status == "in_progress":
        return {
            "status": "in_progress",
            "message": "Your assessment attempt is in progress.",
        }
    if attempt.status in {"submitted", "pending_evaluation", "auto_submitted_on_leave"}:
        return {
            "status": "pending_evaluation",
            "message": "Your submission is pending teacher evaluation.",
        }
    if attempt.status == "evaluated":
        return {
            "status": "evaluated_not_published",
            "message": "Your result has been evaluated but not published yet.",
        }
    if attempt.status != "published":
        return {
            "status": attempt.status,
            "message": "Your result is not published yet.",
        }
    percentage = round((attempt.score / attempt.total_marks) * 100, 2) if attempt.total_marks else 0
    return {
        "attempt_id": attempt.id, "assessment_id": assessment.id,
        "assessment_title": assessment.title, "status": attempt.status,
        "score": attempt.score, "total_marks": attempt.total_marks, "percentage": percentage,
        "submitted_at": attempt.submitted_at, "published_at": attempt.published_at,
        "responses": [{
            **response_output(response),
            "correct_answer": response.question.answer_key.correct_answer if response.question.answer_key else None,
            "accepted_answers": response.question.answer_key.accepted_answers if response.question.answer_key else None,
            "explanation": response.question.answer_key.explanation if response.question.answer_key else None,
        } for response in attempt.responses],
    }
