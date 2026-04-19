/**
 * Onboarding step registry + role resolution.
 * Shared between server components (layout, page redirects) and the stepper UI.
 */

import { createAdminClient } from '@/lib/supabase/server'
import type { OrgRole } from '@/lib/types/requisitions'

export type StepSlug =
  | 'profile'
  | 'role'
  | 'org-info'
  | 'modules'
  | 'invites'
  | 'integrations'
  | 'done'

export interface StepDef {
  slug:      StepSlug
  title:     string
  subtitle:  string
  adminOnly: boolean
}

export const STEPS: StepDef[] = [
  { slug: 'profile',      title: 'Your profile',    subtitle: 'Confirm who you are',                    adminOnly: false },
  { slug: 'role',         title: 'Your role',       subtitle: 'Pick how you use RecruiterStack',        adminOnly: false },
  { slug: 'org-info',     title: 'About your team', subtitle: 'Company basics for your workspace',      adminOnly: true  },
  { slug: 'modules',      title: 'AI agents',       subtitle: 'Turn on the agents your team will use',  adminOnly: true  },
  { slug: 'invites',      title: 'Invite teammates',subtitle: 'Bring your team in (optional)',          adminOnly: true  },
  { slug: 'integrations', title: 'Integrations',    subtitle: 'Connect calendar + meeting tools',       adminOnly: false },
  { slug: 'done',         title: 'All set',         subtitle: 'Ready to hire',                          adminOnly: false },
]

/**
 * Effective role for onboarding purposes.
 *  - "admin"            — org_members.role === 'admin' already
 *  - "pending-admin"    — no admin yet in org_members; this user will become one via the role step
 *  - "member"           — at least one admin exists and this user isn't one
 */
export type EffectiveRole = 'admin' | 'pending-admin' | 'member'

export async function resolveEffectiveRole(orgId: string, userId: string): Promise<EffectiveRole> {
  const supabase = createAdminClient()

  const [{ data: me }, { data: adminList }] = await Promise.all([
    supabase
      .from('org_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('org_members')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('role', 'admin')
      .eq('is_active', true)
      .limit(1),
  ])

  if ((me as { role: OrgRole } | null)?.role === 'admin') return 'admin'
  if ((adminList ?? []).length === 0)                     return 'pending-admin'
  return 'member'
}

export function stepsForRole(role: EffectiveRole): StepDef[] {
  const isAdminOrPending = role === 'admin' || role === 'pending-admin'
  return STEPS.filter(s => !s.adminOnly || isAdminOrPending)
}

export function nextStep(current: StepSlug, role: EffectiveRole): StepSlug | null {
  const list = stepsForRole(role)
  const idx = list.findIndex(s => s.slug === current)
  if (idx < 0 || idx >= list.length - 1) return null
  return list[idx + 1].slug
}

export function prevStep(current: StepSlug, role: EffectiveRole): StepSlug | null {
  const list = stepsForRole(role)
  const idx = list.findIndex(s => s.slug === current)
  if (idx <= 0) return null
  return list[idx - 1].slug
}
