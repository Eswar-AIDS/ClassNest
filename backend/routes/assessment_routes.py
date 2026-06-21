from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from assessment_answerkey_import import (
    import_answer_key_for_assessment,
    parse_answer_key_workbook,
    read_answer_key_upload,
)
from assessment_excel import parse_workbook, read_excel_upload, remove_excel_source, store_excel_source
from auth import get_current_user
from database import get_db
from utils import classroom_for_assessment, classroom_for_unit, require_member, require_teacher
import models
import schemas

router = APIRouter(tags=["Assessments"])


def base_output(assessment):
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
        "question_count": len(assessment.questions), "created_at": assessment.created_at,
    }


def dashboard_stats(db, assessment):
    classroom_id = assessment.unit.classroom_id
    total_students = db.query(models.ClassMember).filter_by(classroom_id=classroom_id, role="student").count()
    attempts = [attempt for attempt in assessment.attempts if attempt.status != "in_progress"]
    return {
        "total_students": total_students,
        "submitted_count": len(attempts),
        "pending_count": sum(attempt.status == "pending_evaluation" for attempt in attempts),
        "evaluated_count": sum(attempt.status == "evaluated" for attempt in attempts),
        "published_count": sum(attempt.status == "published" for attempt in attempts),
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
        "responses": [response_output(response, include_hidden_test_cases=True) for response in attempt.responses],
    }


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
    return {
        **base_output(assessment),
        "questions": [question_output(question) for question in assessment.questions],
        "attempt_status": attempt.status if attempt else None,
        "attempt_started_at": attempt.started_at if attempt else None,
        "attempt_expires_at": final_attempt_deadline(assessment, attempt) if attempt else None,
    }


def teacher_detail_output(db, assessment):
    source = Path(assessment.source_excel_file).name if assessment.source_excel_file else None
    return {**base_output(assessment), "source_excel_file": source, "questions": [teacher_question_output(question) for question in assessment.questions], "stats": dashboard_stats(db, assessment)}


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
def attempts(assessment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    require_teacher(db, classroom_id, user.id)
    submitted_attempts = [attempt for attempt in assessment.attempts if attempt.status != "in_progress"]
    return [attempt_output(attempt) for attempt in sorted(submitted_attempts, key=lambda item: item.submitted_at or item.started_at or datetime.min, reverse=True)]


@router.delete("/assessments/{assessment_id}")
def delete_assessment(assessment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    assessment, classroom_id = classroom_for_assessment(db, assessment_id)
    require_teacher(db, classroom_id, user.id)
    if assessment.attempts:
        assessment.archived = True
        assessment.is_published = False
        assessment.is_accepting_responses = False
        db.commit()
        return {"deleted": False, "archived": True}
    source = assessment.source_excel_file
    db.delete(assessment)
    db.commit()
    remove_excel_source(source)
    return {"deleted": True, "archived": False}


@router.post("/assessments/{assessment_id}/start-attempt", response_model=schemas.AssessmentStudentOut)
def start_attempt(assessment_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
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
            # Existing SQLite databases may still enforce NOT NULL here.
            # The value is replaced with the real submission time on submit.
            submitted_at=now,
            total_marks=sum(question.marks for question in assessment.questions),
        )
        if assessment.timing_mode in {"timed", "timed_deadline"}:
            attempt.expires_at = now + timedelta(minutes=assessment.duration_minutes or 0)
        db.add(attempt)
        update_assessment_publish_summary(assessment)
        db.commit()
        db.refresh(attempt)
    return {
        **base_output(assessment),
        "questions": [question_output(question) for question in assessment.questions],
        "attempt_status": attempt.status,
        "attempt_started_at": attempt.started_at,
        "attempt_expires_at": final_attempt_deadline(assessment, attempt),
    }


@router.post("/assessments/{assessment_id}/submit", response_model=schemas.AssessmentSubmissionOut, status_code=201)
def submit(assessment_id: int, data: schemas.AssessmentSubmitInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
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
        attempt = models.AssessmentAttempt(
            assessment_id=assessment.id, student_id=user.id, status="in_progress",
            started_at=now,
            submitted_at=now,
            total_marks=sum(question.marks for question in assessment.questions),
        )
        db.add(attempt)
        db.flush()
    deadline = final_attempt_deadline(assessment, attempt)
    if deadline and now > deadline:
        raise HTTPException(403, "Assessment time has expired.")
    submitted = {response.question_id: response for response in data.responses}
    valid_ids = {question.id for question in assessment.questions}
    if not set(submitted).issubset(valid_ids):
        raise HTTPException(400, "A response does not belong to this assessment")
    attempt.status = "pending_evaluation"
    attempt.submitted_at = now
    attempt.total_marks = sum(question.marks for question in assessment.questions)
    for question in assessment.questions:
        answer = submitted.get(question.id)
        db.add(models.AssessmentResponse(
            attempt_id=attempt.id, question_id=question.id,
            selected_option=answer.selected_option if answer else None,
            text_answer=answer.text_answer if answer else None,
            code_answer=answer.code_answer if answer else None,
        ))
    update_assessment_publish_summary(assessment)
    db.commit()
    return {"attempt_id": attempt.id, "status": "pending_evaluation", "message": "Submitted successfully. Pending evaluation."}


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
        if attempt.status not in {"submitted", "pending_evaluation"}:
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
    if attempt.status in {"submitted", "pending_evaluation"}:
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
