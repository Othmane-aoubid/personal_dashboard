"""
Session / Activity Timeline router.
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.activity import ActivityLog
from app.models.wiki import WorkspaceSnapshot

router = APIRouter(prefix="/api/v1/timeline", tags=["timeline"])


class LogEntry(BaseModel):
    module: str
    action: str
    entity_id: Optional[str] = None
    entity_type: Optional[str] = None
    label: Optional[str] = None


# ── Schemas ────────────────────────────────────────────────────────────────────

class SnapshotCreate(BaseModel):
    name: str
    open_pages: list = []   # [{href, label}]
    notes: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _entry(log: ActivityLog) -> dict:
    extra = log.extra_data or {}
    return {
        "id": str(log.id),
        "module": log.module,
        "action": log.action,
        "label": extra.get("label"),
        "entity_id": str(log.entity_id) if log.entity_id else None,
        "entity_type": log.entity_type,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("")
def get_timeline(
    days: int = Query(default=7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    logs = (
        db.query(ActivityLog)
        .filter(ActivityLog.user_id == current_user.id, ActivityLog.created_at >= since)
        .order_by(ActivityLog.created_at.desc())
        .limit(500)
        .all()
    )

    # Group by date
    days_dict: dict = {}
    for log in logs:
        if log.created_at:
            date_str = log.created_at.strftime("%Y-%m-%d")
        else:
            date_str = "unknown"
        if date_str not in days_dict:
            days_dict[date_str] = []
        days_dict[date_str].append(_entry(log))

    result = [
        {"date": d, "entries": entries}
        for d, entries in sorted(days_dict.items(), reverse=True)
    ]
    return {"days": result}


@router.get("/summary")
def get_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    def count(module=None, action=None, since=None):
        q = db.query(func.count(ActivityLog.id)).filter(
            ActivityLog.user_id == current_user.id
        )
        if module:
            q = q.filter(ActivityLog.module == module)
        if action:
            q = q.filter(ActivityLog.action == action)
        if since:
            q = q.filter(ActivityLog.created_at >= since)
        return q.scalar() or 0

    return {
        "todos_completed_today": count(module="todos", action="completed", since=today_start),
        "todos_completed_week": count(module="todos", action="completed", since=week_start),
        "goals_updated_week": count(module="goals", action="updated", since=week_start),
        "files_accessed_today": count(module="files", since=today_start),
        "total_actions_today": count(since=today_start),
        "total_actions_week": count(since=week_start),
    }


@router.post("/session/save", status_code=201)
def save_snapshot(
    body: SnapshotCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    snap = WorkspaceSnapshot(
        user_id=current_user.id,
        name=body.name,
        open_pages=body.open_pages,
        notes=body.notes,
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return {
        "id": str(snap.id),
        "name": snap.name,
        "open_pages": snap.open_pages,
        "notes": snap.notes,
        "created_at": snap.created_at.isoformat() if snap.created_at else None,
    }


@router.get("/session/list")
def list_snapshots(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    snaps = (
        db.query(WorkspaceSnapshot)
        .filter(WorkspaceSnapshot.user_id == current_user.id)
        .order_by(WorkspaceSnapshot.created_at.desc())
        .all()
    )
    return [
        {
            "id": str(s.id),
            "name": s.name,
            "open_pages": s.open_pages or [],
            "notes": s.notes,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in snaps
    ]


@router.delete("/session/{snap_id}", status_code=204)
def delete_snapshot(
    snap_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    snap = (
        db.query(WorkspaceSnapshot)
        .filter(WorkspaceSnapshot.id == snap_id, WorkspaceSnapshot.user_id == current_user.id)
        .first()
    )
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    db.delete(snap)
    db.commit()


@router.post("/log", status_code=201)
def log_activity(
    body: LogEntry,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = ActivityLog(
        user_id=current_user.id,
        module=body.module,
        action=body.action,
        entity_id=uuid.UUID(body.entity_id) if body.entity_id else None,
        entity_type=body.entity_type,
        extra_data={"label": body.label} if body.label else {},
    )
    db.add(log)
    db.commit()
    return {"ok": True}


@router.get("/stats")
def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models.todo import Todo as TodoModel
    from app.models.goal import Goal as GoalModel
    from app.routers.goals import _goal_progress

    uid = current_user.id

    # Todos by status
    todos_by_status = []
    for status, label in [("backlog", "Backlog"), ("in_progress", "In Progress"),
                           ("done", "Done"), ("archived", "Archived")]:
        count = db.query(func.count(TodoModel.id)).filter(
            TodoModel.user_id == uid, TodoModel.status == status
        ).scalar() or 0
        todos_by_status.append({"name": label, "value": count, "status": status})

    # Todos by priority (open only)
    priority_labels = {0: "Urgent", 1: "High", 2: "Medium", 3: "Low"}
    todos_by_priority = []
    for p, label in priority_labels.items():
        count = db.query(func.count(TodoModel.id)).filter(
            TodoModel.user_id == uid,
            TodoModel.priority == p,
            TodoModel.status.notin_(["done", "archived"]),
        ).scalar() or 0
        todos_by_priority.append({"name": label, "count": count})

    # Goals progress (compute from key results, same as goals router)
    goals = (
        db.query(GoalModel)
        .filter(GoalModel.user_id == uid, GoalModel.status != "archived")
        .order_by(GoalModel.created_at.desc())
        .limit(8)
        .all()
    )
    goals_data = [
        {"title": (g.title[:20] + "…") if len(g.title) > 20 else g.title,
         "progress": round(_goal_progress(g.id, db)),
         "status": g.status}
        for g in goals
    ]

    # Activity per day last 7 days
    now = datetime.now(timezone.utc)
    activity_by_day = []
    for i in range(6, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = db.query(func.count(ActivityLog.id)).filter(
            ActivityLog.user_id == uid,
            ActivityLog.created_at >= day_start,
            ActivityLog.created_at < day_end,
        ).scalar() or 0
        activity_by_day.append({"day": day_start.strftime("%a"), "actions": count})

    # Overdue todos
    overdue = db.query(func.count(TodoModel.id)).filter(
        TodoModel.user_id == uid,
        TodoModel.status.notin_(["done", "archived"]),
        TodoModel.due_at.isnot(None),
        TodoModel.due_at < datetime.now(timezone.utc),
    ).scalar() or 0

    return {
        "todos_by_status": todos_by_status,
        "todos_by_priority": todos_by_priority,
        "goals": goals_data,
        "activity_by_day": activity_by_day,
        "overdue_todos": overdue,
    }
