import hashlib
import os
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from auth import create_access_token, get_current_user, hash_password, verify_password
from services.email_service import send_email
from services.email_validation import (
    INVALID_EMAIL_FORMAT_MESSAGE,
    is_valid_email_format,
    normalize_email,
    validate_registration_email,
)
import models, schemas

router = APIRouter(prefix="/auth", tags=["Authentication"])
RESET_SUCCESS_MESSAGE = "If an account exists for this email, a reset link has been sent."
RESET_TOKEN_MINUTES = 30


def token_hash(raw_token: str):
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def send_password_reset_email(recipient_email: str, name: str, reset_link: str):
    message = (
        f"Hi {name},\n\n"
        "We received a request to reset your ClassNest password.\n\n"
        "Click the link below to set a new password:\n"
        f"{reset_link}\n\n"
        "This link will expire in 30 minutes.\n\n"
        "If you did not request this, you can ignore this email."
    )
    send_email(recipient_email, "Reset your ClassNest password", message)


@router.post("/register", response_model=schemas.Token, status_code=201)
def register(data: schemas.UserCreate, db: Session = Depends(get_db)):
    try:
        email = validate_registration_email(data.email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if db.query(models.User).filter_by(email=email).first():
        raise HTTPException(409, "Email is already registered")
    user = models.User(name=data.name.strip(), email=email, password_hash=hash_password(data.password))
    db.add(user); db.commit(); db.refresh(user)
    return {"access_token": create_access_token(user.id)}


@router.post("/login", response_model=schemas.Token)
def login(data: schemas.LoginInput, db: Session = Depends(get_db)):
    email = normalize_email(data.email)
    user = db.query(models.User).filter_by(email=email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    return {"access_token": create_access_token(user.id)}


@router.post("/forgot-password", response_model=schemas.MessageOut)
def forgot_password(data: schemas.ForgotPasswordInput, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    email = normalize_email(data.email)
    if not is_valid_email_format(email):
        raise HTTPException(status_code=400, detail=INVALID_EMAIL_FORMAT_MESSAGE)
    user = db.query(models.User).filter_by(email=email).first()
    if user:
        raw_token = secrets.token_urlsafe(48)
        db.add(models.PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash(raw_token),
            expires_at=datetime.utcnow() + timedelta(minutes=RESET_TOKEN_MINUTES),
        ))
        db.commit()
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
        reset_link = f"{frontend_url}/reset-password?token={raw_token}"
        background_tasks.add_task(send_password_reset_email, user.email, user.name, reset_link)
    return {"message": RESET_SUCCESS_MESSAGE}


@router.post("/reset-password", response_model=schemas.MessageOut)
def reset_password(data: schemas.ResetPasswordInput, db: Session = Depends(get_db)):
    reset = db.query(models.PasswordResetToken).filter_by(token_hash=token_hash(data.token)).first()
    now = datetime.utcnow()
    if not reset or reset.used_at is not None or reset.expires_at < now:
        raise HTTPException(400, "Reset link is invalid or expired")
    user = db.get(models.User, reset.user_id)
    if not user:
        raise HTTPException(400, "Reset link is invalid or expired")
    user.password_hash = hash_password(data.new_password)
    reset.used_at = now
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.user_id == user.id,
        models.PasswordResetToken.id != reset.id,
        models.PasswordResetToken.used_at.is_(None),
    ).update({models.PasswordResetToken.used_at: now}, synchronize_session=False)
    db.commit()
    return {"message": "Password reset successfully. You can now sign in."}


@router.get("/me", response_model=schemas.UserOut)
def me(user=Depends(get_current_user)):
    return user
