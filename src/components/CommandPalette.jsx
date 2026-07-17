'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard',  label: 'Dashboard',  icon: '⚡', group: 'Navigation' },
  { href: '/calendar',   label: 'Calendar',   icon: '📅', group: 'Navigation' },
  { href: '/todos',      label: 'To-Do',      icon: '✅', group: 'Navigation' },
  { href: '/files',      label: 'Files',      icon: '📁', group: 'Navigation' },
  { href: '/financials', label: 'Financials', icon: '💰', group: 'Navigation' },
  { href: '/goals',      label: 'Goals',      icon: '🎯', group: 'Navigation' },
  { href: '/studio',     label: 'AI Studio',  icon: '✨', group: 'Navigation' },
  { href: '/draw',       label: 'Draw',       icon: '✏️', group: 'Navigation' },
  { href: '/media',      label: 'Media',      icon: '🎬', group: 'Navigation' },
  { href: '/generate',   label: 'Generate',   icon: '📄', group: 'Navigation' },
  { href: '/terminal',   label: 'Terminal',   icon: '💻', group: 'Navigation' },
  { href: '/wiki',       label: 'Wiki',       icon: '📖', group: 'Navigation' },
  { href: '/storage',    label: 'Storage',    icon: '💾', group: 'Navigation' },
  { href: '/timeline',   label: 'Timeline',   icon: '📊', group: 'Navigation' },
  { href: '/settings',   label: 'Settings',   icon: '⚙️', group: 'Navigation' },
]

const ACTION_ITEMS = [
  { id: 'new-todo',      label: 'New Todo',       icon: '✅', group: 'Actions' },
  { id: 'new-event',     label: 'New Event',      icon: '📅', group: 'Actions' },
  { id: 'new-wiki',      label: 'New Wiki Page',  icon: '📖', group: 'Actions' },
  { id: 'capture-note',  label: 'Capture Note',   icon: '📝', group: 'Actions' },
]

const ALL_ITEMS = [...NAV_ITEMS, ...ACTION_ITEMS]

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [actionForm, setActionForm] = useState(null) // { id, value }
  const inputRef = useRef(null)
  const router = useRouter()

  const filtered = query.trim()
    ? ALL_ITEMS.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase())
      )
    : ALL_ITEMS

  useEffect(() => {
    setSelected(0)
  }, [query])

  useEffect(() => {
    function handleKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
        setQuery('')
        setActionForm(null)
        setSelected(0)
      }
      if (e.key === 'Escape') {
        if (actionForm) {
          setActionForm(null)
        } else {
          setOpen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [actionForm])

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  function handleSelect(item) {
    if (item.href) {
      router.push(item.href)
      setOpen(false)
      setQuery('')
    } else {
      setActionForm({ id: item.id, value: '' })
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(s => Math.min(s + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(s => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selected]) handleSelect(filtered[selected])
    }
  }

  function handleActionSubmit(e) {
    e.preventDefault()
    const val = actionForm.value.trim()
    if (!val) return
    if (actionForm.id === 'new-todo') router.push(`/todos?new=${encodeURIComponent(val)}`)
    else if (actionForm.id === 'new-event') router.push(`/calendar?new=${encodeURIComponent(val)}`)
    else if (actionForm.id === 'new-wiki') router.push(`/wiki?new=${encodeURIComponent(val)}`)
    else if (actionForm.id === 'capture-note') router.push(`/wiki?capture=${encodeURIComponent(val)}`)
    setOpen(false)
    setActionForm(null)
    setQuery('')
  }

  // Group results
  const groups = {}
  filtered.forEach(item => {
    if (!groups[item.group]) groups[item.group] = []
    groups[item.group].push(item)
  })

  let flatIdx = 0

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <span className="text-gray-400 text-lg">🔍</span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none text-gray-900 dark:text-white placeholder-gray-400 text-base"
            placeholder="Search pages or actions…"
            value={query}
            onChange={e => { setQuery(e.target.value); setActionForm(null) }}
            onKeyDown={handleKeyDown}
          />
          <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono">ESC</span>
        </div>

        {/* Action mini-form */}
        {actionForm && (
          <form onSubmit={handleActionSubmit} className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {ACTION_ITEMS.find(a => a.id === actionForm.id)?.label}
            </p>
            <div className="flex gap-2">
              <input
                autoFocus
                className="input flex-1 text-sm"
                placeholder="Enter name or text…"
                value={actionForm.value}
                onChange={e => setActionForm(f => ({ ...f, value: e.target.value }))}
              />
              <button type="submit" className="btn-primary text-sm px-3 py-1.5">Go</button>
              <button
                type="button"
                className="btn-ghost text-sm px-3 py-1.5"
                onClick={() => setActionForm(null)}
              >Cancel</button>
            </div>
          </form>
        )}

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 py-8 text-sm">No results for "{query}"</p>
          )}
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <p className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">{group}</p>
              {items.map(item => {
                const idx = flatIdx++
                const isSelected = idx === selected
                return (
                  <button
                    key={item.href || item.id}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                      isSelected
                        ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                    onMouseEnter={() => setSelected(idx)}
                    onClick={() => handleSelect(item)}
                  >
                    <span className="text-base w-5 text-center">{item.icon}</span>
                    <span>{item.label}</span>
                    {item.href && (
                      <span className="ml-auto text-xs text-gray-400">{item.href}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex gap-4 text-xs text-gray-400">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>ESC close</span>
          <span className="ml-auto">Ctrl+K to toggle</span>
        </div>
      </div>
    </div>
  )
}
