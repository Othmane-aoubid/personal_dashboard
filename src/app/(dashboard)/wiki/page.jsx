'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'

// Lightweight HTML sanitizer — strips scripts, event handlers, and dangerous URLs.
// Used wherever external or user-authored HTML is rendered via dangerouslySetInnerHTML.
function sanitizeHTML(html) {
  if (!html) return ''
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?(iframe|object|embed|form|input|button|link|meta|base)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    .replace(/href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, 'href="#"')
    .replace(/src\s*=\s*(?:"data:[^"]*"|'data:[^']*')/gi, '')
}

const PRESET_CATEGORIES = [
  'General', 'Commands', 'University', 'Code Snippets',
  'Server Setup', 'Life Docs', 'Processes', 'Quick Captures',
]

function renderMarkdown(text) {
  if (!text) return ''
  // Sanitize raw user input FIRST before any HTML is generated from it,
  // so that tags like <script> typed by a user are neutralised up front.
  const safe = sanitizeHTML(text)
  return safe
    .replace(/^#### (.+)$/gm, '<h4 class="text-sm font-bold mt-3 mb-1">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 rounded font-mono text-xs">$1</code>')
    .replace(/^```[\w]*\n?([\s\S]*?)```$/gm, '<pre class="bg-gray-100 dark:bg-gray-800 rounded p-3 text-xs font-mono overflow-x-auto my-2"><code>$1</code></pre>')
    .replace(/^\- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
    .replace(/\[(.+?)\]\(((?!javascript:)[^)]+)\)/g, '<a href="$2" class="text-brand-600 underline" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/^---$/gm, '<hr class="border-gray-200 dark:border-gray-700 my-4"/>')
    .split('\n').map(line =>
      line.startsWith('<') ? line : `<p class="my-1">${line}</p>`
    ).join('\n')
}

function wikiExtractToMarkdown(extract, title) {
  // Wikipedia's explaintext API uses == Section == format
  let md = `# ${title}\n\n`
  md += extract
    .replace(/^==== (.+?) ====\s*$/gm, '#### $1')
    .replace(/^=== (.+?) ===\s*$/gm, '### $1')
    .replace(/^== (.+?) ==\s*$/gm, '## $1')
  md += `\n\n*Source: [Wikipedia](https://en.wikipedia.org/wiki/${encodeURIComponent(title)})*`
  return md
}

// ── Wikipedia Import Modal ─────────────────────────────────────────────────────

function WikiImportModal({ open, onClose, onImport, session }) {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [preview, setPreview]     = useState(null)
  const [loading, setLoading]     = useState(false)
  const debounce = useRef(null)

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); setPreview(null) }
  }, [open])

  function handleQueryChange(q) {
    setQuery(q)
    if (debounce.current) clearTimeout(debounce.current)
    if (!q.trim()) { setResults([]); return }
    debounce.current = setTimeout(() => doSearch(q), 350)
  }

  async function doSearch(q) {
    setSearching(true)
    try {
      const data = await api.wiki.wikipediaSearch(q, session)
      setResults(data.results || [])
    } catch {
      toast.error('Wikipedia search failed')
    } finally {
      setSearching(false)
    }
  }

  async function loadPreview(title) {
    setLoading(true)
    setPreview(null)
    try {
      const data = await api.wiki.wikipediaArticle(title, session)
      setPreview({ title: data.title, extract: data.extract })
    } catch {
      toast.error('Failed to load article')
    } finally {
      setLoading(false)
    }
  }

  function stripHtml(html) {
    return html.replace(/<[^>]+>/g, '')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌐</span>
            <h3 className="font-semibold text-gray-900 dark:text-white">Import from Wikipedia</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="relative">
            <input
              autoFocus
              className="input w-full pl-9"
              placeholder="Search Wikipedia…"
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 animate-pulse">Searching…</span>}
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Results list */}
          <div className={`overflow-y-auto border-r border-gray-100 dark:border-gray-800 ${preview ? 'w-1/2' : 'w-full'}`}>
            {results.length === 0 && !searching && query && (
              <p className="p-5 text-sm text-gray-400 text-center">No results found.</p>
            )}
            {results.length === 0 && !query && (
              <div className="p-6 text-center text-gray-400">
                <p className="text-3xl mb-2">📚</p>
                <p className="text-sm">Search any topic to import from Wikipedia</p>
              </div>
            )}
            {results.map(r => (
              <button key={r.pageid}
                onClick={() => loadPreview(r.title)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${preview?.title === r.title ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{r.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2"
                  dangerouslySetInnerHTML={{ __html: sanitizeHTML(r.snippet) + '…' }} />
              </button>
            ))}
          </div>

          {/* Preview panel */}
          {preview && (
            <div className="w-1/2 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                  <div className="flex items-center justify-center h-32 text-gray-400 text-sm animate-pulse">Loading…</div>
                ) : (
                  <>
                    <h4 className="font-bold text-gray-900 dark:text-white mb-2">{preview.title}</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap line-clamp-[20]">
                      {preview.extract.split('\n\n')[0]}
                    </p>
                    {preview.extract.split('\n\n').length > 1 && (
                      <p className="text-xs text-gray-400 mt-2 italic">
                        +{preview.extract.split('\n\n').length - 1} more sections in full article
                      </p>
                    )}
                  </>
                )}
              </div>
              {!loading && preview && (
                <div className="p-3 border-t border-gray-100 dark:border-gray-800 flex gap-2">
                  <button
                    onClick={() => onImport('summary', preview)}
                    className="btn-secondary text-xs flex-1">
                    📝 Import Summary
                  </button>
                  <button
                    onClick={() => onImport('full', preview)}
                    className="btn-primary text-xs flex-1">
                    📄 Import Full Article
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Wiki Page ─────────────────────────────────────────────────────────────

export default function WikiPage() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const [pages, setPages]                 = useState([])
  const [selected, setSelected]           = useState(null)
  const [loading, setLoading]             = useState(true)
  const [searchQ, setSearchQ]             = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [editMode, setEditMode]           = useState(false)
  const [draft, setDraft]                 = useState({})
  const [saving, setSaving]               = useState(false)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const [collapsedCats, setCollapsedCats] = useState({})
  const [wikiModal, setWikiModal]         = useState(false)
  const saveTimerRef = useRef(null)

  const loadPages = useCallback(async () => {
    if (!session) return
    try {
      const data = await api.wiki.list(session)
      setPages(data)
    } catch {
      toast.error('Failed to load wiki pages')
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => { loadPages() }, [loadPages])

  useEffect(() => {
    const newTitle = searchParams.get('new')
    const captureText = searchParams.get('capture')
    if ((newTitle || captureText) && session) {
      handleNewPage(newTitle || captureText, captureText ? 'Quick Captures' : 'General')
    }
  }, [session, searchParams])

  async function handleNewPage(title = 'Untitled', category = 'General') {
    try {
      const page = await api.wiki.create({ title, content: '', category, tags: [], pinned: false }, session)
      setPages(prev => [page, ...prev])
      await selectPage(page.id)
      setEditMode(true)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function selectPage(id) {
    try {
      const page = await api.wiki.get(id, session)
      setSelected(page)
      setDraft({ title: page.title, content: page.content, category: page.category, tags: page.tags })
      setEditMode(false)
    } catch {
      toast.error('Failed to load page')
    }
  }

  async function saveDraft(overrides = {}) {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await api.wiki.update(selected.id, { ...draft, ...overrides }, session)
      setSelected(updated)
      setDraft({ title: updated.title, content: updated.content, category: updated.category, tags: updated.tags })
      setPages(prev => prev.map(p => p.id === updated.id
        ? { ...p, title: updated.title, category: updated.category, tags: updated.tags, pinned: updated.pinned, updated_at: updated.updated_at }
        : p
      ))
      setSavedIndicator(true)
      setTimeout(() => setSavedIndicator(false), 2000)
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function scheduleSave(field, value) {
    setDraft(d => ({ ...d, [field]: value }))
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveDraft({ [field]: value }), 1000)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this page?')) return
    try {
      await api.wiki.delete(id, session)
      setPages(prev => prev.filter(p => p.id !== id))
      if (selected?.id === id) setSelected(null)
      toast.success('Page deleted')
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleTogglePin() {
    if (!selected) return
    const pinned = !selected.pinned
    await saveDraft({ pinned })
    setSelected(s => ({ ...s, pinned }))
  }

  async function handleSearch(q) {
    setSearchQ(q)
    if (!q.trim()) { setSearchResults(null); return }
    try {
      const results = await api.wiki.search(q, session)
      setSearchResults(results)
    } catch (err) {
      toast.error(err.message)
    }
  }

  function handleWikiImport(mode, preview) {
    let content = ''
    if (mode === 'summary') {
      const firstPara = preview.extract.split('\n\n')[0]
      content = `## ${preview.title}\n\n${firstPara}\n\n*Source: [Wikipedia](https://en.wikipedia.org/wiki/${encodeURIComponent(preview.title)})*`
    } else {
      content = wikiExtractToMarkdown(preview.extract, preview.title)
    }
    const newContent = draft.content ? `${draft.content}\n\n---\n\n${content}` : content
    scheduleSave('content', newContent)
    // Also switch to preview so user sees the imported content
    setEditMode(false)
    setWikiModal(false)
    toast.success(`Imported "${preview.title}" from Wikipedia`)
  }

  const grouped = {}
  const displayPages = searchResults || pages
  displayPages.forEach(p => {
    const cat = p.category || 'General'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(p)
  })

  return (
    <>
      <WikiImportModal
        open={wikiModal}
        onClose={() => setWikiModal(false)}
        onImport={handleWikiImport}
        session={session}
      />

      <div className="h-[calc(100vh-6rem)] flex gap-4 min-h-0">
        {/* LEFT — Sidebar */}
        <div className="w-64 flex-shrink-0 flex flex-col card p-0 overflow-hidden">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <button onClick={() => handleNewPage()} className="btn-primary text-sm py-2 w-full mb-3">
              + New Page
            </button>
            <input
              className="input text-sm py-1.5 w-full"
              placeholder="🔍 Search wiki…"
              value={searchQ}
              onChange={e => handleSearch(e.target.value)}
            />
            {searchResults && (
              <button
                onClick={() => { setSearchResults(null); setSearchQ('') }}
                className="text-xs text-gray-400 hover:text-gray-600 mt-1"
              >
                ✕ Clear search
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {loading ? (
              <div className="p-4 text-center text-gray-400 text-sm">Loading…</div>
            ) : Object.keys(grouped).length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">No pages yet. Create your first!</div>
            ) : (
              Object.entries(grouped).map(([cat, catPages]) => (
                <div key={cat}>
                  <button
                    onClick={() => setCollapsedCats(c => ({ ...c, [cat]: !c[cat] }))}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    <span>{cat}</span>
                    <span>{collapsedCats[cat] ? '▶' : '▼'}</span>
                  </button>
                  {!collapsedCats[cat] && catPages.map(p => (
                    <button key={p.id} onClick={() => selectPage(p.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                        selected?.id === p.id
                          ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}>
                      {p.pinned && <span className="text-yellow-500 text-xs">📌</span>}
                      <span className="flex-1 truncate text-xs">{p.title}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-400 mb-2">Categories</p>
            <div className="flex flex-wrap gap-1">
              {PRESET_CATEGORIES.map(cat => (
                <span key={cat}
                  className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full cursor-pointer hover:bg-brand-100 dark:hover:bg-brand-900/30"
                  onClick={() => handleNewPage('Untitled', cat)}
                  title={`New page in ${cat}`}>
                  {cat}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — Editor/Viewer */}
        <div className="flex-1 flex flex-col card p-0 overflow-hidden min-w-0">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="text-5xl mb-4">📖</div>
              <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">Your Personal Wiki</h2>
              <p className="text-gray-400 text-sm mb-6 max-w-md">
                Store notes, commands, code snippets, and anything you need to remember.
                Import articles directly from Wikipedia with one click.
              </p>
              <div className="flex gap-3">
                <button onClick={() => handleNewPage()} className="btn-primary">Create Page</button>
                <button onClick={() => { handleNewPage(); setTimeout(() => setWikiModal(true), 300) }} className="btn-secondary">
                  🌐 Import from Wikipedia
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex-1 min-w-0">
                  <input
                    className="text-xl font-bold bg-transparent border-none outline-none w-full text-gray-900 dark:text-white"
                    value={draft.title || ''}
                    onChange={e => scheduleSave('title', e.target.value)}
                    onBlur={() => saveDraft()}
                    placeholder="Page title…"
                  />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {savedIndicator && <span className="text-xs text-green-500">✓ Saved</span>}
                  {saving && <span className="text-xs text-gray-400">Saving…</span>}
                  <button
                    onClick={() => setWikiModal(true)}
                    className="btn-ghost text-xs px-3 py-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    title="Import content from Wikipedia"
                  >
                    🌐 Wikipedia
                  </button>
                  <button
                    onClick={handleTogglePin}
                    className={`text-sm ${selected.pinned ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
                    title={selected.pinned ? 'Unpin' : 'Pin'}
                  >
                    📌
                  </button>
                  <button
                    onClick={() => setEditMode(e => !e)}
                    className={`btn-ghost text-xs px-3 py-1.5 ${editMode ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600' : ''}`}
                  >
                    {editMode ? '👁 Preview' : '✏️ Edit'}
                  </button>
                  <button
                    onClick={() => handleDelete(selected.id)}
                    className="btn-ghost text-xs px-3 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                <select
                  className="text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-gray-600 dark:text-gray-400"
                  value={draft.category || 'General'}
                  onChange={e => scheduleSave('category', e.target.value)}
                >
                  {PRESET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  className="flex-1 text-xs bg-transparent outline-none text-gray-500 dark:text-gray-400"
                  placeholder="Tags (comma-separated)…"
                  value={(draft.tags || []).join(', ')}
                  onChange={e => {
                    const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                    scheduleSave('tags', tags)
                  }}
                />
                <span className="text-xs text-gray-400">
                  {selected.updated_at ? `Updated ${new Date(selected.updated_at).toLocaleDateString()}` : ''}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden">
                {editMode ? (
                  <textarea
                    className="w-full h-full p-4 bg-transparent outline-none resize-none font-mono text-sm text-gray-900 dark:text-gray-100"
                    value={draft.content || ''}
                    onChange={e => scheduleSave('content', e.target.value)}
                    onBlur={() => saveDraft()}
                    placeholder="Write your content here… (Markdown supported)"
                    spellCheck={false}
                  />
                ) : (
                  <div
                    className="h-full overflow-y-auto p-6 prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200"
                    dangerouslySetInnerHTML={{
                      __html: draft.content
                        ? renderMarkdown(draft.content)
                        : '<p class="text-gray-400">No content yet. Click ✏️ Edit to start writing, or 🌐 Wikipedia to import an article.</p>'
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
