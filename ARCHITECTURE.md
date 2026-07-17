# Personal OS — System Architecture

**Version:** 1.0  
**Date:** May 2026

---

## 1. System Layers

```
User Browser
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Nginx 1.27 (port 80 / 443)  — Reverse Proxy        │
│  ├── /api/auth/*  ──► Next.js (NextAuth routes)     │
│  ├── /api/*       ──► FastAPI backend               │
│  └── /*           ──► Next.js frontend              │
└─────────────────────────────────────────────────────┘
    │                          │
    ▼                          ▼
┌──────────────┐    ┌───────────────────────────┐
│  Next.js 14  │    │  FastAPI + SQLAlchemy 2   │
│  App Router  │    │  Python 3.12              │
│  port 3000   │    │  port 8000                │
│  (internal)  │    │  (internal)               │
└──────────────┘    └───────────┬───────────────┘
                                │
                    ┌───────────▼───────────────┐
                    │  PostgreSQL 16            │
                    │  port 5432 (internal)     │
                    │  Volume: postgres_data    │
                    └───────────────────────────┘

External calls (backend only — never from browser):
  ├── Google Gemini API   (AI provider)
  ├── OpenAI API          (AI provider)
  ├── Anthropic API       (AI provider)
  ├── Runway ML API       (video generation)
  └── Open-Meteo API      (weather — no auth required)
```

---

## 2. Container Map

| Container | Image | Role | Internal Port | External Port |
|---|---|---|---|---|
| `personal_os_nginx` | nginx:1.27-alpine | Reverse proxy, TLS termination | 80 | 80 (+ 443 in prod) |
| `personal_os_frontend` | Custom (Node 22 Alpine) | Next.js SSR + NextAuth | 3000 | — |
| `personal_os_backend` | Custom (Python 3.12 slim) | FastAPI REST API | 8000 | — (dev: 8000) |
| `personal_os_db` | postgres:16-alpine | Primary datastore | 5432 | — (dev: 5432) |

All containers are on the `personal_os_net` bridge network. Only Nginx is exposed publicly.

---

## 3. Directory Structure

```
personal dashboard/
├── SPECS.md
├── ARCHITECTURE.md
├── README.md
├── .env.example
├── docker-compose.yml
├── docker-compose.prod.yml
│
├── Dockerfile.frontend          # Multi-stage Next.js build
│
├── public/
│   └── .gitkeep
│
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.jsx           # Root layout (theme provider, font)
│   │   ├── page.jsx             # / → redirect to /dashboard
│   │   ├── api/
│   │   │   └── auth/[...nextauth]/route.js
│   │   ├── (auth)/
│   │   │   ├── layout.jsx
│   │   │   ├── login/page.jsx
│   │   │   └── register/page.jsx
│   │   └── (dashboard)/
│   │       ├── layout.jsx       # Sidebar + header shell
│   │       ├── dashboard/page.jsx
│   │       ├── calendar/page.jsx
│   │       ├── todos/page.jsx
│   │       ├── files/page.jsx
│   │       ├── financials/page.jsx
│   │       ├── goals/page.jsx
│   │       ├── studio/page.jsx
│   │       └── settings/page.jsx
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Header.jsx
│   │   │   └── MobileNav.jsx
│   │   ├── dashboard/
│   │   │   ├── WidgetGrid.jsx
│   │   │   ├── QuickStats.jsx
│   │   │   └── ActivityFeed.jsx
│   │   ├── calendar/
│   │   │   ├── CalendarGrid.jsx
│   │   │   └── EventModal.jsx
│   │   ├── todos/
│   │   │   ├── TodoList.jsx
│   │   │   ├── KanbanBoard.jsx
│   │   │   └── TodoModal.jsx
│   │   ├── files/
│   │   │   ├── FileBrowser.jsx
│   │   │   └── FileViewer.jsx
│   │   ├── financials/
│   │   │   ├── TransactionList.jsx
│   │   │   ├── FinancialCharts.jsx
│   │   │   └── TransactionModal.jsx
│   │   ├── goals/
│   │   │   ├── GoalCard.jsx
│   │   │   └── GoalModal.jsx
│   │   ├── studio/
│   │   │   ├── AIChat.jsx
│   │   │   ├── DocumentAnalyzer.jsx
│   │   │   └── GenerationPanel.jsx
│   │   └── ui/
│   │       ├── Button.jsx
│   │       ├── Modal.jsx
│   │       ├── Card.jsx
│   │       ├── Badge.jsx
│   │       ├── Input.jsx
│   │       └── Spinner.jsx
│   │
│   └── lib/
│       ├── auth.js              # NextAuth config
│       ├── api.js               # Typed fetch wrapper
│       └── utils.js
│
├── next.config.js
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── jsconfig.json
│
├── nginx/
│   └── nginx.conf
│
└── backend/
    ├── Dockerfile
    ├── requirements.txt
    ├── alembic.ini
    ├── seed.py
    │
    ├── alembic/
    │   ├── env.py
    │   ├── script.py.mako
    │   └── versions/
    │       └── 001_initial_schema.py
    │
    └── app/
        ├── __init__.py
        ├── main.py
        ├── config.py
        ├── database.py
        │
        ├── core/
        │   ├── security.py      # JWT, bcrypt, token generation
        │   ├── deps.py          # FastAPI dependency injection
        │   ├── encryption.py    # AES-256 for API key storage
        │   └── ai/
        │       ├── provider.py  # Multi-provider router
        │       ├── gemini.py
        │       ├── openai_client.py
        │       └── anthropic_client.py
        │
        ├── middleware/
        │   └── security.py      # Rate limiting, security headers
        │
        ├── models/
        │   ├── user.py
        │   ├── session.py
        │   ├── event.py         # Calendar events
        │   ├── todo.py
        │   ├── financial.py     # Transactions, accounts, categories
        │   ├── goal.py
        │   ├── activity.py      # Audit log
        │   └── ai_prompt.py     # Prompt history
        │
        ├── routers/
        │   ├── auth.py
        │   ├── users.py
        │   ├── events.py
        │   ├── todos.py
        │   ├── financials.py
        │   ├── goals.py
        │   ├── files.py
        │   ├── ai.py
        │   └── settings.py
        │
        └── schemas/
            ├── auth.py
            ├── user.py
            ├── event.py
            ├── todo.py
            ├── financial.py
            └── goal.py
```

---

## 4. Data Model

### Users & Auth
```sql
users
  id UUID PK
  email TEXT UNIQUE NOT NULL
  hashed_password TEXT NOT NULL
  name TEXT
  avatar_url TEXT
  timezone TEXT DEFAULT 'UTC'
  theme TEXT DEFAULT 'system'
  widget_config JSONB DEFAULT '{}'    -- enabled widgets + order
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

sessions
  id UUID PK
  user_id UUID FK → users.id
  token_hash TEXT UNIQUE              -- hashed refresh token
  device_info TEXT
  ip_address INET
  expires_at TIMESTAMPTZ
  created_at TIMESTAMPTZ
  revoked_at TIMESTAMPTZ              -- NULL = active

user_settings
  user_id UUID PK FK → users.id
  ai_provider_default TEXT           -- 'gemini' | 'openai' | 'anthropic'
  ai_providers JSONB                 -- encrypted API keys per provider
  mounted_paths JSONB                -- allowed file browser roots
  notification_rules JSONB
  fiscal_year_start INT DEFAULT 1    -- month (1=January)
```

### Calendar
```sql
events
  id UUID PK
  user_id UUID FK → users.id
  title TEXT NOT NULL
  description TEXT
  location TEXT
  start_at TIMESTAMPTZ NOT NULL
  end_at TIMESTAMPTZ NOT NULL
  all_day BOOLEAN DEFAULT false
  color TEXT DEFAULT 'blue'
  calendar_type TEXT DEFAULT 'personal'  -- 'personal' | 'work' | 'finance'
  recurrence_rule JSONB               -- rrule-compatible object
  parent_event_id UUID FK → events.id -- for recurring instances
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
```

### Todos
```sql
todos
  id UUID PK
  user_id UUID FK → users.id
  parent_id UUID FK → todos.id        -- subtask support
  title TEXT NOT NULL
  description TEXT                    -- markdown
  status TEXT DEFAULT 'backlog'       -- 'backlog' | 'in_progress' | 'done' | 'archived'
  priority INT DEFAULT 2              -- 0=P0 (urgent) … 3=P3 (low)
  due_at TIMESTAMPTZ
  labels JSONB DEFAULT '[]'           -- ['work', 'personal']
  recurrence_rule JSONB
  order_index FLOAT                   -- for drag-and-drop ordering
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  completed_at TIMESTAMPTZ
```

### Financials
```sql
accounts
  id UUID PK
  user_id UUID FK → users.id
  name TEXT NOT NULL
  type TEXT                           -- 'bank' | 'cash' | 'credit' | 'investment'
  currency TEXT DEFAULT 'MAD'
  balance DECIMAL(15,2) DEFAULT 0
  color TEXT

categories
  id UUID PK
  user_id UUID FK → users.id
  name TEXT NOT NULL
  icon TEXT
  color TEXT
  type TEXT                           -- 'income' | 'expense'
  budget_monthly DECIMAL(15,2)        -- monthly budget limit

transactions
  id UUID PK
  user_id UUID FK → users.id
  account_id UUID FK → accounts.id
  category_id UUID FK → categories.id
  type TEXT NOT NULL                  -- 'income' | 'expense' | 'transfer'
  amount DECIMAL(15,2) NOT NULL
  description TEXT
  date DATE NOT NULL
  recurrence_rule JSONB
  tags JSONB DEFAULT '[]'
  created_at TIMESTAMPTZ
```

### Goals
```sql
goals
  id UUID PK
  user_id UUID FK → users.id
  title TEXT NOT NULL
  description TEXT
  category TEXT                       -- 'health' | 'career' | 'finance' | 'personal' | 'learning'
  status TEXT DEFAULT 'not_started'
  target_date DATE
  pinned BOOLEAN DEFAULT false
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

key_results
  id UUID PK
  goal_id UUID FK → goals.id
  title TEXT NOT NULL
  type TEXT                           -- 'numeric' | 'boolean'
  target_value DECIMAL
  current_value DECIMAL DEFAULT 0
  unit TEXT
  completed BOOLEAN DEFAULT false

goal_reflections
  id UUID PK
  goal_id UUID FK → goals.id
  user_id UUID FK → users.id
  note TEXT
  created_at TIMESTAMPTZ
```

### Activity Log
```sql
activity_log
  id UUID PK
  user_id UUID FK → users.id
  module TEXT NOT NULL                -- 'calendar' | 'todos' | 'financials' | 'goals' | 'files' | 'studio'
  action TEXT NOT NULL                -- 'created' | 'updated' | 'deleted' | 'viewed' | 'generated'
  entity_id UUID
  entity_type TEXT
  metadata JSONB DEFAULT '{}'
  created_at TIMESTAMPTZ
```

### AI Studio
```sql
ai_prompts
  id UUID PK
  user_id UUID FK → users.id
  provider TEXT NOT NULL              -- 'gemini' | 'openai' | 'anthropic'
  feature TEXT NOT NULL              -- 'chat' | 'analysis' | 'generation' | 'image' | 'video'
  prompt TEXT NOT NULL
  output TEXT
  model TEXT
  tokens_used INT
  created_at TIMESTAMPTZ
```

---

## 5. API Surface

### Auth
```
POST  /api/v1/auth/register
POST  /api/v1/auth/login
POST  /api/v1/auth/refresh
POST  /api/v1/auth/logout
GET   /api/v1/auth/me
GET   /api/v1/auth/sessions          -- list active sessions
DELETE /api/v1/auth/sessions/{id}    -- revoke session
```

### Calendar
```
GET    /api/v1/events?start=&end=    -- range query
POST   /api/v1/events
GET    /api/v1/events/{id}
PATCH  /api/v1/events/{id}
DELETE /api/v1/events/{id}
```

### Todos
```
GET    /api/v1/todos?status=&priority=&label=
POST   /api/v1/todos
GET    /api/v1/todos/{id}
PATCH  /api/v1/todos/{id}
DELETE /api/v1/todos/{id}
POST   /api/v1/todos/{id}/complete
```

### Financials
```
GET    /api/v1/accounts
POST   /api/v1/accounts
PATCH  /api/v1/accounts/{id}
DELETE /api/v1/accounts/{id}

GET    /api/v1/categories
POST   /api/v1/categories
PATCH  /api/v1/categories/{id}

GET    /api/v1/transactions?from=&to=&category=&account=
POST   /api/v1/transactions
PATCH  /api/v1/transactions/{id}
DELETE /api/v1/transactions/{id}

GET    /api/v1/financials/summary     -- totals, budget progress
GET    /api/v1/financials/trend       -- monthly trend data
```

### Goals
```
GET    /api/v1/goals
POST   /api/v1/goals
GET    /api/v1/goals/{id}
PATCH  /api/v1/goals/{id}
DELETE /api/v1/goals/{id}
POST   /api/v1/goals/{id}/reflect
PATCH  /api/v1/goals/{goal_id}/kr/{kr_id}
```

### Files
```
GET    /api/v1/files?path=           -- list directory
GET    /api/v1/files/info?path=      -- file metadata
GET    /api/v1/files/preview?path=   -- stream file content
GET    /api/v1/files/download?path=  -- force-download
POST   /api/v1/files/convert         -- { path, to: 'pdf'|'docx' }
POST   /api/v1/files/analyze         -- { path, question? }
```

### AI Studio
```
POST   /api/v1/ai/chat               -- { message, history, provider }
POST   /api/v1/ai/analyze            -- { content, question, provider }
POST   /api/v1/ai/generate/text      -- { prompt, tone, length, provider }
POST   /api/v1/ai/generate/image     -- { prompt, style, provider }
POST   /api/v1/ai/generate/video     -- { prompt, duration } → async job
GET    /api/v1/ai/jobs/{id}          -- poll async job
GET    /api/v1/ai/history
```

### Settings
```
GET    /api/v1/settings
PATCH  /api/v1/settings
POST   /api/v1/settings/ai-keys      -- save encrypted API key
DELETE /api/v1/settings/ai-keys/{provider}
GET    /api/v1/activity?module=&from=&to=
```

---

## 6. Multi-Provider AI Architecture

```
Client → POST /api/v1/ai/chat { provider: "gemini" | "openai" | "anthropic" }
              │
              ▼
    app/core/ai/provider.py
         AIProviderRouter
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
 GeminiClient OpenAIClient AnthropicClient
              │
              ▼
    Normalized response:
      { content: str, tokens: int, model: str }
```

The router reads the user's configured API keys (decrypted per-request), selects the appropriate client, and returns a normalized response object. The feature calling the router never knows which provider was used.

**Per-feature provider defaults (configurable in Settings):**
- Document analysis → Gemini (vision-native)
- Text generation → Claude (strong writing)
- Image generation → OpenAI (DALL·E 3)
- Video generation → Runway ML (separate auth)
- Chat → User preference (default: Claude)
- Code generation → OpenAI GPT-4o

---

## 7. Auth Flow

```
1. POST /api/v1/auth/login
   → FastAPI verifies password (bcrypt, constant-time)
   → Issues { access_token (30m JWT), refresh_token (7d JWT) }
   → refresh_token stored as HttpOnly cookie + hashed in sessions table

2. Next.js (NextAuth) calls internal FastAPI on every session check
   → Validates access_token
   → If expired: uses refresh_token cookie to get new access_token
   → If refresh expired: redirect to /login

3. Frontend requests
   → access_token sent as Authorization: Bearer header
   → Never stored in localStorage (XSS vector)
   → Stored in NextAuth session (server-side encrypted cookie)

4. Session persistence
   → Sessions table in PostgreSQL
   → Survives frontend/backend container restart
   → User stays logged in for 7 days (refresh window)
```

---

## 8. File Security Model

```
Allowed paths (configured in Settings → user_settings.mounted_paths):
  [ "/userfiles/projects", "/userfiles/documents" ]

All file API requests:
  1. Resolve path.realpath() in Python
  2. Assert resolved path starts with one of the allowed prefixes
  3. If not → 403 Forbidden
  4. Serve content only if within allowed roots

Docker volume mount (docker-compose.yml):
  - C:/Users/othma → /userfiles:ro   (read-only)
  - No write access to host filesystem from container
```

---

## 9. Session Persistence Strategy

The key problem: containers restart, but users should stay logged in.

**Solution:**
- `sessions` table in PostgreSQL (named volume survives restarts)
- Refresh tokens stored as `token_hash` (SHA-256) — even if extracted, raw token needed
- NextAuth `database` session strategy with PostgreSQL adapter → session cookies reference DB rows
- `NEXTAUTH_SECRET` in .env (consistent across restarts) → cookie signatures remain valid

**What survives a container restart:**
- ✅ PostgreSQL data (named volume)
- ✅ Active sessions (rows in sessions table)
- ✅ User's login cookie (signed with NEXTAUTH_SECRET)
- ❌ In-memory rate limit counters (acceptable — reset to zero on restart)

---

## 10. Extension Model

### Adding a new widget (example: "Notes" module)

**Backend** — add `backend/app/routers/notes.py`:
```python
router = APIRouter(prefix="/api/v1/notes", tags=["notes"])
# CRUD endpoints
```
Register in `app/main.py`: `app.include_router(notes.router)`
Add migration in `alembic/versions/`.

**Frontend** — add `src/widgets/notes/`:
```
notes/
  manifest.js        # { id: 'notes', name: 'Notes', icon: 'StickyNote', route: '/notes' }
  Widget.jsx         # Dashboard card (summary view)
  Page.jsx           # Full page (linked from sidebar)
```

Settings page auto-discovers `manifest.js` files via `src/lib/widgets.js` and renders them in the widget catalog. No other file needs to change.

---

## 11. Production Hardening Checklist

```
[ ] Set NEXTAUTH_URL to your real domain (https://)
[ ] Rotate all secrets in .env (SECRET_KEY, NEXTAUTH_SECRET, DB password)
[ ] Enable HTTPS: mount Certbot volume in nginx service
[ ] Set secure: true on refresh token cookie (requires HTTPS)
[ ] Re-enable HSTS header in nginx.conf
[ ] Re-enable upgrade-insecure-requests in CSP
[ ] Set APP_ENV=production
[ ] Remove exposed DB port (5432) from docker-compose.prod.yml
[ ] Add off-site backup for postgres_data volume
[ ] Rotate ENCRYPTION_KEY (used for AI key storage)
[ ] Enable Nginx access logging to persistent volume
```
