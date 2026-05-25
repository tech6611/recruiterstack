/**
 * Feature flags. Minimal env-based gating for user-visible surfaces while the
 * data layer underneath ships additively. Set the env var to 'false' to hide.
 *
 * NEXT_PUBLIC_* so flags are readable in client components. Default ON — the
 * flag exists to *hide* a surface in a given environment, not to keep it dark.
 */
export const flags = {
  /** HRIS module surfaces (Employees page, etc.). */
  hris: process.env.NEXT_PUBLIC_HRIS_ENABLED !== 'false',
} as const

export type FeatureFlag = keyof typeof flags
