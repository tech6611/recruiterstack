'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Kanban,
  Settings,
  Zap,
  ClipboardList,
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/',                  label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/hiring-requests',   label: 'Hiring',          icon: ClipboardList },
  { href: '/candidates',        label: 'Candidates',      icon: Users },
  { href: '/pipeline',          label: 'Pipeline',        icon: Kanban },
  { href: '/roles',             label: 'Roles',           icon: Briefcase },
  { href: '/settings',          label: 'Settings',        icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

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
            href === '/' ? pathname === '/' : pathname.startsWith(href)

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

      {/* Footer */}
      <div className="border-t border-slate-100 px-6 py-4">
        <p className="text-xs text-slate-400">Phase 4 · JD Generation</p>
      </div>
    </aside>
  )
}
