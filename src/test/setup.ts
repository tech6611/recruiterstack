import { vi } from 'vitest'

// ── Mock Clerk ──────────────────────────────────────────────────────────────
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(() => ({ userId: 'user_test123', orgId: 'org_test123' })),
  clerkMiddleware: vi.fn(),
  createRouteMatcher: vi.fn(),
}))

// ── Mock Sentry (no-op in tests) ────────────────────────────────────────────
vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
  replayIntegration: vi.fn(),
}))

// ── Mock Supabase ───────────────────────────────────────────────────────────
// Individual tests should use createMockSupabase() from ./helpers.ts
// for per-test control of query results.
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}))
