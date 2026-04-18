'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Zap, Menu, X } from 'lucide-react'

const NAV_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/agents',   label: 'Agents'   },
  { href: '/pricing',  label: 'Pricing'  },
  { href: '/blog',     label: 'Blog'     },
  { href: '/about',    label: 'About'    },
]

export function MarketingNav() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 border-b border-emerald-800 bg-emerald-900 text-white shadow-xl shadow-emerald-900/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 shadow-sm group-hover:scale-105 transition-transform">
            <Zap className="h-3.5 w-3.5 text-emerald-950" />
          </div>
          <span className="text-sm font-bold tracking-tight text-white group-hover:text-emerald-100 transition-colors">RecruiterStack</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-emerald-100/80 hover:text-white hover:bg-emerald-800 transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/sign-in"
            className="rounded-lg px-4 py-2 text-sm font-medium text-emerald-100/80 hover:text-white hover:bg-emerald-800 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 shadow-sm transition-colors"
          >
            Get started
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-emerald-200 hover:text-white hover:bg-emerald-800 rounded-lg transition-colors"
          onClick={() => setOpen(prev => !prev)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-emerald-800 bg-emerald-900 px-6 py-4 space-y-1 shadow-2xl">
          {NAV_LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-emerald-100 hover:text-white hover:bg-emerald-800 transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <div className="pt-3 border-t border-emerald-800 flex flex-col gap-2">
            <Link
              href="/sign-in"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-emerald-100 hover:text-white hover:bg-emerald-800 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              onClick={() => setOpen(false)}
              className="block rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 text-center hover:bg-emerald-50 transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
