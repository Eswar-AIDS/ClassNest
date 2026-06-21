from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from services.email_service import configuration_error, send_email
from utils import require_teacher
import models
import schemas

router = APIRouter(tags=["Email Notifications"])
ASSESSMENT_MODES = {
    "not_attempted_assessment", "pending_evaluation",
    "result_published", "below_score_threshold",
}


def class_and_teacher(db, classroom_id, user_id):
    teacher = require_teacher(db, classroom_id, user_id)
    classroom = db.get(models.Classroom, classroom_id)
    if not classroom:
        raise HTTPException(404, "Classroom not found")
    return classroom, teacher


def selected_assessment(db, classroom_id, data):
    if data.recipient_mode not in ASSESSMENT_MODES:
        return None
    if not data.assessment_id:
        raise HTTPException(400, "Select an assessment for this recipient mode")
    assessment = db.get(models.Assessment, data.assessment_id)
    if not assessment or assessment.unit.classroom_id != classroom_id:
        raise HTTPException(400, "Assessment does not belong to this classroom")
    return assessment


def resolve_recipients(db, classroom_id, data):
    assessment = selected_assessment(db, classroom_id, data)
    students = (
        db.query(models.ClassMember)
        .filter_by(classroom_id=classroom_id, role="student")
        .order_by(models.ClassMember.joined_at, models.ClassMember.id)
        .all()
    )
    by_user_id = {member.user_id: member for member in students}

    if data.recipient_mode == "all_students":
        selected = students
    elif data.recipient_mode == "selected_students":
        requested = set(data.selected_student_ids)
        if not requested:
            raise HTTPException(400, "Select at least one student")
        invalid = requested - set(by_user_id)
        if invalid:
            raise HTTPException(400, "One or more selected users are not students in this classroom")
        selected = [member for member in students if member.user_id in requested]
    else:
        attempts = {
            attempt.student_id: attempt
            for attempt in db.query(models.AssessmentAttempt).filter_by(assessment_id=assessment.id).all()
        }
        if data.recipient_mode == "not_attempted_assessment":
            selected = [member for member in students if member.user_id not in attempts]
        elif data.recipient_mode == "pending_evaluation":
            selected = [member for member in students if member.user_id in attempts and attempts[member.user_id].status in {"submitted", "pending_evaluation"}]
        elif data.recipient_mode == "result_published":
            selected = [member for member in students if member.user_id in attempts and attempts[member.user_id].status == "published"]
        else:
            if data.below_score_threshold is None:
                raise HTTPException(400, "Enter a score percentage threshold")
            selected = [
                member for member in students
                if member.user_id in attempts
                and attempts[member.user_id].status in {"evaluated", "published"}
                and attempts[member.user_id].total_marks > 0
                and attempts[member.user_id].score / attempts[member.user_id].total_marks * 100 < data.below_score_threshold
            ]

    if not selected:
        raise HTTPException(400, "No students match the selected recipient criteria")
    if len(selected) > 100:
        raise HTTPException(400, "A notification can have at most 100 recipients")
    return selected, assessment


def validate_message(data):
    if not data.subject.strip():
        raise HTTPException(400, "Subject is required")
    if not data.message_body.strip():
        raise HTTPException(400, "Message body is required")


def replace_variables(value, classroom, teacher, recipient, assessment):
    variables = {
        "{{student_name}}": recipient.user.name or "",
        "{{class_name}}": classroom.name or "",
        "{{assessment_title}}": assessment.title if assessment else "",
        "{{unit_title}}": assessment.unit.title if assessment else "",
        "{{teacher_name}}": teacher.user.name or "ClassNest teacher",
    }
    for variable, replacement in variables.items():
        value = value.replace(variable, replacement)
    return value


def recipient_preview(member):
    return {"user_id": member.user_id, "name": member.user.name, "email": member.user.email}


@router.post("/classrooms/{classroom_id}/notifications/email/preview", response_model=schemas.EmailNotificationPreview)
def preview_email(classroom_id: int, data: schemas.EmailNotificationRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    classroom, teacher = class_and_teacher(db, classroom_id, user.id)
    validate_message(data)
    recipients, assessment = resolve_recipients(db, classroom_id, data)
    personalized = [{
        **recipient_preview(member),
        "subject": replace_variables(data.subject.strip(), classroom, teacher, member, assessment),
        "message_body": replace_variables(data.message_body.strip(), classroom, teacher, member, assessment),
    } for member in recipients]
    return {
        "recipient_count": len(recipients),
        "recipients": personalized,
        "subject": personalized[0]["subject"],
        "message_body": personalized[0]["message_body"],
    }


@router.post("/classrooms/{classroom_id}/notifications/email/send", response_model=schemas.EmailNotificationSendResult)
def send_class_email(classroom_id: int, data: schemas.EmailNotificationRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    classroom, teacher = class_and_teacher(db, classroom_id, user.id)
    validate_message(data)
    hour_ago = datetime.utcnow() - timedelta(hours=1)
    recent_count = db.query(models.EmailNotification).filter(
        models.EmailNotification.sent_by_user_id == user.id,
        models.EmailNotification.created_at >= hour_ago,
    ).count()
    if recent_count >= 5:
        raise HTTPException(429, "Bulk email limit reached. Try again after one hour")
    recipients, assessment = resolve_recipients(db, classroom_id, data)

    notification = models.EmailNotification(
        classroom_id=classroom_id,
        assessment_id=assessment.id if assessment else None,
        sent_by_user_id=user.id,
        subject=data.subject.strip(),
        message_body=data.message_body.strip(),
        recipient_mode=data.recipient_mode,
        recipient_count=len(recipients),
        status="sending",
    )
    db.add(notification)
    db.flush()
    delivery_rows = []
    for member in recipients:
        row = models.EmailNotificationRecipient(
            notification_id=notification.id,
            user_id=member.user_id,
            email=member.user.email,
            status="pending",
        )
        db.add(row)
        delivery_rows.append((row, member))
    db.commit()

    config_error = configuration_error()
    sent = 0
    failed = 0
    provider_ids = []
    for row, member in delivery_rows:
        subject = replace_variables(data.subject.strip(), classroom, teacher, member, assessment)
        message = replace_variables(data.message_body.strip(), classroom, teacher, member, assessment)
        success, error, provider_id = (False, config_error, None) if config_error else send_email(member.user.email, subject, message)
        if success:
            row.status = "sent"
            row.sent_at = datetime.utcnow()
            sent += 1
            if provider_id:
                provider_ids.append(provider_id)
        else:
            row.status = "failed"
            row.error_message = error
            failed += 1

    notification.sent_at = datetime.utcnow()
    notification.status = "completed" if not failed else "failed" if not sent else "partial"
    notification.error_message = config_error if config_error else ("Some recipients could not be reached" if failed else None)
    notification.provider_message_id = ",".join(provider_ids) or None
    db.commit()
    return {
        "notification_id": notification.id,
        "recipient_count": len(recipients),
        "sent": sent,
        "failed": failed,
        "status": notification.status,
        "error_message": notification.error_message,
    }


def notification_summary(item):
    return {
        "id": item.id,
        "assessment_id": item.assessment_id,
        "subject": item.subject,
        "recipient_mode": item.recipient_mode,
        "recipient_count": item.recipient_count,
        "status": item.status,
        "sent_at": item.sent_at,
        "created_at": item.created_at,
        "sent_by_name": item.sent_by.name,
        "error_message": item.error_message,
    }


@router.get("/classrooms/{classroom_id}/notifications/email/history")
def email_history(classroom_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    class_and_teacher(db, classroom_id, user.id)
    items = db.query(models.EmailNotification).filter_by(classroom_id=classroom_id).order_by(models.EmailNotification.created_at.desc()).all()
    return [notification_summary(item) for item in items]


@router.get("/notifications/email/{notification_id}")
def email_details(notification_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    item = db.get(models.EmailNotification, notification_id)
    if not item:
        raise HTTPException(404, "Email notification not found")
    classroom, teacher = class_and_teacher(db, item.classroom_id, user.id)
    personalized = [{
        "user_id": row.user_id,
        "name": row.user.name,
        "email": row.email,
        "status": row.status,
        "error_message": row.error_message,
        "sent_at": row.sent_at,
        "subject": replace_variables(item.subject, classroom, teacher, row, item.assessment),
        "message_body": replace_variables(item.message_body, classroom, teacher, row, item.assessment),
    } for row in item.recipients]
    return {
        **notification_summary(item),
        "subject": personalized[0]["subject"] if personalized else item.subject,
        "message_body": personalized[0]["message_body"] if personalized else item.message_body,
        "recipients": personalized,
    }
