'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Settings,
  Zap,
  BarChart2,
  Inbox,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { UserButton, useOrganization } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { NotificationBell } from '@/components/notifications/NotificationBell'

const NAV_ITEMS = [
  { href: '/dashboard',   label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/jobs',        label: 'Jobs',       icon: Briefcase },
  { href: '/candidates',  label: 'Candidates', icon: Users },
  { href: '/sourcing',    label: 'Sourcing',   icon: Search },
  { href: '/analytics',   label: 'Analytics',  icon: BarChart2 },
  { href: '/inbox',       label: 'Inbox',      icon: Inbox },
  { href: '/settings',    label: 'Settings',   icon: Settings },
]

const LS_KEY = 'rs_sidebar_collapsed'

export function Sidebar() {
  const pathname                    = usePathname()
  const { organization }            = useOrganization()
  const [collapsed, setCollapsed]   = useState(false)
  const [hydrated,  setHydrated]    = useState(false)

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(LS_KEY) === 'true')
    } catch {}
    setHydrated(true)
  }, [])

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(LS_KEY, String(next)) } catch {}
      return next
    })
  }

  // Avoid layout flash before hydration
  const w = !hydrated ? 'w-60' : collapsed ? 'w-16' : 'w-60'

  return (
    <aside
      className={`relative flex h-screen flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ease-in-out ${w} shrink-0`}
    >
      {/* Logo */}
      <div className={`flex border-b border-slate-100 ${collapsed ? 'h-16 flex-col items-center justify-center gap-0.5 px-2' : 'h-14 items-center px-4'}`}>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600">
          <Zap className="h-3.5 w-3.5 text-white" />
        </div>
        {collapsed ? (
          <div className="flex flex-col items-center leading-none select-none mt-1">
            <span className="text-[7px] font-semibold text-slate-500 tracking-tight">Recruiter</span>
            <span className="text-[7px] font-semibold text-slate-500 tracking-tight">Stack</span>
          </div>
        ) : (
          <span className="ml-2.5 truncate text-sm font-bold tracking-tight text-slate-900">
            RecruiterStack
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon
                className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`}
              />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Footer — user + org + notifications */}
      {!collapsed && (
        <div className="border-t border-slate-100 px-4 py-4">
          <div className="flex items-center gap-3">
            <UserButton afterSignOutUrl="/sign-in" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-700">
                {organization?.name ?? 'RecruiterStack'}
              </p>
              <p className="text-xs text-slate-400">Coming Soon</p>
            </div>
            <NotificationBell />
          </div>
        </div>
      )}
      {collapsed && (
        <div className="flex flex-col items-center gap-3 border-t border-slate-100 py-4">
          <UserButton afterSignOutUrl="/sign-in" />
          <NotificationBell collapsed />
        </div>
      )}

      {/* Collapse toggle — sits on the right edge */}
      <button
        onClick={toggleCollapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-[52px] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-700"
      >
        {collapsed
          ? <ChevronRight className="h-3 w-3" />
          : <ChevronLeft  className="h-3 w-3" />
        }
      </button>
    </aside>
  )
}
