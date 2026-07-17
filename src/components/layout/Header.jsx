'use client'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { usePathname } from 'next/navigation'

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/calendar': 'Calendar',
  '/todos': 'To-Do',
  '/files': 'Files',
  '/financials': 'Financials',
  '/goals': 'Goals',
  '/studio': 'AI Studio',
  '/settings': 'Settings',
}

export default function Header() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] || 'Personal OS'
  const now = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div>
        <h1 className="font-semibold text-gray-900 dark:text-white">{title}</h1>
        <p className="text-xs text-gray-400">{now}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{session?.user?.name}</p>
          <p className="text-xs text-gray-400">{session?.user?.email}</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center text-white font-semibold text-sm">
          {session?.user?.name?.[0]?.toUpperCase() || '?'}
        </div>
      </div>
    </header>
  )
}
