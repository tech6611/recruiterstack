import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scheduleInterviewReminders } from '../reminders'
import { enqueue } from '@/lib/api/job-queue'

vi.mock('@/lib/api/job-queue', () => ({
  enqueue: vi.fn().mockResolvedValue('job-id'),
}))

const mockedEnqueue = vi.mocked(enqueue)
const HOUR = 60 * 60 * 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function callsFor(kind: '24h' | '1h') {
  return mockedEnqueue.mock.calls.filter(([opts]) => (opts.payload as any).kind === kind)
}

describe('scheduleInterviewReminders', () => {
  beforeEach(() => vi.clearAllMocks())

  it('schedules both 24h and 1h reminders for a far-future interview', async () => {
    const scheduledAt = new Date(Date.now() + 48 * HOUR).toISOString()
    await scheduleInterviewReminders({ orgId: 'org-1', interviewId: 'iv-1', scheduledAt })

    expect(mockedEnqueue).toHaveBeenCalledTimes(2)
    expect(callsFor('24h')).toHaveLength(1)
    expect(callsFor('1h')).toHaveLength(1)

    for (const [opts] of mockedEnqueue.mock.calls) {
      expect(opts.jobType).toBe('interview_reminder')
      expect(opts.orgId).toBe('org-1')
      expect(opts.payload).toMatchObject({ interviewId: 'iv-1', targetScheduledAt: scheduledAt })
      expect(opts.delaySeconds).toBeGreaterThan(0)
    }
  })

  it('fires the 24h reminder ~24h before and the 1h reminder ~1h before', async () => {
    const scheduledAt = new Date(Date.now() + 48 * HOUR).toISOString()
    await scheduleInterviewReminders({ orgId: 'org-1', interviewId: 'iv-1', scheduledAt })

    const delay24 = callsFor('24h')[0][0].delaySeconds!
    const delay1  = callsFor('1h')[0][0].delaySeconds!
    // 48h out → 24h reminder fires in ~24h, 1h reminder in ~47h
    expect(Math.round(delay24 / 3600)).toBe(24)
    expect(Math.round(delay1 / 3600)).toBe(47)
  })

  it('skips the 24h reminder when the interview is under 24h away', async () => {
    const scheduledAt = new Date(Date.now() + 3 * HOUR).toISOString()
    await scheduleInterviewReminders({ orgId: 'org-1', interviewId: 'iv-1', scheduledAt })

    expect(callsFor('24h')).toHaveLength(0)
    expect(callsFor('1h')).toHaveLength(1)
  })

  it('skips both reminders when the interview is under an hour away', async () => {
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
