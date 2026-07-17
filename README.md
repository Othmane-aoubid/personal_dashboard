# Personal OS — Self-Hosted Personal Dashboard

A self-contained dashboard with calendar, todos, goals, financials, file browser, and AI-powered features. Runs entirely on your machine via Docker — no cloud accounts, no subscriptions.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS v3, Recharts |
| Backend | FastAPI (Python 3.12), SQLAlchemy 2, Alembic |
| Database | PostgreSQL 16 (named Docker volume — survives restarts) |
| Proxy | Nginx (rate-limiting, security headers, reverse proxy) |
| Auth | NextAuth v4 (JWT) + bcrypt + AES-256 encrypted AI keys |

---

## Quickstart

### 1. Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)
- Git

### 2. Clone and configure

```bash
git clone <repo-url> personal-dashboard
cd personal-dashboard
cp .env.example .env
```

Edit `.env` — at minimum set a strong `NEXTAUTH_SECRET` and `ENCRYPTION_KEY`:

```bash
# Generate NEXTAUTH_SECRET (32+ random bytes, base64)
openssl rand -base64 32

# Generate ENCRYPTION_KEY (32 bytes hex for Fernet)
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 3. Start

```bash
docker compose up -d
```

First boot takes ~2 minutes (pulls images, runs Alembic migrations, starts all services).

### 4. Seed demo data

```bash
docker compose exec backend python seed.py
```

This creates:
- **User**: `me@personal.os` / `Personal123!`
- Sample events, todos, goals, financial accounts, and transactions tailored as a job-search productivity setup

### 5. Open

```
http://localhost
```

Log in with the seeded credentials or register a new account.

---

## Environment variables

All variables are in `.env` at the project root. Docker Compose reads them automatically.

### Required

| Variable | Description |
|---|---|
| `NEXTAUTH_SECRET` | Secret for signing NextAuth JWTs. Must be consistent across restarts for session persistence. Min 32 bytes. |
| `ENCRYPTION_KEY` | Fernet key for encrypting AI provider API keys at rest. Generate once, never rotate without migrating existing keys. |
| `POSTGRES_PASSWORD` | PostgreSQL password. Set before first `docker compose up`. |

### Optional (AI providers)

You can set these as env var fallbacks. Per-user keys stored in the database take priority and are encrypted with `ENCRYPTION_KEY`.

| Variable | Provider |
|---|---|
| `GEMINI_API_KEY` | Google Gemini (chat, text generation) |
| `OPENAI_API_KEY` | OpenAI (chat, text, DALL·E 3 images) |
| `ANTHROPIC_API_KEY` | Anthropic Claude (chat, text) |
| `RUNWAY_API_KEY` | Runway ML (video generation) |

### Full reference

```env
# App
APP_ENV=production                    # or 'development'
NEXTAUTH_URL=http://localhost
NEXTAUTH_SECRET=<generate>

# Database
POSTGRES_DB=personal_os
POSTGRES_USER=personal_os
POSTGRES_PASSWORD=<set-this>
DATABASE_URL=postgresql://personal_os:<password>@db:5432/personal_os

# Security
ENCRYPTION_KEY=<generate-fernet-key>
JWT_SECRET_KEY=<generate>             # can match NEXTAUTH_SECRET
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# AI (optional env fallbacks — users can also set keys in Settings UI)
GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
RUNWAY_API_KEY=

# File browser (the host path mounted into the container)
USERFILES_HOST_PATH=C:/Users/yourname
```

---

## File browser

The container mounts the host directory configured in `docker-compose.yml`:

```yaml
volumes:
  - C:/Users/othma:/userfiles:ro
```

Change `C:/Users/othma` to whatever root you want to browse. The `:ro` flag makes it read-only — remove it only if you add upload/write features. Users can further restrict which sub-paths the browser exposes via **Settings → File browser paths**.

---

## Development

### Run without Docker (faster iteration)

**Backend:**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
# Requires a local PostgreSQL instance — set DATABASE_URL in .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend   # or the project root if src/ is there
npm install
npm run dev   # http://localhost:3000
```

In dev mode Next.js proxies `/api/v1/*` to `http://localhost:8000` (configured in `next.config.js`).

### Database migrations

```bash
# Create a new migration after model changes
docker compose exec backend alembic revision --autogenerate -m "your_description"

# Apply pending migrations
docker compose exec backend alembic upgrade head

# Roll back one step
docker compose exec backend alembic downgrade -1
```

### Logs

```bash
docker compose logs -f             # all services
docker compose logs -f backend     # FastAPI only
docker compose logs -f frontend    # Next.js only
docker compose logs -f nginx       # Nginx only
```

---

## Architecture overview

```
Browser
  └── Nginx :80
        ├── /api/auth/*     → Next.js :3000  (NextAuth)
        ├── /api/v1/*       → FastAPI  :8000
        └── /*              → Next.js  :3000
```

Sessions survive container restarts because:
- PostgreSQL data is on a named Docker volume (`postgres_data`)
- `NEXTAUTH_SECRET` is fixed in `.env` → JWT signatures remain valid
- Refresh tokens are stored as bcrypt hashes in the `sessions` table

---

## Adding a widget / page

Drop three files into `src/widgets/<name>/`:

| File | Purpose |
|---|---|
| `manifest.js` | `{ id, label, icon, path, order }` |
| `Widget.jsx` | Dashboard summary card |
| `Page.jsx` | Full page component |

The sidebar auto-discovers all manifests and renders the nav items. No config file to edit.

---

## Security notes

- All AI provider keys are encrypted with AES-256 (Fernet) before being written to PostgreSQL. They are never returned to the browser.
- Passwords are hashed with bcrypt. The API always calls `verify_password` even for unknown users to prevent timing-based user enumeration.
- The file browser enforces path traversal protection: `Path.resolve()` is checked against the allowed roots from `user_settings.mounted_paths` before any file operation.
- Nginx applies rate limiting: 10 req/min on login, 5 req/min on register, 100 req/min global.
- Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) are set by Nginx.

---

## Default credentials (seeded)

| Field | Value |
|---|---|
| Email | `me@personal.os` |
| Password | `Personal123!` |

Change these immediately after first login via **Settings → Change password**.

---

## Resetting / wiping data

```bash
# Stop everything and delete the database volume
docker compose down -v

# Start fresh
docker compose up -d
docker compose exec backend python seed.py
```
