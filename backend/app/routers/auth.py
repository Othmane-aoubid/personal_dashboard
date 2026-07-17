from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.orm import Session

from app.core.security import (
    verify_password, get_password_hash, create_access_token,
    create_refresh_token, decode_token, hash_token,
)
from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User, Session as DbSession, UserSettings
from app.config import settings
from pydantic import BaseModel, EmailStr

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    if len(body.password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password too long")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_password=get_password_hash(body.password),
        name=body.name,
    )
    db.add(user)
    db.flush()

    # Create default settings
    us = UserSettings(
        user_id=user.id,
        mounted_paths=["/userfiles"],
    )
    db.add(us)
    db.commit()
    db.refresh(user)

    return _issue_tokens(user, request, response, db)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    # Always call verify_password — prevents timing attack user enumeration
    dummy_hash = "$2b$12$dummy_hash_for_constant_time_check_xxxxxxxxx"
    if not user:
        verify_password(body.password, dummy_hash)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return _issue_tokens(user, request, response, db)


@router.post("/refresh-token", response_model=TokenResponse)
def refresh_with_body(body: RefreshRequest, db: Session = Depends(get_db)):
    """Token refresh via request body — for server-side callers like NextAuth."""
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    token_hash = hash_token(body.refresh_token)
    db_session = db.query(DbSession).filter(
        DbSession.token_hash == token_hash,
        DbSession.revoked_at.is_(None),
        DbSession.expires_at > datetime.now(timezone.utc),
    ).first()
    if not db_session:
        raise HTTPException(status_code=401, detail="Session expired or revoked")

    user = db.query(User).filter(User.id == db_session.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    access_token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    token_hash = hash_token(refresh_token)
    db_session = db.query(DbSession).filter(
        DbSession.token_hash == token_hash,
        DbSession.revoked_at.is_(None),
        DbSession.expires_at > datetime.now(timezone.utc),
    ).first()
    if not db_session:
        raise HTTPException(status_code=401, detail="Session expired or revoked")

    user = db.query(User).filter(User.id == db_session.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    access_token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=access_token)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        token_hash = hash_token(refresh_token)
        db_session = db.query(DbSession).filter(DbSession.token_hash == token_hash).first()
        if db_session:
            db_session.revoked_at = datetime.now(timezone.utc)
            db.commit()
    response.delete_cookie("refresh_token")
    return {"message": "Logged out"}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "name": current_user.name,
        "avatar_url": current_user.avatar_url,
        "timezone": current_user.timezone,
        "theme": current_user.theme,
        "widget_config": current_user.widget_config,
    }


@router.get("/sessions")
def list_sessions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sessions = db.query(DbSession).filter(
        DbSession.user_id == current_user.id,
        DbSession.revoked_at.is_(None),
        DbSession.expires_at > datetime.now(timezone.utc),
    ).all()
    return [{"id": str(s.id), "device_info": s.device_info, "ip_address": s.ip_address,
             "created_at": s.created_at, "expires_at": s.expires_at} for s in sessions]


@router.delete("/sessions/{session_id}")
def revoke_session(session_id: str, current_user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    s = db.query(DbSession).filter(
        DbSession.id == session_id,
        DbSession.user_id == current_user.id,
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    s.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Session revoked"}


# ── Internal helper ───────────────────────────────────────────────────────────

def _issue_tokens(user: User, request: Request, response: Response, db: Session) -> TokenResponse:
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    db_session = DbSession(
        user_id=user.id,
        token_hash=hash_token(refresh_token),
        device_info=request.headers.get("User-Agent", "")[:255],
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(db_session)
    db.commit()

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=settings.APP_ENV == "production",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )
    return TokenResponse(access_token=access_token)
