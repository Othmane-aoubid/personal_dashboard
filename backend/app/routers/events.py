from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.event import Event

router = APIRouter(prefix="/api/v1/events", tags=["calendar"])


class EventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    location: Optional[str] = None
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    color: str = "blue"
    calendar_type: str = "personal"
    recurrence_rule: Optional[dict] = None


class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    all_day: Optional[bool] = None
    color: Optional[str] = None
    calendar_type: Optional[str] = None
    recurrence_rule: Optional[dict] = None


def _serialize(e: Event) -> dict:
    return {
        "id": str(e.id),
        "title": e.title,
        "description": e.description,
        "location": e.location,
        "start_at": e.start_at.isoformat() if e.start_at else None,
        "end_at": e.end_at.isoformat() if e.end_at else None,
        "all_day": e.all_day,
        "color": e.color,
        "calendar_type": e.calendar_type,
        "recurrence_rule": e.recurrence_rule,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


@router.get("")
def list_events(
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    calendar_type: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Event).filter(Event.user_id == current_user.id)
    if start:
        q = q.filter(Event.end_at >= start)
    if end:
        q = q.filter(Event.start_at <= end)
    if calendar_type:
        q = q.filter(Event.calendar_type == calendar_type)
    return [_serialize(e) for e in q.order_by(Event.start_at).all()]


@router.post("", status_code=201)
def create_event(body: EventCreate, current_user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    event = Event(user_id=current_user.id, **body.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return _serialize(event)


@router.get("/{event_id}")
def get_event(event_id: str, current_user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id, Event.user_id == current_user.id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return _serialize(event)


@router.patch("/{event_id}")
def update_event(event_id: str, body: EventUpdate, current_user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id, Event.user_id == current_user.id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(event, k, v)
    db.commit()
    db.refresh(event)
    return _serialize(event)


@router.delete("/{event_id}", status_code=204)
def delete_event(event_id: str, current_user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id, Event.user_id == current_user.id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    db.delete(event)
    db.commit()
