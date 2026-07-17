'use client'
import { useSession } from 'next-auth/react'
import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime, relativeTime, PRIORITY_COLORS, PRIORITY_LABELS } from '@/lib/utils'
import Link from 'next/link'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line, CartesianGrid,
} from 'recharts'

const PIE_COLORS = {
  backlog: '#94a3b8',
  in_progress: '#3b82f6',
  done: '#22c55e',
  archived: '#e5e7eb',
}

const PRIORITY_CHART_COLORS = ['#ef4444', '#f97316', '#3b82f6', '#94a3b8']

function StatCard({ label, value, sub, icon, color = 'brand' }) {
  const colors = {
    brand: 'bg-brand-50 dark:bg-brand-900/20 text-brand-600',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600',
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600',
  }
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${colors[color]}`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function SectionTitle({ children, href, linkLabel }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-semibold text-gray-900 dark:text-white">{children}</h3>
      {href && <Link href={href} className="text-xs text-brand-600 hover:text-brand-500">{linkLabel || 'View all →'}</Link>}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <span className="font-bold">{p.value}</span></p>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const [todos, setTodos] = useState([])
  const [events, setEvents] = useState([])
  const [financial, setFinancial] = useState(null)
  const [goals, setGoals] = useState([])
  const [activity, setActivity] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)

  const load = useCallback(async () => {
    if (!session) return
    try {
      const now = new Date()
      const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7)
      const [t, e, fin, g, act, st] = await Promise.all([
        api.todos.list({}, session),
        api.events.list({ start: now.toISOString(), end: weekEnd.toISOString() }, session),
        api.financials.summary(session),
        api.goals.list(session),
        api.settings.activity(session),
        api.timeline.stats(session),
      ])
      setTodos(t)
      setEvents(e.slice(0, 5))
      setFinancial(fin)
      setGoals(g.filter(g => g.status !== 'archived'))
      setActivity(act.slice(0, 8))
      setStats(st)
      setLastRefresh(new Date())
    } catch (_) {}
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!session) return
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [session, load])

  const inProgressTodos = todos.filter(t => t.status === 'in_progress')
  const doneTodos = todos.filter(t => t.status === 'done').length
  const totalTodos = todos.filter(t => t.status !== 'archived').length
  const pinnedGoal = goals.find(g => g.pinned)
  const activeGoals = goals.filter(g => g.status === 'in_progress' || g.pinned)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400 text-sm animate-pulse">Loading dashboard…</div>
    </div>
  )

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {session?.user?.name?.split(' ')[0]} 👋
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Here's your overview for today.</p>
        </div>
        {lastRefresh && (
          <p className="text-xs text-gray-400 mt-1">
            Updated {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Pinned goal banner */}
      {pinnedGoal && (
        <div className="card p-5 bg-gradient-to-r from-brand-600 to-brand-700 border-0 text-white">
          <p className="text-brand-100 text-xs font-medium uppercase tracking-wide mb-1">📌 Daily Focus</p>
          <p className="font-semibold text-lg">{pinnedGoal.title}</p>
          <div className="mt-3 bg-white/20 rounded-full h-2 w-full">
            <div className="bg-white rounded-full h-2" style={{ width: `${pinnedGoal.progress}%` }} />
          </div>
          <p className="text-brand-100 text-xs mt-1">{pinnedGoal.progress}% complete</p>
        </div>
      )}

      {/* KPI stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Upcoming events" value={events.length} sub="next 7 days" icon="📅" color="brand" />
        <StatCard label="Tasks in progress" value={inProgressTodos.length}
          sub={`${doneTodos} done · ${stats?.overdue_todos || 0} overdue`} icon="✅"
          color={stats?.overdue_todos > 0 ? 'red' : 'green'} />
        <StatCard label="Month income" value={financial ? formatCurrency(financial.month_income) : '—'} sub="this month" icon="💰" color="green" />
        <StatCard label="Month spend" value={financial ? formatCurrency(financial.month_expense) : '—'}
          sub={financial ? `Net: ${formatCurrency(financial.month_net)}` : ''} icon="💸"
          color={financial?.month_net < 0 ? 'red' : 'orange'} />
      </div>

      {/* Charts row */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Todo status donut */}
          <div className="card p-5">
            <SectionTitle href="/todos">Tasks by Status</SectionTitle>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={stats.todos_by_status} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                  dataKey="value" nameKey="name" paddingAngle={3}>
                  {stats.todos_by_status.map(entry => (
                    <Cell key={entry.status} fill={PIE_COLORS[entry.status]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} formatter={v => <span className="text-xs text-gray-600 dark:text-gray-400">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-1 mt-2">
              {stats.todos_by_status.map(s => (
                <div key={s.status} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[s.status] }} />
                  {s.name}: <span className="font-semibold ml-0.5">{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Goals progress */}
          <div className="card p-5">
            <SectionTitle href="/goals">Goals Progress</SectionTitle>
            {stats.goals.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No active goals.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.goals} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="title" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip content={<CustomTooltip />} formatter={v => [`${v}%`, 'Progress']} />
                  <Bar dataKey="progress" fill="#6366f1" radius={[0, 4, 4, 0]} name="Progress" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Activity last 7 days */}
          <div className="card p-5">
            <SectionTitle href="/timeline">Activity (7 days)</SectionTitle>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.activity_by_day} margin={{ top: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="actions" fill="#6366f1" radius={[4, 4, 0, 0]} name="Actions" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Priority breakdown */}
      {stats && stats.todos_by_priority.some(p => p.count > 0) && (
        <div className="card p-5">
          <SectionTitle href="/todos">Open Tasks by Priority</SectionTitle>
          <div className="grid grid-cols-4 gap-3">
            {stats.todos_by_priority.map((p, i) => (
              <div key={p.name} className="text-center p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                <p className="text-2xl font-bold" style={{ color: PRIORITY_CHART_COLORS[i] }}>{p.count}</p>
                <p className="text-xs text-gray-500 mt-0.5">{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming events */}
        <div className="card p-5">
          <SectionTitle href="/calendar">Upcoming</SectionTitle>
          {events.length === 0 ? (
            <p className="text-gray-400 text-sm">No events this week.</p>
          ) : (
            <div className="space-y-3">
              {events.map(ev => (
                <div key={ev.id} className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-brand-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{ev.title}</p>
                    <p className="text-xs text-gray-400">{formatDateTime(ev.start_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* In Progress todos */}
        <div className="card p-5">
          <SectionTitle href="/todos">In Progress</SectionTitle>
          {inProgressTodos.length === 0 ? (
            <p className="text-gray-400 text-sm">No active tasks.</p>
          ) : (
            <div className="space-y-2">
              {inProgressTodos.slice(0, 6).map(t => (
                <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <span className={`badge ${PRIORITY_COLORS[t.priority]}`}>{PRIORITY_LABELS[t.priority][0]}</span>
                  <p className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{t.title}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity feed */}
        <div className="card p-5">
          <SectionTitle href="/timeline">Recent Activity</SectionTitle>
          {activity.length === 0 ? (
            <p className="text-gray-400 text-sm">No recent activity.</p>
          ) : (
            <div className="space-y-3">
              {activity.map(a => (
                <div key={a.id} className="flex items-start gap-2 text-sm">
                  <span className="text-base leading-none mt-0.5">
                    {{ calendar: '📅', todos: '✅', financials: '💰', goals: '🎯', files: '📁', studio: '✨' }[a.module] || '📌'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-700 dark:text-gray-300 truncate block">
                      {a.label || `${a.module} · ${a.action}`}
                    </span>
                    <p className="text-xs text-gray-400">{relativeTime(a.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active goals */}
      {activeGoals.length > 0 && (
        <div className="card p-5">
          <SectionTitle href="/goals">Active Goals</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {activeGoals.slice(0, 6).map(g => (
              <div key={g.id} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{g.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">{g.category}</p>
                <div className="mt-3 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                  <div className="bg-brand-500 rounded-full h-1.5" style={{ width: `${g.progress}%` }} />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{g.progress}%</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
