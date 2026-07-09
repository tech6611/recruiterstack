import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cancelCalendarEvent } from '../cancel-event'
import { resolveHost } from '../host-resolver'

vi.mock('../host-resolver', () => ({
  resolveHost: vi.fn(),
  HostTokenUnavailableError: class extends Error {},
}))

const mockedResolveHost = vi.mocked(resolveHost)

describe('cancelCalendarEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedResolveHost.mockResolvedValue({
      access_token: 'tok-123',
      connected_email: 'host@example.com',
      host_user_id: 'user-1',
      via: 'user_integrations',
    })
    // Default: provider DELETE succeeds
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 }) as unknown as typeof fetch
  })

  it('returns false without hitting the network when there is no calendar event', async () => {
    expect(await cancelCalendarEvent({
      meetingPlatform: null, calendarEventId: null, panelEmails: [], orgId: 'org-1',
    })).toBe(false)

    expect(await cancelCalendarEvent({
      meetingPlatform: 'google_meet', calendarEventId: null, panelEmails: [], orgId: 'org-1',
    })).toBe(false)

    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockedResolveHost).not.toHaveBeenCalled()
  })

  it('returns false for an unknown platform', async () => {
    expect(await cancelCalendarEvent({
      meetingPlatform: 'skype', calendarEventId: 'evt-1', panelEmails: [], orgId: 'org-1',
    })).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('deletes a Google event on the primary calendar and notifies attendees by default', async () => {
    const ok = await cancelCalendarEvent({
      meetingPlatform: 'google_meet', calendarEventId: 'evt-abc',
      panelEmails: ['a@x.com'], orgId: 'org-1',
    })
    expect(ok).toBe(true)
    expect(mockedResolveHost).toHaveBeenCalledWith('google', ['a@x.com'], 'org-1')
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('/calendars/primary/events/evt-abc')
    expect(url).toContain('sendUpdates=all')
    expect(init.method).toBe('DELETE')
    expect(init.headers.Authorization).toBe('Bearer tok-123')
  })

  it('suppresses attendee emails when notifyAttendees is false', async () => {
    await cancelCalendarEvent({
      meetingPlatform: 'google_meet', calendarEventId: 'evt-abc',
      panelEmails: [], orgId: 'org-1', notifyAttendees: false,
    })
    const [url] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('sendUpdates=none')
  })

  it('deletes a Teams event via the Graph API', async () => {
    await cancelCalendarEvent({
      meetingPlatform: 'ms_teams', calendarEventId: 'graph-evt', panelEmails: [], orgId: 'org-1',
    })
    expect(mockedResolveHost).toHaveBeenCalledWith('microsoft', [], 'org-1')
    const [url] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('graph.microsoft.com/v1.0/me/events/graph-evt')
  })

  it('deletes a Zoom meeting via the Zoom API', async () => {
    await cancelCalendarEvent({
      meetingPlatform: 'zoom', calendarEventId: '99887766', panelEmails: [], orgId: 'org-1',
    })
    expect(mockedResolveHost).toHaveBeenCalledWith('zoom', [], 'org-1')
    const [url] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('api.zoom.us/v2/meetings/99887766')
  })

  it('treats an already-gone event (404/410) as success', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 410 }) as unknown as typeof fetch
    expect(await cancelCalendarEvent({
      meetingPlatform: 'google_meet', calendarEventId: 'evt', panelEmails: [], orgId: 'org-1',
    })).toBe(true)
  })

  it('returns false on a genuine provider error', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch
    expect(await cancelCalendarEvent({
      meetingPlatform: 'zoom', calendarEventId: 'evt', panelEmails: [], orgId: 'org-1',
    })).toBe(false)
  })

  it('never throws when the host cannot be resolved', async () => {
    mockedResolveHost.mockRejectedValue(new Error('no token'))
    expect(await cancelCalendarEvent({
      meetingPlatform: 'google_meet', calendarEventId: 'evt', panelEmails: [], orgId: 'org-1',
    })).toBe(false)
  })
})
