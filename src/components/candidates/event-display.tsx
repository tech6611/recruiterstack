'use client'

/**
 * One source of truth for how an application event LOOKS — icon, colour tone,
 * headline and detail — shared by the profile Feed, the pipeline timeline and
 * anywhere else events are listed. Every event type the platform writes (Next.js
 * + Django) has an entry, so nothing falls back to a bare `event_type` string.
 */

import type { ComponentType } from 'react'
import {
  Send, ArrowRight, StickyNote, Flag, Mail, MailOpen,
  CalendarPlus, CalendarCheck, CalendarX, PhoneOutgoing, PhoneCall,
  Gift, BadgeCheck, PartyPopper, Ban, ClipboardList, ClipboardCheck,
  Users, UserPlus, ListChecks, MessageCircle, MessageCircleReply,
  Trophy, XCircle, LogOut, Archive, Activity, Bot,
} from 'lucide-react'
import type { ApplicationEvent } from '@/lib/types/database'

export type EventTone = 'neutral' | 'success' | 'warning' | 'danger'

/** Soft badge (light disc, coloured glyph) — for compact feeds. */
export const TONE_SOFT: Record<EventTone, string> = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  success: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-600 ring-amber-100',
  danger:  'bg-red-50 text-red-600 ring-red-100',
}

/** Solid badge (coloured disc, white glyph) — for the big timeline. */
export const TONE_SOLID: Record<EventTone, string> = {
  neutral: 'bg-slate-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-red-500',
}

export interface EventDisplay {
  Icon: ComponentType<{ className?: string }>
  tone: EventTone
  /** Headline, e.g. "Moved to Interview". */
  title: string
  /** Optional one-line detail under the headline, e.g. the email subject. */
  detail?: string
  /** For stage moves: the from → to pair, rendered as chips. */
  stageMove?: { from: string | null; to: string | null }
}

type Meta = Record<string, unknown> | null | undefined
const metaStr = (m: Meta, key: string): string | null => {
  const v = (m ?? {})[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

const STAGE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A stage value fit to show. Legacy rows may still hold a stage id whose stage
 *  has since been deleted (nothing to resolve it to) — never show that. */
const readableStage = (v: string | null | undefined): string | null =>
  v && !STAGE_UUID_RE.test(v) ? v : null
const REMOVED_STAGE = 'That stage has since been removed from the job'

/** "phone_screen_started" → "Phone screen started". */
export function humanizeEventType(type: string): string {
  const s = type.replace(/[_-]+/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : 'Activity'
}

/** Notes that merely restate who acted (the actor line already says so). */
const BOILERPLATE_NOTES = new Set([
  'Moved by an automation rule',
  'Archived by an automation rule',
])
export const isBoilerplateNote = (note: string | null | undefined): boolean =>
  !!note && BOILERPLATE_NOTES.has(note.trim())

export function getEventDisplay(e: ApplicationEvent): EventDisplay {
  const m = e.metadata as Meta
  switch (e.event_type) {
    case 'applied': {
      const to = readableStage(e.to_stage)
      return { Icon: Send, tone: 'success', title: 'Applied', detail: to ? `Entered ${to}` : undefined }
    }
    case 'sourced': {
      const to = readableStage(e.to_stage)
      return { Icon: UserPlus, tone: 'neutral', title: 'Added from sourcing', detail: to ? `Entered ${to}` : undefined }
    }
    case 'stage_moved': {
      const from = readableStage(e.from_stage), to = readableStage(e.to_stage)
      const orphaned = (!!e.to_stage && !to) || (!!e.from_stage && !from)
      return {
        Icon: ArrowRight, tone: 'neutral',
        title: to ? `Moved to ${to}` : 'Moved to another stage',
        detail: orphaned ? REMOVED_STAGE : undefined,
        stageMove: { from, to },
      }
    }
    case 'status_changed': {
      const s = (readableStage(e.to_stage) ?? '').toLowerCase()
      if (s === 'hired')     return { Icon: Trophy,  tone: 'success', title: 'Marked as hired' }
      if (s === 'rejected')  return { Icon: XCircle, tone: 'danger',  title: 'Rejected' }
      if (s === 'withdrawn') return { Icon: LogOut,  tone: 'neutral', title: 'Candidate withdrew' }
      if (s === 'archived')  return { Icon: Archive, tone: 'neutral', title: 'Archived' }
      return { Icon: Flag, tone: 'neutral', title: s ? `Status changed to ${readableStage(e.to_stage)}` : 'Status changed' }
    }
    case 'rejected':
      return { Icon: XCircle, tone: 'danger', title: 'Rejected' }
    case 'note':
    case 'note_added':
      return { Icon: StickyNote, tone: 'warning', title: 'Note added' }
    case 'email_sent':
      return { Icon: Mail, tone: 'success', title: 'Email sent', detail: metaStr(m, 'subject') ?? undefined }
    case 'email_received':
      return { Icon: MailOpen, tone: 'success', title: 'Email reply received', detail: metaStr(m, 'subject') ?? undefined }
    case 'interview_scheduled':
      return { Icon: CalendarPlus, tone: 'warning', title: 'Interview scheduled' }
    case 'interview_completed':
      return { Icon: CalendarCheck, tone: 'success', title: 'Interview completed' }
    case 'interview_cancelled':
      return { Icon: CalendarX, tone: 'danger', title: 'Interview cancelled' }
    case 'phone_screen_started':
      return { Icon: PhoneOutgoing, tone: 'warning', title: 'AI phone screen started' }
    case 'phone_screen':
      return { Icon: PhoneCall, tone: 'success', title: 'AI phone screen completed' }
    case 'assessment_sent':
      return { Icon: ClipboardList, tone: 'warning', title: 'Assessment sent' }
    case 'scorecard_added':
      return { Icon: ClipboardCheck, tone: 'neutral', title: 'Scorecard submitted' }
    case 'review_triaged':
      return { Icon: ListChecks, tone: 'neutral', title: 'Reviewed and triaged' }
    case 'referral_added':
      return { Icon: Users, tone: 'neutral', title: 'Referral added' }
    case 'offer_created':
      return { Icon: Gift, tone: 'neutral', title: 'Offer created' }
    case 'offer_approved':
      return { Icon: BadgeCheck, tone: 'success', title: 'Offer approved' }
    case 'offer_sent':
      return { Icon: Send, tone: 'success', title: 'Offer sent to candidate' }
    case 'offer_accepted':
      return { Icon: PartyPopper, tone: 'success', title: 'Offer accepted' }
    case 'offer_declined':
      return { Icon: Ban, tone: 'danger', title: 'Offer declined' }
    case 'whatsapp_sent':
      return { Icon: MessageCircle, tone: 'success', title: 'WhatsApp message sent' }
    case 'whatsapp_received':
      return { Icon: MessageCircleReply, tone: 'success', title: 'WhatsApp reply received' }
    case 'whatsapp_opt_out':
      return { Icon: Ban, tone: 'danger', title: 'Opted out of WhatsApp' }
    default:
      return { Icon: Activity, tone: 'neutral', title: humanizeEventType(e.event_type) }
  }
}

// ── Who did it ────────────────────────────────────────────────────────────────

export interface ActorDisplay {
  label: string
  /** true → render a robot glyph instead of initials. */
  isSystem: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SYSTEM_ACTORS: Record<string, string> = {
  automation: 'Automation rule',
  autopilot:  'Autopilot',
  seed:       'Seed data',
  system:     'System',
  sourcing:   'Sourcing',
}

/** Turn whatever a writer stored in `created_by` into something a recruiter can read. */
export function getActorDisplay(createdBy: string | null | undefined): ActorDisplay {
  const raw = (createdBy ?? '').trim()
  if (!raw) return { label: 'System', isSystem: true }
  const key = raw.toLowerCase()
  if (SYSTEM_ACTORS[key]) return { label: SYSTEM_ACTORS[key], isSystem: true }
  if (/^(🤖\s*)?ai\b/i.test(raw) || /\bai\b/i.test(raw)) return { label: raw.replace(/^🤖\s*/, ''), isSystem: true }
  // Raw ids the server couldn't resolve (deleted user, other org, legacy rows).
  if (raw.startsWith('user_')) return { label: 'Team member', isSystem: false }
  if (raw.startsWith('org_') || UUID_RE.test(raw)) return { label: 'RecruiterStack', isSystem: true }
  return { label: raw, isSystem: false }
}

export { Bot as SystemActorIcon }
