'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard',   label: 'Dashboard',   icon: '⚡' },
  { href: '/calendar',    label: 'Calendar',    icon: '📅' },
  { href: '/todos',       label: 'To-Do',       icon: '✅' },
  { href: '/files',       label: 'Files',       icon: '📁' },
  { href: '/financials',  label: 'Financials',  icon: '💰' },
  { href: '/goals',       label: 'Goals',       icon: '🎯' },
  { href: '/studio',      label: 'AI Studio',   icon: '✨' },
  { href: '/draw',        label: 'Draw',        icon: '✏️' },
  { href: '/media',       label: 'Media',       icon: '🎬' },
  { href: '/generate',    label: 'Generate',    icon: '📄' },
  { href: '/terminal',    label: 'Terminal',    icon: '💻' },
  { href: '/wiki',        label: 'Wiki',        icon: '📖' },
  { href: '/storage',     label: 'Storage',     icon: '💾' },
  { href: '/timeline',    label: 'Timeline',    icon: '📊' },
  { href: '/security',    label: 'Security',    icon: '🛡️' },
  { href: '/games',       label: 'Games',       icon: '🎮' },
]

const BOTTOM = [
  { href: '/settings',    label: 'Settings',    icon: '⚙️' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex flex-col w-60 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-200 dark:border-gray-800">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white text-sm">⚡</div>
        <span className="font-semibold text-gray-900 dark:text-white">Personal OS</span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              )}>
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-gray-200 dark:border-gray-800 space-y-0.5">
        {BOTTOM.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}
              className={cn('flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                active ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400'
                       : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800')}>
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
        <button onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors w-full text-left">
          <span className="text-base">🚪</span>
          Sign out
        </button>
      </div>
    </aside>
  )
}
