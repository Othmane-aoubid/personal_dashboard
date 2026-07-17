'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'

const PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini', icon: '🌀', placeholder: 'AIza…', models: 'gemini-1.5-pro, gemini-2.0-flash' },
  { id: 'openai', name: 'OpenAI', icon: '⚡', placeholder: 'sk-…', models: 'gpt-4o, dall-e-3' },
  { id: 'anthropic', name: 'Anthropic', icon: '🔶', placeholder: 'sk-ant-…', models: 'claude-opus-4, claude-sonnet-4' },
  { id: 'runway', name: 'Runway ML', icon: '🎬', placeholder: 'key_…', models: 'gen-4 turbo (video)' },
]

const TIMEZONES = [
  'Africa/Casablanca', 'Europe/Paris', 'Europe/London', 'UTC',
  'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Tokyo',
]

function Section({ title, description, children }) {
  return (
    <div className="card p-6">
      <div className="mb-5">
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        {description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession()

  // Profile
  const [profile, setProfile] = useState({ full_name: '', email: '', timezone: 'Africa/Casablanca' })
  const [profileLoading, setProfileLoading] = useState(false)

  // Theme
  const [theme, setTheme] = useState('system')

  // AI providers — keys never come back from backend (write-only)
  const [providerKeys, setProviderKeys] = useState({ gemini: '', openai: '', anthropic: '', runway: '' })
  const [configuredProviders, setConfiguredProviders] = useState({})
  const [providerLoading, setProviderLoading] = useState({})
  const [showKey, setShowKey] = useState({})

  // Mounted paths
  const [mountedPaths, setMountedPaths] = useState([])
  const [newPath, setNewPath] = useState('')
  const [pathLoading, setPathLoading] = useState(false)

  // Sessions
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)

  // Password change
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)

  useEffect(() => {
    if (session) {
      loadSettings()
      loadSessions()
    }
  }, [session])

  async function loadSettings() {
    try {
      const data = await api.settings.get(session)
      setProfile({ full_name: data.full_name || '', email: data.email || '', timezone: data.timezone || 'Africa/Casablanca' })
      const t = data.theme || 'system'
      setTheme(t)
      applyTheme(t)
      setConfiguredProviders(data.ai_providers_configured || {})
      setMountedPaths(data.mounted_paths || [])
    } catch (_) {}
  }

  function applyTheme(t) {
    const root = document.documentElement
    if (t === 'dark') root.classList.add('dark')
    else if (t === 'light') root.classList.remove('dark')
    else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) root.classList.add('dark')
      else root.classList.remove('dark')
    }
  }

  async function loadSessions() {
    setSessionsLoading(true)
    try {
      const data = await api.settings.sessions(session)
      setSessions(data)
    } catch (_) {}
    setSessionsLoading(false)
  }

  async function saveProfile() {
    setProfileLoading(true)
    try {
      await api.settings.updateProfile({ ...profile, theme }, session)
      toast.success('Profile saved')
      await updateSession({ theme, name: profile.full_name, email: profile.email })
    } catch (e) { toast.error(e.message || 'Failed to save profile') }
    setProfileLoading(false)
  }

  async function saveProviderKey(providerId) {
    const key = providerKeys[providerId]?.trim()
    if (!key) { toast.error('Enter a key first'); return }
    setProviderLoading(p => ({ ...p, [providerId]: true }))
    try {
      await api.settings.setProviderKey(providerId, key, session)
      toast.success(`${providerId} key saved`)
      setConfiguredProviders(p => ({ ...p, [providerId]: true }))
      setProviderKeys(p => ({ ...p, [providerId]: '' }))
    } catch (e) { toast.error(e.message || 'Failed to save key') }
    setProviderLoading(p => ({ ...p, [providerId]: false }))
  }

  async function deleteProviderKey(providerId) {
    try {
      await api.settings.deleteProviderKey(providerId, session)
      toast.success(`${providerId} key removed`)
      setConfiguredProviders(p => ({ ...p, [providerId]: false }))
    } catch (e) { toast.error(e.message || 'Failed') }
  }

  async function addMountedPath() {
    if (!newPath.trim()) return
    setPathLoading(true)
    try {
      const updated = [...new Set([...mountedPaths, newPath.trim()])]
      await api.settings.updateProfile({ mounted_paths: updated }, session)
      setMountedPaths(updated)
      setNewPath('')
      toast.success('Path added')
    } catch (e) { toast.error(e.message) }
    setPathLoading(false)
  }

  async function removeMountedPath(p) {
    const updated = mountedPaths.filter(x => x !== p)
    try {
      await api.settings.updateProfile({ mounted_paths: updated }, session)
      setMountedPaths(updated)
      toast.success('Path removed')
    } catch (e) { toast.error(e.message) }
  }

  async function revokeSession(sid) {
    try {
      await api.settings.revokeSession(sid, session)
      toast.success('Session revoked')
      loadSessions()
    } catch (e) { toast.error(e.message) }
  }

  async function revokeAllSessions() {
    if (!confirm('Revoke all other sessions? You will stay logged in.')) return
    try {
      await api.settings.revokeAllSessions(session)
      toast.success('All other sessions revoked')
      loadSessions()
    } catch (e) { toast.error(e.message) }
  }

  async function changePassword() {
    if (!pwForm.current || !pwForm.next) { toast.error('Fill all fields'); return }
    if (pwForm.next !== pwForm.confirm) { toast.error('Passwords do not match'); return }
    if (pwForm.next.length < 8) { toast.error('Password must be ≥ 8 characters'); return }
    setPwLoading(true)
    try {
      await api.settings.changePassword({ current_password: pwForm.current, new_password: pwForm.next }, session)
      toast.success('Password changed')
      setPwForm({ current: '', next: '', confirm: '' })
    } catch (e) { toast.error(e.message || 'Failed to change password') }
    setPwLoading(false)
  }

  return (
    <div className="max-w-2xl space-y-6 fade-in">

      {/* Profile */}
      <Section title="Profile" description="Your name, email address, and regional preferences.">
        <div className="space-y-3">
          <div>
            <label className="label">Full name</label>
            <input className="input" value={profile.full_name} onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))} placeholder="Your name" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} placeholder="you@example.com" />
          </div>
          <div>
            <label className="label">Timezone</label>
            <select className="input" value={profile.timezone} onChange={e => setProfile(p => ({ ...p, timezone: e.target.value }))}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          {/* Theme */}
          <div>
            <label className="label">Theme</label>
            <div className="flex gap-2">
              {['light', 'dark', 'system'].map(t => (
                <button key={t} onClick={() => { setTheme(t); applyTheme(t) }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors
                    ${theme === t ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                  {t === 'light' ? '☀️' : t === 'dark' ? '🌙' : '💻'} {t}
                </button>
              ))}
            </div>
          </div>


          <button onClick={saveProfile} disabled={profileLoading} className="btn-primary w-full justify-center">
            {profileLoading ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </Section>

      {/* AI Provider Keys */}
      <Section title="AI Providers" description="API keys are encrypted with AES-256 and never returned to the browser. Keys stored here override environment variables.">
        <div className="space-y-4">
          {PROVIDERS.map(p => {
            const isConfigured = configuredProviders[p.id]
            const isLoading = providerLoading[p.id]
            return (
              <div key={p.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{p.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.models}</p>
                    </div>
                  </div>
                  <span className={`badge ${isConfigured ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                    {isConfigured ? '✓ Configured' : 'Not set'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey[p.id] ? 'text' : 'password'}
                      className="input pr-10 text-sm font-mono"
                      placeholder={isConfigured ? '••••••••••••••••' : p.placeholder}
                      value={providerKeys[p.id]}
                      onChange={e => setProviderKeys(k => ({ ...k, [p.id]: e.target.value }))}
                    />
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                      onClick={() => setShowKey(s => ({ ...s, [p.id]: !s[p.id] }))}>
                      {showKey[p.id] ? '🙈' : '👁'}
                    </button>
                  </div>
                  <button onClick={() => saveProviderKey(p.id)} disabled={isLoading || !providerKeys[p.id]?.trim()} className="btn-primary text-sm">
                    {isLoading ? '…' : 'Save'}
                  </button>
                  {isConfigured && (
                    <button onClick={() => deleteProviderKey(p.id)} className="btn-ghost text-sm text-red-500 hover:text-red-700">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Mounted Paths */}
      <Section title="File browser paths" description="Directories the file browser is allowed to access. The container already mounts /userfiles — add sub-paths to restrict scope or add aliases.">
        <div className="space-y-3">
          {mountedPaths.length > 0 && (
            <div className="space-y-2">
              {mountedPaths.map(p => (
                <div key={p} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-sm font-mono text-gray-700 dark:text-gray-300 flex-1 truncate">{p}</span>
                  <button onClick={() => removeMountedPath(p)} className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none">×</button>
                </div>
              ))}
            </div>
          )}
          {mountedPaths.length === 0 && (
            <p className="text-sm text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">No custom paths. Defaults to <code className="text-xs">/userfiles</code>.</p>
          )}
          <div className="flex gap-2">
            <input className="input flex-1 text-sm font-mono" placeholder="/userfiles/projects" value={newPath}
              onChange={e => setNewPath(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addMountedPath() }} />
            <button onClick={addMountedPath} disabled={pathLoading || !newPath.trim()} className="btn-secondary text-sm">Add path</button>
          </div>
        </div>
      </Section>

      {/* Change password */}
      <Section title="Change password" description="Choose a strong password — at least 8 characters.">
        <div className="space-y-3">
          <div>
            <label className="label">Current password</label>
            <input type="password" className="input" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} />
          </div>
          <div>
            <label className="label">New password</label>
            <input type="password" className="input" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input type="password" className="input" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
          </div>
          <button onClick={changePassword} disabled={pwLoading} className="btn-primary">
            {pwLoading ? 'Updating…' : 'Change password'}
          </button>
        </div>
      </Section>

      {/* Active sessions */}
      <Section title="Active sessions" description="Devices and browsers where your account is currently signed in.">
        {sessionsLoading && <p className="text-sm text-gray-400 animate-pulse">Loading…</p>}
        {!sessionsLoading && sessions.length === 0 && <p className="text-sm text-gray-400">No active sessions found.</p>}
        <div className="space-y-2">
          {sessions.map(s => {
            const isCurrentSession = s.is_current
            return (
              <div key={s.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isCurrentSession ? 'border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/10' : 'border-gray-200 dark:border-gray-700'}`}>
                <span className="text-2xl">{s.user_agent?.includes('Mobile') ? '📱' : '💻'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {s.user_agent?.split('(')[0]?.trim() || 'Unknown browser'}
                    {isCurrentSession && <span className="ml-2 badge bg-brand-100 dark:bg-brand-900/40 text-brand-600 text-xs">Current</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s.ip_address && `${s.ip_address} · `}
                    Last active: {new Date(s.last_used_at || s.created_at).toLocaleString()}
                  </p>
                </div>
                {!isCurrentSession && (
                  <button onClick={() => revokeSession(s.id)} className="text-sm text-red-500 hover:text-red-700 transition-colors font-medium shrink-0">
                    Revoke
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {sessions.filter(s => !s.is_current).length > 1 && (
          <button onClick={revokeAllSessions} className="mt-4 text-sm text-red-500 hover:text-red-700 transition-colors font-medium">
            Revoke all other sessions
          </button>
        )}
      </Section>

      {/* Data */}
      <Section title="Data" description="Export or reset your personal data.">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={async () => {
              try {
                const res = await fetch('/api/v1/settings/export', {
                  headers: { Authorization: `Bearer ${session?.accessToken}` }
                })
                if (!res.ok) throw new Error('Export failed')
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `personal-os-export-${new Date().toISOString().slice(0,10)}.json`
                a.click()
                URL.revokeObjectURL(url)
              } catch (e) { toast.error(e.message) }
            }}
            className="btn-secondary text-sm">
            ⬇ Export all data (JSON)
          </button>
        </div>
      </Section>

      {/* Danger zone */}
      <div className="card p-6 border-red-200 dark:border-red-900">
        <h3 className="font-semibold text-red-600 dark:text-red-400 mb-1">Danger zone</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">These actions are permanent and cannot be undone.</p>
        <button
          onClick={async () => {
            const confirmed = prompt('Type DELETE to confirm account deletion')
            if (confirmed !== 'DELETE') return
            try {
              await api.settings.deleteAccount(session)
              window.location.href = '/login'
            } catch (e) { toast.error(e.message || 'Failed') }
          }}
          className="btn-danger text-sm">
          Delete my account and all data
        </button>
      </div>

    </div>
  )
}
