'use client'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'

const PROVIDERS = ['gemini', 'openai', 'anthropic']
const TABS = ['chat', 'text', 'image', 'video', 'history']
const TAB_ICONS = { chat: '💬', text: '✍️', image: '🎨', video: '🎬', history: '📜' }
const TONES = ['professional', 'casual', 'technical', 'creative', 'persuasive']
const LENGTHS = ['short', 'medium', 'long']

function ProviderPill({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {PROVIDERS.map(p => (
        <button key={p} onClick={() => onChange(p)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors
            ${value===p ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
          {p}
        </button>
      ))}
    </div>
  )
}

export default function StudioPage() {
  const { data: session } = useSession()
  const [tab, setTab] = useState('chat')
  const [provider, setProvider] = useState('gemini')

  // Chat state
  const [chatHistory, setChatHistory] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  // Text generation
  const [textPrompt, setTextPrompt] = useState('')
  const [tone, setTone] = useState('professional')
  const [length, setLength] = useState('medium')
  const [textOutput, setTextOutput] = useState('')
  const [textLoading, setTextLoading] = useState(false)

  // Image generation
  const [imagePrompt, setImagePrompt] = useState('')
  const [imageStyle, setImageStyle] = useState('natural')
  const [imageUrl, setImageUrl] = useState('')
  const [imageLoading, setImageLoading] = useState(false)

  // Video generation
  const [videoPrompt, setVideoPrompt] = useState('')
  const [videoDuration, setVideoDuration] = useState(5)
  const [videoJob, setVideoJob] = useState(null)
  const [videoLoading, setVideoLoading] = useState(false)

  // History
  const [history, setHistory] = useState([])
  const [histLoaded, setHistLoaded] = useState(false)

  async function sendChat() {
    if (!chatInput.trim()) return
    const msg = chatInput.trim(); setChatInput('')
    const newHistory = [...chatHistory, { role: 'user', content: msg }]
    setChatHistory(newHistory); setChatLoading(true)
    try {
      const res = await api.ai.chat({ message: msg, history: chatHistory, provider }, session)
      setChatHistory([...newHistory, { role: 'assistant', content: res.content }])
    } catch (e) { toast.error(e.message || 'Chat failed — add API key in Settings') }
    setChatLoading(false)
  }

  async function generateText() {
    if (!textPrompt.trim()) { toast.error('Enter a prompt'); return }
    setTextLoading(true); setTextOutput('')
    try {
      const res = await api.ai.generateText({ prompt: textPrompt, tone, length, provider }, session)
      setTextOutput(res.content)
    } catch (e) { toast.error(e.message || 'Generation failed — add API key in Settings') }
    setTextLoading(false)
  }

  async function generateImage() {
    if (!imagePrompt.trim()) { toast.error('Enter a prompt'); return }
    setImageLoading(true); setImageUrl('')
    try {
      const res = await api.ai.generateImage({ prompt: imagePrompt, style: imageStyle, provider: 'openai' }, session)
      setImageUrl(res.url)
    } catch (e) { toast.error(e.message || 'Image generation failed — add OpenAI key in Settings') }
    setImageLoading(false)
  }

  async function generateVideo() {
    if (!videoPrompt.trim()) { toast.error('Enter a prompt'); return }
    setVideoLoading(true)
    try {
      const res = await api.ai.generateVideo({ prompt: videoPrompt, duration: videoDuration }, session)
      setVideoJob(res)
      toast.success('Video job started — poll for status')
    } catch (e) { toast.error(e.message || 'Video generation failed — add Runway key in Settings') }
    setVideoLoading(false)
  }

  async function loadHistory() {
    try { const data = await api.ai.history(session); setHistory(data); setHistLoaded(true) }
    catch (_) {}
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); if(t==='history' && !histLoaded) loadHistory() }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors
              ${tab===t ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            {TAB_ICONS[t]} {t}
          </button>
        ))}
      </div>

      {/* Chat */}
      {tab === 'chat' && (
        <div className="card flex flex-col h-[calc(100vh-13rem)]">
          <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Provider:</p>
            <ProviderPill value={provider} onChange={setProvider} />
            <button onClick={() => setChatHistory([])} className="btn-ghost text-xs ml-auto">Clear</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatHistory.length === 0 && (
              <div className="text-center py-12">
                <p className="text-4xl mb-2">💬</p>
                <p className="text-gray-400 text-sm">Start a conversation with your AI assistant.</p>
              </div>
            )}
            {chatHistory.map((m, i) => (
              <div key={i} className={`flex ${m.role==='user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
                  ${m.role==='user' ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2.5 rounded-2xl">
                  <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}</div>
                </div>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex gap-2">
            <textarea className="input flex-1 resize-none text-sm" rows={2}
              placeholder="Ask anything…" value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }}} />
            <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} className="btn-primary self-end">Send</button>
          </div>
        </div>
      )}

      {/* Text generation */}
      {tab === 'text' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Generate text</h3>
              <ProviderPill value={provider} onChange={setProvider} />
            </div>
            <div>
              <label className="label">Prompt</label>
              <textarea className="input resize-none" rows={5} placeholder="Write a LinkedIn post about my experience with FastAPI and Docker…" value={textPrompt} onChange={e => setTextPrompt(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Tone</label>
                <select className="input" value={tone} onChange={e => setTone(e.target.value)}>
                  {TONES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Length</label>
                <select className="input" value={length} onChange={e => setLength(e.target.value)}>
                  {LENGTHS.map(l => <option key={l} value={l} className="capitalize">{l}</option>)}
                </select>
              </div>
            </div>
            <button onClick={generateText} disabled={textLoading} className="btn-primary w-full justify-center">
              {textLoading ? 'Generating…' : '✍️ Generate'}
            </button>
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Output</p>
              {textOutput && (
                <button onClick={() => { navigator.clipboard.writeText(textOutput); toast.success('Copied!') }}
                  className="btn-ghost text-xs">Copy</button>
              )}
            </div>
            {textOutput ? (
              <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{textOutput}</div>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <p className="text-3xl mb-2">✍️</p>
                <p className="text-sm">Output will appear here</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image generation */}
      {tab === 'image' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Generate image</h3>
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">Uses OpenAI DALL·E 3 — requires OpenAI API key in Settings.</p>
            <div>
              <label className="label">Prompt</label>
              <textarea className="input resize-none" rows={5} placeholder="A minimalist workspace with a laptop, coffee, and soft morning light, photorealistic…" value={imagePrompt} onChange={e => setImagePrompt(e.target.value)} />
            </div>
            <div>
              <label className="label">Style</label>
              <select className="input" value={imageStyle} onChange={e => setImageStyle(e.target.value)}>
                <option value="natural">Natural</option>
                <option value="vivid">Vivid</option>
              </select>
            </div>
            <button onClick={generateImage} disabled={imageLoading} className="btn-primary w-full justify-center">
              {imageLoading ? 'Generating…' : '🎨 Generate image'}
            </button>
          </div>
          <div className="card p-5 flex items-center justify-center min-h-80">
            {imageLoading && <div className="text-center text-gray-400 animate-pulse"><p className="text-4xl mb-2">🎨</p><p className="text-sm">Creating your image…</p></div>}
            {imageUrl && !imageLoading && (
              <div className="w-full">
                <img src={imageUrl} alt="Generated" className="w-full rounded-xl" />
                <div className="flex gap-2 mt-3">
                  <a href={imageUrl} target="_blank" rel="noopener" className="btn-secondary flex-1 justify-center text-sm">Open</a>
                  <a href={imageUrl} download="generated.png" className="btn-secondary flex-1 justify-center text-sm">Download</a>
                </div>
              </div>
            )}
            {!imageUrl && !imageLoading && (
              <div className="text-center text-gray-400"><p className="text-4xl mb-2">🎨</p><p className="text-sm">Your image will appear here</p></div>
            )}
          </div>
        </div>
      )}

      {/* Video generation */}
      {tab === 'video' && (
        <div className="card p-5 max-w-xl space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Generate video</h3>
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">Uses Runway ML — requires RUNWAY_API_KEY in backend .env. Generation is async (30–120s).</p>
          <div>
            <label className="label">Prompt</label>
            <textarea className="input resize-none" rows={4} placeholder="A time-lapse of a city skyline transitioning from day to night, cinematic style…" value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)} />
          </div>
          <div>
            <label className="label">Duration: {videoDuration}s</label>
            <input type="range" min={5} max={10} step={5} value={videoDuration} onChange={e => setVideoDuration(parseInt(e.target.value))} className="w-full accent-brand-600" />
          </div>
          <button onClick={generateVideo} disabled={videoLoading} className="btn-primary w-full justify-center">
            {videoLoading ? 'Submitting job…' : '🎬 Generate video'}
          </button>
          {videoJob && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-sm">
              <p className="font-medium text-gray-700 dark:text-gray-300">Job submitted</p>
              <p className="text-gray-500 text-xs mt-1 font-mono">{videoJob.job_id}</p>
              <p className="text-gray-400 text-xs mt-1">{videoJob.message}</p>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        <div className="card divide-y divide-gray-100 dark:divide-gray-800">
          {!histLoaded && <div className="p-8 text-center text-gray-400 animate-pulse">Loading…</div>}
          {histLoaded && history.length === 0 && <div className="p-8 text-center text-gray-400">No AI prompts yet.</div>}
          {history.map(p => (
            <div key={p.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <span className="badge bg-brand-50 dark:bg-brand-900/30 text-brand-600 capitalize">{p.provider}</span>
                <span className="badge bg-gray-100 dark:bg-gray-800 text-gray-500 capitalize">{p.feature}</span>
                <span className="text-xs text-gray-400 ml-auto">{new Date(p.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{p.prompt}</p>
              <p className="text-xs text-gray-400 mt-0.5">{p.model}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
