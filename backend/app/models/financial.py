import uuid
from datetime import datetime, date, timezone
from sqlalchemy import Column, String, DateTime, Date, Numeric, JSON
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Account(Base):
    __tablename__ = "accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String, nullable=False)
    type = Column(String, default="bank")  # 'bank' | 'cash' | 'credit' | 'investment'
    currency = Column(String, default="MAD")
    balance = Column(Numeric(15, 2), default=0)
    color = Column(String, default="blue")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Category(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String, nullable=False)
    icon = Column(String, nullable=True)
    color = Column(String, default="gray")
    type = Column(String, nullable=False)  # 'income' | 'expense'
    budget_monthly = Column(Numeric(15, 2), nullable=True)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    account_id = Column(UUID(as_uuid=True), nullable=True)
    category_id = Column(UUID(as_uuid=True), nullable=True)
    type = Column(String, nullable=False)  # 'income' | 'expense' | 'transfer'
    amount = Column(Numeric(15, 2), nullable=False)
    description = Column(String, nullable=True)
    date = Column(Date, nullable=False, default=date.today)
    recurrence_rule = Column(JSON, nullable=True)
    tags = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
