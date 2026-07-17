'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { PRIORITY_COLORS, PRIORITY_LABELS, formatDate, cn } from '@/lib/utils'
import toast from 'react-hot-toast'

const STATUSES = ['backlog', 'in_progress', 'done', 'archived']
const STATUS_LABELS = { backlog: 'Backlog', in_progress: 'In Progress', done: 'Done', archived: 'Archived' }
const STATUS_COLORS = {
  backlog:     'bg-gray-100 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700',
  in_progress: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  done:        'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  archived:    'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800',
}
const STATUS_HEADER = {
  backlog:     'text-gray-600 dark:text-gray-400',
  in_progress: 'text-blue-700 dark:text-blue-400',
  done:        'text-green-700 dark:text-green-400',
  archived:    'text-gray-500 dark:text-gray-500',
}

function Modal({ open, onClose, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg p-6"
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function logActivity(session, module, action, label, entityId) {
  api.timeline.log({ module, action, label, entity_id: entityId || null, entity_type: module }, session).catch(() => {})
}

export default function TodosPage() {
  const { data: session } = useSession()
  const [todos, setTodos] = useState([])
  const [view, setView] = useState('kanban')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', priority: 2, status: 'backlog', due_at: '', labels: [] })
  const [newLabel, setNewLabel] = useState('')
  const [search, setSearch] = useState('')

  // Drag state
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverStatus, setDragOverStatus] = useState(null)
  const dragItem = useRef(null)

  useEffect(() => { if (session) loadTodos() }, [session])

  async function loadTodos() {
    try {
      const data = await api.todos.list({}, session)
      setTodos(data)
    } catch (_) {}
  }

  function openNew(status = 'backlog') {
    setForm({ title: '', description: '', priority: 2, status, due_at: '', labels: [] })
    setEditing(null); setShowModal(true)
  }

  function openEdit(t) {
    setForm({ title: t.title, description: t.description || '', priority: t.priority, status: t.status, due_at: t.due_at ? t.due_at.slice(0, 16) : '', labels: t.labels || [] })
    setEditing(t.id); setShowModal(true)
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Title required'); return }
    try {
      if (editing) {
        await api.todos.update(editing, form, session)
        logActivity(session, 'todos', 'updated', `Updated "${form.title}"`, editing)
        toast.success('Task updated')
      } else {
        const created = await api.todos.create(form, session)
        logActivity(session, 'todos', 'created', `Created "${form.title}"`, created?.id)
        toast.success('Task created')
      }
      setShowModal(false); loadTodos()
    } catch (e) { toast.error(e.message) }
  }

  async function handleComplete(id, title) {
    try {
      await api.todos.complete(id, session)
      logActivity(session, 'todos', 'completed', `Completed "${title}"`, id)
      toast.success('Task done! ✅'); loadTodos()
    } catch (e) { toast.error(e.message) }
  }

  async function handleDelete(id) {
    const targetId = id || editing
    const t = todos.find(x => x.id === targetId)
    if (!confirm('Delete this task?')) return
    try {
      await api.todos.delete(targetId, session)
      logActivity(session, 'todos', 'deleted', `Deleted "${t?.title || ''}"`, targetId)
      toast.success('Deleted')
      if (!id) setShowModal(false)
      loadTodos()
    } catch (e) { toast.error(e.message) }
  }

  // ── Drag & Drop ─────────────────────────────────────────────────────────────

  function onDragStart(e, todo) {
    dragItem.current = todo
    setDraggingId(todo.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', todo.id)
  }

  function onDragEnd() {
    setDraggingId(null)
    setDragOverStatus(null)
    dragItem.current = null
  }

  function onDragOver(e, status) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStatus(status)
  }

  function onDragLeave(e) {
    // only clear when leaving the column entirely (not a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverStatus(null)
    }
  }

  async function onDrop(e, newStatus) {
    e.preventDefault()
    setDragOverStatus(null)
    const todo = dragItem.current
    if (!todo || todo.status === newStatus) { setDraggingId(null); return }
    // Optimistic update
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: newStatus } : t))
    setDraggingId(null)
    try {
      await api.todos.update(todo.id, { status: newStatus }, session)
      logActivity(session, 'todos', 'moved',
        `Moved "${todo.title}" → ${STATUS_LABELS[newStatus]}`, todo.id)
    } catch (e) {
      toast.error(e.message)
      loadTodos() // revert on error
    }
  }

  const filtered = todos.filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()))
  const byStatus = status => filtered.filter(t => t.status === status)

  return (
    <div className="space-y-4 fade-in">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {['kanban', 'list'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={cn('btn-ghost text-xs capitalize', view === v && 'bg-brand-50 dark:bg-brand-900/30 text-brand-600')}>
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input className="input w-48" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          <button onClick={() => openNew()} className="btn-primary">+ Task</button>
        </div>
      </div>

      {/* Kanban */}
      {view === 'kanban' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATUSES.map(status => {
            const isOver = dragOverStatus === status
            return (
              <div key={status}
                className={cn(
                  'rounded-xl p-3 border-2 transition-all duration-150 min-h-[200px]',
                  STATUS_COLORS[status],
                  isOver && 'scale-[1.01] shadow-lg border-brand-400 dark:border-brand-500 ring-2 ring-brand-300/50'
                )}
                onDragOver={e => onDragOver(e, status)}
                onDragLeave={onDragLeave}
                onDrop={e => onDrop(e, status)}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className={cn('text-sm font-semibold', STATUS_HEADER[status])}>
                    {STATUS_LABELS[status]}
                  </h3>
                  <span className="badge bg-white/70 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                    {byStatus(status).length}
                  </span>
                </div>

                {/* Drop hint */}
                {isOver && dragItem.current?.status !== status && (
                  <div className="mb-2 border-2 border-dashed border-brand-400 rounded-lg h-14 flex items-center justify-center text-xs text-brand-500">
                    Drop here
                  </div>
                )}

                <div className="space-y-2">
                  {byStatus(status).map(t => (
                    <div key={t.id}
                      draggable
                      onDragStart={e => onDragStart(e, t)}
                      onDragEnd={onDragEnd}
                      className={cn(
                        'group card p-3 cursor-grab active:cursor-grabbing hover:border-brand-300 dark:hover:border-brand-700 transition-all select-none',
                        draggingId === t.id && 'opacity-40 scale-95 rotate-1'
                      )}
                      onClick={() => openEdit(t)}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1.5">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug">{t.title}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          {status !== 'done' && (
                            <button onClick={e => { e.stopPropagation(); handleComplete(t.id, t.title) }}
                              className="text-gray-300 hover:text-green-500 transition-colors text-lg leading-none">○</button>
                          )}
                          <button onClick={e => { e.stopPropagation(); handleDelete(t.id) }}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-base leading-none" title="Delete">🗑</button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`badge ${PRIORITY_COLORS[t.priority]}`}>{PRIORITY_LABELS[t.priority]}</span>
                        {t.due_at && <span className="badge bg-gray-100 dark:bg-gray-700 text-gray-500">{formatDate(t.due_at)}</span>}
                        {(t.labels || []).slice(0, 2).map(l => (
                          <span key={l} className="badge bg-brand-50 dark:bg-brand-900/30 text-brand-600">{l}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button onClick={() => openNew(status)}
                    className="w-full text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 py-2 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg hover:border-gray-400 transition-colors">
                    + Add
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="card divide-y divide-gray-100 dark:divide-gray-800">
          {filtered.length === 0 && <div className="p-8 text-center text-gray-400">No tasks yet.</div>}
          {filtered.map(t => (
            <div key={t.id} className="group flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
              onClick={() => openEdit(t)}>
              <button onClick={e => { e.stopPropagation(); t.status !== 'done' && handleComplete(t.id, t.title) }}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${t.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>
                {t.status === 'done' && <span className="text-xs">✓</span>}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-200'}`}>{t.title}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className={`badge ${PRIORITY_COLORS[t.priority]}`}>{PRIORITY_LABELS[t.priority]}</span>
                  {t.due_at && <span className="text-xs text-gray-400">{formatDate(t.due_at)}</span>}
                </div>
              </div>
              <select
                className="input text-xs py-1 w-32"
                value={t.status}
                onClick={e => e.stopPropagation()}
                onChange={async e => {
                  const newStatus = e.target.value
                  setTodos(prev => prev.map(x => x.id === t.id ? { ...x, status: newStatus } : x))
                  await api.todos.update(t.id, { status: newStatus }, session)
                  logActivity(session, 'todos', 'moved', `Moved "${t.title}" → ${STATUS_LABELS[newStatus]}`, t.id)
                }}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              <button onClick={e => { e.stopPropagation(); handleDelete(t.id) }}
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-lg" title="Delete">🗑</button>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-900 dark:text-white">{editing ? 'Edit task' : 'New task'}</h3>
          <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="space-y-3">
          <div><label className="label">Title *</label>
            <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title" /></div>
          <div><label className="label">Description</label>
            <textarea className="input resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional markdown" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) }))}>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            <div><label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select></div>
          </div>
          <div><label className="label">Due date</label>
            <input type="datetime-local" className="input" value={form.due_at} onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))} /></div>
          <div>
            <label className="label">Labels</label>
            <div className="flex gap-2 flex-wrap mb-2">
              {(form.labels || []).map(l => (
                <span key={l} className="badge bg-brand-50 dark:bg-brand-900/30 text-brand-600 cursor-pointer"
                  onClick={() => setForm(f => ({ ...f, labels: f.labels.filter(x => x !== l) }))}>
                  {l} ×
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="Add label" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newLabel.trim()) { setForm(f => ({ ...f, labels: [...f.labels, newLabel.trim()] })); setNewLabel('') } }} />
              <button className="btn-secondary" onClick={() => { if (newLabel.trim()) { setForm(f => ({ ...f, labels: [...f.labels, newLabel.trim()] })); setNewLabel('') } }}>Add</button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          {editing && <button onClick={() => handleDelete()} className="btn-danger">Delete</button>}
          <button onClick={() => setShowModal(false)} className="btn-secondary ml-auto">Cancel</button>
          <button onClick={handleSave} className="btn-primary">Save</button>
        </div>
      </Modal>
    </div>
  )
}
