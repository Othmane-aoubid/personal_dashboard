'use client'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'

const TYPES = ['Note', 'Todo', 'Idea']

export default function QuickCapture() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [type, setType] = useState('Note')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) return
    setSaving(true)
    try {
      if (type === 'Todo') {
        await api.todos.create({ title: text.trim() }, session)
        toast.success('Todo created!')
      } else {
        await api.wiki.create(
          {
            title: text.trim().slice(0, 80) || 'Quick Capture',
            content: text.trim(),
            category: 'Quick Captures',
            tags: [type.toLowerCase()],
            pinned: false,
          },
          session
        )
        toast.success(`${type} saved to Wiki!`)
      }
      setText('')
      setOpen(false)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-brand-600 hover:bg-brand-700 text-white rounded-full shadow-lg flex items-center justify-center text-xl transition-transform hover:scale-110 active:scale-95"
        title="Quick Capture (note, todo, or idea)"
      >
        ✏️
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:justify-end p-4 sm:p-6 bg-black/30"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Quick Capture</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
              >×</button>
            </div>

            {/* Type selector */}
            <div className="flex gap-1 mb-3">
              {TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    type === t
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {t === 'Note' ? '📝' : t === 'Todo' ? '✅' : '💡'} {t}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit}>
              <textarea
                autoFocus
                className="input w-full resize-none text-sm"
                rows={4}
                placeholder={
                  type === 'Todo'
                    ? 'What needs to be done?'
                    : type === 'Idea'
                    ? 'Capture your idea…'
                    : 'Write a quick note…'
                }
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    handleSubmit(e)
                  }
                }}
              />
              <div className="flex gap-2 mt-3">
                <button
                  type="submit"
                  disabled={saving || !text.trim()}
                  className="btn-primary flex-1 text-sm py-2 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : `Save ${type}`}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-ghost text-sm px-3 py-2"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">Ctrl+Enter to save</p>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
