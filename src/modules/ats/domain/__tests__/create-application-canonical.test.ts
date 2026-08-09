import { describe, it, expect } from 'vitest'
import { createApplication } from '../applications'

/**
 * Canonical-model guard for the "Add to Job" flow.
 *
 * A candidacy must be anchored to a canonical job via `job_id`. Before the fix,
 * "Add to Job" wrote the job's id into the legacy `hiring_request_id` column,
 * leaving `job_id` null — so the application never resolved its job or stages.
 * These tests pin the domain facade's mapping so that can't silently regress.
 */

// Minimal Supabase stub that captures the row handed to .insert().
function capturingClient() {
  const captured: { table?: string; row?: Record<string, unknown> } = {}
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {
        insert(row: Record<string, unknown>) { captured.table = table; captured.row = row; return builder },
        select() { return builder },
        single() { return Promise.resolve({ data: { id: 'app-new', ...captured.row }, error: null }) },
      }
      return builder
    },
  }
  return { client, captured }
}

describe('createApplication — canonical linkage', () => {
  it('anchors a canonical candidacy on job_id (not legacy hiring_request_id)', async () => {
    const { client, captured } = capturingClient()

    await createApplication(client as never, {
      orgId: 'org-1',
      candidateId: 'cand-1',
      jobId: 'job-1',
      source: 'manual',
    })

    expect(captured.table).toBe('applications')
    expect(captured.row?.job_id).toBe('job-1')
    // The legacy column must NOT be set for a canonical candidacy.
    expect(captured.row?.hiring_request_id).toBeUndefined()
  })

  it('still supports a legacy hiring_request anchor when no jobId is given', async () => {
    const { client, captured } = capturingClient()

    await createApplication(client as never, {
      orgId: 'org-1',
      candidateId: 'cand-1',
      hiringRequestId: 'hr-1',
      source: 'manual',
    })

    expect(captured.row?.hiring_request_id).toBe('hr-1')
    expect(captured.row?.job_id).toBeUndefined()
  })
})
