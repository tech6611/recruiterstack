'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Check,
  CheckCheck,
  UserPlus,
  Calendar,
  Sparkles,
  ArrowRight,
  AlertCircle,
  Clock,
  Info,
} from 'lucide-react'
import { timeAgo } from '@/lib/ui/date-utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  read: boolean
  resource_type: string | null
  resource_id: string | null
  created_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  candidate_applied:    { icon: UserPlus,     color: 'bg-blue-500' },
  interview_scheduled:  { icon: Calendar,     color: 'bg-amber-500' },
  score_complete:       { icon: Sparkles,     color: 'bg-violet-500' },
  stage_moved:          { icon: ArrowRight,   color: 'bg-emerald-500' },
  offer_extended:       { icon: Check,        color: 'bg-green-500' },
  task_due:             { icon: Clock,        color: 'bg-red-500' },
  system:              { icon: Info,          color: 'bg-slate-500' },
}

function resourceHref(type: string | null, id: string | null): string | null {
  if (!type || !id) return null
  switch (type) {
    case 'candidate':    return `/candidates/${id}`
    case 'application':  return `/candidates/${id}`
    case 'job':          return `/jobs/${id}`
    case 'role':         return `/roles/${id}`
    default:             return null
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function NotificationBell({ collapsed }: { collapsed?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch unread count ─────────────────────────────────────────────────
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?unread_only=true&limit=1&offset=0')
      if (res.ok) {
        const json = await res.json()
        setUnreadCount(json.count ?? 0)
      }
    } catch {
      // Silently ignore — non-critical
    }
  }, [])

  // Poll unread count every 30s
  useEffect(() => {
    fetchUnreadCount()
    pollRef.current = setInterval(fetchUnreadCount, 30_000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchUnreadCount])

  // ── Fetch notifications when dropdown opens ────────────────────────────
  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications?limit=10&offset=0')
      if (res.ok) {
        const json = await res.json()
        setNotifications(json.data ?? [])
        // Update unread count from full list
        setUnreadCount(json.data?.filter((n: Notification) => !n.read).length ?? 0)
      }
    } catch {
      // Silently ignore
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) fetchNotifications()
  }, [open, fetchNotifications])

  // ── Close on outside click ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // ── Mark all as read ───────────────────────────────────────────────────
  const markAllRead = async () => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
        setUnreadCount(0)
      }
    } catch {
      // Silently ignore
    }
  }

  // ── Click notification ─────────────────────────────────────────────────
  const handleNotificationClick = async (n: Notification) => {
    // Mark as read
    if (!n.read) {
      try {
        await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [n.id] }),
        })
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
        setUnreadCount(prev => Math.max(0, prev - 1))
      } catch {
        // Silently ignore
      }
    }

    // Navigate if resource link available
    const href = resourceHref(n.resource_type, n.resource_id)
    if (href) {
      setOpen(false)
      router.push(href)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        title="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          className={`absolute z-50 w-80 rounded-xl border border-slate-200 bg-white shadow-lg ${
            collapsed ? 'bottom-0 left-10' : 'bottom-0 left-10'
          }`}
          style={{ maxHeight: '28rem' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: '22rem' }}>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-sm text-slate-400">
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Bell className="h-6 w-6 text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => {
                const config = TYPE_CONFIG[n.type] ?? { icon: AlertCircle, color: 'bg-slate-400' }
                const Icon = config.icon
                const href = resourceHref(n.resource_type, n.resource_id)

                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors ${
                      n.read
                        ? 'bg-white hover:bg-slate-50'
                        : 'bg-blue-50/50 hover:bg-blue-50'
                    } ${href ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    {/* Type icon */}
                    <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${config.color}`}>
                      <Icon className="h-3 w-3 text-white" />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs leading-snug ${n.read ? 'text-slate-600' : 'text-slate-800 font-medium'}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-2">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-slate-400">{timeAgo(n.created_at)}</p>
                    </div>

                    {/* Unread dot */}
                    {!n.read && (
                      <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
