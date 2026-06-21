from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user, hash_password, verify_password
from database import get_db
import models
import schemas

router = APIRouter(prefix="/users", tags=["User Profile"])


def profile_output(db: Session, user: models.User):
    teaching_count = db.query(models.ClassMember).filter_by(user_id=user.id, role="teacher").count()
    learning_count = db.query(models.ClassMember).filter_by(user_id=user.id, role="student").count()
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "bio": user.bio,
        "avatar_url": user.avatar_url,
        "created_at": user.created_at,
        "teaching_count": teaching_count,
        "learning_count": learning_count,
    }


@router.get("/me", response_model=schemas.UserProfileOut)
def get_profile(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return profile_output(db, user)


@router.put("/me", response_model=schemas.UserProfileOut)
def update_profile(data: schemas.UserProfileUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    user.name = data.name.strip()
    user.bio = data.bio.strip() if data.bio and data.bio.strip() else None
    user.avatar_url = str(data.avatar_url) if data.avatar_url else None
    db.commit()
    db.refresh(user)
    return profile_output(db, user)


@router.put("/me/password", status_code=204)
def change_password(data: schemas.PasswordChange, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    db.commit()
