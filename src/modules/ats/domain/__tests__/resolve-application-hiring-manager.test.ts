import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from '@/test/helpers'
import { resolveApplicationHiringManager } from '../job-pipelines'

// The HM contact powers the {{hiring_manager_calendar}} sequence link. It can
// live in three places depending on how the job was created — this resolver has
// to find it in all of them, or the link silently falls back to plain text.
describe('resolveApplicationHiringManager', () => {
  let mock: ReturnType<typeof createMockSupabase>
  beforeEach(() => {
    mock = createMockSupabase()
    mock.results.set('applications', { data: { job_id: 'job-1' }, error: null })
    // Default the requisition lookups to "nothing linked" so tests that don't
    // exercise the fallback don't accidentally resolve through it.
    mock.results.set('job_openings', { data: { opening_id: null }, error: null })
    mock.results.set('openings', { data: null, error: null })
  })

  it('reads the top-level custom_fields.hiring_manager_email (create-from-requisition path)', async () => {
    mock.results.set('jobs', {
      data: { custom_fields: { hiring_manager_name: 'Priya HM', hiring_manager_email: 'priya@co.com' } },
      error: null,
    })
    const hm = await resolveApplicationHiringManager(mock.client as never, 'org-1', 'app-1')
    expect(hm).toEqual({ email: 'priya@co.com', name: 'Priya HM' })
  })

  it('reads the nested custom_fields.intake.hiring_manager_email (Send-to-HM intake path)', async () => {
    mock.results.set('jobs', {
      data: { custom_fields: { intake: { hiring_manager_name: 'Nested HM', hiring_manager_email: 'nested@co.com' } } },
      error: null,
    })
    const hm = await resolveApplicationHiringManager(mock.client as never, 'org-1', 'app-1')
    expect(hm).toEqual({ email: 'nested@co.com', name: 'Nested HM' })
  })

  it('falls back to the linked requisition when the job carries no HM contact', async () => {
    mock.results.set('jobs', { data: { custom_fields: {} }, error: null })
    mock.results.set('job_openings', { data: { opening_id: 'op-1' }, error: null })
    mock.results.set('openings', {
      data: { hiring_manager_email: 'req@co.com', hiring_manager_name: 'Req HM' },
      error: null,
    })
    const hm = await resolveApplicationHiringManager(mock.client as never, 'org-1', 'app-1')
    expect(hm).toEqual({ email: 'req@co.com', name: 'Req HM' })
  })

  it('defaults the name to the email when only an email is known', async () => {
    mock.results.set('jobs', {
      data: { custom_fields: { hiring_manager_email: 'noname@co.com' } },
      error: null,
    })
    const hm = await resolveApplicationHiringManager(mock.client as never, 'org-1', 'app-1')
    expect(hm).toEqual({ email: 'noname@co.com', name: 'noname@co.com' })
  })

  it('returns null when no HM can be resolved anywhere', async () => {
    mock.results.set('jobs', { data: { custom_fields: {} }, error: null })
    const hm = await resolveApplicationHiringManager(mock.client as never, 'org-1', 'app-1')
    expect(hm).toBeNull()
  })

  it('returns null when the application has no job', async () => {
    mock.results.set('applications', { data: { job_id: null }, error: null })
    const hm = await resolveApplicationHiringManager(mock.client as never, 'org-1', 'app-1')
    expect(hm).toBeNull()
  })
})
