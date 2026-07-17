'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { STATUS_COLORS, formatDate, cn } from '@/lib/utils'
import toast from 'react-hot-toast'

const CATEGORIES = ['personal','career','health','finance','learning','other']
const STATUSES = ['not_started','in_progress','on_track','at_risk','completed','abandoned']
const STATUS_LABELS = { not_started:'Not Started', in_progress:'In Progress', on_track:'On Track', at_risk:'At Risk', completed:'Completed', abandoned:'Abandoned' }

function Modal({ open, onClose, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function ProgressRing({ progress, size = 56 }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (progress / 100) * circ
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-gray-200 dark:text-gray-700" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="text-brand-500 transition-all duration-700" />
    </svg>
  )
}

export default function GoalsPage() {
  const { data: session } = useSession()
  const [goals, setGoals] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [selectedGoal, setSelectedGoal] = useState(null)
  const [form, setForm] = useState({ title:'', description:'', category:'personal', target_date:'' })
  const [reflection, setReflection] = useState('')

  useEffect(() => { if (session) loadGoals() }, [session])

  async function loadGoals() {
    try { const data = await api.goals.list(session); setGoals(data) } catch (_) {}
  }

  function openNew() { setForm({ title:'', description:'', category:'personal', target_date:'' }); setEditing(null); setShowModal(true) }
  function openEdit(g) { setForm({ title:g.title, description:g.description||'', category:g.category, target_date:g.target_date||'' }); setEditing(g.id); setShowModal(true) }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Title required'); return }
    try {
      if (editing) { await api.goals.update(editing, form, session); toast.success('Goal updated') }
      else { await api.goals.create(form, session); toast.success('Goal created') }
      setShowModal(false); loadGoals()
    } catch (e) { toast.error(e.message) }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this goal and all its key results?')) return
    try { await api.goals.delete(id || editing, session); toast.success('Goal deleted'); setShowModal(false); setSelectedGoal(null); loadGoals() }
    catch (e) { toast.error(e.message) }
  }

  async function handlePin(g) {
    try { await api.goals.update(g.id, { pinned: !g.pinned }, session); loadGoals() } catch (_) {}
  }

  async function handleStatusChange(g, status) {
    try { await api.goals.update(g.id, { status }, session); loadGoals() } catch (_) {}
  }

  async function handleKRUpdate(goal, kr, field, value) {
    try { await api.goals.updateKR(goal.id, kr.id, { [field]: value }, session); loadGoals() } catch (_) {}
  }

  async function handleReflect() {
    if (!reflection.trim() || !selectedGoal) return
    try {
      await api.goals.reflect(selectedGoal.id, reflection, session)
      toast.success('Reflection saved'); setReflection('')
    } catch (e) { toast.error(e.message) }
  }

  const catEmoji = { personal:'🙋', career:'💼', health:'🏋️', finance:'💰', learning:'📚', other:'⭐' }

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{goals.filter(g=>g.status!=='completed').length} active · {goals.filter(g=>g.status==='completed').length} completed</p>
        </div>
        <button onClick={openNew} className="btn-primary">+ Goal</button>
      </div>

      {goals.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">🎯</p>
          <p className="text-gray-400">No goals yet. Start by adding one.</p>
          <button onClick={openNew} className="btn-primary mt-4">Add your first goal</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {goals.map(g => (
          <div key={g.id} className={cn('card p-5 cursor-pointer hover:border-brand-300 dark:hover:border-brand-700 transition-colors', g.pinned && 'ring-2 ring-brand-500')}
            onClick={() => setSelectedGoal(selectedGoal?.id === g.id ? null : g)}>
            <div className="flex items-start gap-3">
              <ProgressRing progress={g.progress} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{g.title}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={e => { e.stopPropagation(); handlePin(g) }}
                      className={`text-sm transition-colors ${g.pinned ? 'text-brand-500' : 'text-gray-300 hover:text-gray-500'}`}>📌</button>
                    <button onClick={e => { e.stopPropagation(); openEdit(g) }}
                      className="text-gray-300 hover:text-gray-500 text-sm">✏️</button>
                    <button onClick={e => { e.stopPropagation(); handleDelete(g.id) }}
                      className="text-gray-300 hover:text-red-500 transition-colors text-sm" title="Delete goal">🗑</button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="badge bg-gray-100 dark:bg-gray-800 text-gray-500 capitalize">{catEmoji[g.category]} {g.category}</span>
                  <span className={`badge ${STATUS_COLORS[g.status] || 'bg-gray-100 text-gray-600'}`}>{STATUS_LABELS[g.status]}</span>
                  {g.target_date && <span className="text-xs text-gray-400">🗓 {formatDate(g.target_date)}</span>}
                </div>
                <p className="text-xs text-gray-400 mt-1 font-medium">{g.progress}% complete</p>
              </div>
            </div>

            {/* Key results (expanded) */}
            {selectedGoal?.id === g.id && g.key_results?.length > 0 && (
              <div className="mt-4 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-4" onClick={e => e.stopPropagation()}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Key Results</p>
                {g.key_results.map(kr => (
                  <div key={kr.id} className="flex items-center gap-3">
                    {kr.type === 'boolean' ? (
                      <input type="checkbox" checked={kr.completed} onChange={e => handleKRUpdate(g, kr, 'completed', e.target.checked)}
                        className="w-4 h-4 accent-brand-600 cursor-pointer" />
                    ) : (
                      <input type="number" className="input w-24 text-sm" value={kr.current_value}
                        onChange={e => handleKRUpdate(g, kr, 'current_value', parseFloat(e.target.value))} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 dark:text-gray-300">{kr.title}</p>
                      {kr.type === 'numeric' && kr.target_value && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                            <div className="bg-brand-500 rounded-full h-1.5" style={{ width: `${Math.min(100, (kr.current_value/kr.target_value)*100)}%` }} />
                          </div>
                          <p className="text-xs text-gray-400 shrink-0">{kr.current_value}/{kr.target_value}{kr.unit ? ` ${kr.unit}` : ''}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Status change */}
                <div className="flex items-center gap-2 mt-2">
                  <label className="text-xs text-gray-500">Status:</label>
                  <select className="input text-xs py-1" value={g.status} onChange={e => handleStatusChange(g, e.target.value)}>
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>

                {/* Weekly reflection */}
                <div className="mt-3">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Weekly reflection</label>
                  <textarea className="input resize-none mt-1 text-sm" rows={2} placeholder="What did you do toward this goal this week?" value={reflection} onChange={e => setReflection(e.target.value)} />
                  <button onClick={handleReflect} className="btn-secondary text-xs mt-2">Save reflection</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Goal modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-900 dark:text-white">{editing ? 'Edit goal' : 'New goal'}</h3>
          <button onClick={() => setShowModal(false)} className="text-gray-400 text-xl">×</button>
        </div>
        <div className="space-y-3">
          <div><label className="label">Title *</label><input className="input" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} placeholder="What do you want to achieve?" /></div>
          <div><label className="label">Description</label><textarea className="input resize-none" rows={2} value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))}>
                {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{catEmoji[c]} {c}</option>)}
              </select>
            </div>
            <div><label className="label">Target date</label><input type="date" className="input" value={form.target_date} onChange={e => setForm(f=>({...f,target_date:e.target.value}))} /></div>
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
