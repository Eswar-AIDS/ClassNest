from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

import models, schemas
from auth import get_current_user
from database import get_db
from utils import require_member, require_teacher

router = APIRouter(prefix="/classes", tags=["Class Activity"])


@router.post("/{classroom_id}/activity", status_code=204)
def record_class_activity(
    classroom_id: int,
    data: schemas.ClassActivityInput,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    require_member(db, classroom_id, user.id)
    now = datetime.utcnow()
    activity = db.query(models.ClassActivity).filter_by(classroom_id=classroom_id, user_id=user.id).first()
    if not activity:
        activity = models.ClassActivity(classroom_id=classroom_id, user_id=user.id, created_at=now)
        db.add(activity)
    activity.activity_type = data.activity_type
    activity.activity_label = data.activity_label
    activity.entity_type = data.entity_type
    activity.entity_id = data.entity_id
    activity.route_path = data.route_path
    activity.last_active_at = now
    activity.updated_at = now
    db.commit()
    return Response(status_code=204)


@router.get("/{classroom_id}/active-users", response_model=list[schemas.ActiveUserOut])
def active_users(classroom_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    require_teacher(db, classroom_id, user.id)
    now = datetime.utcnow()
    active_cutoff = now - timedelta(minutes=2)
    recent_cutoff = now - timedelta(minutes=10)
    rows = (
        db.query(models.ClassActivity, models.User)
        .join(models.User, models.User.id == models.ClassActivity.user_id)
        .join(
            models.ClassMember,
            (models.ClassMember.classroom_id == models.ClassActivity.classroom_id)
            & (models.ClassMember.user_id == models.ClassActivity.user_id),
        )
        .filter(models.ClassActivity.classroom_id == classroom_id)
        .filter(models.ClassMember.role == "student")
        .order_by(models.ClassActivity.last_active_at.desc())
        .all()
    )
    output = []
    for activity, activity_user in rows:
        if activity.last_active_at >= active_cutoff:
            status = "active"
        elif activity.last_active_at >= recent_cutoff:
            status = "recently_active"
        else:
            status = "offline"
        output.append({
            "user_id": activity_user.id,
            "name": activity_user.name,
            "email": activity_user.email,
            "activity_type": activity.activity_type,
            "activity_label": activity.activity_label,
            "entity_type": activity.entity_type,
            "entity_id": activity.entity_id,
            "route_path": activity.route_path,
            "last_active_at": activity.last_active_at,
            "status": status,
        })
    return output
