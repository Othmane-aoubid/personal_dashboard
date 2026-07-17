import { clsx } from 'clsx'

export function cn(...inputs) {
  return clsx(inputs)
}

export function formatDate(dateStr, options = {}) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', ...options,
  })
}

export function formatDateTime(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export function formatCurrency(amount, currency = 'MAD') {
  return new Intl.NumberFormat('fr-MA', { style: 'currency', currency }).format(amount)
}

export function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return formatDate(dateStr)
}

export const PRIORITY_LABELS = { 0: 'Urgent', 1: 'High', 2: 'Normal', 3: 'Low' }
export const PRIORITY_COLORS = {
  0: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  1: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  2: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  3: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export const STATUS_COLORS = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  on_track: 'bg-green-100 text-green-700',
  at_risk: 'bg-orange-100 text-orange-700',
  completed: 'bg-emerald-100 text-emerald-700',
  abandoned: 'bg-red-100 text-red-600',
}

export const EVENT_COLORS = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
  pink: 'bg-pink-500',
  yellow: 'bg-yellow-400',
  gray: 'bg-gray-400',
}

export function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = typeof key === 'function' ? key(item) : item[key]
    ;(acc[k] = acc[k] || []).push(item)
    return acc
  }, {})
}

export function truncate(str, n = 60) {
  return str?.length > n ? str.slice(0, n) + '…' : str
}

export function fileIcon(ext) {
  const icons = {
    pdf: '📄', doc: '📝', docx: '📝', ppt: '📊', pptx: '📊',
    xls: '📈', xlsx: '📈', md: '📋', txt: '📋', csv: '📋',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
    mp4: '🎬', webm: '🎬', mov: '🎬', mp3: '🎵', wav: '🎵',
    json: '⚙️', zip: '📦',
  }
  return icons[ext?.toLowerCase()] || '📁'
}

export function formatBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}
