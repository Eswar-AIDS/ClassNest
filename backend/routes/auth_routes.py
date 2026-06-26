import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from auth import create_access_token, get_current_user, hash_password, verify_password
import models, schemas

router = APIRouter(prefix="/auth", tags=["Authentication"])
SREC_EMAIL_ERROR = "Use your official SREC email address ending with @srec.ac.in"
SREC_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@srec\.ac\.in$")


@router.post("/register", response_model=schemas.Token, status_code=201)
def register(data: schemas.UserCreate, db: Session = Depends(get_db)):
    email = str(data.email).strip().lower()
    if not email.endswith("@srec.ac.in") or not SREC_EMAIL_RE.fullmatch(email):
        raise HTTPException(status_code=400, detail=SREC_EMAIL_ERROR)
    if db.query(models.User).filter_by(email=email).first():
        raise HTTPException(409, "Email is already registered")
    user = models.User(name=data.name.strip(), email=email, password_hash=hash_password(data.password))
    db.add(user); db.commit(); db.refresh(user)
    return {"access_token": create_access_token(user.id)}


@router.post("/login", response_model=schemas.Token)
def login(data: schemas.LoginInput, db: Session = Depends(get_db)):
    user = db.query(models.User).filter_by(email=data.email.lower()).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    return {"access_token": create_access_token(user.id)}


@router.get("/me", response_model=schemas.UserOut)
def me(user=Depends(get_current_user)):
    return user
