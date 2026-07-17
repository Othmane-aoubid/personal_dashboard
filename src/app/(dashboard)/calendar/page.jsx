'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { EVENT_COLORS, formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'

// ── Holiday data ───────────────────────────────────────────────────────────────

function getNthWeekday(year, month, weekday, nth) {
  const d = new Date(year, month - 1, 1)
  let count = 0
  while (d.getMonth() === month - 1) {
    if (d.getDay() === weekday && ++count === nth)
      return `${year}-${String(month).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    d.setDate(d.getDate() + 1)
  }
  return null
}

function pad2(n) { return String(n).padStart(2, '0') }

function getHolidays(year) {
  const list = []
  const add = (date, title, emoji, category) => date && list.push({ date, title, emoji, category })

  // Fixed international
  add(`${year}-01-01`, "New Year's Day",              '🎆', 'international')
  add(`${year}-02-14`, "Valentine's Day",              '❤️',  'international')
  add(`${year}-03-08`, "International Women's Day",    '👩',  'international')
  add(`${year}-10-31`, "Halloween",                    '🎃', 'international')
  add(`${year}-12-24`, "Christmas Eve",                '🎄', 'international')
  add(`${year}-12-25`, "Christmas Day",                '🎁', 'international')
  add(`${year}-12-31`, "New Year's Eve",               '🥂', 'international')

  // Dynamic international
  add(getNthWeekday(year, 5, 0, 2),  "Mother's Day",  '🌸', 'international')
  add(getNthWeekday(year, 6, 0, 3),  "Father's Day",  '👔', 'international')

  // Moroccan national holidays (fixed dates)
  add(`${year}-01-11`, "Manifesto of Independence",          '🇲🇦', 'morocco')
  add(`${year}-05-01`, "Labour Day",                         '⚒️',  'morocco')
  add(`${year}-07-30`, "Feast of the Throne",                '👑',  'morocco')
  add(`${year}-08-14`, "Oued Ed-Dahab Day",                  '🇲🇦', 'morocco')
  add(`${year}-08-20`, "Revolution of the King and People",  '🇲🇦', 'morocco')
  add(`${year}-08-21`, "Youth Day",                          '🧡', 'morocco')
  add(`${year}-11-06`, "Green March Day",                    '🇲🇦', 'morocco')
  add(`${year}-11-18`, "Independence Day",                   '🇲🇦', 'morocco')

  // Islamic holidays (pre-computed 2024–2028, approximate)
  const islamic = {
    2024: [
      ['2024-04-10', 'Eid al-Fitr (1st day)', '🌙'],
      ['2024-04-11', 'Eid al-Fitr (2nd day)', '🌙'],
      ['2024-06-16', 'Eid al-Adha (1st day)', '🐑'],
      ['2024-06-17', 'Eid al-Adha (2nd day)', '🐑'],
      ['2024-07-07', 'Islamic New Year',       '🌙'],
      ['2024-09-15', "Prophet's Birthday",     '🕌'],
    ],
    2025: [
      ['2025-03-30', 'Eid al-Fitr (1st day)', '🌙'],
      ['2025-03-31', 'Eid al-Fitr (2nd day)', '🌙'],
      ['2025-06-06', 'Eid al-Adha (1st day)', '🐑'],
      ['2025-06-07', 'Eid al-Adha (2nd day)', '🐑'],
      ['2025-06-26', 'Islamic New Year',       '🌙'],
      ['2025-09-04', "Prophet's Birthday",     '🕌'],
    ],
    2026: [
      ['2026-03-20', 'Eid al-Fitr (1st day)', '🌙'],
      ['2026-03-21', 'Eid al-Fitr (2nd day)', '🌙'],
      ['2026-05-27', 'Eid al-Adha (1st day)', '🐑'],
      ['2026-05-28', 'Eid al-Adha (2nd day)', '🐑'],
      ['2026-06-16', 'Islamic New Year',       '🌙'],
      ['2026-08-25', "Prophet's Birthday",     '🕌'],
    ],
    2027: [
      ['2027-03-09', 'Eid al-Fitr (1st day)', '🌙'],
      ['2027-03-10', 'Eid al-Fitr (2nd day)', '🌙'],
      ['2027-05-16', 'Eid al-Adha (1st day)', '🐑'],
      ['2027-05-17', 'Eid al-Adha (2nd day)', '🐑'],
      ['2027-06-05', 'Islamic New Year',       '🌙'],
      ['2027-08-14', "Prophet's Birthday",     '🕌'],
    ],
    2028: [
      ['2028-02-26', 'Eid al-Fitr (1st day)', '🌙'],
      ['2028-05-04', 'Eid al-Adha (1st day)', '🐑'],
      ['2028-05-24', 'Islamic New Year',       '🌙'],
      ['2028-08-03', "Prophet's Birthday",     '🕌'],
    ],
  }
  ;(islamic[year] || []).forEach(([date, title, emoji]) => add(date, title, emoji, 'islamic'))

  return list
}

// ── Constants / helpers ────────────────────────────────────────────────────────

const COLORS      = ['blue','green','red','purple','orange','pink','yellow','gray']
const DAYS_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS      = ['January','February','March','April','May','June','July','August','September','October','November','December']
const HOUR_HEIGHT = 56   // px per hour in week / day grid

function isSameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
}
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}` }
function fmtHour(h)   { if(!h) return ''; return h<12 ? `${h} AM` : h===12 ? '12 PM' : `${h-12} PM` }
function fmtTime(s)   { return new Date(s).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) }

function weekStart(d) {
  const r = new Date(d); r.setDate(r.getDate()-r.getDay()); r.setHours(0,0,0,0); return r
}

// ── Modal ──────────────────────────────────────────────────────────────────────

function Modal({ open, onClose, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { data: session } = useSession()
  const [view, setView]   = useState('month')
  const [current, setCurrent] = useState(new Date())
  const [events, setEvents]   = useState([])
  const [now, setNow]         = useState(new Date())
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm] = useState({
    title:'', description:'', location:'', start_at:'', end_at:'',
    color:'blue', calendar_type:'personal', all_day:false,
  })
  const scrollRef = useRef(null)

  const year     = current.getFullYear()
  const month    = current.getMonth()
  const today    = new Date()
  const holidays = [...getHolidays(year), ...getHolidays(year+1), ...getHolidays(year-1)]

  // Tick clock every minute
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Auto-scroll to current hour on week/day open
  useEffect(() => {
    if ((view === 'week' || view === 'day') && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, (now.getHours() - 1) * HOUR_HEIGHT)
    }
  }, [view])

  useEffect(() => { if (session) loadEvents() }, [session, current, view])

  async function loadEvents() {
    try {
      let start, end
      if (view === 'month') {
        start = new Date(year, month-1, 1)
        end   = new Date(year, month+2, 0)
      } else if (view === 'week') {
        start = weekStart(current)
        end   = new Date(start); end.setDate(start.getDate()+7)
      } else if (view === 'day') {
        start = new Date(current); start.setHours(0,0,0,0)
        end   = new Date(current); end.setHours(23,59,59,999)
      } else {
        start = new Date(year, month, 1)
        end   = new Date(year, month+2, 0)
      }
      const data = await api.events.list({ start: start.toISOString(), end: end.toISOString() }, session)
      setEvents(data)
    } catch (_) {}
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function openNew(defaultDate = null, defaultHour = 9) {
    const d = defaultDate ? new Date(defaultDate) : new Date(current)
    if (defaultDate) d.setHours(defaultHour, 0, 0, 0)
    const fmt = dt => `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`
    const e = new Date(d); e.setHours(d.getHours()+1)
    setForm({ title:'', description:'', location:'', start_at:fmt(d), end_at:fmt(e), color:'blue', calendar_type:'personal', all_day:false })
    setEditing(null); setShowModal(true)
  }

  function openEdit(ev) {
    const fmt = s => s ? s.slice(0,16) : ''
    setForm({ title:ev.title, description:ev.description||'', location:ev.location||'',
      start_at:fmt(ev.start_at), end_at:fmt(ev.end_at), color:ev.color||'blue',
      calendar_type:ev.calendar_type||'personal', all_day:ev.all_day||false })
    setEditing(ev.id); setShowModal(true)
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Title required'); return }
    try {
      if (editing) { await api.events.update(editing, form, session); toast.success('Updated') }
      else         { await api.events.create(form, session);          toast.success('Created') }
      setShowModal(false); loadEvents()
    } catch (e) { toast.error(e.message) }
  }

  async function handleDelete(id) {
    const tid = id || editing; if (!tid) return
    if (!confirm('Delete this event?')) return
    try { await api.events.delete(tid, session); toast.success('Deleted'); if (!id) setShowModal(false); loadEvents() }
    catch (e) { toast.error(e.message) }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function prev() {
    if (view==='month') setCurrent(new Date(year, month-1, 1))
    else if (view==='week') { const d=new Date(current); d.setDate(d.getDate()-7); setCurrent(d) }
    else { const d=new Date(current); d.setDate(d.getDate()-1); setCurrent(d) }
  }
  function next() {
    if (view==='month') setCurrent(new Date(year, month+1, 1))
    else if (view==='week') { const d=new Date(current); d.setDate(d.getDate()+7); setCurrent(d) }
    else { const d=new Date(current); d.setDate(d.getDate()+1); setCurrent(d) }
  }

  function navLabel() {
    if (view==='month')  return `${MONTHS[month]} ${year}`
    if (view==='day')    return `${MONTHS[month]} ${current.getDate()}, ${year}`
    const ws = weekStart(current)
    const we = new Date(ws); we.setDate(ws.getDate()+6)
    return ws.getMonth()===we.getMonth()
      ? `${MONTHS[ws.getMonth()]} ${ws.getFullYear()}`
      : `${MONTHS[ws.getMonth()].slice(0,3)} – ${MONTHS[we.getMonth()].slice(0,3)} ${we.getFullYear()}`
  }

  // ── Data helpers ───────────────────────────────────────────────────────────

  function eventsForDay(d)  { return events.filter(ev => isSameDay(new Date(ev.start_at), d)) }
  function holidaysForDay(d){ return holidays.filter(h => h.date === toDateStr(d)) }

  function evPos(ev) {
    const s = new Date(ev.start_at), e = new Date(ev.end_at)
    const sm = s.getHours()*60 + s.getMinutes()
    const dm = Math.max((e.getHours()*60 + e.getMinutes()) - sm, 30)
    return { top: (sm/60)*HOUR_HEIGHT, height: (dm/60)*HOUR_HEIGHT - 2 }
  }

  const nowTop = (now.getHours() + now.getMinutes()/60) * HOUR_HEIGHT

  // ── Week days ──────────────────────────────────────────────────────────────

  const ws = weekStart(current)
  const weekDays = Array.from({length:7}, (_,i) => { const d=new Date(ws); d.setDate(ws.getDate()+i); return d })

  // ── Month grid ─────────────────────────────────────────────────────────────

  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const cells = [...Array(firstDay).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)]
  while (cells.length % 7) cells.push(null)

  // ── Category badge ─────────────────────────────────────────────────────────

  function catBadge(cat) {
    const cls = {
      morocco:       'bg-red-50   text-red-600   dark:bg-red-900/30   dark:text-red-400',
      islamic:       'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400',
      international: 'bg-gray-100 text-gray-500  dark:bg-gray-800     dark:text-gray-400',
    }
    return cls[cat] || cls.international
  }

  // ── Time grid (shared for week/day) ────────────────────────────────────────

  function TimeColumn({ d }) {
    const isToday  = isSameDay(d, today)
    const dayEvs   = eventsForDay(d)
    return (
      <div className={`flex-1 relative border-r border-gray-100 dark:border-gray-800 min-w-0 ${isToday ? 'bg-blue-50/20 dark:bg-blue-900/10' : ''}`}
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          const hour = Math.floor((e.clientY - rect.top) / HOUR_HEIGHT)
          openNew(d, Math.max(0, Math.min(23, hour)))
        }}>
        {/* Hour lines */}
        {Array.from({length:24}).map((_,h) => (
          <div key={h} style={{height:HOUR_HEIGHT}} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors" />
        ))}
        {/* Current time indicator */}
        {isToday && (
          <div className="absolute left-0 right-0 flex items-center pointer-events-none z-20" style={{top:nowTop}}>
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 -ml-1" />
            <div className="flex-1 h-px bg-red-500" />
          </div>
        )}
        {/* Events */}
        {dayEvs.map(ev => {
          const {top, height} = evPos(ev)
          return (
            <div key={ev.id}
              onClick={e => { e.stopPropagation(); openEdit(ev) }}
              className={`absolute inset-x-0.5 rounded-lg px-1.5 py-1 text-white text-xs cursor-pointer hover:opacity-90 overflow-hidden z-10 ${EVENT_COLORS[ev.color]||'bg-brand-500'}`}
              style={{top:top+1, height:height-1}}>
              <p className="font-medium leading-tight truncate">{ev.title}</p>
              {height > 32 && <p className="opacity-80 leading-tight">{fmtTime(ev.start_at)}</p>}
            </div>
          )
        })}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col fade-in" style={{height:'calc(100vh - 8rem)'}}>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <button className="btn-secondary px-2 py-1.5" onClick={prev}>‹</button>
          <span className="font-semibold text-gray-900 dark:text-white min-w-[210px] text-center">{navLabel()}</span>
          <button className="btn-secondary px-2 py-1.5" onClick={next}>›</button>
          <button className="btn-ghost text-xs" onClick={() => { setCurrent(new Date()); setView('day') }}>Today</button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
            {['month','week','day','agenda'].map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 font-medium capitalize transition-colors
                  ${view===v ? 'bg-brand-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                {v}
              </button>
            ))}
          </div>
          <button onClick={() => openNew()} className="btn-primary">+ Event</button>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-3 mb-2 text-xs shrink-0">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-brand-500 inline-block"/> Your events</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"/> Holidays</span>
        <span className="flex items-center gap-1 text-gray-400">🇲🇦 Moroccan · 🌙 Islamic · 🎉 International</span>
      </div>

      {/* ── MONTH VIEW ── */}
      {view === 'month' && (
        <div className="flex-1 card overflow-hidden flex flex-col min-h-0">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-800 shrink-0">
            {DAYS_SHORT.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">{d}</div>
            ))}
          </div>
          {/* Grid cells */}
          <div className="flex-1 overflow-auto grid grid-cols-7" style={{gridTemplateRows:`repeat(${cells.length/7}, minmax(100px,1fr))`}}>
            {cells.map((day, i) => {
              const cellDate  = day ? new Date(year, month, day) : null
              const isToday   = cellDate && isSameDay(cellDate, today)
              const dayEvs    = cellDate ? eventsForDay(cellDate) : []
              const dayHols   = cellDate ? holidaysForDay(cellDate) : []
              const isWeekend = [0,6].includes(i % 7)
              return (
                <div key={i}
                  onClick={() => day && openNew(new Date(year, month, day, 9, 0))}
                  className={`p-1.5 border-b border-r border-gray-100 dark:border-gray-800 cursor-pointer transition-colors
                    ${!day ? 'bg-gray-50/60 dark:bg-gray-900/40 cursor-default' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}
                    ${isWeekend && day ? 'bg-gray-50/40 dark:bg-gray-900/20' : ''}`}>
                  {day && (
                    <>
                      <span className={`inline-flex w-6 h-6 items-center justify-center text-xs rounded-full font-semibold mb-0.5
                        ${isToday ? 'bg-brand-600 text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                        {day}
                      </span>
                      {/* Holidays */}
                      {dayHols.map((h, hi) => (
                        <div key={hi} className="text-xs px-1 py-0.5 rounded mb-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 truncate leading-tight cursor-default"
                          onClick={e => e.stopPropagation()} title={h.title}>
                          {h.emoji} {h.title}
                        </div>
                      ))}
                      {/* User events */}
                      {dayEvs.slice(0, Math.max(0, 3 - dayHols.length)).map(ev => (
                        <div key={ev.id}
                          onClick={e => { e.stopPropagation(); openEdit(ev) }}
                          className={`text-white text-xs px-1.5 py-0.5 rounded truncate mb-0.5 cursor-pointer hover:opacity-80 ${EVENT_COLORS[ev.color]||'bg-brand-500'}`}>
                          {ev.title}
                        </div>
                      ))}
                      {(dayEvs.length + dayHols.length > 3) && (
                        <div className="text-xs text-gray-400 pl-1">+{dayEvs.length + dayHols.length - 3} more</div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── WEEK VIEW ── */}
      {view === 'week' && (
        <div className="flex-1 card overflow-hidden flex flex-col min-h-0">
          {/* Day headers */}
          <div className="flex shrink-0 border-b border-gray-200 dark:border-gray-800">
            <div style={{width:52}} className="shrink-0 border-r border-gray-200 dark:border-gray-800" />
            {weekDays.map((d, i) => {
              const isToday = isSameDay(d, today)
              const dayHols = holidaysForDay(d)
              return (
                <div key={i}
                  className={`flex-1 min-w-0 px-1 py-2 text-center border-r border-gray-100 dark:border-gray-800 cursor-pointer
                    ${isToday ? 'bg-brand-50 dark:bg-brand-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'}`}
                  onClick={() => { setCurrent(d); setView('day') }}>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">{DAYS_SHORT[d.getDay()]}</p>
                  <div className={`text-xl font-bold mx-auto w-9 h-9 flex items-center justify-center rounded-full transition-colors
                    ${isToday ? 'bg-brand-600 text-white' : 'text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                    {d.getDate()}
                  </div>
                  {dayHols.slice(0,1).map((h,hi) => (
                    <p key={hi} className="text-xs text-emerald-600 dark:text-emerald-400 truncate mt-0.5">{h.emoji} {h.title}</p>
                  ))}
                  {dayHols.length > 1 && <p className="text-xs text-emerald-600 dark:text-emerald-400">+{dayHols.length-1} more</p>}
                </div>
              )
            })}
          </div>
          {/* Time grid */}
          <div className="flex-1 overflow-y-auto" ref={scrollRef}>
            <div className="flex" style={{height:`${24*HOUR_HEIGHT}px`}}>
              {/* Hour labels */}
              <div style={{width:52}} className="shrink-0 border-r border-gray-200 dark:border-gray-800">
                {Array.from({length:24}).map((_,h) => (
                  <div key={h} style={{height:HOUR_HEIGHT}} className="border-b border-gray-100 dark:border-gray-800 flex items-start justify-end pr-1.5 pt-0.5">
                    <span className="text-xs text-gray-400 whitespace-nowrap">{fmtHour(h)}</span>
                  </div>
                ))}
              </div>
              {/* Day columns */}
              {weekDays.map((d, i) => <TimeColumn key={i} d={d} />)}
            </div>
          </div>
        </div>
      )}

      {/* ── DAY VIEW ── */}
      {view === 'day' && (
        <div className="flex-1 card overflow-hidden flex flex-col min-h-0">
          {/* Day header */}
          <div className="flex shrink-0 border-b border-gray-200 dark:border-gray-800">
            <div style={{width:52}} className="shrink-0 border-r border-gray-200 dark:border-gray-800" />
            <div className={`flex-1 px-4 py-3 ${isSameDay(current,today) ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}>
              <div className="flex items-center gap-3">
                <div className={`text-3xl font-bold w-12 h-12 flex items-center justify-center rounded-full
                  ${isSameDay(current,today) ? 'bg-brand-600 text-white' : 'text-gray-800 dark:text-gray-200'}`}>
                  {current.getDate()}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{DAYS_SHORT[current.getDay()]}, {MONTHS[month]} {current.getDate()}, {year}</p>
                  <div className="flex gap-2 flex-wrap mt-0.5">
                    {holidaysForDay(current).map((h, hi) => (
                      <span key={hi} className="text-xs text-emerald-600 dark:text-emerald-400">{h.emoji} {h.title}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Time grid */}
          <div className="flex-1 overflow-y-auto" ref={scrollRef}>
            <div className="flex" style={{height:`${24*HOUR_HEIGHT}px`}}>
              <div style={{width:52}} className="shrink-0 border-r border-gray-200 dark:border-gray-800">
                {Array.from({length:24}).map((_,h) => (
                  <div key={h} style={{height:HOUR_HEIGHT}} className="border-b border-gray-100 dark:border-gray-800 flex items-start justify-end pr-1.5 pt-0.5">
                    <span className="text-xs text-gray-400 whitespace-nowrap">{fmtHour(h)}</span>
                  </div>
                ))}
              </div>
              <TimeColumn d={current} />
            </div>
          </div>
        </div>
      )}

      {/* ── AGENDA VIEW ── */}
      {view === 'agenda' && (
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Upcoming holidays */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Upcoming observances</h3>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {holidays
                .filter(h => h.date >= toDateStr(today))
                .sort((a,b) => a.date.localeCompare(b.date))
                .slice(0, 10)
                .map((h, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5">
                    <span className="text-xl w-8 text-center">{h.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{h.title}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(h.date+'T12:00:00').toLocaleDateString('en',{weekday:'short',month:'long',day:'numeric',year:'numeric'})}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${catBadge(h.category)}`}>{h.category}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* User events */}
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Your events</h3>
            </div>
            {events.length === 0
              ? <div className="p-8 text-center text-gray-400">No events this period.</div>
              : events
                  .sort((a,b) => a.start_at.localeCompare(b.start_at))
                  .map(ev => (
                <div key={ev.id}
                  className="group flex items-start gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                  onClick={() => openEdit(ev)}>
                  <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${EVENT_COLORS[ev.color]||'bg-brand-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{ev.title}</p>
                    {ev.description && <p className="text-gray-400 text-xs mt-0.5 truncate">{ev.description}</p>}
                    {ev.location    && <p className="text-gray-400 text-xs mt-0.5">📍 {ev.location}</p>}
                  </div>
                  <div className="text-right text-xs text-gray-400 shrink-0">
                    <p>{formatDateTime(ev.start_at)}</p>
                    <p className="capitalize mt-0.5">{ev.calendar_type}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); handleDelete(ev.id) }}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-lg self-center ml-1">🗑</button>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ── Event modal ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-900 dark:text-white">{editing ? 'Edit event' : 'New event'}</h3>
          <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">Title *</label>
            <input className="input" placeholder="Event title" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Start</label><input type="datetime-local" className="input" value={form.start_at} onChange={e => setForm(f=>({...f,start_at:e.target.value}))} /></div>
            <div><label className="label">End</label><input type="datetime-local" className="input" value={form.end_at} onChange={e => setForm(f=>({...f,end_at:e.target.value}))} /></div>
          </div>
          <div><label className="label">Location</label><input className="input" placeholder="Optional" value={form.location} onChange={e => setForm(f=>({...f,location:e.target.value}))} /></div>
          <div><label className="label">Description</label><textarea className="input resize-none" rows={2} value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} /></div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">Calendar</label>
              <select className="input" value={form.calendar_type} onChange={e => setForm(f=>({...f,calendar_type:e.target.value}))}>
                {['personal','work','finance'].map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Color</label>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setForm(f=>({...f,color:c}))}
                    className={`w-6 h-6 rounded-full ${EVENT_COLORS[c]} ${form.color===c ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          {editing && <button onClick={() => handleDelete()} className="btn-danger">Delete</button>}
          <button onClick={() => setShowModal(false)} className="btn-secondary ml-auto">Cancel</button>
          <button onClick={handleSave} className="btn-primary">Save</button>
        </div>
      </Modal>
    </div>
  )
}
