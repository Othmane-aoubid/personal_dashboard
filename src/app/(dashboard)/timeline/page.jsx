'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'

const MODULE_ICONS = {
  todos:      '✅',
  calendar:   '📅',
  goals:      '🎯',
  files:      '📁',
  financials: '💰',
  studio:     '✨',
  media:      '🎬',
  generate:   '📄',
  settings:   '⚙️',
  wiki:       '📖',
  terminal:   '💻',
  default:    '🔵',
}

function ActivityIcon({ module }) {
  return <span className="text-base">{MODULE_ICONS[module] || MODULE_ICONS.default}</span>
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function formatTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function StatCard({ label, value, icon, sub }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value ?? '—'}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  )
}

export default function TimelinePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [summary, setSummary] = useState(null)
  const [days, setDays] = useState([])
  const [daysBack, setDaysBack] = useState(7)
  const [loading, setLoading] = useState(true)
  const [snapshots, setSnapshots] = useState([])
  const [snapName, setSnapName] = useState('')
  const [snapNotes, setSnapNotes] = useState('')
  const [savingSnap, setSavingSnap] = useState(false)

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const [sumData, tlData, snapData] = await Promise.all([
        api.timeline.summary(session),
        api.timeline.list(daysBack, session),
        api.timeline.listSessions(session),
      ])
      setSummary(sumData)
      setDays(tlData.days || [])
      setSnapshots(snapData || [])
    } catch (err) {
      toast.error('Failed to load timeline')
    } finally {
      setLoading(false)
    }
  }, [session, daysBack])

  useEffect(() => { load() }, [load])

  // Live sync every 10 seconds
  useEffect(() => {
    if (!session) return
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [session, load])

  async function saveSnapshot() {
    if (!snapName.trim()) { toast.error('Enter a snapshot name'); return }
    setSavingSnap(true)
    try {
      const NAV_ITEMS = [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/calendar', label: 'Calendar' },
        { href: '/todos', label: 'To-Do' },
        { href: '/files', label: 'Files' },
        { href: '/financials', label: 'Financials' },
        { href: '/goals', label: 'Goals' },
        { href: '/studio', label: 'AI Studio' },
        { href: '/draw', label: 'Draw' },
        { href: '/media', label: 'Media' },
        { href: '/generate', label: 'Generate' },
        { href: '/terminal', label: 'Terminal' },
        { href: '/wiki', label: 'Wiki' },
        { href: '/storage', label: 'Storage' },
        { href: '/timeline', label: 'Timeline' },
        { href: '/settings', label: 'Settings' },
      ]
      const snap = await api.timeline.saveSession(
        { name: snapName.trim(), open_pages: NAV_ITEMS, notes: snapNotes || null },
        session
      )
      setSnapshots(s => [snap, ...s])
      setSnapName('')
      setSnapNotes('')
      toast.success('Snapshot saved!')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingSnap(false)
    }
  }

  async function deleteSnapshot(id) {
    if (!confirm('Delete this snapshot?')) return
    try {
      await api.timeline.deleteSession(id, session)
      setSnapshots(s => s.filter(x => x.id !== id))
      toast.success('Deleted')
    } catch (err) {
      toast.error(err.message)
    }
  }

  function loadSnapshot(snap) {
    if (snap.open_pages && snap.open_pages.length > 0) {
      router.push(snap.open_pages[0].href)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📊 Activity Timeline</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">Show last</label>
          <select
            className="input text-sm py-1.5 w-24"
            value={daysBack}
            onChange={e => setDaysBack(Number(e.target.value))}
          >
            {[1, 3, 7, 14, 30, 60].map(d => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Todos Today" value={summary.todos_completed_today} icon="✅" />
          <StatCard label="Todos This Week" value={summary.todos_completed_week} icon="📋" />
          <StatCard label="Goals Updated" value={summary.goals_updated_week} icon="🎯" sub="this week" />
          <StatCard label="Files Today" value={summary.files_accessed_today} icon="📁" />
          <StatCard label="Actions Today" value={summary.total_actions_today} icon="⚡" />
          <StatCard label="Actions Week" value={summary.total_actions_week} icon="📈" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Activity Log
          </h2>
          {loading ? (
            <div className="card p-6 text-center text-gray-400">Loading…</div>
          ) : days.length === 0 ? (
            <div className="card p-6 text-center text-gray-400">
              No activity found in the last {daysBack} days.
            </div>
          ) : (
            <div className="space-y-4">
              {days.map(day => (
                <div key={day.date} className="card p-0 overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {formatDate(day.date)}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      {day.entries.length} actions
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {day.entries.map(entry => (
                      <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <ActivityIcon module={entry.module} />
                        <div className="flex-1 min-w-0">
                          {entry.label ? (
                            <span className="text-sm text-gray-800 dark:text-gray-200">{entry.label}</span>
                          ) : (
                            <span className="text-sm text-gray-800 dark:text-gray-200">
                              <span className="font-medium capitalize">{entry.module}</span>
                              <span className="text-gray-500 mx-1">·</span>
                              <span className="text-gray-600 dark:text-gray-400">{entry.action}</span>
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {formatTime(entry.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Workspace Snapshots */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Workspace Snapshots
          </h2>
          <div className="card p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Save Snapshot</h3>
            <div className="space-y-2">
              <input
                className="input text-sm w-full"
                placeholder="Snapshot name…"
                value={snapName}
                onChange={e => setSnapName(e.target.value)}
              />
              <textarea
                className="input text-sm w-full resize-none"
                rows={2}
                placeholder="Notes (optional)…"
                value={snapNotes}
                onChange={e => setSnapNotes(e.target.value)}
              />
              <button
                onClick={saveSnapshot}
                disabled={savingSnap || !snapName.trim()}
                className="btn-primary text-sm py-2 w-full disabled:opacity-50"
              >
                {savingSnap ? 'Saving…' : '💾 Save Snapshot'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {snapshots.length === 0 && !loading && (
              <p className="text-sm text-gray-400 text-center py-4">No snapshots saved yet.</p>
            )}
            {snapshots.map(snap => (
              <div key={snap.id} className="card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {snap.name}
                    </p>
                    {snap.notes && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{snap.notes}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {snap.created_at ? new Date(snap.created_at).toLocaleDateString() : ''}
                      {snap.open_pages?.length ? ` · ${snap.open_pages.length} pages` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => loadSnapshot(snap)}
                      className="btn-ghost text-xs px-2 py-1"
                      title="Load snapshot"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => deleteSnapshot(snap.id)}
                      className="btn-ghost text-xs px-2 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="Delete"
                    >
                      🗑
                    </button>
                  </div>
                </div>
                {snap.open_pages?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {snap.open_pages.slice(0, 5).map(p => (
                      <button
                        key={p.href}
                        onClick={() => router.push(p.href)}
                        className="text-xs bg-gray-100 dark:bg-gray-800 text-brand-600 dark:text-brand-400 px-2 py-0.5 rounded hover:bg-brand-50 dark:hover:bg-brand-900/30"
                      >
                        {p.label}
                      </button>
                    ))}
                    {snap.open_pages.length > 5 && (
                      <span className="text-xs text-gray-400">+{snap.open_pages.length - 5} more</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
