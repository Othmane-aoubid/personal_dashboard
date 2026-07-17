"""Seed a default admin user and sample data for first-run."""
import sys
sys.path.insert(0, ".")

from app.database import SessionLocal
from app.models.user import User, UserSettings
from app.models.event import Event
from app.models.todo import Todo
from app.models.goal import Goal, KeyResult
from app.models.financial import Account, Category
from app.core.security import get_password_hash
from datetime import datetime, timezone, timedelta, date
import uuid

db = SessionLocal()

# Check if already seeded
if db.query(User).first():
    print("Already seeded — skipping.")
    db.close()
    sys.exit(0)

print("Seeding database...")

# ── User ──────────────────────────────────────────────────────────────────────
user = User(
    email="me@personal.os",
    hashed_password=get_password_hash("Personal123!"),
    name="Othmane",
    timezone="Africa/Casablanca",
    theme="dark",
    widget_config={"enabled": ["calendar", "todos", "financials", "goals", "files", "studio"]},
)
db.add(user)
db.flush()

us = UserSettings(
    user_id=user.id,
    ai_provider_default="gemini",
    mounted_paths=["/userfiles", "/hostc"],
)
db.add(us)

# ── Sample events ─────────────────────────────────────────────────────────────
now = datetime.now(timezone.utc)
events = [
    Event(user_id=user.id, title="Team standup", start_at=now.replace(hour=9, minute=0),
          end_at=now.replace(hour=9, minute=30), color="blue", calendar_type="work"),
    Event(user_id=user.id, title="Gym session", start_at=(now + timedelta(days=1)).replace(hour=7),
          end_at=(now + timedelta(days=1)).replace(hour=8), color="green", calendar_type="personal"),
    Event(user_id=user.id, title="Portfolio review", start_at=(now + timedelta(days=2)).replace(hour=14),
          end_at=(now + timedelta(days=2)).replace(hour=15), color="purple", calendar_type="personal"),
]
db.add_all(events)

# ── Sample todos ──────────────────────────────────────────────────────────────
todos = [
    Todo(user_id=user.id, title="Update GitHub portfolio", priority=0, status="in_progress",
         labels=["career"], due_at=now + timedelta(days=3)),
    Todo(user_id=user.id, title="Get AWS Solutions Architect cert", priority=1, status="backlog",
         labels=["career", "learning"]),
    Todo(user_id=user.id, title="Build Big Data demo project (Spark + Kafka)", priority=1,
         status="backlog", labels=["career"]),
    Todo(user_id=user.id, title="Send 5 job applications", priority=0, status="backlog",
         labels=["career"], due_at=now + timedelta(days=1)),
    Todo(user_id=user.id, title="Read Designing Data-Intensive Applications", priority=2,
         status="in_progress", labels=["learning"]),
]
for i, t in enumerate(todos):
    t.order_index = float(i)
db.add_all(todos)

# ── Sample financials ─────────────────────────────────────────────────────────
account = Account(user_id=user.id, name="CIH Bank", type="bank", currency="MAD",
                  balance=12500, color="blue")
db.add(account)

cats = [
    Category(user_id=user.id, name="Salary", type="income", color="green", icon="💼"),
    Category(user_id=user.id, name="Freelance", type="income", color="emerald", icon="💻"),
    Category(user_id=user.id, name="Food", type="expense", color="orange", icon="🍔",
             budget_monthly=1500),
    Category(user_id=user.id, name="Transport", type="expense", color="yellow", icon="🚗",
             budget_monthly=800),
    Category(user_id=user.id, name="Learning", type="expense", color="purple", icon="📚",
             budget_monthly=500),
]
db.add_all(cats)

# ── Sample goals ──────────────────────────────────────────────────────────────
goal = Goal(user_id=user.id, title="Land a software engineering job",
            category="career", status="in_progress",
            target_date=date(2026, 8, 1), pinned=True,
            description="Full-time role in Morocco or remote internationally.")
db.add(goal)
db.flush()

krs = [
    KeyResult(goal_id=goal.id, title="Applications sent", type="numeric",
              target_value=50, current_value=8, unit="applications"),
    KeyResult(goal_id=goal.id, title="GitHub portfolio live", type="boolean", completed=False),
    KeyResult(goal_id=goal.id, title="AWS cert obtained", type="boolean", completed=False),
    KeyResult(goal_id=goal.id, title="Big Data project deployed", type="boolean", completed=False),
]
db.add_all(krs)

db.commit()
db.close()
print("✅ Seeded: user me@personal.os / Personal123!")
print("✅ Sample events, todos, goal, financials created.")
