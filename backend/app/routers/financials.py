from datetime import date
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.financial import Account, Category, Transaction

router = APIRouter(prefix="/api/v1", tags=["financials"])


# ── Accounts ─────────────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    name: str
    type: str = "bank"
    currency: str = "MAD"
    balance: Decimal = Decimal("0")
    color: str = "blue"


@router.get("/accounts")
def list_accounts(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [{"id": str(a.id), "name": a.name, "type": a.type, "currency": a.currency,
             "balance": float(a.balance), "color": a.color}
            for a in db.query(Account).filter(Account.user_id == current_user.id).all()]


@router.post("/accounts", status_code=201)
def create_account(body: AccountCreate, current_user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    acc = Account(user_id=current_user.id, **body.model_dump())
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return {"id": str(acc.id), "name": acc.name, "type": acc.type, "currency": acc.currency,
            "balance": float(acc.balance), "color": acc.color}


@router.patch("/accounts/{account_id}")
def update_account(account_id: str, body: dict, current_user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    acc = db.query(Account).filter(Account.id == account_id, Account.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    for k, v in body.items():
        if hasattr(acc, k):
            setattr(acc, k, v)
    db.commit()
    return {"id": str(acc.id), "name": acc.name, "balance": float(acc.balance)}


# ── Categories ────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str
    type: str  # 'income' | 'expense'
    icon: Optional[str] = None
    color: str = "gray"
    budget_monthly: Optional[Decimal] = None


@router.get("/categories")
def list_categories(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [{"id": str(c.id), "name": c.name, "type": c.type, "icon": c.icon,
             "color": c.color, "budget_monthly": float(c.budget_monthly) if c.budget_monthly else None}
            for c in db.query(Category).filter(Category.user_id == current_user.id).all()]


@router.post("/categories", status_code=201)
def create_category(body: CategoryCreate, current_user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    cat = Category(user_id=current_user.id, **body.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"id": str(cat.id), "name": cat.name, "type": cat.type}


# ── Transactions ──────────────────────────────────────────────────────────────

class TransactionCreate(BaseModel):
    type: str
    amount: Decimal
    description: Optional[str] = None
    date: date
    account_id: Optional[str] = None
    category_id: Optional[str] = None
    tags: list = []


@router.get("/transactions")
def list_transactions(
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    category_id: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    if from_date:
        q = q.filter(Transaction.date >= from_date)
    if to_date:
        q = q.filter(Transaction.date <= to_date)
    if category_id:
        q = q.filter(Transaction.category_id == category_id)
    if account_id:
        q = q.filter(Transaction.account_id == account_id)
    if type:
        q = q.filter(Transaction.type == type)
    return [{"id": str(t.id), "type": t.type, "amount": float(t.amount),
             "description": t.description, "date": t.date.isoformat(),
             "account_id": str(t.account_id) if t.account_id else None,
             "category_id": str(t.category_id) if t.category_id else None,
             "tags": t.tags or []}
            for t in q.order_by(Transaction.date.desc()).all()]


@router.post("/transactions", status_code=201)
def create_transaction(body: TransactionCreate, current_user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    t = Transaction(user_id=current_user.id, **body.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": str(t.id), "type": t.type, "amount": float(t.amount), "date": t.date.isoformat()}


@router.delete("/transactions/{txn_id}", status_code=204)
def delete_transaction(txn_id: str, current_user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    t = db.query(Transaction).filter(Transaction.id == txn_id, Transaction.user_id == current_user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(t)
    db.commit()


@router.get("/financials/summary")
def financial_summary(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from datetime import datetime
    now = datetime.now()
    month_start = date(now.year, now.month, 1)

    income = db.query(func.sum(Transaction.amount)).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == "income",
        Transaction.date >= month_start,
    ).scalar() or 0

    expense = db.query(func.sum(Transaction.amount)).filter(
        Transaction.user_id == current_user.id,
        Transaction.type == "expense",
        Transaction.date >= month_start,
    ).scalar() or 0

    return {
        "month_income": float(income),
        "month_expense": float(expense),
        "month_net": float(income) - float(expense),
    }
