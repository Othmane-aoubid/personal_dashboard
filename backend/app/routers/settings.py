from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.core.security import verify_password, get_password_hash
from app.core.encryption import encrypt
from app.database import get_db
from app.models.user import User, UserSettings, Session as DbSession

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    timezone: Optional[str] = None
    theme: Optional[str] = None
    widget_config: Optional[dict] = None
    ai_provider_default: Optional[str] = None
    mounted_paths: Optional[list] = None
    fiscal_year_start: Optional[str] = None


class AIKeyRequest(BaseModel):
    provider: str
    api_key: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ── Profile / Settings ────────────────────────────────────────────────────────

@router.get("")
def get_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    us = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()

    ai_providers_configured = {}
    if us and us.ai_providers:
        for p in ("gemini", "openai", "anthropic", "runway"):
            ai_providers_configured[p] = bool(us.ai_providers.get(p))

    return {
        "full_name": current_user.name,
        "email": current_user.email,
        "timezone": current_user.timezone,
        "theme": current_user.theme,
        "widget_config": current_user.widget_config,
        "ai_provider_default": us.ai_provider_default if us else "gemini",
        "ai_providers_configured": ai_providers_configured,
        "mounted_paths": us.mounted_paths if us else ["/userfiles"],
        "fiscal_year_start": us.fiscal_year_start if us else "1",
    }


@router.patch("")
def update_settings(
    body: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.full_name is not None:
        current_user.name = body.full_name
    if body.email is not None:
        existing = db.query(User).filter(User.email == body.email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=409, detail="Email already in use")
        current_user.email = body.email
    if body.timezone is not None:
        current_user.timezone = body.timezone
    if body.theme is not None:
        current_user.theme = body.theme
    if body.widget_config is not None:
        current_user.widget_config = body.widget_config
    current_user.updated_at = datetime.now(timezone.utc)

    us = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    if not us:
        us = UserSettings(user_id=current_user.id)
        db.add(us)

    if body.ai_provider_default is not None:
        us.ai_provider_default = body.ai_provider_default
    if body.mounted_paths is not None:
        us.mounted_paths = body.mounted_paths
    if body.fiscal_year_start is not None:
        us.fiscal_year_start = body.fiscal_year_start

    db.commit()
    return {"message": "Settings updated"}


# ── AI Provider Keys ──────────────────────────────────────────────────────────

@router.post("/ai-keys")
def save_ai_key(
    body: AIKeyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.provider not in ("gemini", "openai", "anthropic", "runway"):
        raise HTTPException(status_code=400, detail="Unknown provider")
    if not body.api_key.strip():
        raise HTTPException(status_code=400, detail="API key cannot be empty")

    us = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    if not us:
        us = UserSettings(user_id=current_user.id)
        db.add(us)

    providers = dict(us.ai_providers or {})
    providers[body.provider] = encrypt(body.api_key.strip())
    us.ai_providers = providers
    db.commit()
    return {"message": f"{body.provider} API key saved"}


@router.delete("/ai-keys/{provider}")
def delete_ai_key(
    provider: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    us = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    if us and us.ai_providers:
        providers = dict(us.ai_providers)
        providers.pop(provider, None)
        us.ai_providers = providers
        db.commit()
    return {"message": f"{provider} key removed"}


# ── Password & Account ────────────────────────────────────────────────────────

@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if len(body.new_password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password too long (max 72 bytes)")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    current_user.hashed_password = get_password_hash(body.new_password)
    current_user.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Password updated"}


@router.delete("/account")
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently delete the authenticated user and all their data."""
    user_id = current_user.id

    from app.models.activity import ActivityLog, AIPrompt
    from app.models.todo import Todo
    from app.models.event import Event
    from app.models.financial import Transaction, Account, Category
    from app.models.goal import Goal, KeyResult, GoalReflection

    goal_ids = [g.id for g in db.query(Goal.id).filter(Goal.user_id == user_id).all()]
    if goal_ids:
        db.query(KeyResult).filter(KeyResult.goal_id.in_(goal_ids)).delete(synchronize_session=False)
        db.query(GoalReflection).filter(GoalReflection.goal_id.in_(goal_ids)).delete(synchronize_session=False)

    for model in [ActivityLog, AIPrompt, Todo, Event, Transaction, Account, Category, Goal]:
        db.query(model).filter(model.user_id == user_id).delete(synchronize_session=False)

    db.query(UserSettings).filter(UserSettings.user_id == user_id).delete(synchronize_session=False)
    db.query(DbSession).filter(DbSession.user_id == user_id).delete(synchronize_session=False)
    db.query(User).filter(User.id == user_id).delete(synchronize_session=False)
    db.commit()
    return {"message": "Account deleted"}


# ── Sessions ──────────────────────────────────────────────────────────────────

@router.get("/sessions")
def list_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sessions = db.query(DbSession).filter(
        DbSession.user_id == current_user.id,
        DbSession.revoked_at.is_(None),
        DbSession.expires_at > datetime.now(timezone.utc),
    ).order_by(DbSession.created_at.desc()).all()

    return [
        {
            "id": str(s.id),
            "user_agent": s.device_info,
            "ip_address": s.ip_address,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "expires_at": s.expires_at.isoformat() if s.expires_at else None,
            "is_current": False,
        }
        for s in sessions
    ]


@router.delete("/sessions/{session_id}")
def revoke_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = db.query(DbSession).filter(
        DbSession.id == session_id,
        DbSession.user_id == current_user.id,
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    s.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Session revoked"}


@router.delete("/sessions")
def revoke_all_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke all sessions for this user."""
    db.query(DbSession).filter(
        DbSession.user_id == current_user.id,
        DbSession.revoked_at.is_(None),
    ).update({"revoked_at": datetime.now(timezone.utc)})
    db.commit()
    return {"message": "All sessions revoked"}


# ── Data Export ───────────────────────────────────────────────────────────────

@router.get("/export")
def export_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export all user data as JSON."""
    from app.models.activity import ActivityLog
    from app.models.todo import Todo
    from app.models.event import Event
    from app.models.financial import Transaction, Account, Category
    from app.models.goal import Goal, KeyResult, GoalReflection

    def serialize(r, model):
        result = {}
        for c in model.__table__.columns:
            val = getattr(r, c.name)
            if hasattr(val, 'hex'):
                val = str(val)
            elif hasattr(val, 'isoformat'):
                val = val.isoformat()
            result[c.name] = val
        return result

    def rows(model):
        return [serialize(r, model) for r in
                db.query(model).filter(model.user_id == current_user.id).all()]

    goal_ids = [g.id for g in db.query(Goal.id).filter(Goal.user_id == current_user.id).all()]

    kr_rows = []
    refl_rows = []
    if goal_ids:
        kr_rows = [serialize(r, KeyResult) for r in
                   db.query(KeyResult).filter(KeyResult.goal_id.in_(goal_ids)).all()]
        refl_rows = [serialize(r, GoalReflection) for r in
                     db.query(GoalReflection).filter(GoalReflection.goal_id.in_(goal_ids)).all()]

    export = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": {
            "id": str(current_user.id),
            "email": current_user.email,
            "name": current_user.name,
        },
        "events": rows(Event),
        "todos": rows(Todo),
        "transactions": rows(Transaction),
        "accounts": rows(Account),
        "categories": rows(Category),
        "goals": rows(Goal),
        "key_results": kr_rows,
        "goal_reflections": refl_rows,
        "activity_log": rows(ActivityLog),
    }

    return JSONResponse(
        content=export,
        headers={"Content-Disposition": 'attachment; filename="personal-os-export.json"'},
    )


# ── Activity Log ──────────────────────────────────────────────────────────────

@router.get("/activity")
def get_activity(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models.activity import ActivityLog
    logs = (
        db.query(ActivityLog)
        .filter(ActivityLog.user_id == current_user.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": str(l.id),
            "module": l.module,
            "action": l.action,
            "entity_type": l.entity_type,
            "created_at": l.created_at.isoformat(),
        }
        for l in logs
    ]
