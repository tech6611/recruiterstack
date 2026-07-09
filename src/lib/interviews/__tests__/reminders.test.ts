import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scheduleInterviewReminders, getOrgReminderLeadMinutes } from '../reminders'
import { enqueue } from '@/lib/api/job-queue'

vi.mock('@/lib/api/job-queue', () => ({
  enqueue: vi.fn().mockResolvedValue('job-id'),
}))

// Mutable holder so tests can control what org_settings.reminder_lead_minutes returns.
const h = vi.hoisted(() => ({ row: null as null | { reminder_lead_minutes: unknown } }))
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: h.row }) }) }) }),
  }),
}))

const mockedEnqueue = vi.mocked(enqueue)
const HOUR = 60 * 60 * 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const leadOf = (call: any) => (call[0].payload as any).leadMinutes
const callsForLead = (mins: number) => mockedEnqueue.mock.calls.filter(c => leadOf(c) === mins)

describe('scheduleInterviewReminders', () => {
  beforeEach(() => { vi.clearAllMocks(); h.row = null /* → default 24h + 1h */ })

  it('defaults to 24h + 1h reminders for a far-future interview', async () => {
    const scheduledAt = new Date(Date.now() + 48 * HOUR).toISOString()
    await scheduleInterviewReminders({ orgId: 'org-1', interviewId: 'iv-1', scheduledAt })

    expect(mockedEnqueue).toHaveBeenCalledTimes(2)
    expect(callsForLead(1440)).toHaveLength(1)  // 24h
    expect(callsForLead(60)).toHaveLength(1)     // 1h
    for (const [opts] of mockedEnqueue.mock.calls) {
      expect(opts.jobType).toBe('interview_reminder')
      expect(opts.payload).toMatchObject({ interviewId: 'iv-1', targetScheduledAt: scheduledAt })
      expect(opts.delaySeconds).toBeGreaterThan(0)
    }
  })

  it('fires each reminder its lead-time before the interview', async () => {
    const scheduledAt = new Date(Date.now() + 48 * HOUR).toISOString()
    await scheduleInterviewReminders({ orgId: 'org-1', interviewId: 'iv-1', scheduledAt })
    // 48h out → 24h reminder fires in ~24h, 1h reminder in ~47h
    expect(Math.round(callsForLead(1440)[0][0].delaySeconds! / 3600)).toBe(24)
    expect(Math.round(callsForLead(60)[0][0].delaySeconds! / 3600)).toBe(47)
  })

  it('uses the org-configured intervals when set', async () => {
    h.row = { reminder_lead_minutes: [4320, 30] }  // 3 days + 30 min
    const scheduledAt = new Date(Date.now() + 5 * 24 * HOUR).toISOString()
    await scheduleInterviewReminders({ orgId: 'org-1', interviewId: 'iv-1', scheduledAt })
    expect(mockedEnqueue).toHaveBeenCalledTimes(2)
    expect(callsForLead(4320)).toHaveLength(1)
    expect(callsForLead(30)).toHaveLength(1)
    expect(callsForLead(1440)).toHaveLength(0)  // default not used
  })

  it('sends nothing when the org has reminders turned off (empty array)', async () => {
    h.row = { reminder_lead_minutes: [] }
    const scheduledAt = new Date(Date.now() + 48 * HOUR).toISOString()
    await scheduleInterviewReminders({ orgId: 'org-1', interviewId: 'iv-1', scheduledAt })
    expect(mockedEnqueue).not.toHaveBeenCalled()
  })

  it('skips the 24h reminder when the interview is under 24h away', async () => {
    const scheduledAt = new Date(Date.now() + 3 * HOUR).toISOString()
    await scheduleInterviewReminders({ orgId: 'org-1', interviewId: 'iv-1', scheduledAt })
    expect(callsForLead(1440)).toHaveLength(0)
    expect(callsForLead(60)).toHaveLength(1)
  })

  it('skips all reminders when the interview is under an hour away', async () => {
    const scheduledAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    await scheduleInterviewReminders({ orgId: 'org-1', interviewId: 'iv-1', scheduledAt })
    expect(mockedEnqueue).not.toHaveBeenCalled()
  })

  it('does nothing for an invalid date', async () => {
    await scheduleInterviewReminders({ orgId: 'org-1', interviewId: 'iv-1', scheduledAt: 'not-a-date' })
    expect(mockedEnqueue).not.toHaveBeenCalled()
  })

  it('never throws when enqueue fails', async () => {
    mockedEnqueue.mockRejectedValueOnce(new Error('db down'))
    const scheduledAt = new Date(Date.now() + 48 * HOUR).toISOString()
    await expect(
      scheduleInterviewReminders({ orgId: 'org-1', interviewId: 'iv-1', scheduledAt }),
    ).resolves.toBeUndefined()
  })

  it('passes the booking timezone through to the reminder payload', async () => {
    const scheduledAt = new Date(Date.now() + 48 * HOUR).toISOString()
    await scheduleInterviewReminders({ orgId: 'org-1', interviewId: 'iv-1', scheduledAt, timezone: 'Asia/Kolkata' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mockedEnqueue.mock.calls[0][0].payload as any).timezone).toBe('Asia/Kolkata')
  })
})

describe('getOrgReminderLeadMinutes', () => {
  beforeEach(() => { h.row = null })

  it('returns the default when unset', async () => {
    expect(await getOrgReminderLeadMinutes('org-1')).toEqual([1440, 60])
  })
  it('returns stored positive intervals, filtering junk', async () => {
    h.row = { reminder_lead_minutes: [4320, 0, -5, 60] }
    expect(await getOrgReminderLeadMinutes('org-1')).toEqual([4320, 60])
  })
  it('returns empty (off) when explicitly empty', async () => {
    h.row = { reminder_lead_minutes: [] }
    expect(await getOrgReminderLeadMinutes('org-1')).toEqual([])
  })
})
