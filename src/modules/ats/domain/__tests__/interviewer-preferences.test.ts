import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from '@/test/helpers'
import {
  getInterviewerPreferences,
  getInterviewerPreferenceByToken,
  DEFAULT_WINDOWS,
  DEFAULT_TIMEZONE,
} from '../interviewer-preferences'

describe('interviewer-preferences facade', () => {
  let mock: ReturnType<typeof createMockSupabase>
  beforeEach(() => { mock = createMockSupabase() })

  it('DEFAULT_WINDOWS is Mon–Fri 09:00–18:00', () => {
    expect(DEFAULT_WINDOWS).toEqual([
      { day: 1, start: 540, end: 1080 },
      { day: 2, start: 540, end: 1080 },
      { day: 3, start: 540, end: 1080 },
      { day: 4, start: 540, end: 1080 },
      { day: 5, start: 540, end: 1080 },
    ])
  })

  it('falls back to the default window + timezone for interviewers with no stored row', async () => {
    mock.results.set('interviewer_preferences', { data: [], error: null })

    const prefs = await getInterviewerPreferences(mock.client as never, 'org-1', ['a@x.com', 'b@y.com'])

    expect(Object.keys(prefs).sort()).toEqual(['a@x.com', 'b@y.com'])
    expect(prefs['a@x.com'].windows).toEqual(DEFAULT_WINDOWS)
    expect(prefs['a@x.com'].timezone).toBe(DEFAULT_TIMEZONE)
  })

  it('normalizes email case and de-dupes', async () => {
    mock.results.set('interviewer_preferences', { data: [], error: null })
    const prefs = await getInterviewerPreferences(mock.client as never, 'org-1', ['A@X.com', 'a@x.COM'])
    expect(Object.keys(prefs)).toEqual(['a@x.com'])
  })

  it('uses stored windows/timezone when present, defaults when the row has empty windows', async () => {
    mock.results.set('interviewer_preferences', {
      data: [
        { email: 'set@x.com',   name: 'Set', timezone: 'America/New_York', windows: [{ day: 2, start: 600, end: 900 }], note: 'mid-week' },
        { email: 'empty@x.com', name: 'Empty', timezone: 'Europe/London',  windows: [], note: null },
      ],
      error: null,
    })

    const prefs = await getInterviewerPreferences(mock.client as never, 'org-1', ['set@x.com', 'empty@x.com'])

    expect(prefs['set@x.com'].windows).toEqual([{ day: 2, start: 600, end: 900 }])
    expect(prefs['set@x.com'].timezone).toBe('America/New_York')
    expect(prefs['set@x.com'].note).toBe('mid-week')

    // Empty stored windows → fall back to default, but keep the interviewer's own timezone.
    expect(prefs['empty@x.com'].windows).toEqual(DEFAULT_WINDOWS)
    expect(prefs['empty@x.com'].timezone).toBe('Europe/London')
  })

  it('returns an empty object when no emails are requested', async () => {
    const prefs = await getInterviewerPreferences(mock.client as never, 'org-1', [])
    expect(prefs).toEqual({})
  })

  it('getInterviewerPreferenceByToken maps a row and returns null when missing', async () => {
    mock.results.set('interviewer_preferences', {
      data: { org_id: 'org-9', email: 'hm@x.com', name: 'HM', timezone: 'Asia/Kolkata', windows: [{ day: 1, start: 540, end: 720 }], note: null },
      error: null,
    })
    const found = await getInterviewerPreferenceByToken(mock.client as never, 'tok-1')
    expect(found?.orgId).toBe('org-9')
    expect(found?.email).toBe('hm@x.com')
    expect(found?.windows).toEqual([{ day: 1, start: 540, end: 720 }])

    mock.results.set('interviewer_preferences', { data: null, error: null })
    expect(await getInterviewerPreferenceByToken(mock.client as never, 'nope')).toBeNull()
  })
})
