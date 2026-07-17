'use client'
import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'

// ── Helpers ────────────────────────────────────────────────────────────────────

function UsageBar({ percent }) {
  const color = percent >= 80 ? 'bg-red-500' : percent >= 60 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  )
}

function DiskCard({ disk }) {
  if (disk.error) return (
    <div className="card p-4">
      <p className="text-xs font-mono text-gray-500">{disk.path}</p>
      <p className="text-xs text-red-500 mt-1">{disk.error}</p>
    </div>
  )
  const color = disk.percent >= 80 ? 'text-red-600 dark:text-red-400'
              : disk.percent >= 60 ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-green-600 dark:text-green-400'
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300">{disk.path}</p>
          <p className={`text-3xl font-bold mt-1 ${color}`}>{disk.percent}%</p>
          <p className="text-xs text-gray-400 mt-0.5">used</p>
        </div>
        <div className="text-right text-xs text-gray-500 space-y-1">
          <p>Total <span className="font-semibold text-gray-700 dark:text-gray-300">{disk.total_gb} GB</span></p>
          <p>Used  <span className="font-semibold text-gray-700 dark:text-gray-300">{disk.used_gb} GB</span></p>
          <p>Free  <span className="font-semibold text-green-600">{disk.free_gb} GB</span></p>
        </div>
      </div>
      <UsageBar percent={disk.percent} />
    </div>
  )
}

// ── Path Picker ────────────────────────────────────────────────────────────────

function PathPicker({ value, onChange, session, label = 'Path' }) {
  const [presets, setPresets]       = useState([])
  const [groups, setGroups]         = useState([])
  const [showDrop, setShowDrop]     = useState(false)
  const [showBrowse, setShowBrowse] = useState(false)
  const [browsePath, setBrowsePath] = useState('/')
  const [browseDirs, setBrowseDirs] = useState([])
  const [browseParent, setBrowseParent] = useState(null)
  const [loadingBrowse, setLoadingBrowse] = useState(false)
  const dropRef = useRef(null)
  const browseRef = useRef(null)

  // Load presets once
  useEffect(() => {
    if (!session) return
    api.storage.presets(session)
      .then(data => {
        setPresets(data.presets || [])
        // Group by group field
        const g = {}
        for (const p of data.presets || []) {
          if (!g[p.group]) g[p.group] = []
          g[p.group].push(p)
        }
        setGroups(Object.entries(g))
      })
      .catch(() => {})
  }, [session])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false)
      if (browseRef.current && !browseRef.current.contains(e.target)) setShowBrowse(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function openBrowse() {
    setShowBrowse(true)
    await navigateBrowse(value || '/')
  }

  async function navigateBrowse(path) {
    setLoadingBrowse(true)
    try {
      const data = await api.storage.browse(path, session)
      setBrowsePath(data.path)
      setBrowseParent(data.parent)
      setBrowseDirs(data.dirs)
    } catch (err) {
      toast.error(err.message || 'Cannot browse path')
    } finally {
      setLoadingBrowse(false)
    }
  }

  function selectPreset(path) {
    onChange(path)
    setShowDrop(false)
  }

  function selectBrowse(path) {
    onChange(path)
    setShowBrowse(false)
  }

  // Build breadcrumb from container path
  function breadcrumb(path) {
    if (!path || path === '/') return [{ label: '/', path: '/' }]
    const parts = path.replace(/^\//, '').split('/')
    const crumbs = [{ label: '/', path: '/' }]
    let cur = ''
    for (const p of parts) {
      cur += '/' + p
      // Show Windows-friendly label for /hostc
      const label = cur === '/hostc' ? 'C:' : p
      crumbs.push({ label, path: cur })
    }
    return crumbs
  }

  return (
    <div className="space-y-2">
      <label className="label">{label}</label>
      <div className="flex gap-2">
        {/* Text input */}
        <div className="flex-1 relative">
          <input
            className="input font-mono text-sm w-full pr-8"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="/hostc/Users/othma/Documents"
          />
          {value && (
            <button onClick={() => onChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          )}
        </div>

        {/* Presets dropdown */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => { setShowDrop(d => !d); setShowBrowse(false) }}
            className="btn-secondary gap-1 whitespace-nowrap"
            title="Choose from presets">
            ▾ Presets
          </button>
          {showDrop && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl w-80 max-h-96 overflow-y-auto">
              {groups.length === 0 && (
                <p className="p-4 text-sm text-gray-400">Loading presets…</p>
              )}
              {groups.map(([group, items]) => (
                <div key={group}>
                  <p className="px-3 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">{group}</p>
                  {items.map((p, i) => (
                    <button key={i} onClick={() => selectPreset(p.path)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors
                        ${value === p.path ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      <span className="text-base shrink-0">{p.icon}</span>
                      <span className="truncate">{p.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Directory browser */}
        <div className="relative" ref={browseRef}>
          <button
            onClick={() => { setShowBrowse(b => !b); setShowDrop(false); if (!showBrowse) openBrowse() }}
            className="btn-secondary gap-1 whitespace-nowrap"
            title="Browse directories">
            📂 Browse
          </button>
          {showBrowse && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl w-96 max-h-[28rem] flex flex-col">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1 px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 flex-wrap">
                {breadcrumb(browsePath).map((crumb, i, arr) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-gray-300 text-xs">›</span>}
                    <button onClick={() => navigateBrowse(crumb.path)}
                      className={`text-xs font-mono hover:text-brand-600 transition-colors
                        ${i === arr.length - 1 ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-500'}`}>
                      {crumb.label}
                    </button>
                  </span>
                ))}
              </div>

              {/* Directory list */}
              <div className="flex-1 overflow-y-auto">
                {loadingBrowse ? (
                  <div className="p-4 text-sm text-gray-400">Loading…</div>
                ) : (
                  <>
                    {browseParent && (
                      <button onClick={() => navigateBrowse(browseParent)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <span>⬆️</span> <span className="font-mono">.. (up)</span>
                      </button>
                    )}
                    {browseDirs.length === 0 && (
                      <p className="px-3 py-4 text-sm text-gray-400">No subdirectories</p>
                    )}
                    {browseDirs.map((d, i) => (
                      <div key={i} className="flex items-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <button onClick={() => navigateBrowse(d.path)}
                          className="flex-1 flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-300">
                          <span>📁</span>
                          <span className="font-mono truncate">{d.name}</span>
                        </button>
                        <button onClick={() => selectBrowse(d.path)}
                          className="px-3 py-2 text-xs text-brand-600 hover:text-brand-800 font-medium shrink-0">
                          Select
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Footer: select current dir */}
              <div className="border-t border-gray-100 dark:border-gray-800 px-3 py-2.5 flex items-center justify-between gap-2">
                <p className="text-xs text-gray-400 font-mono truncate">{browsePath}</p>
                <button onClick={() => selectBrowse(browsePath)}
                  className="btn-primary text-xs py-1 px-3 shrink-0">
                  Use this folder
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function StoragePage() {
  const { data: session } = useSession()
  const [disks, setDisks]         = useState([])
  const [loadingDisks, setLoadingDisks] = useState(true)

  const [analyzePath, setAnalyzePath]     = useState('/hostc')
  const [analyzeResults, setAnalyzeResults] = useState(null)
  const [analyzing, setAnalyzing]           = useState(false)

  const [largeFilesPath, setLargeFilesPath] = useState('/hostc')
  const [minMb, setMinMb]         = useState(100)
  const [largeFiles, setLargeFiles] = useState(null)
  const [loadingLarge, setLoadingLarge] = useState(false)

  useEffect(() => {
    if (!session) return
    api.storage.overview(session)
      .then(d => setDisks(d.disks || []))
      .catch(e => toast.error(e.message))
      .finally(() => setLoadingDisks(false))
  }, [session])

  async function handleAnalyze() {
    if (!analyzePath.trim()) { toast.error('Choose a path first'); return }
    setAnalyzing(true)
    setAnalyzeResults(null)
    try {
      const data = await api.storage.analyze(analyzePath, session)
      setAnalyzeResults(data)
    } catch (e) {
      toast.error(e.message || 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleLargeFiles() {
    if (!largeFilesPath.trim()) { toast.error('Choose a path first'); return }
    setLoadingLarge(true)
    setLargeFiles(null)
    try {
      const data = await api.storage.largeFiles(largeFilesPath, minMb, session)
      setLargeFiles(data)
    } catch (e) {
      toast.error(e.message || 'Search failed')
    } finally {
      setLoadingLarge(false)
    }
  }

  const maxSize = analyzeResults?.entries?.length
    ? Math.max(...analyzeResults.entries.map(e => e.size_bytes), 1) : 1

  return (
    <div className="space-y-6 fade-in">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">💾 Storage Usage</h1>

      {/* Disk overview */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Disk Overview</h2>
        {loadingDisks
          ? <p className="text-sm text-gray-400">Loading…</p>
          : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {disks.map(d => <DiskCard key={d.path} disk={d} />)}
            </div>
        }
      </section>

      {/* Analyze directory */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Analyze Directory</h2>
        <div className="card p-5 space-y-4">
          <PathPicker
            label="Directory to analyze"
            value={analyzePath}
            onChange={setAnalyzePath}
            session={session}
          />
          <button onClick={handleAnalyze} disabled={analyzing || !analyzePath}
            className="btn-primary disabled:opacity-50">
            {analyzing ? '⏳ Analyzing…' : '🔍 Analyze'}
          </button>

          {analyzing && (
            <p className="text-xs text-gray-400">Scanning — large directories may take a few seconds…</p>
          )}

          {analyzeResults && (
            <div>
              <p className="text-xs text-gray-400 mb-3">
                {analyzeResults.entries.length} entries in <span className="font-mono">{analyzeResults.path}</span> — sorted by size
                {analyzeResults.partial && <span className="ml-2 text-yellow-500">(partial — some directories too large to fully scan)</span>}
              </p>
              <div className="space-y-2">
                {analyzeResults.entries.map((entry, i) => {
                  const pct = (entry.size_bytes / maxSize) * 100
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-base w-5 shrink-0">{entry.is_dir ? '📁' : '📄'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span
                            className={`text-xs font-mono truncate ${entry.is_dir ? 'cursor-pointer hover:text-brand-600' : 'text-gray-600 dark:text-gray-400'}`}
                            onClick={() => { if (entry.is_dir) { setAnalyzePath(entry.path); setTimeout(handleAnalyze, 50) } }}
                            title={entry.path}>
                            {entry.name}
                          </span>
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 ml-3 shrink-0">
                            {entry.truncated && <span className="text-yellow-500 mr-0.5" title="Estimated — scan cut short">~</span>}
                            {entry.size_human}
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full transition-all ${entry.truncated ? 'bg-yellow-400' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
                {analyzeResults.entries.length === 0 && (
                  <p className="text-sm text-gray-400">Empty directory or no read permission.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Large files */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Find Large Files</h2>
        <div className="card p-5 space-y-4">
          <PathPicker
            label="Directory to search"
            value={largeFilesPath}
            onChange={setLargeFilesPath}
            session={session}
          />
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Minimum size</label>
            <input type="number" className="input w-24 text-sm" value={minMb}
              onChange={e => setMinMb(Number(e.target.value))} min={1} />
            <span className="text-sm text-gray-500">MB</span>
            <button onClick={handleLargeFiles} disabled={loadingLarge || !largeFilesPath}
              className="btn-primary disabled:opacity-50 ml-auto">
              {loadingLarge ? '⏳ Searching…' : '🔍 Find Files'}
            </button>
          </div>

          {loadingLarge && (
            <p className="text-xs text-gray-400">Walking directory tree — may take a moment for large paths…</p>
          )}

          {largeFiles && (
            <div>
              <p className="text-xs text-gray-400 mb-3">
                {largeFiles.files.length} files ≥ {largeFiles.min_mb} MB in <span className="font-mono">{largeFiles.path}</span>
              </p>
              {largeFiles.files.length === 0
                ? <p className="text-sm text-gray-400">No files found above that size.</p>
                : (
                  <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800/60">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">Name</th>
                          <th className="text-right px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">Size</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">Path</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">Modified</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {largeFiles.files.map((f, i) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                            <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200 max-w-[200px] truncate" title={f.name}>{f.name}</td>
                            <td className="px-3 py-2 text-right font-semibold text-orange-600 dark:text-orange-400 whitespace-nowrap">{f.size_human}</td>
                            <td className="px-3 py-2 font-mono text-gray-500 max-w-xs truncate" title={f.path}>{f.path}</td>
                            <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                              {f.modified ? new Date(f.modified).toLocaleDateString() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
