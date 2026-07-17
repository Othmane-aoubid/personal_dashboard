import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    module = Column(String, nullable=False)   # 'calendar' | 'todos' | 'financials' | 'goals' | 'files' | 'studio'
    action = Column(String, nullable=False)   # 'created' | 'updated' | 'deleted' | 'viewed' | 'generated'
    entity_id = Column(UUID(as_uuid=True), nullable=True)
    entity_type = Column(String, nullable=True)
    extra_data = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class AIPrompt(Base):
    __tablename__ = "ai_prompts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    provider = Column(String, nullable=False)
    feature = Column(String, nullable=False)  # 'chat' | 'analysis' | 'generation' | 'image' | 'video'
    prompt = Column(String, nullable=False)
    output = Column(String, nullable=True)
    model = Column(String, nullable=True)
    tokens_used = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
