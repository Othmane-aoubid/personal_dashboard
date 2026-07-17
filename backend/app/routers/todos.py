from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.todo import Todo

router = APIRouter(prefix="/api/v1/todos", tags=["todos"])


class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: int = 2
    due_at: Optional[datetime] = None
    labels: list = []
    parent_id: Optional[str] = None
    status: str = "backlog"


class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[int] = None
    due_at: Optional[datetime] = None
    labels: Optional[list] = None
    order_index: Optional[float] = None


def _s(t: Todo) -> dict:
    return {
        "id": str(t.id),
        "parent_id": str(t.parent_id) if t.parent_id else None,
        "title": t.title,
        "description": t.description,
        "status": t.status,
        "priority": t.priority,
        "due_at": t.due_at.isoformat() if t.due_at else None,
        "labels": t.labels or [],
        "order_index": t.order_index,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
    }


@router.get("")
def list_todos(
    status: Optional[str] = Query(None),
    priority: Optional[int] = Query(None),
    label: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Todo).filter(Todo.user_id == current_user.id)
    if status:
        q = q.filter(Todo.status == status)
    if priority is not None:
        q = q.filter(Todo.priority == priority)
    todos = q.order_by(Todo.order_index, Todo.created_at).all()
    if label:
        todos = [t for t in todos if label in (t.labels or [])]
    return [_s(t) for t in todos]


@router.post("", status_code=201)
def create_todo(body: TodoCreate, current_user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    # Set order_index to end of list
    last = db.query(Todo).filter(
        Todo.user_id == current_user.id, Todo.status == body.status
    ).order_by(Todo.order_index.desc()).first()
    order = (last.order_index + 1.0) if last else 0.0

    todo = Todo(user_id=current_user.id, order_index=order, **body.model_dump())
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return _s(todo)


@router.get("/{todo_id}")
def get_todo(todo_id: str, current_user: User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    todo = db.query(Todo).filter(Todo.id == todo_id, Todo.user_id == current_user.id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return _s(todo)


@router.patch("/{todo_id}")
def update_todo(todo_id: str, body: TodoUpdate, current_user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    todo = db.query(Todo).filter(Todo.id == todo_id, Todo.user_id == current_user.id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(todo, k, v)
    db.commit()
    db.refresh(todo)
    return _s(todo)


@router.post("/{todo_id}/complete")
def complete_todo(todo_id: str, current_user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    todo = db.query(Todo).filter(Todo.id == todo_id, Todo.user_id == current_user.id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    todo.status = "done"
    todo.completed_at = datetime.now(timezone.utc)
    db.commit()
    return _s(todo)


@router.delete("/{todo_id}", status_code=204)
def delete_todo(todo_id: str, current_user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    todo = db.query(Todo).filter(Todo.id == todo_id, Todo.user_id == current_user.id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    db.delete(todo)
    db.commit()
