/**
 * Typed API client — wraps fetch with auth header injection, error handling,
 * and base URL resolution. Never stores tokens in localStorage.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL || ''

async function request(path, options = {}, session = null) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }

  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (!res.ok) {
    let detail = `Request failed: ${res.status}`
    try {
      const json = await res.json()
      detail = json.detail || detail
    } catch (_) {}
    const err = new Error(detail)
    err.status = res.status
    throw err
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: {
    login:    (email, password)       => request('/api/v1/auth/login',    { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (email, password, name) => request('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
    me:       (session)               => request('/api/v1/auth/me',       {}, session),
    sessions: (session)               => request('/api/v1/auth/sessions', {}, session),
    revokeSession: (id, session)      => request(`/api/v1/auth/sessions/${id}`, { method: 'DELETE' }, session),
  },

  // ── Events (Calendar) ─────────────────────────────────────────────────────
  events: {
    list:   (params, session) => request(`/api/v1/events?${new URLSearchParams(params)}`, {}, session),
    create: (data, session)   => request('/api/v1/events',     { method: 'POST',  body: JSON.stringify(data) }, session),
    update: (id, data, session) => request(`/api/v1/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, session),
    delete: (id, session)     => request(`/api/v1/events/${id}`, { method: 'DELETE' }, session),
  },

  // ── Todos ─────────────────────────────────────────────────────────────────
  todos: {
    list:     (params, session) => request(`/api/v1/todos?${new URLSearchParams(params)}`, {}, session),
    create:   (data, session)   => request('/api/v1/todos',           { method: 'POST',   body: JSON.stringify(data) }, session),
    update:   (id, data, session) => request(`/api/v1/todos/${id}`,   { method: 'PATCH',  body: JSON.stringify(data) }, session),
    complete: (id, session)     => request(`/api/v1/todos/${id}/complete`, { method: 'POST' }, session),
    delete:   (id, session)     => request(`/api/v1/todos/${id}`,     { method: 'DELETE' }, session),
  },

  // ── Financials ────────────────────────────────────────────────────────────
  financials: {
    accounts:        (session)          => request('/api/v1/accounts', {}, session),
    createAccount:   (data, session)    => request('/api/v1/accounts', { method: 'POST', body: JSON.stringify(data) }, session),
    categories:      (session)          => request('/api/v1/categories', {}, session),
    createCategory:  (data, session)    => request('/api/v1/categories', { method: 'POST', body: JSON.stringify(data) }, session),
    transactions:    (params, session)  => request(`/api/v1/transactions?${new URLSearchParams(params)}`, {}, session),
    createTxn:       (data, session)    => request('/api/v1/transactions', { method: 'POST', body: JSON.stringify(data) }, session),
    deleteTxn:       (id, session)      => request(`/api/v1/transactions/${id}`, { method: 'DELETE' }, session),
    summary:         (session)          => request('/api/v1/financials/summary', {}, session),
  },

  // ── Goals ─────────────────────────────────────────────────────────────────
  goals: {
    list:      (session)              => request('/api/v1/goals', {}, session),
    create:    (data, session)        => request('/api/v1/goals', { method: 'POST', body: JSON.stringify(data) }, session),
    update:    (id, data, session)    => request(`/api/v1/goals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, session),
    delete:    (id, session)          => request(`/api/v1/goals/${id}`, { method: 'DELETE' }, session),
    updateKR:  (gid, kid, data, session) => request(`/api/v1/goals/${gid}/kr/${kid}`, { method: 'PATCH', body: JSON.stringify(data) }, session),
    reflect:   (id, note, session)    => request(`/api/v1/goals/${id}/reflect`, { method: 'POST', body: JSON.stringify({ note }) }, session),
  },

  // ── Files ─────────────────────────────────────────────────────────────────
  files: {
    list:     (path, session)         => request(`/api/v1/files?path=${encodeURIComponent(path)}`, {}, session),
    info:     (path, session)         => request(`/api/v1/files/info?path=${encodeURIComponent(path)}`, {}, session),
    preview:  (path, session)         => request(`/api/v1/files/preview?path=${encodeURIComponent(path)}`, {}, session),
    analyze:  (data, session)         => request('/api/v1/files/analyze', { method: 'POST', body: JSON.stringify(data) }, session),
    downloadUrl: (path)               => `${BASE}/api/v1/files/download?path=${encodeURIComponent(path)}`,
  },

  // ── AI Studio ─────────────────────────────────────────────────────────────
  ai: {
    chat:         (data, session)     => request('/api/v1/ai/chat',            { method: 'POST', body: JSON.stringify(data) }, session),
    generateText: (data, session)     => request('/api/v1/ai/generate/text',   { method: 'POST', body: JSON.stringify(data) }, session),
    generateImage:(data, session)     => request('/api/v1/ai/generate/image',  { method: 'POST', body: JSON.stringify(data) }, session),
    generateVideo:(data, session)     => request('/api/v1/ai/generate/video',  { method: 'POST', body: JSON.stringify(data) }, session),
    pollJob:      (id, session)       => request(`/api/v1/ai/jobs/${id}`, {}, session),
    history:      (session)           => request('/api/v1/ai/history', {}, session),
  },

  // ── Media ─────────────────────────────────────────────────────────────────
  // Note: these endpoints accept FormData — call fetch directly with the
  // Authorization header; see media/page.jsx for usage pattern.
  media: {
    imageProcessUrl:   () => `${BASE}/api/v1/media/image/process`,
    videoTrimUrl:      () => `${BASE}/api/v1/media/video/trim`,
    videoExtractUrl:   () => `${BASE}/api/v1/media/video/extract-frame`,
  },

  // ── Generate ──────────────────────────────────────────────────────────────
  generate: {
    pdf:  (data, session) => request('/api/v1/generate/pdf',  { method: 'POST', body: JSON.stringify(data) }, session),
    docx: (data, session) => request('/api/v1/generate/docx', { method: 'POST', body: JSON.stringify(data) }, session),
    pptx: (data, session) => request('/api/v1/generate/pptx', { method: 'POST', body: JSON.stringify(data) }, session),
  },

  // ── Drawings ──────────────────────────────────────────────────────────────
  drawings: {
    list:   (session)              => request('/api/v1/drawings', {}, session),
    save:   (data, session)        => request('/api/v1/drawings', { method: 'POST', body: JSON.stringify(data) }, session),
    get:    (id, session)          => request(`/api/v1/drawings/${id}`, {}, session),
    update: (id, data, session)    => request(`/api/v1/drawings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, session),
    rename: (id, name, session)    => request(`/api/v1/drawings/${id}/rename`, { method: 'PATCH', body: JSON.stringify({ name }) }, session),
    delete: (id, session)          => request(`/api/v1/drawings/${id}`, { method: 'DELETE' }, session),
  },

  // ── Terminal ──────────────────────────────────────────────────────────────
  terminal: {
    exec:   (data, session)   => request('/api/v1/terminal/exec', { method: 'POST', body: JSON.stringify(data) }, session),
    ls:     (path, session)   => request(`/api/v1/terminal/fs?path=${encodeURIComponent(path)}`, {}, session),
    mkdir:  (data, session)   => request('/api/v1/terminal/fs/mkdir', { method: 'POST', body: JSON.stringify(data) }, session),
    touch:  (data, session)   => request('/api/v1/terminal/fs/touch', { method: 'POST', body: JSON.stringify(data) }, session),
    write:  (data, session)   => request('/api/v1/terminal/fs/write', { method: 'POST', body: JSON.stringify(data) }, session),
    read:   (path, session)   => request(`/api/v1/terminal/fs/read?path=${encodeURIComponent(path)}`, {}, session),
    delete: (data, session)   => request('/api/v1/terminal/fs/delete', { method: 'DELETE', body: JSON.stringify(data) }, session),
    rename: (data, session)   => request('/api/v1/terminal/fs/rename', { method: 'POST', body: JSON.stringify(data) }, session),
    search: (data, session)   => request('/api/v1/terminal/fs/search', { method: 'POST', body: JSON.stringify(data) }, session),
  },

  // ── Wiki ──────────────────────────────────────────────────────────────────
  wiki: {
    list:   (session)              => request('/api/v1/wiki', {}, session),
    create: (data, session)        => request('/api/v1/wiki', { method: 'POST', body: JSON.stringify(data) }, session),
    get:    (id, session)          => request(`/api/v1/wiki/${id}`, {}, session),
    update: (id, data, session)    => request(`/api/v1/wiki/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, session),
    delete: (id, session)          => request(`/api/v1/wiki/${id}`, { method: 'DELETE' }, session),
    search: (q, session)           => request(`/api/v1/wiki/search?q=${encodeURIComponent(q)}`, {}, session),
    wikipediaSearch:  (q, session)       => request(`/api/v1/wiki/wikipedia/search?q=${encodeURIComponent(q)}`, {}, session),
    wikipediaArticle: (title, session)   => request(`/api/v1/wiki/wikipedia/article?title=${encodeURIComponent(title)}`, {}, session),
  },

  // ── Storage ───────────────────────────────────────────────────────────────
  storage: {
    overview:   (session)              => request('/api/v1/storage/overview', {}, session),
    presets:    (session)              => request('/api/v1/storage/presets', {}, session),
    browse:     (path, session)        => request(`/api/v1/storage/browse?path=${encodeURIComponent(path)}`, {}, session),
    analyze:    (path, session)        => request(`/api/v1/storage/analyze?path=${encodeURIComponent(path)}`, {}, session),
    largeFiles: (path, minMb, session) => request(`/api/v1/storage/large-files?path=${encodeURIComponent(path)}&min_mb=${minMb}`, {}, session),
  },

  // ── Timeline ──────────────────────────────────────────────────────────────
  timeline: {
    list:          (days, session)    => request(`/api/v1/timeline?days=${days}`, {}, session),
    summary:       (session)          => request('/api/v1/timeline/summary', {}, session),
    stats:         (session)          => request('/api/v1/timeline/stats', {}, session),
    log:           (data, session)    => request('/api/v1/timeline/log', { method: 'POST', body: JSON.stringify(data) }, session),
    saveSession:   (data, session)    => request('/api/v1/timeline/session/save', { method: 'POST', body: JSON.stringify(data) }, session),
    listSessions:  (session)          => request('/api/v1/timeline/session/list', {}, session),
    deleteSession: (id, session)      => request(`/api/v1/timeline/session/${id}`, { method: 'DELETE' }, session),
  },

  // ── Security Scanner ─────────────────────────────────────────────────────
  security: {
    scan:    (data, session) => request('/api/v1/security/scan',         { method: 'POST', body: JSON.stringify(data) }, session),
    scanUrl: (data, session) => request('/api/v1/security/scan-website', { method: 'POST', body: JSON.stringify(data) }, session),
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  settings: {
    get:              (session)                => request('/api/v1/settings', {}, session),
    updateProfile:    (data, session)          => request('/api/v1/settings', { method: 'PATCH', body: JSON.stringify(data) }, session),
    setProviderKey:   (provider, key, session) => request('/api/v1/settings/ai-keys', {
                                                   method: 'POST', body: JSON.stringify({ provider, api_key: key })
                                                 }, session),
    deleteProviderKey:(provider, session)      => request(`/api/v1/settings/ai-keys/${provider}`, { method: 'DELETE' }, session),
    changePassword:   (data, session)          => request('/api/v1/settings/change-password', { method: 'POST', body: JSON.stringify(data) }, session),
    deleteAccount:    (session)                => request('/api/v1/settings/account', { method: 'DELETE' }, session),
    sessions:         (session)                => request('/api/v1/settings/sessions', {}, session),
    revokeSession:    (id, session)            => request(`/api/v1/settings/sessions/${id}`, { method: 'DELETE' }, session),
    revokeAllSessions:(session)                => request('/api/v1/settings/sessions', { method: 'DELETE' }, session),
    activity:         (session)                => request('/api/v1/settings/activity', {}, session),
  },
}
