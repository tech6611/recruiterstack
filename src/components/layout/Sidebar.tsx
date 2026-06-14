'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  UserCog,
  Network,
  Briefcase,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileText,
  LifeBuoy,
  CheckSquare,
  Wallet,
  Receipt,
  Settings,
  ShieldCheck,
  Zap,
  BarChart2,
  Inbox,
  Search,
  Mail,
  Target,
  Menu,
  X,
} from 'lucide-react'
import { UserButton, useOrganization } from '@clerk/nextjs'
import { useEffect, useRef, useState } from 'react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { flags } from '@/lib/flags'
import type { Capability } from '@/lib/permissions'

type IconType = typeof LayoutDashboard
type NavItem = { href: string; label: string; icon: IconType; cap?: Capability }
type NavSection = {
  section: string
  icon: IconType
  /** Direct route for buckets that don't open a flyout (e.g. Dashboard). */
  href?: string
  /** Empty array = no flyout (bucket navigates directly via `href`). */
  items: NavItem[]
  /** Capability gating the bucket's direct route (sections with items derive
   *  visibility from their visible items instead). */
  cap?: Capability
}

const NAV_SECTIONS: NavSection[] = [
  {
    section: 'Dashboard',
    icon:    LayoutDashboard,
    href:    '/dashboard',
    items:   [],
  },
  {
    section: 'Recruiting',
    icon:    Briefcase,
    items: [
      { href: '/openings',   label: 'Openings',   icon: ClipboardList, cap: 'openings:view' },
      { href: '/jobs',       label: 'Jobs',       icon: Briefcase,     cap: 'recruiting:view' },
      { href: '/candidates', label: 'Candidates', icon: Users,         cap: 'recruiting:view' },
      { href: '/sourcing',   label: 'Sourcing',   icon: Search,        cap: 'recruiting:view' },
      { href: '/sequences',  label: 'Sequences',  icon: Mail,          cap: 'recruiting:view' },
      { href: '/inbox',      label: 'Inbox',      icon: Inbox,         cap: 'recruiting:view' },
    ],
  },
  ...(flags.hris
    ? [{
        section:   'People',
        icon:      UserCog,
        items: [
          { href: '/hris/employees',      label: 'Employees',      icon: UserCog,        cap: 'people:view' },
          { href: '/hris/org-chart',      label: 'Org chart',      icon: Network,        cap: 'people:view' },
          { href: '/hris/onboarding',     label: 'Onboarding',     icon: ClipboardCheck, cap: 'onboarding:view' },
          { href: '/hris/okrs',           label: 'OKRs',           icon: Target,         cap: 'okrs:view' },
          { href: '/hris/documents',      label: 'Documents',      icon: FileText,       cap: 'documents:view' },
          { href: '/hris/cases',          label: 'HR cases',       icon: LifeBuoy,       cap: 'hr_cases:view' },
          { href: '/hris/leave-policies', label: 'Leave policies', icon: CalendarDays,   cap: 'leave:view' },
        ],
      } satisfies NavSection]
    : []),
  ...(flags.payroll
    ? [{
        section:   'Payroll',
        icon:      Wallet,
        items: [
          { href: '/payroll/runs',     label: 'Payroll runs', icon: Wallet,  cap: 'payroll:view' },
          { href: '/settings/payroll', label: 'Tax settings', icon: Receipt, cap: 'payroll:view' },
        ],
      } satisfies NavSection]
    : []),
  {
    section: 'Insights',
    icon:    BarChart2,
    items: [
      { href: '/analytics',        label: 'Analytics',        icon: BarChart2, cap: 'analytics:view' },
      { href: '/analytics/people', label: 'People analytics', icon: BarChart2, cap: 'people:view' },
    ],
  },
  {
    section:   'Admin',
    icon:      ShieldCheck,
    items: [
      { href: '/approvals/inbox', label: 'Approvals',       icon: CheckSquare,   cap: 'approvals:view' },
      { href: '/admin/approvals', label: 'Approval chains', icon: ClipboardList, cap: 'settings:edit' },
      { href: '/settings',        label: 'Settings',        icon: Settings,      cap: 'settings:view' },
    ],
  },
]

const OPEN_DELAY_MS  = 150
const CLOSE_DELAY_MS = 120

export function Sidebar() {
  const pathname              = usePathname()
  const { organization }      = useOrganization()
  const [caps, setCaps] = useState<Set<string> | null>(null)
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen]   = useState(false)

  const openTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch the viewer's capabilities so the sidebar shows only accessible
  // modules. Initial render assumes none, to avoid a flash of chrome the
  // member can't access.
  useEffect(() => {
    let alive = true
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (alive) setCaps(new Set<string>(j?.data?.capabilities ?? [])) })
      .catch(() => { if (alive) setCaps(new Set<string>()) })
    return () => { alive = false }
  }, [])

  useEffect(() => () => {
    if (openTimer.current)  clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  // Close any open flyout / mobile drawer on navigation.
  useEffect(() => { setOpenSection(null); setMobileOpen(false) }, [pathname])

  // A section with items shows iff it has ≥1 capability-visible item; a direct
  // bucket (Dashboard) shows if its own capability (if any) is held.
  const hasCap = (cap?: Capability) => !cap || (caps?.has(cap) ?? false)
  const sections = NAV_SECTIONS
    .map(s => ({ ...s, items: s.items.filter(it => hasCap(it.cap)) }))
    .filter(s => s.items.length > 0 || (!!s.href && hasCap(s.cap)))

  function scheduleOpen(name: string) {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    if (openSection === name) return
    if (openTimer.current) clearTimeout(openTimer.current)
    openTimer.current = setTimeout(() => setOpenSection(name), OPEN_DELAY_MS)
  }
  function scheduleClose() {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null }
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpenSection(null), CLOSE_DELAY_MS)
  }
  function cancelClose() {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }

  function isItemActive(href: string) {
    return href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)
  }
  function isSectionActive(s: NavSection) {
    if (s.href) return isItemActive(s.href)
    return s.items.some(i => isItemActive(i.href))
  }

  // ── Bucket row (rail) ────────────────────────────────────────────────
  function Bucket({ s }: { s: NavSection }) {
    const Icon      = s.icon
    const active    = isSectionActive(s)
    const hasFlyout = s.items.length > 0
    const isOpen    = openSection === s.section
    const cls = `flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-emerald-50 text-emerald-700'
        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
    }`
    const inner = (
      <>
        <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
        <span className="truncate">{s.section}</span>
      </>
    )

    function toggleClick() {
      if (openTimer.current)  { clearTimeout(openTimer.current);  openTimer.current  = null }
      if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
      setOpenSection(prev => prev === s.section ? null : s.section)
    }

    return (
      <div
        className="relative"
        onMouseEnter={() => hasFlyout ? scheduleOpen(s.section) : scheduleClose()}
        onMouseLeave={() => hasFlyout && scheduleClose()}
      >
        {s.href
          ? <Link  href={s.href} className={cls}>{inner}</Link>
          : <button type="button" className={cls} onClick={toggleClick} aria-haspopup="menu" aria-expanded={isOpen}>{inner}</button>}

        {hasFlyout && isOpen && (
          <div
            role="menu"
            className="absolute left-full top-0 z-50 ml-2 w-60 rounded-2xl border border-slate-200 bg-white py-2 shadow-xl"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {s.section}
            </p>
            <div className="space-y-0.5 px-1">
              {s.items.map(({ href, label, icon: ItemIcon }) => {
                const itemActive = isItemActive(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    role="menuitem"
                    className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors ${
                      itemActive
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <ItemIcon className={`h-[18px] w-[18px] shrink-0 ${itemActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span className="truncate">{label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Mobile drawer (full nested list) ─────────────────────────────────
  function MobileDrawerBody() {
    return (
      <nav className="flex-1 space-y-3 overflow-y-auto px-2 py-3">
        {sections.map(s => (
          <div key={s.section}>
            {s.section !== 'Dashboard' && (
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {s.section}
              </p>
            )}
            <div className="space-y-0.5">
              {(s.items.length === 0 && s.href
                ? [{ href: s.href, label: s.section, icon: s.icon }]
                : s.items
              ).map(({ href, label, icon: ItemIcon }) => {
                const active = isItemActive(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <ItemIcon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span className="truncate">{label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    )
  }

  return (
    <>
      {/* ── Desktop rail (md+) ─────────────────────────────────────────── */}
      <aside className="relative hidden h-screen w-[140px] shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b border-slate-100 px-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="truncate text-sm font-bold tracking-tight text-slate-900">
            RecruiterStack
          </span>
        </div>

        {/* Buckets. overflow-visible is required so flyouts (absolutely
            positioned to the right of each bucket) aren't clipped by the
            nav's overflow box. 7 buckets fit comfortably without scrolling. */}
        <nav className="flex-1 space-y-0.5 overflow-visible px-2 py-3">
          {sections.map(s => <Bucket key={s.section} s={s} />)}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-100 px-3 py-3">
          <div className="flex items-center gap-2">
            <UserButton afterSignOutUrl="/sign-in" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-700">
                {organization?.name ?? 'RecruiterStack'}
              </p>
            </div>
            <NotificationBell />
          </div>
        </div>
      </aside>

      {/* ── Mobile hamburger (below md) ─────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-4 w-4 text-slate-700" />
      </button>

      {/* ── Mobile drawer ──────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-slate-200 bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-slate-100 px-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600">
                  <Zap className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="truncate text-sm font-bold tracking-tight text-slate-900">
                  RecruiterStack
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <MobileDrawerBody />
            <div className="border-t border-slate-100 px-4 py-3">
              <div className="flex items-center gap-3">
                <UserButton afterSignOutUrl="/sign-in" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-700">
                    {organization?.name ?? 'RecruiterStack'}
                  </p>
                </div>
                <NotificationBell />
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
