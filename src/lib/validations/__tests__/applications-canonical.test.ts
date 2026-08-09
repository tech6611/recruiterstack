import { describe, it, expect } from 'vitest'
import { applicationInsertSchema } from '../applications'

/** Canonical-model guard for the "Add to Job" payload. */
describe('applicationInsertSchema — canonical anchor', () => {
  const CAND = '11111111-1111-4111-8111-111111111111'
  const JOB = '22222222-2222-4222-8222-222222222222'
  const HR = '33333333-3333-4333-8333-333333333333'

  it('accepts a canonical job_id anchor', () => {
    const result = applicationInsertSchema.safeParse({ job_id: JOB, candidate_id: CAND })
    expect(result.success).toBe(true)
  })

  it('still accepts a legacy hiring_request_id anchor', () => {
    const result = applicationInsertSchema.safeParse({ hiring_request_id: HR, candidate_id: CAND })
    expect(result.success).toBe(true)
  })

  it('rejects when neither job_id nor hiring_request_id is provided', () => {
    const result = applicationInsertSchema.safeParse({ candidate_id: CAND })
    expect(result.success).toBe(false)
  })
})
