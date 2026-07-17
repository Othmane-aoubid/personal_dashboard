# Personal OS — Feature Specifications

**Version:** 1.0  
**Author:** Othmane Aoubid  
**Date:** May 2026  
**Status:** Active Development

---

## 1. Product Overview

Personal OS is a self-hosted, containerized personal dashboard designed for a single power user. It replaces scattered tools (calendar apps, note apps, finance trackers, file managers) with a unified, extensible interface that runs locally and persists across sessions.

**Design principles:**
- Local-first: all data stays on your machine (PostgreSQL volume)
- Secure by default: auth-gated, hardened headers, no external data leakage
- Extensible: widget system lets you add new panels without touching core code
- Lightweight: minimal external dependencies, no third-party SaaS required to function
- AI-augmented: multi-provider AI layer (Gemini / OpenAI / Claude) for analysis and generation

---

## 2. Feature Modules

### 2.1 Dashboard Home
**Purpose:** Unified overview of all modules with quick-action widgets.

| Feature | Description |
|---|---|
| Widget grid | Drag-and-drop layout, resizable cards, persistent position per user |
| Quick stats bar | Today's events count, open todos, net balance this month, active goals |
| Activity feed | Chronological log of all actions taken across modules |
| Date/time display | Live clock with timezone |
| Weather widget | Optional — local weather via Open-Meteo (no API key required) |
| Daily focus | Pin one goal or todo as the day's focus, shown prominently |
| Upcoming events | Next 3 calendar events inline |
| Add widget button | Opens widget catalog — user picks which panels to show |

---

### 2.2 Calendar
**Purpose:** Full event management with views and quick scheduling.

| Feature | Description |
|---|---|
| Views | Month, Week, Day, Agenda |
| Event CRUD | Create, read, update, delete events with title, description, location, time, color label |
| Recurring events | Daily / weekly / monthly / custom recurrence rules |
| Drag-and-drop | Move events by dragging in week/day view |
| Multi-calendar | Color-coded personal, work, finance calendars |
| Reminders | In-app notification N minutes before an event |
| Quick add | Natural language input ("meeting tomorrow at 3pm") parsed via AI |
| Export | ICS export of calendar data |

---

### 2.3 To-Do Lists
**Purpose:** Task management with priorities, labels, and due dates.

| Feature | Description |
|---|---|
| Views | List, Kanban board (backlog / in progress / done / archived) |
| Task fields | Title, description (markdown), due date, priority (P0–P3), labels, assignee (self), subtasks |
| Subtasks | Nested tasks under a parent |
| Labels | User-defined color labels, filter by label |
| Priority sort | Auto-sort by priority + due date |
| Quick add | Inline add from any page via keyboard shortcut |
| Recurring tasks | Same recurrence model as calendar |
| Bulk actions | Multi-select → bulk complete / delete / change priority |
| Search | Full-text search across all tasks |
| Analytics | Completion rate chart, overdue count, velocity by week |

---

### 2.4 File Browser & Viewer
**Purpose:** Browse local mounted folders and preview/read any file type.

| Feature | Description |
|---|---|
| Directory tree | Navigate folders mounted into the container |
| File grid/list toggle | Icon grid or detailed list with metadata |
| Preview panel | Side panel shows file content inline |
| Supported formats | PDF (rendered), DOCX, PPTX, XLSX (tabular), MD (rendered), TXT, JPG/PNG/GIF/WEBP, MP4/WEBM/MOV (video player), MP3/WAV (audio player) |
| Full-screen viewer | Open any file in a dedicated full-screen modal |
| Search | Search files by name within the mounted directories |
| File info | Size, modified date, MIME type, path |
| Quick convert | Right-click → "Convert to PDF", "Extract text", "Summarize with AI" |
| AI document analysis | Send file to AI for summary, key points, or Q&A |
| Copy path | Copy file path to clipboard |
| Download | Serve file as download via backend |
| Protected | Only files within explicitly mounted paths are accessible — no path traversal |

---

### 2.5 Financials
**Purpose:** Personal income/expense tracking with budgets and analysis.

| Feature | Description |
|---|---|
| Transaction CRUD | Add income or expense with amount, category, date, description, account |
| Accounts | Multiple accounts (cash, bank, credit card) — manual balances |
| Categories | User-defined categories with icons and color |
| Budgets | Monthly budget per category, progress bar vs. actual spend |
| Dashboard summary | Net balance, income vs. spend this month, top categories |
| Charts | Monthly trend (line), category breakdown (donut), budget vs. actual (bar) |
| Recurring transactions | Model regular income/expenses |
| CSV import | Paste or upload CSV — AI maps columns to schema |
| Export | CSV export of filtered transactions |
| AI analysis | "Where did I overspend this month?" — natural language query over your financial data |
| Fiscal year | Configurable fiscal year start month |

---

### 2.6 Goals
**Purpose:** OKR-style goal tracking with milestones and progress visualization.

| Feature | Description |
|---|---|
| Goal CRUD | Title, description, category, target date, status |
| Key results | Nested measurable outcomes under each goal (numeric targets or boolean) |
| Milestones | Sub-steps with dates and completion status |
| Progress calc | Auto-calculated from key result completion % |
| Categories | Health, Career, Finance, Personal, Learning, Other |
| Status | Not started / In Progress / On Track / At Risk / Completed / Abandoned |
| Weekly review | Prompt: "What did you do toward each goal this week?" — stores reflection notes |
| Analytics | Goal completion rate over time, category distribution |
| Daily focus | Pin a goal to dashboard home |

---

### 2.7 Activity Log
**Purpose:** Automatic audit trail of all actions in the dashboard.

| Feature | Description |
|---|---|
| Auto-logging | Every create/update/delete across all modules is logged |
| Manual log | User can add a freeform daily journal entry |
| Timeline view | Vertical chronological feed with module icons |
| Filter | Filter by module, action type, date range |
| Export | JSON or CSV export |

---

### 2.8 AI Studio
**Purpose:** Multi-provider AI generation hub for documents, images, and marketing materials.

| Feature | Description |
|---|---|
| Provider config | Per-feature provider selection (Gemini / OpenAI / Claude) with API key management |
| Document analysis | Upload or pick from File Browser → AI returns summary, key points, Q&A |
| Document conversion | PDF→DOCX, PPTX→PDF, DOCX→PDF (via LibreOffice + Pandoc) |
| Text generation | Blog post, email, marketing copy, cover letter — with tone and length controls |
| Image generation | DALL·E 3 (OpenAI) or Gemini Imagen — prompt-to-image with style controls |
| Marketing materials | Branded social post (LinkedIn, Twitter/X), email newsletter section, ad copy |
| Video generation | Runway ML or Kling API integration — text-to-video prompt → async job → preview |
| Code generation | Code snippet generation with language selector |
| AI Chat | Persistent conversation with context window — can reference your dashboard data |
| Prompt history | All prompts and outputs stored and searchable |
| Output actions | Save to File Browser, copy to clipboard, add to Todo, add to Goal |

---

### 2.9 Settings
**Purpose:** Dashboard configuration, security, and extensibility.

| Feature | Description |
|---|---|
| Profile | Name, avatar, timezone, language |
| Security | Change password, active sessions, session revocation |
| AI providers | Configure API keys per provider (stored encrypted in DB, never sent to browser) |
| Widget catalog | Enable/disable modules, reorder sidebar |
| Theme | Light / Dark / System — persisted server-side |
| Notifications | In-app notification rules per module |
| Mounted folders | Configure which local directories are exposed to File Browser |
| Import/export | Export all data as JSON, import from backup |
| Danger zone | Reset data, delete account |

---

## 3. Security Specifications

| Control | Implementation |
|---|---|
| Authentication | NextAuth v4 with JWT strategy, backed by database sessions |
| Access tokens | 30-minute expiry, signed with NEXTAUTH_SECRET |
| Refresh tokens | 7-day expiry, HttpOnly cookie, SameSite=Lax |
| Password hashing | bcrypt, validated ≤72 bytes before hashing, constant-time compare |
| Rate limiting | 10/min login, 5/min register, 100/min global (Nginx + FastAPI middleware) |
| Security headers | X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy |
| CSP | Tight policy, no unsafe-inline in production, script-src 'self' |
| File path safety | Backend validates all file paths are within mounted whitelist — no path traversal |
| API key storage | AI provider keys AES-256 encrypted at rest in PostgreSQL |
| CORS | Strict origin whitelist, no wildcard |
| SQL injection | SQLAlchemy ORM parameterized queries only |
| Input validation | Pydantic schemas validate all API inputs |
| Error messages | Never expose stack traces or library errors to HTTP responses |
| Audit log | All state-changing actions logged with user ID and timestamp |

---

## 4. Extension / Plugin Model

New widgets can be added without modifying core code:

**Frontend:** Drop a new `src/widgets/<name>/` directory containing:
- `Widget.jsx` — the card component
- `Page.jsx` — the full page
- `manifest.js` — `{ id, name, icon, route, description }`

**Backend:** Drop a new `app/routers/<name>.py` and register it in `main.py`.

The settings panel auto-discovers widget manifests and lets the user enable/disable them from the UI. The sidebar re-renders based on the enabled widget list stored in the user's profile.

---

## 5. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Page load (cold) | < 2s on localhost |
| API response (CRUD) | < 200ms p95 |
| File preview (PDF, 10 pages) | < 3s render |
| AI response (streaming) | First token < 1s |
| Container memory | < 512MB total at idle |
| Container startup | < 30s from `docker compose up` to first request served |
| Session persistence | Sessions survive container restart (stored in PostgreSQL) |
| Data durability | PostgreSQL data in named Docker volume, survives container recreation |
