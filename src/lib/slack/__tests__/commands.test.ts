import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn(() => ({})) }))
vi.mock('@/lib/slack/identity', () => ({ resolveSlackUser: vi.fn() }))
vi.mock('@/lib/rbac', () => ({
  getPermissionSet: vi.fn(),
  can: (caps: Set<string>, c: string) => caps.has(c),
}))
vi.mock('@/modules/ats/domain/candidates', () => ({ searchCandidatesForAgent: vi.fn() }))
vi.mock('@/modules/ats/domain/applications', () => ({ listActiveApplicationsByCandidatesWithJobTitle: vi.fn() }))

import { resolveSlackUser } from '@/lib/slack/identity'
import { getPermissionSet } from '@/lib/rbac'
import { searchCandidatesForAgent } from '@/modules/ats/domain/candidates'
import { listActiveApplicationsByCandidatesWithJobTitle } from '@/modules/ats/domain/applications'
import { handleSlashCommand } from '@/lib/slack/handlers/commands'

const CALL = { teamId: 'T1', slackUserId: 'U1' }

describe('handleSlashCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveSlackUser).mockResolvedValue({ orgId: 'org_1', userId: 'u1', email: 'a@b.com' })
    vi.mocked(getPermissionSet).mockResolvedValue(new Set(['recruiting:view']) as never)
  })

  it('rejects a Slack user with no RecruiterStack match', async () => {
    vi.mocked(resolveSlackUser).mockResolvedValue(null)
    const res = await handleSlashCommand({ ...CALL, text: 'search jane' })
    const body = await res.json()
    expect(body.text).toContain("couldn't match your Slack account")
  })

  it('rejects a user without recruiting:view', async () => {
    vi.mocked(getPermissionSet).mockResolvedValue(new Set() as never)
    const res = await handleSlashCommand({ ...CALL, text: 'search jane' })
    const body = await res.json()
    expect(body.text).toContain("don't have permission")
  })

  it('shows help for an unknown / empty command', async () => {
    const res = await handleSlashCommand({ ...CALL, text: '' })
    const body = await res.json()
    expect(body.text).toContain('search <name or title>')
  })

  it('shows usage when search has no query', async () => {
    const res = await handleSlashCommand({ ...CALL, text: 'search' })
    const body = await res.json()
    expect(body.text).toContain('Usage:')
  })

  it('returns candidate result blocks for a search', async () => {
    vi.mocked(searchCandidatesForAgent).mockResolvedValue({
      data: [{
        id: 'c1', current_title: 'Engineer', status: 'active',
        skills: [], experience_years: 5, location: null,
        person: { name: 'Jane Doe', email: 'jane@x.com' },
      }],
      error: null,
    } as never)
    vi.mocked(listActiveApplicationsByCandidatesWithJobTitle).mockResolvedValue([
      { candidate_id: 'c1', hiring_request: { position_title: 'Backend Engineer' } },
    ] as never)

    const res = await handleSlashCommand({ ...CALL, text: 'search jane' })
    const body = await res.json()

    expect(body.response_type).toBe('ephemeral')
    const dump = JSON.stringify(body.blocks)
    expect(dump).toContain('Jane Doe')
    expect(dump).toContain('Backend Engineer')
    expect(dump).toContain('/candidates/c1') // Open button link
  })

  it('handles no matches gracefully', async () => {
    vi.mocked(searchCandidatesForAgent).mockResolvedValue({ data: [], error: null } as never)
    const res = await handleSlashCommand({ ...CALL, text: 'search zzz' })
    const body = await res.json()
    expect(JSON.stringify(body.blocks)).toContain('No candidates matching')
    expect(listActiveApplicationsByCandidatesWithJobTitle).not.toHaveBeenCalled()
  })
})
