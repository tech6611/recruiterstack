'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  UserCog,
  UserCircle,
  Network,
  Briefcase,
  Calendar,
  ClipboardList,
  CheckSquare,
  Clock,
  Settings,
  Zap,
  BarChart2,
  Inbox,
  Search,
  Mail,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { UserButton, useOrganization } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { flags } from '@/lib/flags'

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard }
type NavSection = { section: string | null; items: NavItem[]; adminOnly?: boolean }

// Grouped into platform modules so the suite structure is visible. Admin-only
// sections are filtered out at render time for non-admin viewers.
const NAV_SECTIONS: NavSection[] = [
  {
    section: null, // ungrouped top items
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  ...(flags.hris
    ? [{
        section: 'Me',
        items: [
          { href: '/me',           label: 'Overview',  icon: UserCircle },
          { href: '/me/time-off',  label: 'Time off',  icon: Calendar },
          { href: '/me/timeline',  label: 'Timeline',  icon: Clock },
          { href: '/me/approvals', label: 'Approvals', icon: Inbox },
        ],
      }]
    : []),
  {
    section: 'Recruiting',
    items: [
      { href: '/openings',   label: 'Openings',   icon: ClipboardList },
      { href: '/jobs',       label: 'Jobs',       icon: Briefcase },
      { href: '/req-jobs',   label: 'Pipelines',  icon: Briefcase },
      { href: '/candidates', label: 'Candidates', icon: Users },
      { href: '/sourcing',   label: 'Sourcing',   icon: Search },
      { href: '/sequences',  label: 'Sequences',  icon: Mail },
      { href: '/inbox',      label: 'Inbox',      icon: Inbox },
    ],
  },
  ...(flags.hris
    ? [{
        section: 'HRIS',
        adminOnly: true,
        items: [
          { href: '/hris/employees',  label: 'Employees', icon: UserCog },
          { href: '/hris/org-chart',  label: 'Org chart', icon: Network },
        ],
      }]
    : []),
  {
    section: 'Insights',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart2 },
    ],
  },
  {
    section: 'Admin',
    adminOnly: true,
    items: [
      { href: '/approvals/inbox', label: 'Approvals',       icon: CheckSquare },
      { href: '/admin/approvals', label: 'Approval chains', icon: ClipboardList },
      { href: '/settings',        label: 'Settings',        icon: Settings },
    ],
  },
]

const LS_KEY = 'rs_sidebar_collapsed'

export function Sidebar() {
  const pathname                    = usePathname()
  const { organization }            = useOrganization()
  const [collapsed, setCollapsed]   = useState(false)
  const [hydrated,  setHydrated]    = useState(false)
  const [isAdmin,   setIsAdmin]     = useState<boolean | null>(null)

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(LS_KEY) === 'true')
    } catch {}
    setHydrated(true)
  }, [])

  // Fetch admin status so we can hide admin-only sections (HRIS, Admin) for
  // non-admins. Until we know, optimistically show non-admin layout to avoid
  // a flash of admin sections for employees.
  useEffect(() => {
    let alive = true
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (alive) setIsAdmin(Boolean(j?.data?.is_admin)) })
      .catch(() => { if (alive) setIsAdmin(false) })
    return () => { alive = false }
  }, [])

  const sections = NAV_SECTIONS.filter(s => !s.adminOnly || isAdmin === true)

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
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600">
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
        {sections.map(({ section, items }, idx) => (
          <div key={section ?? `top-${idx}`} className={idx > 0 ? 'pt-3' : undefined}>
            {section && !collapsed && (
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {section}
              </p>
            )}
            {section && collapsed && idx > 0 && (
              <div className="mx-2 mb-1 border-t border-slate-100" />
            )}
            {items.map(({ href, label, icon: Icon }) => {
              const isActive =
                href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

              return (
                <Link
                  key={href}
                  href={href}
                  title={collapsed ? label : undefined}
                  className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}
                  />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              )
            })}
          </div>
        ))}
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
