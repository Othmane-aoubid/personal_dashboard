# Personal OS — Application Audit
> Generated: 2026-05-18

---

## Current Feature Inventory

| Page | What it does |
|------|-------------|
| `/dashboard` | KPI cards, charts, activity feed, pinned goal — auto-refreshes every 30s |
| `/calendar` | Month/Week/Day/Agenda views, Moroccan + Islamic holidays, event CRUD |
| `/todos` | 4-column Kanban + list view, drag-and-drop, priorities, labels, due dates |
| `/files` | File browser, preview (text/image/audio/video), AI analysis via Gemini |
| `/financials` | Transaction log, accounts, category pie + monthly bar charts |
| `/goals` | OKR-style goals with Key Results, progress rings, weekly reflections |
| `/studio` | Chat (multi-provider), text gen, DALL·E images, Runway video jobs |
| `/draw` | Full canvas drawing app + 8 animated chart types, cloud save |
| `/media` | Image processing (filters/format) and video trimming/frame extraction |
| `/generate` | PDF, DOCX, PPTX document generation from form inputs |
| `/terminal` | Browser pseudo-terminal + file browser, command history |
| `/wiki` | Markdown knowledge base with Wikipedia import |
| `/storage` | Disk usage overview, directory browser, large-file finder |
| `/timeline` | Chronological activity log, snapshot/session saving |
| `/security` | Code vulnerability scanner + URL website scanner |
| `/games` | Chess, 2048, Snake, Minesweeper, Flappy Bird, Soccer — all with sound |

---

## Per-Feature Gap Analysis

### `/dashboard`
- `widget_config` column on User model exists but **zero UI** for customizing widgets — no drag-to-reorder, no show/hide
- 6 API calls fire in parallel; any failure is **silently swallowed** — page looks identical whether backend is offline or has no data
- Auto-refresh fires even when the browser tab is hidden/backgrounded (wasteful)
- No **budget consumption widget** despite `budget_monthly` existing in the DB
- Cannot update goal progress directly from the pinned goal banner

### `/calendar`
- **No recurring events UI** — `recurrence_rule` field exists in DB but the modal has no recurrence input
- No drag-to-move or drag-to-resize events in week/day views
- Islamic holidays hardcoded only through **2028**
- No iCal export/import or Google Calendar sync

### `/todos`
- **Subtask support** — `parent_id` column in DB, **zero UI** for creating subtasks
- **Recurring tasks** — `recurrence_rule` in DB, no UI
- Drag-and-drop only changes status, **not card order** within a column (`order_index` stored but ignored)
- No overdue highlighting on individual Kanban cards
- `?new=` query param from Command Palette is **completely ignored** — pre-filling a new todo from elsewhere is broken
- No bulk actions; no filter by priority / label / due date

### `/files`
- **No upload capability** — entire page is read-only; no upload input, no endpoint in `api.js`
- No rename or delete from the browser UI
- Preview truncates at 3,000 chars with no "show more"
- No breadcrumb trail navigation

### `/financials`
- **No create/edit/delete for accounts or categories** from the UI (DB + backend support it, frontend doesn't)
- **No edit** of existing transactions — only create + delete
- No transaction search or date-range filter
- `budget_monthly` on Category is fetched but **never visualized**
- Account balance doesn't update when transactions are recorded (no backend trigger)
- `transfer` type exists in DB but is **not in the UI** dropdown — only income/expense
- No CSV import/export

### `/goals`
- **No "Add Key Result" button** — users can update existing KRs but cannot create new ones from the UI
- `GoalReflection` records are saved but **never displayed** — no reflection history view
- No milestone/deadline per KR

### `/studio`
- Chat conversations are **session-local only** — refresh loses everything (History tab shows prompts, not full conversations)
- **No streaming** — waits for full response before displaying (feels slow)
- Video generation has no built-in poll loop — user gets a job ID and nothing else
- **Image generation ignores the provider pill** — always uses OpenAI/DALL·E regardless of selection
- No model selector within a provider (e.g., gpt-4o vs gpt-4o-mini)
- No system prompt / persona configuration for chat

### `/draw`
- Canvas fixed at 1600×900 — no viewport scaling for smaller screens
- **No touch support** — mouse events only; tablets and phones cannot draw
- Text tool has **pixel-offset bug on Retina/HiDPI displays** due to device pixel ratio not applied
- No layers, no z-order controls (send to back / bring to front)
- No image import onto canvas
- No SVG export

### `/media`
- No preview of trimmed video before downloading
- No batch processing of multiple files
- No audio playback or waveform visualization

### `/generate`
- Text-only content input — no WYSIWYG or template system
- No preview of generated document before download
- No template library

### `/terminal`
- HTTP REST execution — **no streaming output**, no interactive programs (vim, python REPL, etc.)
- No tab-completion
- Quick Nav hardcodes Linux paths (`/home`, `/etc`, `/tmp`) — irrelevant on Windows hosts
- No sandboxing validation visible on backend (security risk)

### `/wiki`
- Home-grown regex markdown renderer — **no table support**, broken nested lists, no language highlighting in code blocks
- No **page history / versioning** — previous versions are permanently lost
- No inter-page links (`[[PageTitle]]` style)
- No image embedding within pages

### `/storage`
- **Read-only** — cannot delete files from the Storage page
- No scheduled cleanup or empty-folder detection

### `/timeline`
- Activity logging is **inconsistent** — Wiki, Terminal, Media, Generate, Draw, and AI Studio actions are not logged
- No filter by module or action type
- No snapshot comparison

### `/security`
- Path conversion hardcoded for Docker-on-Windows (`/hostc/...`) — breaks on other environments
- No scheduled / periodic rescanning
- No CVE database or external vulnerability API integration

### `/games`
- **No score persistence** — high scores lost on every refresh
- Chess has no visible difficulty selector on the hub card
- No multiplayer matchmaking

### `/settings`
- **Theme FOUC** — page flickers on hard reload before the session loads
- Only 8 hardcoded timezones — no full IANA timezone picker
- Mounted path UI has no validation that the path actually exists on the backend

---

## Cross-Cutting Issues

### Mobile Responsiveness
- Sidebar is fixed `w-60` with `pl-60` on main content — **no hamburger, no drawer, no collapse**
- The entire app is effectively **desktop-only**
- Calendar week/day views, Draw, Terminal, Wiki, Security all use multi-pane layouts that collapse to unusable on phones

### Error Handling
- Most `catch` blocks are silent (`catch (_) {}`) or only show a toast
- **No React error boundaries** anywhere in the component tree
- "No data" and "backend offline" states look identical — users cannot tell if a fetch failed
- `401` responses are not caught specially — expired sessions show toast errors instead of redirecting to `/login`

### Loading States
- No skeleton loaders — layout shifts when data arrives
- Dashboard is blank until all 6 parallel fetches resolve (no progressive rendering)
- Inconsistent spinner styles across pages

### Dark Mode
- Canvas in `/draw` is hardcoded white background + dark text — dark mode has **no effect** inside `<canvas>`
- `/games` uses dark-first colors (`bg-gray-950`) that **clash with the light theme**

### Accessibility
- All nav items use emoji as primary icons with **no `aria-label`** — screen readers read emoji names verbatim
- Modals lack `role="dialog"`, `aria-modal`, and **focus trapping**
- Kanban drag-and-drop has no keyboard alternative
- Color is the **sole differentiator** for priority badges and statuses (no icons/patterns for color-blind users)
- Form labels may not be programmatically associated with inputs (no `htmlFor`/`id` pairing visible)

### Performance
- Todos loads all records at once — no pagination (large datasets will be slow)
- Financials aggregates all transactions in the browser — should be server-aggregated
- Draw re-renders entire canvas on every React state change to `shapes` (no rAF gating)
- Images in file browser and gallery lack `loading="lazy"`

### API Client (`api.js`)
- No `AbortController` — stale responses can update state after navigation
- FormData uploads (media page) bypass `api.js` entirely, duplicating auth header logic
- No special handling for `401` → auto-redirect to `/login`

---

## Recommended New Features (ranked by impact)

| # | Feature | Rationale |
|---|---------|-----------|
| 1 | **Habits Tracker** | Daily streaks + heatmap; highest daily engagement driver; ties to Goals |
| 2 | **Focus Timer / Pomodoro** | Persistent floating timer, links current todo/goal, logs to Timeline |
| 3 | **Notes / Journal** | Daily journal with mood/gratitude prompts; exports to Wiki |
| 4 | **Dashboard Widget Customization** | `widget_config` column already in DB — just needs the UI |
| 5 | **Budget Tracker** | `budget_monthly` already in DB — add progress bars, bill reminders, savings goals |
| 6 | **Contacts / CRM Lite** | People list with notes, last-contact date, reminders; ties to Calendar + Goals |
| 7 | **Reading List / Bookmarks** | Books/articles with status + rating; notes link to Wiki |
| 8 | **Mobile Responsive Sidebar** | Largest single usability gap — entire app inaccessible on phones |
| 9 | **In-app Notifications / Reminders** | `notification_rules` field on UserSettings already exists but unused |
| 10 | **Global Search** | Full-text search across todos, wiki, transactions, events — surfaced in Command Palette |
| 11 | **Automations / Rules** | "When todo completed → log to Wiki" type triggers — true Personal OS feel |
| 12 | **Password Vault** | Encrypted credential storage; natural companion to the Security page |

---

## Quick Wins (fixes, not new features)

- [ ] Fix `?new=` param being ignored in To-Do
- [ ] Add "Create Key Result" button to Goals
- [ ] Surface `budget_monthly` progress bars in Financials
- [ ] Fix canvas dark mode in Draw (detect `prefers-color-scheme` or read theme class)
- [ ] Fix Games page light-theme clash (`bg-gray-950` → theme-aware background)
- [ ] Add `aria-label` to all emoji sidebar nav icons
- [ ] Add pagination to Todos and Transactions lists
- [ ] Redirect to `/login` on `401` response in `api.js`
- [ ] Show meaningful empty-vs-error states across all pages
- [ ] Add React error boundaries at the page level
