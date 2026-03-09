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
} from 'lucide-react'
import { UserButton, useOrganization } from '@clerk/nextjs'

const NAV_ITEMS = [
  { href: '/dashboard',   label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/jobs',        label: 'Jobs',       icon: Briefcase },
  { href: '/candidates',  label: 'Candidates', icon: Users },
  { href: '/analytics',  label: 'Analytics',  icon: BarChart2 },
  { href: '/inbox',       label: 'Inbox',      icon: Inbox },
  { href: '/settings',    label: 'Settings',   icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { organization } = useOrganization()

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-slate-200 bg-white">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-slate-100">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <span className="text-base font-bold tracking-tight text-slate-900">
          RecruiterStack
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon
                className={`h-4.5 w-4.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`}
                size={18}
              />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer — user + org */}
      <div className="border-t border-slate-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <UserButton afterSignOutUrl="/sign-in" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-700">
              {organization?.name ?? 'RecruiterStack'}
            </p>
            <p className="text-xs text-slate-400">ATS</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
