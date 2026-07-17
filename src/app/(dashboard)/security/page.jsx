'use client'
import { useSession } from 'next-auth/react'
import { useState, useRef, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'

// ── Severity config ────────────────────────────────────────────────────────────
const SEV = {
  CRITICAL: { color: 'bg-red-600',    text: 'text-red-700 dark:text-red-400',    badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',    ring: 'border-red-300 dark:border-red-700',    icon: '🔴' },
  HIGH:     { color: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-400', badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800', ring: 'border-orange-300 dark:border-orange-700', icon: '🟠' },
  MEDIUM:   { color: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-400', badge: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800', ring: 'border-yellow-300 dark:border-yellow-700', icon: '🟡' },
  LOW:      { color: 'bg-blue-500',   text: 'text-blue-700 dark:text-blue-400',    badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',    ring: 'border-blue-300 dark:border-blue-700',    icon: '🔵' },
  INFO:     { color: 'bg-gray-400',   text: 'text-gray-600 dark:text-gray-400',    badge: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',    ring: 'border-gray-200 dark:border-gray-700',    icon: 'ℹ️' },
}
const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']

// Convert Windows project path → Docker-mounted path (/hostc/…)
function toDockerPath(projectPath, relativePath) {
  let base = projectPath.trim().replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(base)) {
    base = '/host' + base[0].toLowerCase() + '/' + base.slice(3)
  }
  // normalise trailing slash
  base = base.replace(/\/$/, '')
  return base + '/' + relativePath
}

// ── Simple line-level syntax colouring (no library) ────────────────────────────
function lineClass(line) {
  const t = line.trimStart()
  if (t.startsWith('#') || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
    return 'text-gray-500'
  if (/^\s*(import|from|export|const|let|var|def |class |return|if |else|for |while |async |await |try|except|raise)\b/.test(line))
    return 'text-sky-300'
  return 'text-gray-200'
}

// ── Built-in code editor ───────────────────────────────────────────────────────
function FileEditor({ finding, projectPath, session, onClose }) {
  const [content, setContent]       = useState(null)   // original saved content
  const [editContent, setEditContent] = useState('')
  const [mode, setMode]             = useState('view')  // 'view' | 'edit'
  const [saving, setSaving]         = useState(false)
  const [loading, setLoading]       = useState(true)
  const [loadErr, setLoadErr]       = useState(null)

  const highlightRowRef = useRef(null)
  const textareaRef     = useRef(null)
  const lineNumsRef     = useRef(null)

  const targetLine = finding.line - 1  // 0-based

  // Load file
  useEffect(() => {
    let cancelled = false
    setLoading(true); setLoadErr(null)
    const fullPath = toDockerPath(projectPath, finding.file)
    api.terminal.read(fullPath, session)
      .then(data => {
        if (cancelled) return
        setContent(data.content)
        setEditContent(data.content)
      })
      .catch(err => { if (!cancelled) setLoadErr(err.message || 'Could not read file') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [finding.file, projectPath]) // eslint-disable-line

  // Scroll to highlighted line in view mode
  useEffect(() => {
    if (!loading && mode === 'view' && highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [loading, mode])

  async function handleSave() {
    setSaving(true)
    try {
      const fullPath = toDockerPath(projectPath, finding.file)
      await api.terminal.write({ path: fullPath, content: editContent }, session)
      setContent(editContent)
      setMode('view')
      toast.success('File saved!')
    } catch (err) {
      toast.error('Save failed: ' + (err.message || 'unknown error'))
    } finally {
      setSaving(false)
    }
  }

  function handleDiscard() {
    setEditContent(content)
    setMode('view')
  }

  // Sync textarea scroll → line numbers
  const syncScroll = useCallback(() => {
    if (lineNumsRef.current && textareaRef.current) {
      lineNumsRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const lines     = (mode === 'view' ? content : editContent)?.split('\n') ?? []
  const isDirty   = editContent !== content
  const cfg       = SEV[finding.severity] || SEV.INFO
  const LINE_H    = 22  // px — must match CSS lineHeight below

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        {/* File info */}
        <span className="text-gray-400 text-sm">📄</span>
        <span className="text-sm text-gray-200 truncate max-w-sm">{finding.file}</span>
        <span className="text-xs text-gray-500">:{finding.line}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>{finding.severity}</span>
        {isDirty && mode === 'edit' && (
          <span className="text-xs text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded-full border border-yellow-700">
            ● unsaved
          </span>
        )}

        <div className="flex-1"/>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {mode === 'view' ? (
            <button
              onClick={() => setMode('edit')}
              disabled={loading || !!loadErr}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors">
              ✏️ Edit
            </button>
          ) : (
            <>
              <button
                onClick={handleDiscard}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded-lg transition-colors">
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !isDirty}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors">
                {saving
                  ? <><span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin"/>Saving…</>
                  : '💾 Save'}
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-800 text-xs rounded-lg transition-colors">
            ✕ Close
          </button>
        </div>
      </div>

      {/* ── Finding info bar ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 py-2 bg-red-950/40 border-b border-red-900/40 flex-shrink-0">
        <span className="text-base flex-shrink-0 mt-0.5">{cfg.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-red-300">{finding.title}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{finding.fix_description}</p>
        </div>
        <div className="text-xs text-gray-500 flex-shrink-0 self-center">
          Line {finding.line}
        </div>
      </div>

      {/* ── Code area ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-3 text-gray-400">
          <span className="w-5 h-5 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin"/>
          Loading {finding.file}…
        </div>
      ) : loadErr ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 p-8">
          <span className="text-3xl">⚠️</span>
          <p className="text-sm">Could not load file</p>
          <p className="text-xs font-mono bg-gray-900 px-3 py-2 rounded-lg text-red-400">{loadErr}</p>
          <p className="text-xs text-gray-500">
            Full path: <span className="font-mono">{toDockerPath(projectPath, finding.file)}</span>
          </p>
        </div>
      ) : mode === 'view' ? (
        /* ── View mode ────────────────────────────────────────────────────── */
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-xs" style={{ lineHeight: LINE_H + 'px' }}>
            <tbody>
              {lines.map((line, i) => {
                const isHit  = i === targetLine
                const isNear = !isHit && Math.abs(i - targetLine) <= 2
                return (
                  <tr
                    key={i}
                    ref={isHit ? highlightRowRef : null}
                    className={
                      isHit  ? 'bg-yellow-500/20 border-l-[3px] border-yellow-400' :
                      isNear ? 'bg-gray-900/60 border-l-[3px] border-gray-700' :
                               'border-l-[3px] border-transparent hover:bg-gray-900/30'
                    }>
                    {/* Line number */}
                    <td className={`select-none text-right pr-4 pl-3 w-12 border-r border-gray-800 bg-gray-950 sticky left-0 ${isHit ? 'text-yellow-400 font-bold' : 'text-gray-600'}`}>
                      {i + 1}
                    </td>
                    {/* Code */}
                    <td className={`pl-5 pr-8 whitespace-pre ${isHit ? 'text-yellow-100 font-semibold' : lineClass(line)}`}>
                      {line || ' '}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Edit mode ────────────────────────────────────────────────────── */
        <div className="flex-1 flex overflow-hidden text-xs" style={{ lineHeight: LINE_H + 'px' }}>
          {/* Line numbers (synced via ref) */}
          <div
            ref={lineNumsRef}
            className="select-none flex-shrink-0 overflow-hidden bg-gray-950 border-r border-gray-800 text-right text-gray-600"
            style={{ width: '3.5rem', paddingTop: 0, paddingRight: '0.75rem', paddingLeft: '0.5rem' }}>
            {lines.map((_, i) => (
              <div key={i} style={{ height: LINE_H + 'px' }} className={i === targetLine ? 'text-yellow-500 font-bold' : ''}>
                {i + 1}
              </div>
            ))}
          </div>

          {/* Editable textarea */}
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            onScroll={syncScroll}
            className="flex-1 bg-gray-950 text-gray-200 resize-none outline-none pl-5 pr-8 overflow-auto"
            style={{ lineHeight: LINE_H + 'px', fontSize: '0.75rem', tabSize: 2, whiteSpace: 'pre' }}
            spellCheck={false}
            autoFocus
          />
        </div>
      )}

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-1 bg-brand-700 text-white text-xs flex-shrink-0">
        <div className="flex items-center gap-4">
          <span>{finding.category}</span>
          <span className="opacity-60">·</span>
          <span className="opacity-60">{finding.owasp}</span>
        </div>
        <div className="flex items-center gap-4 opacity-70">
          <span>{lines.length} lines</span>
          {mode === 'edit' && <span>Ln {targetLine + 1}</span>}
          <span>{mode === 'view' ? 'Read-only' : 'Editing'}</span>
        </div>
      </div>
    </div>
  )
}

// ── URL finding card (no editor button) ───────────────────────────────────────
function URLFindingCard({ f }) {
  const [open, setOpen] = useState(false)
  const cfg = SEV[f.severity] || SEV.INFO
  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${cfg.ring} bg-white dark:bg-gray-900`}>
      <div className="flex items-start gap-3 p-4">
        <button onClick={() => setOpen(o => !o)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
          <span className="text-lg mt-0.5 flex-shrink-0">{cfg.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>{f.severity}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">{f.category}</span>
            </div>
            <p className="font-semibold text-gray-900 dark:text-white text-sm">{f.title}</p>
            {f.url && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono truncate">🌐 {f.url}</p>
            )}
          </div>
        </button>
        <button onClick={() => setOpen(o => !o)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1 flex-shrink-0 mt-0.5">
          {open ? '▲' : '▼'}
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">What's wrong</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{f.description}</p>
          </div>

          {f.evidence && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Evidence</p>
              <pre className="text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg p-3 overflow-x-auto text-red-900 dark:text-red-300 font-mono leading-relaxed whitespace-pre-wrap">{f.evidence}</pre>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">How to fix</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{f.fix_description}</p>
          </div>

          {f.fix_example && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Fix example</p>
              <pre className="text-xs bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 rounded-lg p-3 overflow-x-auto text-green-900 dark:text-green-300 font-mono leading-relaxed whitespace-pre">{f.fix_example}</pre>
            </div>
          )}

          {f.references && (
            <a href={f.references} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-500">
              🔗 {f.owasp || 'Reference'} ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── AI prompt generator ────────────────────────────────────────────────────────
function buildAIPrompt(result) {
  const { project_name, project_path, findings, stats } = result
  const bySev = {}
  SEV_ORDER.forEach(s => { bySev[s] = findings.filter(f => f.severity === s) })

  let prompt = `You are a senior security engineer. I need you to fix security vulnerabilities in my project.

# Project: ${project_name}
Path: ${project_path}

## Scan Summary
- Total vulnerabilities: ${stats.total}
- 🔴 CRITICAL: ${stats.critical}
- 🟠 HIGH: ${stats.high}
- 🟡 MEDIUM: ${stats.medium}
- 🔵 LOW: ${stats.low}
- Files scanned: ${stats.files_scanned}

---

## Vulnerabilities to Fix

`
  SEV_ORDER.forEach(sev => {
    const items = bySev[sev]
    if (!items?.length) return
    prompt += `### ${SEV[sev].icon} ${sev} (${items.length} issue${items.length !== 1 ? 's' : ''})\n\n`
    items.forEach((f, idx) => {
      prompt += `#### ${idx + 1}. ${f.title}\n`
      prompt += `- **File:** \`${f.file}\` (line ${f.line})\n`
      prompt += `- **Category:** ${f.category}\n`
      prompt += `- **OWASP:** ${f.owasp}\n`
      prompt += `- **Problem:** ${f.description}\n\n`
      prompt += `**Current code (line ${f.line}):**\n\`\`\`\n${f.code_snippet}\n\`\`\`\n\n`
      prompt += `**How to fix:** ${f.fix_description}\n\n`
      prompt += `**Fix example:**\n\`\`\`\n${f.fix_example}\n\`\`\`\n\n`
      prompt += `---\n\n`
    })
  })

  prompt += `## Your Task

Please implement ALL the fixes listed above. For **each fix**:

1. State the exact file path
2. Show the **original vulnerable code**
3. Show the **fixed secure code** with a diff or full replacement
4. Add a one-line comment explaining what you changed and why

### Priority Order
Fix CRITICAL issues first, then HIGH, then MEDIUM, then LOW.

### Rules
- Do not break existing functionality
- Maintain the same code style as the rest of the file
- Use the project's existing libraries when possible (e.g. don't add new dependencies for simple fixes)
- If a fix requires a new package, mention it explicitly
- If a secret needs rotating, note "ACTION REQUIRED: revoke and replace this secret"

Start with the CRITICAL issues and work your way down. Show the complete fixed code for each file.`

  return prompt
}

// ── URL scan AI prompt ────────────────────────────────────────────────────────
function buildURLAIPrompt(result) {
  const { url, findings, stats } = result
  let p = `You are a senior security engineer. Fix the security issues found on this website.\n\n`
  p += `# Website: ${url}\n\n## Scan Summary\n`
  p += `- Total: ${stats.total}  🔴 CRITICAL: ${stats.critical}  🟠 HIGH: ${stats.high}  🟡 MEDIUM: ${stats.medium}  🔵 LOW: ${stats.low}\n\n---\n\n`
  SEV_ORDER.forEach(sev => {
    const items = findings.filter(f => f.severity === sev)
    if (!items.length) return
    p += `### ${SEV[sev].icon} ${sev}\n\n`
    items.forEach((f, i) => {
      p += `#### ${i + 1}. ${f.title}\n`
      p += `- **Category:** ${f.category}\n- **OWASP:** ${f.owasp}\n`
      p += `- **Evidence:** ${f.evidence}\n`
      p += `- **Fix:** ${f.fix_description}\n\n`
      p += `\`\`\`\n${f.fix_example}\n\`\`\`\n\n---\n\n`
    })
  })
  p += `## Instructions\nFor each issue above, provide the exact server/code configuration change needed. Show the before and after config. Prioritize CRITICAL and HIGH issues first.`
  return p
}

// ── Finding card ──────────────────────────────────────────────────────────────
function FindingCard({ f, onOpenEditor }) {
  const [open, setOpen] = useState(false)
  const cfg = SEV[f.severity] || SEV.INFO
  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${cfg.ring} bg-white dark:bg-gray-900`}>
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        {/* Left: clickable expand area */}
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-start gap-3 flex-1 min-w-0 text-left">
          <span className="text-lg mt-0.5 flex-shrink-0">{cfg.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>{f.severity}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">{f.category}</span>
              {f.owasp && <span className="text-xs text-gray-400 hidden sm:inline">{f.owasp}</span>}
            </div>
            <p className="font-semibold text-gray-900 dark:text-white text-sm">{f.title}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono truncate">
              📄 {f.file}
              {f.line && <span className="ml-1 text-gray-400">:{f.line}</span>}
            </p>
          </div>
        </button>

        {/* Right: always-visible action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          <button
            onClick={() => onOpenEditor(f)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-900 dark:bg-gray-800 hover:bg-gray-700 dark:hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-700 hover:border-gray-500 transition-colors whitespace-nowrap">
            🖊️ <span className="hidden sm:inline">Open in Editor</span>
            <span className="font-mono text-gray-500">:{f.line}</span>
          </button>
          <button onClick={() => setOpen(o => !o)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1">
            {open ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Expandable body */}
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-4 space-y-4">

          {/* Description */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">What's wrong</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{f.description}</p>
          </div>

          {/* Code snippet */}
          {f.code_snippet && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Vulnerable code</p>
              <pre className="text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg p-3 overflow-x-auto text-red-900 dark:text-red-300 font-mono leading-relaxed whitespace-pre">{f.code_snippet}</pre>
            </div>
          )}

          {/* Fix description */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">How to fix</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{f.fix_description}</p>
          </div>

          {/* Fix example */}
          {f.fix_example && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Code fix example</p>
              <pre className="text-xs bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 rounded-lg p-3 overflow-x-auto text-green-900 dark:text-green-300 font-mono leading-relaxed whitespace-pre">{f.fix_example}</pre>
            </div>
          )}

          {/* Reference */}
          {f.references && (
            <a href={f.references} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-500">
              🔗 OWASP Reference ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── Stat badge ────────────────────────────────────────────────────────────────
function StatBadge({ label, count, sev, icon }) {
  if (!count) return null
  const cfg = SEV[sev] || SEV.INFO
  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${cfg.badge} min-w-[7rem]`}>
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-2xl font-bold leading-none">{count}</p>
        <p className="text-xs font-medium mt-0.5 opacity-80">{label}</p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SecurityPage() {
  const { data: session } = useSession()

  // Scan mode
  const [scanMode, setScanMode]     = useState('code')  // 'code' | 'url'

  // Code scan state
  const [path, setPath]             = useState('')
  const [projectName, setProjectName] = useState('')

  // URL scan state
  const [urlInput, setUrlInput]     = useState('')

  // Shared state
  const [scanning, setScanning]     = useState(false)
  const [result, setResult]         = useState(null)
  const [urlResult, setUrlResult]   = useState(null)
  const [filterSev, setFilterSev]   = useState('ALL')
  const [filterCat, setFilterCat]   = useState('ALL')
  const [search, setSearch]         = useState('')
  const [copied, setCopied]         = useState(false)
  const [editorFinding, setEditorFinding] = useState(null)
  const promptRef = useRef(null)

  function resetFilters() { setFilterSev('ALL'); setFilterCat('ALL'); setSearch('') }

  async function handleScan() {
    if (!path.trim()) { toast.error('Enter a project path'); return }
    setScanning(true); setResult(null)
    try {
      const data = await api.security.scan(
        { path: path.trim(), project_name: projectName.trim() },
        session,
      )
      setResult(data)
      if (data.stats.total === 0) toast.success('✅ No vulnerabilities found!')
      else toast(`Found ${data.stats.total} issue${data.stats.total !== 1 ? 's' : ''} in ${data.stats.files_scanned} files`, { icon: '🛡️' })
    } catch (err) {
      toast.error(err.message || 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  async function handleUrlScan() {
    if (!urlInput.trim()) { toast.error('Enter a URL'); return }
    setScanning(true); setUrlResult(null)
    try {
      const data = await api.security.scanUrl({ url: urlInput.trim() }, session)
      setUrlResult(data)
      if (data.stats.total === 0) toast.success('✅ No issues found!')
      else toast(`Found ${data.stats.total} issue${data.stats.total !== 1 ? 's' : ''}`, { icon: '🛡️' })
    } catch (err) {
      toast.error(err.message || 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  async function copyPrompt() {
    const prompt = scanMode === 'url' && urlResult
      ? buildURLAIPrompt(urlResult)
      : result ? buildAIPrompt(result) : null
    if (!prompt) return
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      toast.success('AI prompt copied to clipboard!')
      setTimeout(() => setCopied(false), 3000)
    } catch {
      toast.error('Could not copy — see the text area below')
    }
  }

  // Derived (code-scan only)
  const categories = result ? ['ALL', ...new Set(result.findings.map(f => f.category))] : ['ALL']
  const filtered = result?.findings.filter(f => {
    if (filterSev !== 'ALL' && f.severity !== filterSev) return false
    if (filterCat !== 'ALL' && f.category !== filterCat) return false
    if (search && !f.title.toLowerCase().includes(search.toLowerCase()) &&
        !(f.file || '').toLowerCase().includes(search.toLowerCase()) &&
        !f.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }) ?? []

  const groupedFiltered = SEV_ORDER.reduce((acc, s) => {
    const items = filtered.filter(f => f.severity === s)
    if (items.length) acc[s] = items
    return acc
  }, {})

  const riskScore = result
    ? Math.min(100, (result.stats.critical * 25 + result.stats.high * 10 + result.stats.medium * 4 + result.stats.low * 1))
    : 0
  const riskLabel = riskScore >= 75 ? 'Critical Risk' : riskScore >= 40 ? 'High Risk' : riskScore >= 15 ? 'Medium Risk' : riskScore > 0 ? 'Low Risk' : 'Secure'
  const riskColor = riskScore >= 75 ? 'text-red-600' : riskScore >= 40 ? 'text-orange-500' : riskScore >= 15 ? 'text-yellow-600' : 'text-green-600'

  return (
    <>
      {/* ── File editor overlay ─────────────────────────────────────────── */}
      {editorFinding && (
        <FileEditor
          finding={editorFinding}
          projectPath={result.project_path}
          session={session}
          onClose={() => setEditorFinding(null)}
        />
      )}

      <div className="max-w-5xl mx-auto space-y-6 fade-in">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center text-xl">🛡️</div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Security Scanner</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Scan any project for vulnerabilities — get findings + an AI fix prompt</p>
          </div>
        </div>

        {/* ── Mode toggle ────────────────────────────────────────────────── */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
          {[
            { id: 'code', label: '📁 Source Code' },
            { id: 'url',  label: '🌐 Website URL' },
          ].map(m => (
            <button key={m.id} onClick={() => { setScanMode(m.id); resetFilters() }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                scanMode === m.id
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>
              {m.label}
            </button>
          ))}
        </div>

        {/* ── Scan form ──────────────────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          {scanMode === 'code' ? (<>
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Project to Scan</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Project path</label>
                <input className="input w-full font-mono text-sm"
                  placeholder="C:\Users\you\projects\myapp   or   /home/user/myapp"
                  value={path} onChange={e => setPath(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleScan()} />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Project name (optional)</label>
                <input className="input w-full text-sm" placeholder="My App"
                  value={projectName} onChange={e => setProjectName(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {['node_modules', '.git', '__pycache__', 'dist', 'build', '.next', 'venv', 'vendor', 'packages'].map(d => (
                <span key={d} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">🚫 {d}/</span>
              ))}
              <span className="text-xs text-gray-400 self-center">automatically excluded</span>
            </div>
            <div className="flex gap-3">
              <button onClick={handleScan} disabled={scanning || !path.trim()}
                className="btn-primary disabled:opacity-50 flex items-center gap-2">
                {scanning ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Scanning…</> : '🔍 Start Scan'}
              </button>
              {result && <button onClick={() => { setResult(null); setPath(''); setProjectName('') }} className="btn-secondary text-sm">New Scan</button>}
            </div>
            {scanning && <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><span className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-500 rounded-full animate-spin"/>Scanning source files — up to 2 minutes for large projects…</div>}
          </>) : (<>
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Website to Scan</h2>
            <div className="flex gap-3">
              <input className="input flex-1 text-sm font-mono"
                placeholder="https://example.com  or  example.com"
                value={urlInput} onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUrlScan()} />
              <button onClick={handleUrlScan} disabled={scanning || !urlInput.trim()}
                className="btn-primary disabled:opacity-50 flex items-center gap-2 flex-shrink-0">
                {scanning ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Scanning…</> : '🔍 Scan'}
              </button>
              {urlResult && <button onClick={() => { setUrlResult(null); setUrlInput('') }} className="btn-secondary text-sm flex-shrink-0">New</button>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              {['🔒 TLS / SSL certificate','📋 Security headers (CSP, HSTS…)','🖼️ Clickjacking protection','🍪 Cookie flags (Secure, HttpOnly)','🌍 CORS misconfiguration','📂 Sensitive file exposure (/.env, /.git…)'].map(c => <span key={c}>{c}</span>)}
            </div>
            {scanning && <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><span className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-500 rounded-full animate-spin"/>Probing {urlInput}…</div>}
          </>)}
        </div>

        {/* ── Results ────────────────────────────────────────────────────── */}
        {result && (
          <>
            {/* Summary bar */}
            <div className="card p-5">
              <div className="flex flex-wrap items-start gap-4 mb-4">
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-gray-900 dark:text-white text-lg">
                    {result.project_name}
                    {result.stats.timed_out && (
                      <span className="ml-2 text-xs font-normal text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-2 py-0.5 rounded-full">
                        ⚠️ Partial scan (timeout)
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{result.project_path}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {result.stats.files_scanned} files scanned · {result.stats.files_skipped} skipped ·{' '}
                    {result.stats.scan_seconds}s · {new Date(result.scanned_at).toLocaleString()}
                  </p>
                </div>
                {/* Risk score */}
                <div className="text-right">
                  <p className={`text-3xl font-black ${riskColor}`}>{riskScore}</p>
                  <p className={`text-xs font-semibold ${riskColor}`}>{riskLabel}</p>
                  <p className="text-[10px] text-gray-400">risk score / 100</p>
                </div>
              </div>

              {/* Severity breakdown */}
              <div className="flex flex-wrap gap-2">
                <StatBadge label="Critical" count={result.stats.critical} sev="CRITICAL" icon="🔴"/>
                <StatBadge label="High"     count={result.stats.high}     sev="HIGH"     icon="🟠"/>
                <StatBadge label="Medium"   count={result.stats.medium}   sev="MEDIUM"   icon="🟡"/>
                <StatBadge label="Low"      count={result.stats.low}      sev="LOW"      icon="🔵"/>
                <StatBadge label="Info"     count={result.stats.info}     sev="INFO"     icon="ℹ️"/>
                {result.stats.total === 0 && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400">
                    <span className="text-xl">✅</span>
                    <p className="font-semibold text-sm">No vulnerabilities found</p>
                  </div>
                )}
              </div>

              {/* AI Prompt button */}
              {result.stats.total > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex flex-wrap gap-2 items-center">
                    <button onClick={copyPrompt}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${copied ? 'bg-green-500 text-white' : 'bg-gradient-to-r from-brand-600 to-purple-600 text-white hover:opacity-90'}`}>
                      {copied ? '✅ Copied!' : '🤖 Copy AI Fix Prompt'}
                    </button>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Paste into Claude / ChatGPT to auto-fix all {result.stats.total} vulnerabilities
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Filters */}
            {result.stats.total > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  className="input text-sm py-1.5 w-48"
                  placeholder="Search findings…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {/* Severity filter */}
                <div className="flex gap-1 flex-wrap">
                  {['ALL', ...SEV_ORDER].map(s => (
                    <button key={s} onClick={() => setFilterSev(s)}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${filterSev === s ? (s === 'ALL' ? 'bg-gray-800 dark:bg-white text-white dark:text-gray-900 border-transparent' : `${SEV[s]?.badge} border-transparent`) : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                      {s === 'ALL' ? 'All' : `${SEV[s]?.icon} ${s}`}
                    </button>
                  ))}
                </div>
                {/* Category filter */}
                <select className="input text-xs py-1.5" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="text-xs text-gray-400">{filtered.length} of {result.stats.total} shown</span>
              </div>
            )}

            {/* Findings grouped by severity */}
            {Object.keys(groupedFiltered).length > 0 && (
              <div className="space-y-6">
                {SEV_ORDER.map(sev => {
                  const items = groupedFiltered[sev]
                  if (!items?.length) return null
                  const cfg = SEV[sev]
                  return (
                    <div key={sev}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-base">{cfg.icon}</span>
                        <h3 className={`font-bold text-sm uppercase tracking-wide ${cfg.text}`}>{sev}</h3>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>{items.length}</span>
                        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800"/>
                      </div>
                      <div className="space-y-2">
                        {items.map(f => (
                          <FindingCard
                            key={f.id}
                            f={f}
                            onOpenEditor={setEditorFinding}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {filtered.length === 0 && result.stats.total > 0 && (
              <div className="card p-8 text-center text-gray-400">
                <p className="text-3xl mb-2">🔍</p>
                <p className="text-sm">No findings match your current filters</p>
              </div>
            )}

            {/* AI Prompt preview */}
            {result.stats.total > 0 && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    🤖 AI Fix Prompt Preview
                  </h3>
                  <button onClick={copyPrompt}
                    className={`btn-secondary text-xs ${copied ? 'text-green-600' : ''}`}>
                    {copied ? '✅ Copied!' : '📋 Copy'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  This prompt contains all findings with code snippets and fix examples.
                  Paste it into Claude, ChatGPT, or any AI to get exact code changes.
                </p>
                <textarea
                  ref={promptRef}
                  readOnly
                  value={buildAIPrompt(result)}
                  onClick={e => e.target.select()}
                  className="w-full h-64 text-xs font-mono bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg p-3 resize-none text-gray-700 dark:text-gray-300 focus:outline-none focus:border-brand-400"
                  placeholder="Run a scan to generate the AI prompt…"
                />
              </div>
            )}
          </>
        )}

        {/* ── URL scan results ─────────────────────────────────────────────── */}
        {urlResult && scanMode === 'url' && (() => {
          const ur = urlResult
          const urs = ur.stats
          const urRisk = Math.min(100, urs.critical*25 + urs.high*10 + urs.medium*4 + urs.low*1)
          const urLabel = urRisk >= 75 ? 'Critical Risk' : urRisk >= 40 ? 'High Risk' : urRisk >= 15 ? 'Medium Risk' : urRisk > 0 ? 'Low Risk' : 'Secure'
          const urColor = urRisk >= 75 ? 'text-red-600' : urRisk >= 40 ? 'text-orange-500' : urRisk >= 15 ? 'text-yellow-600' : 'text-green-600'
          const urFiltered = ur.findings.filter(f => {
            if (filterSev !== 'ALL' && f.severity !== filterSev) return false
            if (filterCat !== 'ALL' && f.category !== filterCat) return false
            if (search && !f.title.toLowerCase().includes(search.toLowerCase()) && !f.description.toLowerCase().includes(search.toLowerCase())) return false
            return true
          })
          const urGrouped = SEV_ORDER.reduce((acc, s) => { const it = urFiltered.filter(f => f.severity === s); if (it.length) acc[s] = it; return acc }, {})
          const urCats = ['ALL', ...new Set(ur.findings.map(f => f.category))]
          return (<>
            {/* Summary */}
            <div className="card p-5">
              <div className="flex flex-wrap items-start gap-4 mb-4">
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-gray-900 dark:text-white text-lg break-all">{ur.final_url || ur.url}</h2>
                  <p className="text-xs text-gray-400 mt-1">{urs.scan_seconds}s · {new Date(ur.scanned_at).toLocaleString()}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-3xl font-black ${urColor}`}>{urRisk}</p>
                  <p className={`text-xs font-semibold ${urColor}`}>{urLabel}</p>
                  <p className="text-[10px] text-gray-400">risk score / 100</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatBadge label="Critical" count={urs.critical} sev="CRITICAL" icon="🔴"/>
                <StatBadge label="High"     count={urs.high}     sev="HIGH"     icon="🟠"/>
                <StatBadge label="Medium"   count={urs.medium}   sev="MEDIUM"   icon="🟡"/>
                <StatBadge label="Low"      count={urs.low}      sev="LOW"      icon="🔵"/>
                <StatBadge label="Info"     count={urs.info}     sev="INFO"     icon="ℹ️"/>
                {urs.total === 0 && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400">
                    <span className="text-xl">✅</span><p className="font-semibold text-sm">No issues found</p>
                  </div>
                )}
              </div>
              {urs.total > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-2 items-center">
                  <button onClick={copyPrompt}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${copied ? 'bg-green-500 text-white' : 'bg-gradient-to-r from-brand-600 to-purple-600 text-white hover:opacity-90'}`}>
                    {copied ? '✅ Copied!' : '🤖 Copy AI Fix Prompt'}
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Paste into Claude / ChatGPT to get server config fixes</p>
                </div>
              )}
            </div>

            {/* Filters */}
            {urs.total > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <input className="input text-sm py-1.5 w-48" placeholder="Search findings…" value={search} onChange={e => setSearch(e.target.value)} />
                <div className="flex gap-1 flex-wrap">
                  {['ALL', ...SEV_ORDER].map(s => (
                    <button key={s} onClick={() => setFilterSev(s)}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${filterSev === s ? (s === 'ALL' ? 'bg-gray-800 dark:bg-white text-white dark:text-gray-900 border-transparent' : `${SEV[s]?.badge} border-transparent`) : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                      {s === 'ALL' ? 'All' : `${SEV[s]?.icon} ${s}`}
                    </button>
                  ))}
                </div>
                <select className="input text-xs py-1.5" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                  {urCats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="text-xs text-gray-400">{urFiltered.length} of {urs.total} shown</span>
              </div>
            )}

            {/* Findings */}
            {Object.keys(urGrouped).length > 0 && (
              <div className="space-y-6">
                {SEV_ORDER.map(sev => {
                  const items = urGrouped[sev]; if (!items?.length) return null
                  const cfg = SEV[sev]
                  return (
                    <div key={sev}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-base">{cfg.icon}</span>
                        <h3 className={`font-bold text-sm uppercase tracking-wide ${cfg.text}`}>{sev}</h3>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>{items.length}</span>
                        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800"/>
                      </div>
                      <div className="space-y-2">
                        {items.map(f => <URLFindingCard key={f.id} f={f}/>)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>)
        })()}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {!result && !scanning && !(scanMode === 'url' && urlResult) && (
          <div className="card p-10 text-center">
            <div className="text-5xl mb-4">🛡️</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Ready to scan</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-6">
              Enter your project path above and click Scan. All source files will be checked —
              node_modules, .git, dist and other dependency folders are automatically excluded.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto text-left">
              {[
                { icon: '💉', label: 'SQL Injection',    desc: 'f-strings in SQL' },
                { icon: '🔑', label: 'Exposed Secrets',  desc: 'Hardcoded credentials' },
                { icon: '⚡', label: 'XSS',              desc: 'innerHTML, eval()' },
                { icon: '🔓', label: 'Auth Issues',      desc: 'JWT, weak crypto' },
                { icon: '🗂️', label: 'Path Traversal',   desc: 'Unsafe file ops' },
                { icon: '🌐', label: 'SSRF',             desc: 'User-controlled URLs' },
                { icon: '🍪', label: 'Insecure Cookies', desc: 'Missing Secure/HttpOnly' },
                { icon: '🔧', label: 'Misconfiguration', desc: 'Debug mode, CORS *' },
              ].map(item => (
                <div key={item.label} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                  <p className="text-lg mb-1">{item.icon}</p>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{item.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
