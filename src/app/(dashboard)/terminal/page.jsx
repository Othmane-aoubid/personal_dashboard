'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'

function formatSize(bytes) {
  if (bytes == null) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  for (const u of units) {
    if (v < 1024) return `${v.toFixed(1)} ${u}`
    v /= 1024
  }
  return `${v.toFixed(1)} TB`
}

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleDateString()
}

export default function TerminalPage() {
  const { data: session } = useSession()
  const [cwd, setCwd] = useState('/')
  const [entries, setEntries] = useState([])
  const [loadingFs, setLoadingFs] = useState(false)
  const [history, setHistory] = useState([]) // [{cmd, stdout, stderr, returncode, type}]
  const [cmdInput, setCmdInput] = useState('')
  const [running, setRunning] = useState(false)
  const [cmdHistory, setCmdHistory] = useState([])
  const [cmdHistoryIdx, setCmdHistoryIdx] = useState(-1)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const outputRef = useRef(null)
  const inputRef = useRef(null)

  // Load directory
  const loadDir = useCallback(async (path) => {
    setLoadingFs(true)
    try {
      const data = await api.terminal.ls(path, session)
      setEntries(data.entries || [])
      setCwd(path)
    } catch (err) {
      toast.error(err.message || 'Failed to list directory')
    } finally {
      setLoadingFs(false)
    }
  }, [session])

  useEffect(() => {
    if (session) loadDir('/')
  }, [session, loadDir])

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [history])

  function addHistory(entry) {
    setHistory(h => [...h, entry])
  }

  async function runCommand(cmd) {
    if (!cmd.trim()) return
    setRunning(true)
    addHistory({ type: 'cmd', cmd })
    setCmdHistory(h => [cmd, ...h.slice(0, 99)])
    setCmdHistoryIdx(-1)
    try {
      const res = await api.terminal.exec({ command: cmd, cwd }, session)
      addHistory({ type: 'result', stdout: res.stdout, stderr: res.stderr, returncode: res.returncode })
      // If cd command, try to update cwd
      const cdMatch = cmd.match(/^cd\s+(.+)$/)
      if (cdMatch && res.returncode === 0) {
        const newPath = cdMatch[1].trim()
        const resolved = newPath.startsWith('/')
          ? newPath
          : cwd.replace(/\/$/, '') + '/' + newPath
        loadDir(resolved)
      }
    } catch (err) {
      addHistory({ type: 'result', stdout: '', stderr: err.message, returncode: -1 })
    } finally {
      setRunning(false)
    }
  }

  async function handleReadFile(path) {
    try {
      const data = await api.terminal.read(path, session)
      addHistory({ type: 'file', path, content: data.content })
    } catch (err) {
      addHistory({ type: 'result', stdout: '', stderr: err.message, returncode: -1 })
    }
  }

  async function handleDelete(path, isDir) {
    if (!confirm(`Delete ${isDir ? 'folder' : 'file'} "${path}"?`)) return
    try {
      await api.terminal.delete({ path }, session)
      toast.success('Deleted')
      addHistory({ type: 'info', msg: `Deleted: ${path}` })
      loadDir(cwd)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleNewFolder() {
    const name = prompt('Folder name:')
    if (!name) return
    const path = cwd.replace(/\/$/, '') + '/' + name
    try {
      await api.terminal.mkdir({ path }, session)
      toast.success('Folder created')
      addHistory({ type: 'info', msg: `Created folder: ${path}` })
      loadDir(cwd)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleNewFile() {
    const name = prompt('File name:')
    if (!name) return
    const path = cwd.replace(/\/$/, '') + '/' + name
    try {
      await api.terminal.touch({ path }, session)
      toast.success('File created')
      addHistory({ type: 'info', msg: `Created file: ${path}` })
      loadDir(cwd)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const data = await api.terminal.search({ root: cwd, query: searchQuery }, session)
      const results = data.results || []
      addHistory({
        type: 'search',
        query: searchQuery,
        root: cwd,
        results,
      })
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSearching(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      runCommand(cmdInput)
      setCmdInput('')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const idx = cmdHistoryIdx + 1
      if (idx < cmdHistory.length) {
        setCmdHistoryIdx(idx)
        setCmdInput(cmdHistory[idx])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const idx = cmdHistoryIdx - 1
      if (idx < 0) {
        setCmdHistoryIdx(-1)
        setCmdInput('')
      } else {
        setCmdHistoryIdx(idx)
        setCmdInput(cmdHistory[idx])
      }
    }
  }

  // Breadcrumb parts
  const parts = cwd === '/' ? [''] : cwd.split('/').filter(Boolean)
  const breadcrumb = [{ label: '/', path: '/' }].concat(
    parts.map((p, i) => ({
      label: p,
      path: '/' + parts.slice(0, i + 1).join('/'),
    }))
  )

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col gap-0">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">💻 Terminal</h1>
        <span className="text-xs text-gray-400">Working dir: {cwd}</span>
      </div>

      <div className="flex flex-1 gap-3 min-h-0">
        {/* LEFT — File Browser */}
        <div className="w-64 flex-shrink-0 flex flex-col card p-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex flex-wrap gap-1 text-xs">
              {breadcrumb.map((b, i) => (
                <span key={b.path} className="flex items-center gap-1">
                  {i > 0 && <span className="text-gray-400">/</span>}
                  <button
                    onClick={() => loadDir(b.path)}
                    className="text-brand-600 dark:text-brand-400 hover:underline font-mono"
                  >
                    {b.label || '/'}
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingFs ? (
              <div className="p-4 text-center text-gray-400 text-sm">Loading…</div>
            ) : entries.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">Empty directory</div>
            ) : (
              entries.map(entry => (
                <div
                  key={entry.path}
                  className="group flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-sm"
                  onClick={() => entry.is_dir ? loadDir(entry.path) : null}
                  onDoubleClick={() => !entry.is_dir ? handleReadFile(entry.path) : null}
                >
                  <span className="text-base flex-shrink-0">{entry.is_dir ? '📁' : '📄'}</span>
                  <span className="flex-1 truncate text-gray-800 dark:text-gray-200 font-mono text-xs">
                    {entry.name}
                  </span>
                  {!entry.is_dir && (
                    <span className="text-gray-400 text-xs flex-shrink-0">
                      {formatSize(entry.size)}
                    </span>
                  )}
                  <div className="hidden group-hover:flex gap-1 flex-shrink-0">
                    {!entry.is_dir && (
                      <button
                        onClick={e => { e.stopPropagation(); handleReadFile(entry.path) }}
                        className="text-xs text-blue-500 hover:text-blue-700"
                        title="Read file"
                      >👁</button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(entry.path, entry.is_dir) }}
                      className="text-xs text-red-500 hover:text-red-700"
                      title="Delete"
                    >🗑</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* CENTER — Terminal Output */}
        <div className="flex-1 flex flex-col card p-0 overflow-hidden min-w-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 font-mono">TERMINAL</span>
            <button
              onClick={() => setHistory([])}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              Clear
            </button>
          </div>

          {/* Output area */}
          <div
            ref={outputRef}
            className="flex-1 overflow-y-auto p-3 bg-gray-950 font-mono text-sm space-y-1"
          >
            {history.length === 0 && (
              <div className="text-gray-500 text-xs">
                Type a command below or use the file browser. Double-click files to read them.
              </div>
            )}
            {history.map((entry, i) => (
              <div key={i}>
                {entry.type === 'cmd' && (
                  <div className="text-green-400">
                    <span className="text-gray-500">{cwd}$</span> {entry.cmd}
                  </div>
                )}
                {entry.type === 'result' && (
                  <>
                    {entry.stdout && (
                      <pre className="text-gray-200 whitespace-pre-wrap break-all text-xs">{entry.stdout}</pre>
                    )}
                    {entry.stderr && (
                      <pre className="text-red-400 whitespace-pre-wrap break-all text-xs">{entry.stderr}</pre>
                    )}
                    {entry.returncode !== 0 && (
                      <div className="text-red-500 text-xs">Exit code: {entry.returncode}</div>
                    )}
                  </>
                )}
                {entry.type === 'file' && (
                  <div className="border border-gray-700 rounded p-2 mt-1">
                    <div className="text-yellow-400 text-xs mb-1">📄 {entry.path}</div>
                    <pre className="text-gray-300 whitespace-pre-wrap break-all text-xs max-h-60 overflow-y-auto">
                      {entry.content}
                    </pre>
                  </div>
                )}
                {entry.type === 'info' && (
                  <div className="text-blue-400 text-xs">ℹ {entry.msg}</div>
                )}
                {entry.type === 'search' && (
                  <div className="border border-gray-700 rounded p-2 mt-1">
                    <div className="text-yellow-400 text-xs mb-1">
                      🔍 Search "{entry.query}" in {entry.root} — {entry.results.length} results
                    </div>
                    {entry.results.map((r, j) => (
                      <div
                        key={j}
                        className="text-xs text-gray-300 py-0.5 cursor-pointer hover:text-white"
                        onClick={() => r.is_dir ? loadDir(r.path) : handleReadFile(r.path)}
                      >
                        {r.is_dir ? '📁' : '📄'} {r.path}
                      </div>
                    ))}
                    {entry.results.length === 0 && (
                      <div className="text-gray-500 text-xs">No results found</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {running && (
              <div className="text-yellow-400 text-xs animate-pulse">Running…</div>
            )}
          </div>

          {/* Command input */}
          <div className="px-3 py-2 border-t border-gray-700 bg-gray-900 flex items-center gap-2">
            <span className="text-green-400 font-mono text-sm flex-shrink-0 text-xs">{cwd}$</span>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent outline-none text-gray-100 font-mono text-sm"
              value={cmdInput}
              onChange={e => setCmdInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Enter command…"
              disabled={running}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={() => { runCommand(cmdInput); setCmdInput('') }}
              disabled={running || !cmdInput.trim()}
              className="btn-primary text-xs px-3 py-1 disabled:opacity-40"
            >
              Run
            </button>
          </div>
        </div>

        {/* RIGHT — Quick Actions */}
        <div className="w-52 flex-shrink-0 flex flex-col gap-3">
          <div className="card p-3">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Quick Actions
            </h3>
            <div className="flex flex-col gap-2">
              <button onClick={handleNewFolder} className="btn-secondary text-xs py-2 w-full">
                📁 New Folder
              </button>
              <button onClick={handleNewFile} className="btn-secondary text-xs py-2 w-full">
                📄 New File
              </button>
              <button onClick={() => loadDir(cwd)} className="btn-ghost text-xs py-2 w-full">
                🔄 Refresh
              </button>
              {cwd !== '/' && (
                <button
                  onClick={() => {
                    const parent = cwd.split('/').slice(0, -1).join('/') || '/'
                    loadDir(parent)
                  }}
                  className="btn-ghost text-xs py-2 w-full"
                >
                  ↑ Go Up
                </button>
              )}
            </div>
          </div>

          <div className="card p-3 flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Search Files
            </h3>
            <input
              className="input text-xs py-1.5"
              placeholder="filename pattern…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="btn-primary text-xs py-1.5 disabled:opacity-40"
            >
              {searching ? 'Searching…' : '🔍 Search'}
            </button>
            <p className="text-xs text-gray-400">Searches from: {cwd}</p>
          </div>

          <div className="card p-3">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Quick Nav
            </h3>
            <div className="flex flex-col gap-1">
              {['/', '/home', '/tmp', '/var', '/etc', '/userfiles'].map(p => (
                <button
                  key={p}
                  onClick={() => loadDir(p)}
                  className="text-xs text-left font-mono text-brand-600 dark:text-brand-400 hover:underline px-1 py-0.5"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
