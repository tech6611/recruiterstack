import { describe, it, expect } from 'vitest'
import { executeTool } from '@/lib/copilot-tools'
import type { Capability } from '@/lib/permissions'

// RBAC Slice 3: executeTool gates each tool on the caller's capability set when
// one is provided. The deny path returns early (before any Supabase access), so
// a dummy client is never touched.
describe('executeTool capability gate', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dummySupabase = {} as any

  it('denies a gated tool when the required capability is missing', async () => {
    const res = await executeTool('list_employees', {}, 'org_1', dummySupabase, new Set())
    expect(res).toContain('Permission denied')
    expect(res).toContain('people:view')
  })

  it('denies a write tool the recruiter set lacks', async () => {
    const recruiter = new Set<Capability>(['recruiting:view', 'recruiting:edit', 'openings:view', 'openings:edit', 'analytics:view'])
    const res = await executeTool('record_employee_compensation', { employee_id: 'e1' }, 'org_1', dummySupabase, recruiter)
    expect(res).toContain('Permission denied')
    expect(res).toContain('payroll:edit')
  })
})
