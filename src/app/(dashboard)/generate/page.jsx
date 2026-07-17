'use client'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import toast from 'react-hot-toast'

const BASE = process.env.NEXT_PUBLIC_API_URL || ''

// ── Download helper ─────────────────────────────────────────────────────────

async function downloadJSON(url, body, filename, session) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.accessToken}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`
    try { const j = await res.json(); msg = j.detail || msg } catch (_) {}
    throw new Error(msg)
  }
  const blob = await res.blob()
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(objUrl), 5000)
}

// ── PDF Tab ─────────────────────────────────────────────────────────────────

function PdfTab({ session }) {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [pageSize, setPageSize] = useState('A4')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  async function generate() {
    if (!title.trim()) { toast.error('Title is required'); return }
    if (!content.trim()) { toast.error('Content is required'); return }
    setLoading(true)
    try {
      await downloadJSON(
        `${BASE}/api/v1/generate/pdf`,
        { title: title.trim(), author: author.trim() || undefined, page_size: pageSize, content },
        `${title.trim().replace(/\s+/g, '_')}.pdf`,
        session,
      )
      toast.success('PDF downloaded!')
    } catch (e) {
      toast.error(e.message || 'PDF generation failed')
    }
    setLoading(false)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Form */}
      <div className="space-y-4">
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">PDF settings</h3>

          <div>
            <label className="label">Title *</label>
            <input className="input" placeholder="My Document" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="label">Author</label>
            <input className="input" placeholder="Your name" value={author} onChange={e => setAuthor(e.target.value)} />
          </div>

          <div>
            <label className="label">Page size</label>
            <select className="input" value={pageSize} onChange={e => setPageSize(e.target.value)}>
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
              <option value="A3">A3</option>
            </select>
          </div>

          <button onClick={generate} disabled={loading} className="btn-primary w-full justify-center">
            {loading ? 'Generating…' : '📄 Generate PDF'}
          </button>
        </div>

        {/* Markdown guide */}
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Markdown supported</p>
          <div className="space-y-1 text-xs text-gray-400 font-mono">
            <p># Heading 1</p>
            <p>## Heading 2</p>
            <p>### Heading 3</p>
            <p>- Bullet item</p>
            <p>1. Numbered item</p>
            <p>**bold** and *italic*</p>
            <p>{`> Blockquote`}</p>
            <p>--- (horizontal rule)</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="card p-5 flex flex-col">
        <label className="label mb-2">Content (Markdown)</label>
        <textarea
          className="input flex-1 resize-none font-mono text-sm min-h-96"
          placeholder={`# Introduction\n\nWrite your document content here using Markdown syntax.\n\n## Section 1\n\nSome paragraph text.\n\n- Bullet one\n- Bullet two\n\n## Section 2\n\n1. First item\n2. Second item`}
          value={content}
          onChange={e => setContent(e.target.value)}
        />
        <p className="text-xs text-gray-400 mt-2">
          {content.length} characters · {content.split('\n').length} lines
        </p>
      </div>
    </div>
  )
}

// ── DOCX Tab ────────────────────────────────────────────────────────────────

const FONTS = ['Calibri', 'Arial', 'Times New Roman', 'Georgia']

function DocxTab({ session }) {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [font, setFont] = useState('Calibri')
  const [fontSize, setFontSize] = useState(11)
  const [sections, setSections] = useState([{ heading: '', content: '', level: 1 }])
  const [loading, setLoading] = useState(false)

  function addSection() {
    setSections(s => [...s, { heading: '', content: '', level: 1 }])
  }

  function removeSection(idx) {
    setSections(s => s.filter((_, i) => i !== idx))
  }

  function updateSection(idx, field, value) {
    setSections(s => s.map((sec, i) => i === idx ? { ...sec, [field]: value } : sec))
  }

  async function generate() {
    if (!title.trim()) { toast.error('Title is required'); return }
    const validSections = sections.filter(s => s.heading.trim())
    setLoading(true)
    try {
      await downloadJSON(
        `${BASE}/api/v1/generate/docx`,
        {
          title: title.trim(),
          author: author.trim() || undefined,
          font,
          font_size: fontSize,
          sections: validSections.map(s => ({
            heading: s.heading.trim(),
            content: s.content,
            level: parseInt(s.level),
          })),
        },
        `${title.trim().replace(/\s+/g, '_')}.docx`,
        session,
      )
      toast.success('DOCX downloaded!')
    } catch (e) {
      toast.error(e.message || 'DOCX generation failed')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      {/* Header settings */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Document settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" placeholder="Document title" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Author</label>
            <input className="input" placeholder="Your name" value={author} onChange={e => setAuthor(e.target.value)} />
          </div>
          <div>
            <label className="label">Font</label>
            <select className="input" value={font} onChange={e => setFont(e.target.value)}>
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Font size (pt)</label>
            <input
              type="number" min={8} max={24} className="input"
              value={fontSize} onChange={e => setFontSize(parseInt(e.target.value) || 11)}
            />
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {sections.map((sec, idx) => (
          <div key={idx} className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Section {idx + 1}</span>
              {sections.length > 1 && (
                <button onClick={() => removeSection(idx)} className="btn-ghost text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                  🗑 Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3">
              <div className="sm:col-span-3">
                <label className="label">Heading</label>
                <input
                  className="input"
                  placeholder="Section heading"
                  value={sec.heading}
                  onChange={e => updateSection(idx, 'heading', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Level</label>
                <select className="input" value={sec.level} onChange={e => updateSection(idx, 'level', e.target.value)}>
                  <option value={1}>H1</option>
                  <option value={2}>H2</option>
                  <option value={3}>H3</option>
                  <option value={4}>H4</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">Content</label>
              <textarea
                className="input resize-none text-sm font-mono"
                rows={4}
                placeholder={`Section content.\n- Bullet points supported\n1. Numbered lists too`}
                value={sec.content}
                onChange={e => updateSection(idx, 'content', e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={addSection} className="btn-secondary">
          ➕ Add section
        </button>
        <button onClick={generate} disabled={loading} className="btn-primary">
          {loading ? 'Generating…' : '📝 Generate DOCX'}
        </button>
      </div>
    </div>
  )
}

// ── PPTX Tab ────────────────────────────────────────────────────────────────

const THEMES = [
  { id: 'default', label: 'Default (white)' },
  { id: 'dark',    label: 'Dark (#1a1a2e)' },
  { id: 'minimal', label: 'Minimal (#fafafa)' },
]

function PptxTab({ session }) {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [theme, setTheme] = useState('default')
  const [slides, setSlides] = useState([{ title: '', bullets: '', notes: '', notesOpen: false }])
  const [loading, setLoading] = useState(false)

  function addSlide() {
    setSlides(s => [...s, { title: '', bullets: '', notes: '', notesOpen: false }])
  }

  function removeSlide(idx) {
    setSlides(s => s.filter((_, i) => i !== idx))
  }

  function updateSlide(idx, field, value) {
    setSlides(s => s.map((sl, i) => i === idx ? { ...sl, [field]: value } : sl))
  }

  function moveSlide(idx, dir) {
    const newSlides = [...slides]
    const target = idx + dir
    if (target < 0 || target >= newSlides.length) return
    ;[newSlides[idx], newSlides[target]] = [newSlides[target], newSlides[idx]]
    setSlides(newSlides)
  }

  async function generate() {
    if (!title.trim()) { toast.error('Presentation title is required'); return }
    const validSlides = slides.filter(s => s.title.trim())
    if (validSlides.length === 0) { toast.error('Add at least one slide with a title'); return }
    setLoading(true)
    try {
      await downloadJSON(
        `${BASE}/api/v1/generate/pptx`,
        {
          title: title.trim(),
          subtitle: subtitle.trim() || undefined,
          theme,
          slides: validSlides.map(s => ({
            title: s.title.trim(),
            bullets: s.bullets.split('\n').map(b => b.trim()).filter(Boolean),
            notes: s.notes.trim() || undefined,
          })),
        },
        `${title.trim().replace(/\s+/g, '_')}.pptx`,
        session,
      )
      toast.success('PPTX downloaded!')
    } catch (e) {
      toast.error(e.message || 'PPTX generation failed')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Presentation settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" placeholder="My Presentation" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Subtitle</label>
            <input className="input" placeholder="Optional subtitle" value={subtitle} onChange={e => setSubtitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Theme</label>
            <select className="input" value={theme} onChange={e => setTheme(e.target.value)}>
              {THEMES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Slides */}
      <div className="space-y-3">
        {slides.map((sl, idx) => (
          <div key={idx} className="card p-4">
            {/* Slide header */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Slide {idx + 1}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveSlide(idx, -1)}
                  disabled={idx === 0}
                  className="btn-ghost text-xs py-1 px-2 disabled:opacity-30"
                  title="Move up"
                >↑</button>
                <button
                  onClick={() => moveSlide(idx, 1)}
                  disabled={idx === slides.length - 1}
                  className="btn-ghost text-xs py-1 px-2 disabled:opacity-30"
                  title="Move down"
                >↓</button>
                {slides.length > 1 && (
                  <button onClick={() => removeSlide(idx)} className="btn-ghost text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                    🗑
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label">Slide title</label>
                <input
                  className="input"
                  placeholder="Slide title"
                  value={sl.title}
                  onChange={e => updateSlide(idx, 'title', e.target.value)}
                />
              </div>

              <div>
                <label className="label">Bullets (one per line)</label>
                <textarea
                  className="input resize-none text-sm"
                  rows={3}
                  placeholder={"First bullet point\nSecond bullet point\nThird bullet point"}
                  value={sl.bullets}
                  onChange={e => updateSlide(idx, 'bullets', e.target.value)}
                />
              </div>

              {/* Notes toggle */}
              <button
                onClick={() => updateSlide(idx, 'notesOpen', !sl.notesOpen)}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1"
              >
                {sl.notesOpen ? '▾' : '▸'} Speaker notes
              </button>

              {sl.notesOpen && (
                <textarea
                  className="input resize-none text-sm text-gray-500"
                  rows={2}
                  placeholder="Speaker notes (not shown on slide)"
                  value={sl.notes}
                  onChange={e => updateSlide(idx, 'notes', e.target.value)}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={addSlide} className="btn-secondary">
          ➕ Add slide
        </button>
        <button onClick={generate} disabled={loading} className="btn-primary">
          {loading ? 'Generating…' : '📊 Generate PPTX'}
        </button>
      </div>

      {/* Preview info */}
      <div className="card p-4">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Preview</p>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {slides.filter(s => s.title.trim()).length} content slide{slides.filter(s => s.title.trim()).length !== 1 ? 's' : ''} + 1 title slide
          {subtitle && ` · subtitle: "${subtitle}"`}
          {` · theme: ${theme}`}
        </p>
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'pdf',  label: 'PDF',  icon: '📄' },
  { id: 'docx', label: 'DOCX', icon: '📝' },
  { id: 'pptx', label: 'PPTX', icon: '📊' },
]

export default function GeneratePage() {
  const { data: session } = useSession()
  const [tab, setTab] = useState('pdf')

  return (
    <div className="space-y-4 fade-in">
      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${tab === t.id
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'pdf'  && <PdfTab  session={session} />}
      {tab === 'docx' && <DocxTab session={session} />}
      {tab === 'pptx' && <PptxTab session={session} />}
    </div>
  )
}
