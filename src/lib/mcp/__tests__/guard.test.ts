import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AuthInfo } from '@modelcontextprotocol/server'

// RBAC is tested elsewhere; here we control what it returns.
const viewerScope = vi.fn()
vi.mock('@/lib/rbac', () => ({ getViewerScope: (...a: unknown[]) => viewerScope(...a) }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => { throw new Error('tests must inject supabase') } }))

import { authorizeCall, auditableIds, McpDenied } from '../guard'
import { guarded } from '../tool'
import { isApprovedClient } from '../clients'

// ── tiny fake Supabase: per-table single-row results + a log of writes ─────────
function fakeSupabase(rows: Record<string, unknown>) {
  const writes: Array<{ table: string; op: string; value: unknown }> = []
  const client = {
    from(table: string) {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit']) q[m] = () => q
      q.maybeSingle = async () => ({ data: rows[table] ?? null, error: null })
      q.insert = async (value: unknown) => { writes.push({ table, op: 'insert', value }); return { error: null } }
      q.upsert = (value: unknown) => { writes.push({ table, op: 'upsert', value }); return Promise.resolve({ error: null }) }
      return q
    },
  }
  return { client: client as never, writes }
}

const TEST_CLIENT = 'test-client-123'
function auth(overrides: Partial<{ clientId: string; scopes: string[]; userId: string; orgId: string }> = {}): AuthInfo {
  const caller = {
    userId: 'user_clerk_1',
    orgId: 'org_A',
    clientId: TEST_CLIENT,
    scopes: ['jobs:read', 'candidates:read', 'pipeline:write'],
    ...overrides,
  }
  return { token: 't', clientId: caller.clientId, scopes: caller.scopes, extra: { caller } }
}

const memberRecruiter = {
  role: 'recruiter',
  capabilities: new Set(['recruiting:view', 'recruiting:edit']),
  jobIds: new Set(),
}
const happyRows = { users: { id: 'uuid-1', deactivated_at: null } }

beforeEach(() => {
  process.env.MCP_EXTRA_CLIENT_IDS = TEST_CLIENT
  viewerScope.mockResolvedValue(memberRecruiter)
})
afterEach(() => { delete process.env.MCP_EXTRA_CLIENT_IDS })

async function expectDenied(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(McpDenied)
  await expect(p).rejects.toMatchObject({ code })
}

describe('isApprovedClient', () => {
  it('approves ChatGPT and Claude CIMD URLs and configured extra IDs only', () => {
    expect(isApprovedClient('https://chatgpt.com/oauth/client.json')).toBe(true)
    expect(isApprovedClient('https://claude.ai/oauth/claude-code-client-metadata')).toBe(true)
    expect(isApprovedClient(TEST_CLIENT)).toBe(true)
    expect(isApprovedClient('https://evil.example/oauth/client.json')).toBe(false)
    expect(isApprovedClient('https://chatgpt.com.evil.example/oauth/x')).toBe(false)
    expect(isApprovedClient('')).toBe(false)
  })
})

describe('authorizeCall — every "no" is refused', () => {
  const read = { scope: 'jobs:read' as const, capability: 'recruiting:view' as const }
  const write = { scope: 'pipeline:write' as const, capability: 'recruiting:edit' as const }

  it('allows an approved app, granted scope, active member with the capability', async () => {
    const { client, writes } = fakeSupabase(happyRows)
    const ctx = await authorizeCall(auth(), read, client)
    expect(ctx).toMatchObject({ userId: 'uuid-1', orgId: 'org_A' })
    expect(writes.find((w) => w.table === 'ai_app_connections')?.op).toBe('upsert')
  })

  it('refuses an unapproved AI app', async () => {
    const { client } = fakeSupabase(happyRows)
    await expectDenied(authorizeCall(auth({ clientId: 'unknown-app' }), read, client), 'client_not_approved')
  })

  it('refuses when the scope was not granted', async () => {
    const { client } = fakeSupabase(happyRows)
    await expectDenied(authorizeCall(auth({ scopes: ['jobs:read'] }), write, client), 'missing_scope')
  })

  it('refuses an unknown or deactivated user', async () => {
    await expectDenied(authorizeCall(auth(), read, fakeSupabase({}).client), 'user_not_found')
    const deactivated = fakeSupabase({ users: { id: 'uuid-1', deactivated_at: '2026-01-01' } }).client
    await expectDenied(authorizeCall(auth(), read, deactivated), 'user_not_found')
  })

  it('refuses when the workspace switched AI access off', async () => {
    const { client } = fakeSupabase({ ...happyRows, ai_app_settings: { enabled: false } })
    await expectDenied(authorizeCall(auth(), read, client), 'ai_access_off')
  })

  it('allows when the workspace has no settings row (on by default)', async () => {
    const { client } = fakeSupabase(happyRows)
    await expect(authorizeCall(auth(), read, client)).resolves.toBeTruthy()
  })

  it('refuses a disconnected (revoked) connection', async () => {
    const { client } = fakeSupabase({ ...happyRows, ai_app_connections: { id: 'c1', revoked_at: '2026-11-01' } })
    await expectDenied(authorizeCall(auth(), read, client), 'connection_revoked')
  })

  it('refuses someone who is no longer an active member', async () => {
    viewerScope.mockResolvedValue({ ...memberRecruiter, role: null })
    await expectDenied(authorizeCall(auth(), read, fakeSupabase(happyRows).client), 'not_a_member')
  })

  it("refuses when the role lacks the capability (e.g. hiring manager writing)", async () => {
    viewerScope.mockResolvedValue({ role: 'hiring_manager', capabilities: new Set(), jobIds: new Set(['job-1']) })
    await expectDenied(authorizeCall(auth(), write, fakeSupabase(happyRows).client), 'role_not_allowed')
    // …but may READ the jobs they are on
    await expect(authorizeCall(auth(), read, fakeSupabase(happyRows).client)).resolves.toBeTruthy()
  })

  it('takes the workspace from the token, never from elsewhere', async () => {
    const ctx = await authorizeCall(auth({ orgId: 'org_B' }), read, fakeSupabase(happyRows).client)
    expect(ctx.orgId).toBe('org_B')
    expect(viewerScope).toHaveBeenLastCalledWith(expect.anything(), 'org_B', 'uuid-1')
  })
})

describe('guarded() tool wrapper', () => {
  const req = { scope: 'jobs:read' as const, capability: 'recruiting:view' as const }

  it('runs the tool and audits ok with IDs only', async () => {
    const { client, writes } = fakeSupabase(happyRows)
    const tool = guarded('get_job', req, async () => ({ content: [{ type: 'text', text: 'ok' }], resultCount: 1 }), { supabase: () => client })
    const res = await tool({ job_id: 'j1', query: 'secret free text' }, { http: { authInfo: auth() } })
    expect(res.isError).toBeUndefined()
    const audit = writes.find((w) => w.table === 'ai_app_audit')?.value as Record<string, unknown>
    expect(audit).toMatchObject({ tool: 'get_job', outcome: 'ok', org_id: 'org_A', user_id: 'uuid-1', result_count: 1 })
    expect(audit.input_ids).toEqual({ job_id: 'j1' }) // free text is never logged
  })

  it('returns the plain-English reason and audits a denial without running the tool', async () => {
    const { client, writes } = fakeSupabase(happyRows)
    const run = vi.fn()
    const tool = guarded('get_job', req, run, { supabase: () => client })
    const res = await tool({}, { http: { authInfo: auth({ clientId: 'unknown-app' }) } })
    expect(run).not.toHaveBeenCalled()
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/not approved/)
    expect(writes.find((w) => w.table === 'ai_app_audit')?.value).toMatchObject({ outcome: 'denied', reason: 'client_not_approved' })
  })

  it('hides internal errors from the user and audits them', async () => {
    const { client, writes } = fakeSupabase(happyRows)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const tool = guarded('get_job', req, async () => { throw new Error('db exploded: password=xyz') }, { supabase: () => client })
    const res = await tool({}, { http: { authInfo: auth() } })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).not.toMatch(/password|exploded/)
    expect(writes.find((w) => w.table === 'ai_app_audit')?.value).toMatchObject({ outcome: 'error' })
  })
})

describe('auditableIds', () => {
  it('keeps only *_id / *_ids arguments', () => {
    expect(auditableIds({ job_id: 'a', candidate_ids: ['b'], query: 'x', note: 'y' })).toEqual({ job_id: 'a', candidate_ids: ['b'] })
  })
})
