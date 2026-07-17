'use client'
import { useSession } from 'next-auth/react'
import { useState, useRef, useEffect } from 'react'
import toast from 'react-hot-toast'

const BASE = process.env.NEXT_PUBLIC_API_URL || ''

// ── Download helper ─────────────────────────────────────────────────────────

async function downloadBlob(url, filename, session, body, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${session?.accessToken}` },
    body,
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

// ── Image Tab ───────────────────────────────────────────────────────────────

function ImageTab({ session }) {
  const [imgSrc, setImgSrc] = useState(null)        // object URL for preview
  const [imgFile, setImgFile] = useState(null)       // File object
  const [pathInput, setPathInput] = useState('')
  const [loading, setLoading] = useState(false)

  // Operations state
  const [brightness, setBrightness] = useState(1)
  const [contrast, setContrast] = useState(1)
  const [saturation, setSaturation] = useState(1)
  const [sharpness, setSharpness] = useState(1)
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [outputFormat, setOutputFormat] = useState('png')

  const fileInputRef = useRef(null)

  function handleFileSelect(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setImgFile(f)
    const url = URL.createObjectURL(f)
    setImgSrc(url)
    setPathInput('')
  }

  function handlePathLoad() {
    if (!pathInput.trim()) return
    setImgFile(null)
    // Show path-based image via backend download
    setImgSrc(`${BASE}/api/v1/files/download?path=${encodeURIComponent(pathInput.trim())}`)
  }

  function toggleFilter(name) {
    setActiveFilters(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // Live CSS preview filter string
  const cssFilter = [
    brightness !== 1 ? `brightness(${brightness})` : '',
    contrast !== 1   ? `contrast(${contrast})` : '',
    saturation !== 1 ? `saturate(${saturation})` : '',
    activeFilters.has('grayscale') ? 'grayscale(1)' : '',
    activeFilters.has('sepia')     ? 'sepia(1)' : '',
    activeFilters.has('invert')    ? 'invert(1)' : '',
    activeFilters.has('blur')      ? 'blur(4px)' : '',
  ].filter(Boolean).join(' ') || 'none'

  function buildOperations() {
    const ops = []
    if (brightness !== 1) ops.push({ type: 'brightness', value: brightness })
    if (contrast !== 1)   ops.push({ type: 'contrast',   value: contrast })
    if (saturation !== 1) ops.push({ type: 'saturation', value: saturation })
    if (sharpness !== 1)  ops.push({ type: 'sharpness',  value: sharpness })
    if (activeFilters.has('grayscale')) ops.push({ type: 'grayscale' })
    if (activeFilters.has('sepia'))     ops.push({ type: 'sepia' })
    if (activeFilters.has('invert'))    ops.push({ type: 'invert' })
    if (activeFilters.has('blur'))      ops.push({ type: 'blur', radius: 4 })
    return ops
  }

  async function applyOperation(extraOps = []) {
    if (!imgFile && !pathInput.trim()) { toast.error('Load an image first'); return }
    setLoading(true)
    try {
      const fd = new FormData()
      if (imgFile) fd.append('file', imgFile)
      else fd.append('path', pathInput.trim())
      fd.append('operations', JSON.stringify(extraOps))
      fd.append('output_format', outputFormat)

      const res = await fetch(`${BASE}/api/v1/media/image/process`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.accessToken}` },
        body: fd,
      })
      if (!res.ok) {
        let msg = `Request failed: ${res.status}`
        try { const j = await res.json(); msg = j.detail || msg } catch (_) {}
        throw new Error(msg)
      }
      const blob = await res.blob()
      // Update preview with processed image
      const url = URL.createObjectURL(blob)
      setImgSrc(url)
      // Also make it available as the "file" for further ops
      const processed = new File([blob], `processed.${outputFormat}`, { type: blob.type })
      setImgFile(processed)
      toast.success('Applied!')
    } catch (e) {
      toast.error(e.message)
    }
    setLoading(false)
  }

  async function processAndDownload() {
    if (!imgFile && !pathInput.trim()) { toast.error('Load an image first'); return }
    setLoading(true)
    try {
      const fd = new FormData()
      if (imgFile) fd.append('file', imgFile)
      else fd.append('path', pathInput.trim())
      fd.append('operations', JSON.stringify(buildOperations()))
      fd.append('output_format', outputFormat)

      await downloadBlob(
        `${BASE}/api/v1/media/image/process`,
        `processed.${outputFormat}`,
        session,
        fd,
      )
      toast.success('Downloaded!')
    } catch (e) {
      toast.error(e.message)
    }
    setLoading(false)
  }

  function resetAll() {
    setBrightness(1); setContrast(1); setSaturation(1); setSharpness(1)
    setActiveFilters(new Set())
  }

  const FILTER_BTNS = ['grayscale', 'sepia', 'invert', 'blur']

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Controls */}
      <div className="space-y-4">
        {/* Load image */}
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Load image</h3>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
          <button onClick={() => fileInputRef.current?.click()} className="btn-secondary w-full justify-center">
            📂 Upload image
          </button>
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="Or paste file path…"
              value={pathInput}
              onChange={e => setPathInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePathLoad()}
            />
            <button onClick={handlePathLoad} className="btn-secondary">Load</button>
          </div>
        </div>

        {/* Transform buttons */}
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Transform</h3>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => applyOperation([{ type: 'rotate', angle: 90 }])}  className="btn-secondary text-sm justify-center">↻ Rotate CW</button>
            <button onClick={() => applyOperation([{ type: 'rotate', angle: -90 }])} className="btn-secondary text-sm justify-center">↺ Rotate CCW</button>
            <button onClick={() => applyOperation([{ type: 'flip_h' }])} className="btn-secondary text-sm justify-center">↔ Flip H</button>
            <button onClick={() => applyOperation([{ type: 'flip_v' }])} className="btn-secondary text-sm justify-center">↕ Flip V</button>
          </div>
        </div>

        {/* Adjustments */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">Adjustments</h3>
            <button onClick={resetAll} className="btn-ghost text-xs">Reset</button>
          </div>

          {[
            { label: 'Brightness', value: brightness, set: setBrightness },
            { label: 'Contrast',   value: contrast,   set: setContrast },
            { label: 'Saturation', value: saturation, set: setSaturation },
            { label: 'Sharpness',  value: sharpness,  set: setSharpness },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <div className="flex justify-between text-xs mb-1">
                <label className="label text-xs">{label}</label>
                <span className="text-gray-500">{value.toFixed(2)}</span>
              </div>
              <input
                type="range" min={0.1} max={3} step={0.05}
                value={value} onChange={e => set(parseFloat(e.target.value))}
                className="w-full accent-brand-600"
              />
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Filters</h3>
          <div className="grid grid-cols-2 gap-2">
            {FILTER_BTNS.map(f => (
              <button
                key={f}
                onClick={() => toggleFilter(f)}
                className={`text-sm px-3 py-2 rounded-lg font-medium capitalize transition-colors border
                  ${activeFilters.has(f)
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-brand-400'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Output & download */}
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Export</h3>
          <div>
            <label className="label text-xs">Output format</label>
            <select className="input" value={outputFormat} onChange={e => setOutputFormat(e.target.value)}>
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
            </select>
          </div>
          <button
            onClick={processAndDownload}
            disabled={loading || (!imgFile && !pathInput.trim())}
            className="btn-primary w-full justify-center"
          >
            {loading ? 'Processing…' : '⬇ Process & Download'}
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="card p-4 flex flex-col">
        <p className="font-semibold text-gray-900 dark:text-white mb-3">Preview</p>
        {imgSrc ? (
          <div className="flex-1 flex items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 min-h-64">
            <img
              src={imgSrc}
              alt="Preview"
              className="max-w-full max-h-[60vh] object-contain rounded"
              style={{ filter: cssFilter }}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 min-h-64 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
            <p className="text-4xl mb-2">🖼️</p>
            <p className="text-sm">Upload or paste a path to preview</p>
          </div>
        )}
        {cssFilter !== 'none' && (
          <p className="text-xs text-gray-400 mt-2">CSS preview applied. Click "Process & Download" for actual backend processing.</p>
        )}
      </div>
    </div>
  )
}

// ── Video Tab ───────────────────────────────────────────────────────────────

function VideoTab({ session }) {
  const [videoSrc, setVideoSrc] = useState(null)
  const [videoFile, setVideoFile] = useState(null)
  const [pathInput, setPathInput] = useState('')
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [timestamp, setTimestamp] = useState(0)
  const [frameSrc, setFrameSrc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [frameLoading, setFrameLoading] = useState(false)

  const fileInputRef = useRef(null)
  const videoRef = useRef(null)

  function handleFileSelect(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setVideoFile(f)
    const url = URL.createObjectURL(f)
    setVideoSrc(url)
    setPathInput('')
    setFrameSrc(null)
  }

  function handlePathLoad() {
    if (!pathInput.trim()) return
    setVideoFile(null)
    setVideoSrc(`${BASE}/api/v1/files/download?path=${encodeURIComponent(pathInput.trim())}`)
    setFrameSrc(null)
  }

  function onVideoLoaded() {
    const v = videoRef.current
    if (!v) return
    const d = Math.floor(v.duration) || 0
    setDuration(d)
    setStart(0)
    setEnd(d)
    setTimestamp(0)
  }

  async function trimAndDownload() {
    if (!videoFile && !pathInput.trim()) { toast.error('Load a video first'); return }
    if (end <= start) { toast.error('End must be after start'); return }
    setLoading(true)
    try {
      const fd = new FormData()
      if (videoFile) fd.append('file', videoFile)
      else fd.append('path', pathInput.trim())
      fd.append('start', String(start))
      fd.append('end', String(end))

      await downloadBlob(`${BASE}/api/v1/media/video/trim`, 'trimmed.mp4', session, fd)
      toast.success('Trimmed video downloaded!')
    } catch (e) {
      toast.error(e.message)
    }
    setLoading(false)
  }

  async function extractFrame() {
    if (!videoFile && !pathInput.trim()) { toast.error('Load a video first'); return }
    setFrameLoading(true)
    try {
      const fd = new FormData()
      if (videoFile) fd.append('file', videoFile)
      else fd.append('path', pathInput.trim())
      fd.append('timestamp', String(timestamp))

      const res = await fetch(`${BASE}/api/v1/media/video/extract-frame`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.accessToken}` },
        body: fd,
      })
      if (!res.ok) {
        let msg = `Request failed: ${res.status}`
        try { const j = await res.json(); msg = j.detail || msg } catch (_) {}
        throw new Error(msg)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setFrameSrc(url)
      toast.success('Frame extracted!')
    } catch (e) {
      toast.error(e.message)
    }
    setFrameLoading(false)
  }

  function downloadFrame() {
    if (!frameSrc) return
    const a = document.createElement('a')
    a.href = frameSrc
    a.download = `frame_${timestamp}s.jpg`
    a.click()
  }

  function formatTime(s) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Controls */}
      <div className="space-y-4">
        {/* Load video */}
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Load video</h3>
          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
          <button onClick={() => fileInputRef.current?.click()} className="btn-secondary w-full justify-center">
            📂 Upload video
          </button>
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="Or paste file path…"
              value={pathInput}
              onChange={e => setPathInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePathLoad()}
            />
            <button onClick={handlePathLoad} className="btn-secondary">Load</button>
          </div>
        </div>

        {/* Trim */}
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Trim</h3>
          {duration > 0 && (
            <p className="text-xs text-gray-500">Duration: {formatTime(duration)}</p>
          )}

          <div>
            <div className="flex justify-between text-xs mb-1">
              <label className="label text-xs">Start</label>
              <span className="text-gray-500">{formatTime(start)}</span>
            </div>
            <input
              type="range" min={0} max={Math.max(duration, 1)} step={0.1}
              value={start} onChange={e => setStart(parseFloat(e.target.value))}
              className="w-full accent-brand-600"
            />
            <input
              type="number" min={0} max={duration} step={0.1}
              value={start}
              onChange={e => setStart(Math.max(0, parseFloat(e.target.value) || 0))}
              className="input mt-1 text-sm"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <label className="label text-xs">End</label>
              <span className="text-gray-500">{formatTime(end)}</span>
            </div>
            <input
              type="range" min={0} max={Math.max(duration, 1)} step={0.1}
              value={end} onChange={e => setEnd(parseFloat(e.target.value))}
              className="w-full accent-brand-600"
            />
            <input
              type="number" min={0} max={duration} step={0.1}
              value={end}
              onChange={e => setEnd(Math.max(0, parseFloat(e.target.value) || 0))}
              className="input mt-1 text-sm"
            />
          </div>

          <button
            onClick={trimAndDownload}
            disabled={loading || (!videoFile && !pathInput.trim())}
            className="btn-primary w-full justify-center"
          >
            {loading ? 'Trimming…' : '✂️ Trim & Download'}
          </button>
        </div>

        {/* Extract frame */}
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Extract frame</h3>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <label className="label text-xs">Timestamp</label>
              <span className="text-gray-500">{formatTime(timestamp)}</span>
            </div>
            {duration > 0 && (
              <input
                type="range" min={0} max={duration} step={0.1}
                value={timestamp} onChange={e => setTimestamp(parseFloat(e.target.value))}
                className="w-full accent-brand-600 mb-1"
              />
            )}
            <input
              type="number" min={0} step={0.1}
              value={timestamp}
              onChange={e => setTimestamp(Math.max(0, parseFloat(e.target.value) || 0))}
              className="input text-sm"
              placeholder="Seconds"
            />
          </div>
          <button
            onClick={extractFrame}
            disabled={frameLoading || (!videoFile && !pathInput.trim())}
            className="btn-secondary w-full justify-center"
          >
            {frameLoading ? 'Extracting…' : '📷 Extract Frame'}
          </button>
          {frameSrc && (
            <button onClick={downloadFrame} className="btn-ghost text-sm w-full justify-center">
              ⬇ Download frame
            </button>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-4">
        {videoSrc ? (
          <div className="card p-4">
            <p className="font-semibold text-gray-900 dark:text-white mb-3">Video preview</p>
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              onLoadedMetadata={onVideoLoaded}
              className="w-full rounded-lg bg-black"
              style={{ maxHeight: '40vh' }}
            />
          </div>
        ) : (
          <div className="card p-4 flex flex-col items-center justify-center min-h-48 border-2 border-dashed border-gray-200 dark:border-gray-700">
            <p className="text-4xl mb-2">🎬</p>
            <p className="text-sm text-gray-400">Upload or paste a path to preview</p>
          </div>
        )}

        {frameSrc && (
          <div className="card p-4">
            <p className="font-semibold text-gray-900 dark:text-white mb-3">Extracted frame at {formatTime(timestamp)}</p>
            <img src={frameSrc} alt="Extracted frame" className="w-full rounded-lg" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function MediaPage() {
  const { data: session } = useSession()
  const [tab, setTab] = useState('image')

  const TABS = [
    { id: 'image', label: 'Image', icon: '🖼️' },
    { id: 'video', label: 'Video', icon: '🎬' },
  ]

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

      {tab === 'image' && <ImageTab session={session} />}
      {tab === 'video' && <VideoTab session={session} />}
    </div>
  )
}
