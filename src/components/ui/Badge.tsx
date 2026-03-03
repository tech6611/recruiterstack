import type { CandidateStatus, RoleStatus } from '@/lib/types/database'

type Status = CandidateStatus | RoleStatus

const CANDIDATE_STYLES: Record<CandidateStatus, string> = {
  active:         'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
  inactive:       'bg-slate-100  text-slate-600  ring-1 ring-slate-200',
  interviewing:   'bg-blue-100   text-blue-800   ring-1 ring-blue-200',
  offer_extended: 'bg-violet-100 text-violet-800 ring-1 ring-violet-200',
  hired:          'bg-teal-100   text-teal-800   ring-1 ring-teal-200',
  rejected:       'bg-red-100    text-red-700    ring-1 ring-red-200',
}

const ROLE_STYLES: Record<RoleStatus, string> = {
  draft:  'bg-slate-100  text-slate-600  ring-1 ring-slate-200',
  active: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
  paused: 'bg-amber-100  text-amber-800  ring-1 ring-amber-200',
  closed: 'bg-red-100    text-red-700    ring-1 ring-red-200',
}

const LABEL: Record<Status, string> = {
  active:         'Active',
  inactive:       'Inactive',
  interviewing:   'Interviewing',
  offer_extended: 'Offer Extended',
  hired:          'Hired',
  rejected:       'Rejected',
  draft:          'Draft',
  paused:         'Paused',
  closed:         'Closed',
}

interface BadgeProps {
  status: Status
  variant?: 'candidate' | 'role'
}

export function StatusBadge({ status, variant = 'candidate' }: BadgeProps) {
  const styles =
    variant === 'role'
      ? ROLE_STYLES[status as RoleStatus] ?? 'bg-slate-100 text-slate-600'
      : CANDIDATE_STYLES[status as CandidateStatus] ?? 'bg-slate-100 text-slate-600'

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}
    >
      {LABEL[status]}
    </span>
  )
}
