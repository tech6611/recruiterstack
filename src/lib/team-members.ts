// Shared shape + helpers for org team members as returned by GET /api/team.

export type TeamMember = {
  user_id: string
  is_active?: boolean
  role?: string
  users?: {
    full_name?: string | null
    first_name?: string | null
    last_name?: string | null
    email?: string | null
    avatar_url?: string | null
  } | null
}

/** Best available display name for a team member. */
export function teamMemberName(m: TeamMember): string {
  const u = m.users ?? {}
  return (
    u.full_name?.trim() ||
    [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
    u.email ||
    'Member'
  )
}

/** 1–2 letter initials for an avatar chip. */
export function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
