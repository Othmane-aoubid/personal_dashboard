import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, JSON, Boolean
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    timezone = Column(String, default="UTC")
    theme = Column(String, default="system")  # 'light' | 'dark' | 'system'
    widget_config = Column(JSON, default=dict)  # enabled widgets + sidebar order
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id = Column(UUID(as_uuid=True), primary_key=True)
    ai_provider_default = Column(String, default="gemini")
    # Encrypted AI keys per provider: { "gemini": "<encrypted>", "openai": "<encrypted>" }
    ai_providers = Column(JSON, default=dict)
    # Allowed file browser roots (must be within /userfiles mount)
    mounted_paths = Column(JSON, default=list)
    notification_rules = Column(JSON, default=dict)
    fiscal_year_start = Column(String, default="1")  # month as string


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    token_hash = Column(String, unique=True, nullable=False)
    device_info = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    revoked_at = Column(DateTime(timezone=True), nullable=True)
