'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV, isNavActive } from '@/lib/nav'
import { NotificationBell } from './NotificationBell'

/** Hamburger menu shown below the `lg` breakpoint; the desktop nav is hidden there. */
export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open])

  return (
    <div className="flex items-center gap-1 lg:hidden">
      <NotificationBell />
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
      >
        <span className="text-lg leading-none">{open ? '×' : '≡'}</span>
      </button>

      {open && (
        <>
          {/* click-outside catcher */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <nav className="absolute right-2 top-14 z-40 flex w-44 flex-col rounded-lg border border-border bg-surface py-1 shadow-xl">
            {NAV.map((n) => {
              const active = isNavActive(pathname, n.href)
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`px-4 py-2 font-prose text-sm hover:bg-surface-2 hover:text-fg ${
                    active ? 'bg-surface-2 text-fg' : 'text-fg-muted'
                  }`}
                >
                  {n.label}
                </Link>
              )
            })}
          </nav>
        </>
      )}
    </div>
  )
}
