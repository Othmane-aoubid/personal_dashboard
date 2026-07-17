from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.goal import Goal, KeyResult, GoalReflection

router = APIRouter(prefix="/api/v1/goals", tags=["goals"])


class GoalCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str = "personal"
    target_date: Optional[date] = None


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    target_date: Optional[date] = None
    pinned: Optional[bool] = None


class KRUpdate(BaseModel):
    current_value: Optional[float] = None
    completed: Optional[bool] = None
    title: Optional[str] = None
    target_value: Optional[float] = None


class ReflectionCreate(BaseModel):
    note: str


def _goal_progress(goal_id, db) -> float:
    krs = db.query(KeyResult).filter(KeyResult.goal_id == goal_id).all()
    if not krs:
        return 0.0
    total = 0.0
    for kr in krs:
        if kr.type == "boolean":
            total += 100.0 if kr.completed else 0.0
        else:
            if kr.target_value and float(kr.target_value) > 0:
                total += min(100.0, float(kr.current_value or 0) / float(kr.target_value) * 100)
    return round(total / len(krs), 1)


def _s(g: Goal, db: Session) -> dict:
    krs = db.query(KeyResult).filter(KeyResult.goal_id == g.id).all()
    return {
        "id": str(g.id),
        "title": g.title,
        "description": g.description,
        "category": g.category,
        "status": g.status,
        "target_date": g.target_date.isoformat() if g.target_date else None,
        "pinned": g.pinned,
        "progress": _goal_progress(g.id, db),
        "key_results": [{"id": str(kr.id), "title": kr.title, "type": kr.type,
                         "target_value": float(kr.target_value) if kr.target_value else None,
                         "current_value": float(kr.current_value or 0),
                         "unit": kr.unit, "completed": kr.completed} for kr in krs],
        "created_at": g.created_at.isoformat() if g.created_at else None,
    }


@router.get("")
def list_goals(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goals = db.query(Goal).filter(Goal.user_id == current_user.id).order_by(
        Goal.pinned.desc(), Goal.created_at.desc()
    ).all()
    return [_s(g, db) for g in goals]


@router.post("", status_code=201)
def create_goal(body: GoalCreate, current_user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    goal = Goal(user_id=current_user.id, **body.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _s(goal, db)


@router.patch("/{goal_id}")
def update_goal(goal_id: str, body: GoalUpdate, current_user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == current_user.id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(goal, k, v)
    db.commit()
    return _s(goal, db)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: str, current_user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == current_user.id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(goal)
    db.commit()


@router.patch("/{goal_id}/kr/{kr_id}")
def update_kr(goal_id: str, kr_id: str, body: KRUpdate,
              current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == current_user.id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    kr = db.query(KeyResult).filter(KeyResult.id == kr_id, KeyResult.goal_id == goal_id).first()
    if not kr:
        raise HTTPException(status_code=404, detail="Key result not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(kr, k, v)
    db.commit()
    return _s(goal, db)


@router.post("/{goal_id}/reflect")
def add_reflection(goal_id: str, body: ReflectionCreate,
                   current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == current_user.id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    ref = GoalReflection(goal_id=goal_id, user_id=current_user.id, note=body.note)
    db.add(ref)
    db.commit()
    return {"id": str(ref.id), "note": ref.note, "created_at": ref.created_at.isoformat()}
