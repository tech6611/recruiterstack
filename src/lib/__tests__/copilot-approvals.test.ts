import { describe, it, expect, vi } from 'vitest'

// executeTool must never be reached for held or foreign tools.
const { executeToolMock } = vi.hoisted(() => ({ executeToolMock: vi.fn(async () => 'EXECUTED') }))
vi.mock('@/lib/copilot-tools', async (orig) => {
  const real = await orig<typeof import('@/lib/copilot-tools')>()
  return { ...real, executeTool: executeToolMock }
})

import { needsApproval, ApprovalQueue, batchSummary } from '@/lib/copilot/approvals'
import { runSubAgentTool } from '@/lib/agents/sub-agent'
import type { ToolSchema } from '@/lib/ai/llm'
import type { Capability } from '@/lib/permissions'

// Chainable Supabase stub: every query resolves to { data: null, error: null }.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chain: any = new Proxy(() => {}, {
  get: (_t, prop) => (prop === 'then'
    ? (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
    : () => chain),
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = { from: () => chain } as any

const tool = (name: string): ToolSchema => ({ name, description: '', input_schema: { type: 'object', properties: {} } })
const RECRUITER = new Set<Capability>(['recruiting:view', 'recruiting:edit'])

describe('needsApproval', () => {
  it('holds sends, bulk and irreversible actions', () => {
    for (const t of ['send_outreach_email', 'send_whatsapp_message', 'bulk_reject_below_score', 'bulk_move_to_stage',
      'update_offer_status', 'mark_employee_terminated', 'record_employee_compensation', 'start_onboarding',
      'request_time_off', 'decide_time_off', 'approve_icp', 'schedule_interview']) {
      expect(needsApproval(t, {})).toBe(true)
    }
  })
  it('holds rejecting / withdrawing / hiring but not re-activating', () => {
    expect(needsApproval('update_application_status', { status: 'rejected' })).toBe(true)
    expect(needsApproval('update_application_status', { status: 'withdrawn' })).toBe(true)
    expect(needsApproval('update_application_status', { status: 'hired' })).toBe(true)
    expect(needsApproval('update_application_status', { status: 'active' })).toBe(false)
  })
  it('holds the availability link only when it would be emailed', () => {
    expect(needsApproval('create_interviewer_availability_link', { send_email: true })).toBe(true)
    expect(needsApproval('create_interviewer_availability_link', { send_email: false })).toBe(false)
  })
  it('holds going live / off-market but not submit or unarchive', () => {
    for (const a of ['publish', 'pause', 'resume', 'close']) expect(needsApproval('change_job_status', { action: a })).toBe(true)
    for (const a of ['submit', 'unarchive']) expect(needsApproval('change_job_status', { action: a })).toBe(false)
  })
  it('lets reads and ordinary writes through', () => {
    for (const t of ['list_jobs', 'get_inbox', 'add_note_to_application', 'create_scorecard', 'send_whatsapp_reply', 'generate_icp', 'get_icp']) {
      expect(needsApproval(t, {})).toBe(false)
    }
  })
})

describe('runSubAgentTool', () => {
  const base = { orgId: 'org_1', supabase, userId: 'u1' }

  it('holds a risky call in the queue instead of running it', async () => {
    executeToolMock.mockClear()
    const approvals = new ApprovalQueue()
    const res = await runSubAgentTool(
      { ...base, tools: [tool('send_outreach_email')], capabilities: RECRUITER, approvals },
      'send_outreach_email', { application_id: 'a1', subject: 'Hi', body: 'Hello there' },
    )
    expect(res).toContain('WAITING FOR APPROVAL')
    expect(executeToolMock).not.toHaveBeenCalled()
    expect(approvals.size).toBe(1)
    expect(approvals.actions[0].tool).toBe('send_outreach_email')
    expect(approvals.actions[0].preview).toContain('Subject: Hi')
    expect(approvals.actions[0].preview).toContain('Hello there')
    expect(batchSummary(approvals.actions)).toContain('1 email')
  })

  it('refuses a risky call when there is no approval queue (background callers)', async () => {
    executeToolMock.mockClear()
    const res = await runSubAgentTool(
      { ...base, tools: [tool('send_outreach_email')] },
      'send_outreach_email', { application_id: 'a1' },
    )
    expect(res).toContain('needs a recruiter')
    expect(executeToolMock).not.toHaveBeenCalled()
  })

  it('does not queue what the user has no permission to do', async () => {
    const approvals = new ApprovalQueue()
    const res = await runSubAgentTool(
      { ...base, tools: [tool('mark_employee_terminated')], capabilities: RECRUITER, approvals },
      'mark_employee_terminated', { employee_id: 'e1' },
    )
    expect(res).toContain('Permission denied')
    expect(approvals.size).toBe(0)
  })

  it('refuses a tool that is not on the agent\'s list', async () => {
    executeToolMock.mockClear()
    const res = await runSubAgentTool(
      { ...base, tools: [tool('get_candidate')] },
      'mark_employee_terminated', { employee_id: 'e1' },
    )
    expect(res).toContain('not one of your tools')
    expect(executeToolMock).not.toHaveBeenCalled()
  })

  it('runs safe tools normally', async () => {
    executeToolMock.mockClear()
    const res = await runSubAgentTool(
      { ...base, tools: [tool('list_jobs')], capabilities: RECRUITER, approvals: new ApprovalQueue() },
      'list_jobs', {},
    )
    expect(res).toBe('EXECUTED')
    expect(executeToolMock).toHaveBeenCalledOnce()
  })
})
