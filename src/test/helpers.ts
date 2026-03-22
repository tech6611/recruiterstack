import { vi } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock Supabase query builder ─────────────────────────────────────────────

type MockResult = { data: unknown; error: unknown; count?: number }

/**
 * Creates a chainable mock Supabase client.
 * Configure per-table results via the `results` map.
 *
 * Usage:
 *   const { client, results } = createMockSupabase()
 *   results.set('candidates', { data: [{ id: '1', name: 'Test' }], error: null })
 */
export function createMockSupabase() {
  const results = new Map<string, MockResult>()

  function createQueryBuilder(table: string) {
    const defaultResult: MockResult = { data: [], error: null }

    const builder: Record<string, unknown> = {}
    const chainMethods = [
      'select', 'insert', 'update', 'delete', 'upsert',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
      'like', 'ilike', 'in', 'or', 'not', 'is',
      'order', 'limit', 'range', 'single', 'maybeSingle',
      'filter', 'match', 'textSearch',
    ]

    for (const method of chainMethods) {
      builder[method] = vi.fn().mockReturnValue(builder)
    }

    // Terminal methods that return results
    builder.then = (resolve: (value: MockResult) => void) => {
      const result = results.get(table) ?? defaultResult
      resolve(result)
      return Promise.resolve(result)
    }

    // Make the builder itself thenable for await
    const proxy = new Proxy(builder, {
      get(target, prop) {
        if (prop === 'then') {
          return (resolve: (value: MockResult) => void) => {
            const result = results.get(table) ?? defaultResult
            resolve(result)
            return Promise.resolve(result)
          }
        }
        return target[prop as string]
      },
    })

    return proxy
  }

  const client = {
    from: vi.fn((table: string) => createQueryBuilder(table)),
  }

  return { client, results }
}

// ── Request factories ───────────────────────────────────────────────────────

export function createMockRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>,
): NextRequest {
  const init: RequestInit = { method }
  if (body) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NextRequest(new URL(url, 'http://localhost:3000'), init as any)
}

// ── Data factories ──────────────────────────────────────────────────────────

let counter = 0
function nextId() {
  counter++
  return `00000000-0000-0000-0000-${String(counter).padStart(12, '0')}`
}

export function buildCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    name: 'Test Candidate',
    email: 'test@example.com',
    phone: null,
    resume_url: null,
    skills: [],
    experience_years: 0,
    current_title: null,
    location: null,
    linkedin_url: null,
    status: 'active',
    org_id: 'org_test123',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

export function buildApplication(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    candidate_id: nextId(),
    hiring_request_id: nextId(),
    stage_id: null,
    status: 'active',
    source: 'manual',
    source_detail: null,
    resume_url: null,
    cover_letter: null,
    applied_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ai_score: null,
    ai_recommendation: null,
    ai_strengths: [],
    ai_gaps: [],
    ai_scored_at: null,
    ai_criterion_scores: null,
    credited_to: null,
    org_id: 'org_test123',
    ...overrides,
  }
}

export function buildHiringRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    ticket_number: null,
    position_title: 'Software Engineer',
    department: 'Engineering',
    hiring_manager_name: 'Jane Manager',
    hiring_manager_email: 'jane@example.com',
    hiring_manager_slack: null,
    intake_token: 'tok_test123',
    apply_link_token: 'apply_test123',
    status: 'intake_pending',
    filled_by_recruiter: false,
    team_context: null,
    level: null,
    headcount: 1,
    location: null,
    remote_ok: false,
    key_requirements: null,
    nice_to_haves: null,
    target_companies: null,
    budget_min: null,
    budget_max: null,
    target_start_date: null,
    additional_notes: null,
    generated_jd: null,
    intake_sent_at: null,
    intake_submitted_at: null,
    jd_sent_at: null,
    auto_advance_score: null,
    auto_reject_score: null,
    auto_advance_stage_id: null,
    auto_email_rejection: false,
    autopilot_recruiter_name: null,
    autopilot_company_name: null,
    scoring_criteria: null,
    org_id: 'org_test123',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}
