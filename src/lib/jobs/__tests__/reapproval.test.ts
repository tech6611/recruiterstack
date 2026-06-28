import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the approval engine + audit so we can assert orchestration without a DB.
// vi.hoisted keeps the spies available inside the hoisted vi.mock factories.
const { submitForApproval, writeAudit } = vi.hoisted(() => ({
  submitForApproval: vi.fn(),
  writeAudit: vi.fn(),
}))
vi.mock('@/lib/approvals/engine', () => ({
  submitForApproval,
  ApprovalError: class ApprovalError extends Error { status = 422 },
}))
vi.mock('@/lib/approvals/audit', () => ({ writeAudit }))

import { maybeTriggerReapproval } from '../reapproval'
import { extractSubstance } from '../substance'
import { ApprovalError } from '@/lib/approvals/engine'

// Minimal chainable Supabase stub: update(...).eq(...).eq(...) resolves ok.
function okChain(): any {
  const p: any = Promise.resolve({ error: null })
  p.eq = () => okChain()
  return p
}
const supabase: any = { from: () => ({ update: () => okChain() }) }

const SNAPSHOT = {
  substance: extractSubstance({
    description: '<p>Build the API</p>',
    custom_fields: { intake: { key_requirements: '<p>5 years</p>', nice_to_have: '', team_context: '', level: 'Senior' } },
  }),
  captured_at: '2026-01-01T00:00:00Z',
}

function job(overrides: { description?: string; key_requirements?: string } = {}) {
  return {
    id: 'job-1',
    approved_snapshot: SNAPSHOT,
    description: overrides.description ?? '<p>Build the API</p>',
    custom_fields: { intake: { key_requirements: overrides.key_requirements ?? '<p>5 years</p>', nice_to_have: '', team_context: '', level: 'Senior' } },
  }
}

beforeEach(() => { submitForApproval.mockReset(); writeAudit.mockReset() })

describe('maybeTriggerReapproval', () => {
  it('no-ops for a draft (no approved baseline state)', async () => {
    const r = await maybeTriggerReapproval(supabase, 'org', 'user', job(), 'draft')
    expect(r.reapproval).toBe(false)
    expect(submitForApproval).not.toHaveBeenCalled()
  })

  it('no-ops when there is no snapshot', async () => {
    const j = { ...job(), approved_snapshot: null }
    const r = await maybeTriggerReapproval(supabase, 'org', 'user', j, 'open')
    expect(r.reapproval).toBe(false)
    expect(submitForApproval).not.toHaveBeenCalled()
  })

  it('no-ops on a formatting-only change', async () => {
    // bold added, same words → normalizes equal
    const r = await maybeTriggerReapproval(supabase, 'org', 'user', job({ key_requirements: '<p><strong>5 years</strong></p>' }), 'open')
    expect(r.reapproval).toBe(false)
    expect(submitForApproval).not.toHaveBeenCalled()
  })

  it('auto-approve: restores the prior live state', async () => {
    submitForApproval.mockResolvedValue({ approvalId: 'a1', status: 'approved' })
    const r = await maybeTriggerReapproval(supabase, 'org', 'user', job({ key_requirements: '<p>8 years</p>' }), 'open')
    expect(r.reapproval).toBe(true)
    expect(r.auto_approved).toBe(true)
    expect(r.status).toBe('open')
    expect(r.changed_fields).toEqual(['Key requirements'])
    expect(writeAudit).toHaveBeenCalledOnce()
  })

  it('needs an approver: takes the job offline to pending_approval', async () => {
    submitForApproval.mockResolvedValue({ approvalId: 'a2', status: 'pending' })
    const r = await maybeTriggerReapproval(supabase, 'org', 'user', job({ description: '<p>Build the mobile app</p>' }), 'paused')
    expect(r.reapproval).toBe(true)
    expect(r.auto_approved).toBe(false)
    expect(r.status).toBe('pending_approval')
    expect(r.changed_fields).toEqual(['Job description'])
  })

  it('does not block the edit when no approval chain applies', async () => {
    submitForApproval.mockRejectedValue(new ApprovalError('no chain'))
    const r = await maybeTriggerReapproval(supabase, 'org', 'user', job({ key_requirements: '<p>8 years</p>' }), 'open')
    expect(r.reapproval).toBe(false)
    expect(r.reapproval_skipped).toBe(true)
  })
})
