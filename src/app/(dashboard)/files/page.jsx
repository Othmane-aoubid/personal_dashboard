'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { fileIcon, formatBytes, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

const TEXT_EXTS = new Set(['md','txt','csv','json'])
const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','svg'])
const VIDEO_EXTS = new Set(['mp4','webm','mov'])
const AUDIO_EXTS = new Set(['mp3','wav'])

export default function FilesPage() {
  const { data: session } = useSession()
  const [path, setPath] = useState('/userfiles')
  const [entries, setEntries] = useState([])
  const [parent, setParent] = useState(null)
  const [selected, setSelected] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [analysis, setAnalysis] = useState('')
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [question, setQuestion] = useState('')
  const [view, setView] = useState('list') // list | grid
  const [search, setSearch] = useState('')

  useEffect(() => { if (session) loadDir(path) }, [session])

  async function loadDir(p) {
    try {
      const data = await api.files.list(p, session)
      setEntries(data.entries || [])
      setParent(data.parent)
      setPath(p)
      setSelected(null); setPreview(null); setAnalysis('')
    } catch (e) { toast.error(e.message || 'Could not read directory') }
  }

  async function handleSelect(entry) {
    if (entry.is_dir) { loadDir(entry.path); return }
    setSelected(entry); setPreview(null); setAnalysis('')
    const ext = entry.extension?.toLowerCase()
    if (!ext) return
    if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext)) {
      setPreview({ type: ext, url: api.files.downloadUrl(entry.path) }); return
    }
    setPreviewLoading(true)
    try {
      const data = await api.files.preview(entry.path, session)
      setPreview(data)
    } catch (e) { toast.error('Preview failed') }
    setPreviewLoading(false)
  }

  async function handleAnalyze() {
    if (!selected) return
    setAnalysisLoading(true); setAnalysis('')
    try {
      const data = await api.files.analyze({ path: selected.path, question: question || undefined, provider: 'gemini' }, session)
      setAnalysis(data.analysis)
    } catch (e) { toast.error(e.message || 'Analysis failed — check AI key in Settings') }
    setAnalysisLoading(false)
  }

  const filtered = entries.filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)] fade-in">
      {/* Left: browser */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 flex-1 min-w-0 truncate">
            <span className="truncate font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{path}</span>
          </div>
          <input className="input w-40 text-sm" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          {['list','grid'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`btn-ghost text-xs ${view===v ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600' : ''}`}>{v==='list'?'☰':'⊞'}</button>
          ))}
        </div>

        {/* Breadcrumb / back */}
        {parent && (
          <button onClick={() => loadDir(parent)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white mb-2 transition-colors">
            ← Back
          </button>
        )}

        {/* Entries */}
        <div className="flex-1 overflow-y-auto card">
          {filtered.length === 0 && <div className="p-8 text-center text-gray-400">Empty directory</div>}

          {view === 'list' ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map(e => (
                <div key={e.path}
                  onClick={() => handleSelect(e)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${selected?.path===e.path ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}>
                  <span className="text-xl shrink-0">{e.is_dir ? '📁' : fileIcon(e.extension)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{e.name}</p>
                    {!e.is_dir && <p className="text-xs text-gray-400">{formatBytes(e.size)}</p>}
                  </div>
                  {!e.is_dir && e.modified && <p className="text-xs text-gray-400 hidden sm:block">{formatDate(new Date(e.modified * 1000).toISOString())}</p>}
                  {!e.is_dir && (
                    <a href={api.files.downloadUrl(e.path)} download onClick={ev => ev.stopPropagation()}
                      className="text-gray-300 hover:text-gray-600 dark:hover:text-gray-300 text-sm transition-colors">⬇</a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map(e => (
                <div key={e.path} onClick={() => handleSelect(e)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${selected?.path===e.path ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}>
                  <span className="text-3xl">{e.is_dir ? '📁' : fileIcon(e.extension)}</span>
                  <p className="text-xs text-gray-700 dark:text-gray-300 text-center truncate w-full">{e.name}</p>
                  {!e.is_dir && <p className="text-xs text-gray-400">{formatBytes(e.size)}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: preview panel */}
      {selected && (
        <div className="w-80 xl:w-96 shrink-0 flex flex-col gap-3">
          {/* File info */}
          <div className="card p-4">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-3xl">{fileIcon(selected.extension)}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{selected.name}</p>
                <p className="text-xs text-gray-400">{formatBytes(selected.size)} · .{selected.extension}</p>
              </div>
            </div>
            <a href={api.files.downloadUrl(selected.path)} download className="btn-secondary w-full justify-center text-xs">⬇ Download</a>
          </div>

          {/* Preview */}
          <div className="card p-4 flex-1 overflow-y-auto min-h-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Preview</p>
            {previewLoading && <div className="text-center text-gray-400 text-sm animate-pulse py-8">Loading…</div>}
            {!previewLoading && preview && (
              <>
                {preview.type === 'text' || TEXT_EXTS.has(selected.extension) ? (
                  <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono overflow-x-auto">{preview.content?.slice(0, 3000)}</pre>
                ) : preview.type === 'docx' ? (
                  <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{preview.content?.slice(0, 3000)}</div>
                ) : preview.type === 'pdf' ? (
                  <div className="text-sm text-gray-500">PDF · {preview.page_count} pages — use ⬇ Download to open in your PDF reader.</div>
                ) : IMAGE_EXTS.has(selected.extension) ? (
                  <img src={preview.url} alt={selected.name} className="max-w-full rounded-lg" />
                ) : VIDEO_EXTS.has(selected.extension) ? (
                  <video controls src={preview.url} className="w-full rounded-lg" />
                ) : AUDIO_EXTS.has(selected.extension) ? (
                  <audio controls src={preview.url} className="w-full" />
                ) : null}
              </>
            )}
            {!previewLoading && !preview && <p className="text-gray-400 text-sm text-center py-4">No preview available</p>}
          </div>

          {/* AI analysis */}
          {['pdf','docx','doc','md','txt'].includes(selected.extension) && (
            <div className="card p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">✨ AI Analysis</p>
              <input className="input text-sm mb-2" placeholder="Ask a question (optional)" value={question} onChange={e => setQuestion(e.target.value)} />
              <button onClick={handleAnalyze} disabled={analysisLoading} className="btn-primary w-full justify-center text-sm">
                {analysisLoading ? 'Analysing…' : 'Analyse with AI'}
              </button>
              {analysis && (
                <div className="mt-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {analysis}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
