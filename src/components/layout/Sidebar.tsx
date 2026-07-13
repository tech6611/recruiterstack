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
  BarChart2,
  Coins,
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
import { useCapabilities } from '@/components/providers/CapabilitiesProvider'
import { BrandMark } from '@/components/layout/BrandMark'
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
      // Requisitions (the approved-headcount object) get their own nav home so
      // they're discoverable, not buried behind a Jobs-header button. They sit
      // right above Jobs because a requisition is upstream of a job pipeline.
      { href: '/openings',   label: 'Requisitions', icon: ClipboardList, cap: 'recruiting:view' },
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
      { href: '/admin/permissions', label: 'Permissions',   icon: UserCog,       cap: 'settings:edit' },
      { href: '/admin/ai-usage',  label: 'AI usage & cost', icon: Coins,         cap: 'settings:edit' },
      { href: '/settings',        label: 'Settings',        icon: Settings,      cap: 'settings:view' },
    ],
  },
]

const OPEN_DELAY_MS  = 150
const CLOSE_DELAY_MS = 120

export function Sidebar() {
  const pathname              = usePathname()
  const { organization }      = useOrganization()
  // Capabilities come from the shared provider (one /api/me for the whole
  // dashboard) so the sidebar doesn't flash chrome in after its own late fetch.
  const { capabilities: caps } = useCapabilities()
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen]   = useState(false)
  // Count of approval decisions waiting on the current user, shown as a badge on
  // the Approvals nav item. Mirrors the NotificationBell's polling cadence.
  const [approvalsCount, setApprovalsCount] = useState(0)

  const canViewApprovals = caps?.has('approvals:view') ?? false
  useEffect(() => {
    if (!canViewApprovals) { setApprovalsCount(0); return }
    let cancelled = false
    const fetchCount = () =>
      fetch('/api/approvals/inbox')
        .then(r => r.json())
        .then(j => { if (!cancelled) setApprovalsCount((j.data ?? []).length) })
        .catch(() => { /* non-critical */ })
    fetchCount()
    const id = setInterval(fetchCount, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [canViewApprovals, pathname])

  // Badge count for a given nav item (0 = no badge). Only Approvals carries one.
  const itemBadge = (href: string) => (href === '/approvals/inbox' ? approvalsCount : 0)

  const openTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    const cls = `flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-base font-semibold transition-colors ${
      active
        ? 'bg-white/10 text-[#fdfbf7]'
        : 'text-[#c8beac] hover:bg-white/5 hover:text-[#fdfbf7]'
    }`
    // A bucket shows a small red dot when one of its (collapsed) flyout items has
    // a pending count, so the badge is noticeable without opening the flyout.
    const bucketBadge = s.items.reduce((n, it) => n + itemBadge(it.href), 0)
    const inner = (
      <>
        <span className="relative shrink-0">
          <Icon className={`h-5 w-5 ${active ? 'text-[#fdfbf7]' : 'text-[#9a8f7b]'}`} />
          {bucketBadge > 0 && !isOpen && (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#221b14]" />
          )}
        </span>
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
                const badge      = itemBadge(href)
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
                    {badge > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
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
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#aa9e87]">
                {s.section}
              </p>
            )}
            <div className="space-y-0.5">
              {(s.items.length === 0 && s.href
                ? [{ href: s.href, label: s.section, icon: s.icon }]
                : s.items
              ).map(({ href, label, icon: ItemIcon }) => {
                const active = isItemActive(href)
                const badge  = itemBadge(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-base font-semibold transition-colors ${
                      active
                        ? 'bg-white/10 text-[#fdfbf7]'
                        : 'text-[#c8beac] hover:bg-white/5 hover:text-[#fdfbf7]'
                    }`}
                  >
                    <ItemIcon className={`h-5 w-5 shrink-0 ${active ? 'text-[#fdfbf7]' : 'text-[#9a8f7b]'}`} />
                    <span className="truncate">{label}</span>
                    {badge > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
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
      <aside className="relative hidden h-full w-[240px] shrink-0 flex-col border-r border-[#34291e] bg-[#221b14] md:flex">
        {/* Logo + notifications */}
        <div className="flex h-14 items-center gap-2 border-b border-white/10 px-3">
          <BrandMark className="h-[34px] w-[34px]" />
          <span className="min-w-0 flex-1 truncate font-display text-base font-bold tracking-tight text-[#fdfbf7]">
            Recruiter<span className="font-extrabold">Stack</span>
          </span>
          <div className="shrink-0">
            <NotificationBell align="top" />
          </div>
        </div>

        {/* Buckets. overflow-visible is required so flyouts (absolutely
            positioned to the right of each bucket) aren't clipped by the
            nav's overflow box. 7 buckets fit comfortably without scrolling. */}
        <nav className="flex-1 space-y-0.5 overflow-visible px-2 py-3">
          {sections.map(s => <Bucket key={s.section} s={s} />)}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 px-3 py-3">
          <div className="flex items-center gap-2">
            <UserButton afterSignOutUrl="/sign-in" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[#dcd2bf]">
                {organization?.name ?? 'RecruiterStack'}
              </p>
            </div>
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
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-[#34291e] bg-[#221b14] shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-3">
              <div className="flex items-center gap-2">
                <BrandMark className="h-[34px] w-[34px]" />
                <span className="truncate font-display text-base font-bold tracking-tight text-[#fdfbf7]">
                  Recruiter<span className="font-extrabold">Stack</span>
                </span>
              </div>
              <div className="flex items-center gap-1">
                <NotificationBell align="top" />
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#c8beac] hover:bg-white/10 hover:text-[#fdfbf7]"
                  aria-label="Close navigation"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <MobileDrawerBody />
            <div className="border-t border-white/10 px-4 py-3">
              <div className="flex items-center gap-3">
                <UserButton afterSignOutUrl="/sign-in" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[#dcd2bf]">
                    {organization?.name ?? 'RecruiterStack'}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
