import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Integer, Float, JSON
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Todo(Base):
    __tablename__ = "todos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    parent_id = Column(UUID(as_uuid=True), nullable=True)  # subtask support
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)  # markdown
    status = Column(String, default="backlog")  # 'backlog' | 'in_progress' | 'done' | 'archived'
    priority = Column(Integer, default=2)  # 0=P0 (urgent) … 3=P3 (low)
    due_at = Column(DateTime(timezone=True), nullable=True)
    labels = Column(JSON, default=list)
    recurrence_rule = Column(JSON, nullable=True)
    order_index = Column(Float, default=0.0)  # for drag-and-drop ordering
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True), nullable=True)
