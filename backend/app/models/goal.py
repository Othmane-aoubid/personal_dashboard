import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Date, Numeric, Boolean, JSON
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Goal(Base):
    __tablename__ = "goals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    category = Column(String, default="personal")
    status = Column(String, default="not_started")
    target_date = Column(Date, nullable=True)
    pinned = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


class KeyResult(Base):
    __tablename__ = "key_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    title = Column(String, nullable=False)
    type = Column(String, default="numeric")  # 'numeric' | 'boolean'
    target_value = Column(Numeric(15, 2), nullable=True)
    current_value = Column(Numeric(15, 2), default=0)
    unit = Column(String, nullable=True)
    completed = Column(Boolean, default=False)


class GoalReflection(Base):
    __tablename__ = "goal_reflections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    note = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
