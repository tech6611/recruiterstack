/**
 * Per-member RBAC — capability vocabulary + pure resolution logic (Slice 0).
 *
 * A capability is "<module>:<action>". This registry is the single source of
 * truth for what capabilities exist; the DB stores capability strings validated
 * against it. `resolveCapabilities` is pure (no I/O) so the precedence rules are
 * unit-testable; the Supabase-backed resolver lives in `src/lib/rbac.ts`.
 *
 * NOTE (Slice 0): defined but not yet enforced. Nothing calls the resolver until
 * Slice 1 wires it into route guards. `/me` self-service and a manager's view of
 * their direct reports stay relationship-based (see rbac.ts) — NOT gated here.
 */

export const CAPABILITIES = [
  'recruiting:view',  'recruiting:edit',
  'openings:view',    'openings:edit',    'openings:approve',
  'people:view',      'people:edit',
  'onboarding:view',  'onboarding:edit',
  'okrs:view',        'okrs:edit',
  'documents:view',   'documents:edit',
  'hr_cases:view',    'hr_cases:edit',
  'leave:view',       'leave:edit',       'leave:approve',
  'payroll:view',     'payroll:edit',
  'analytics:view',
  'compliance:view',
  'approvals:view',   'approvals:approve',
  'settings:view',    'settings:edit',
] as const

export type Capability = (typeof CAPABILITIES)[number]

export const ALL_CAPABILITIES: ReadonlySet<Capability> = new Set(CAPABILITIES)

export function isCapability(value: string): value is Capability {
  return (ALL_CAPABILITIES as ReadonlySet<string>).has(value)
}

export type OverrideEffect = 'allow' | 'deny'
export interface CapabilityOverride {
  capability: string
  effect: OverrideEffect
}

export interface ResolveInput {
  /** Owner roles grant every capability and short-circuit resolution. */
  isOwner: boolean
  /** Flattened capability strings from all of the member's assigned roles. */
  roleCapabilities: string[]
  /** Per-member allow/deny grants layered on top of roles. */
  overrides: CapabilityOverride[]
}

/**
 * Effective capability set = (∪ role capabilities) ∪ allows − denies.
 * Precedence: deny > allow > role. Owner → all capabilities.
 * Unknown capability strings (not in the registry) are ignored.
 */
export function resolveCapabilities(input: ResolveInput): Set<Capability> {
  if (input.isOwner) return new Set(ALL_CAPABILITIES)

  const set = new Set<Capability>()
  for (const cap of input.roleCapabilities) {
    if (isCapability(cap)) set.add(cap)
  }
  // Allows first, then denies — so a deny always wins over an allow/role grant.
  for (const o of input.overrides) {
    if (o.effect === 'allow' && isCapability(o.capability)) set.add(o.capability)
  }
  for (const o of input.overrides) {
    if (o.effect === 'deny' && isCapability(o.capability)) set.delete(o.capability)
  }
  return set
}
