'use client'
import dynamic from 'next/dynamic'

const CommandPalette = dynamic(() => import('./CommandPalette'), { ssr: false })
const QuickCapture   = dynamic(() => import('./QuickCapture'),   { ssr: false })

export default function GlobalOverlays() {
  return (
    <>
      <CommandPalette />
      <QuickCapture />
    </>
  )
}
