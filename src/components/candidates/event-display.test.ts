import { describe, it, expect } from 'vitest'
import type { ApplicationEvent } from '@/lib/types/database'
import { getEventDisplay, getActorDisplay, humanizeEventType, isBoilerplateNote } from './event-display'

const ev = (over: Partial<ApplicationEvent>): ApplicationEvent => ({
  id: 'e1', org_id: 'o', application_id: 'a', event_type: 'stage_moved',
  from_stage: null, to_stage: null, note: null, metadata: {}, created_by: 'Recruiter', created_at: '2026-09-17T00:00:00Z',
  ...over,
})

describe('getEventDisplay', () => {
  it('stage moves carry the from → to pair for chips', () => {
    const d = getEventDisplay(ev({ from_stage: 'Applied', to_stage: 'Interview' }))
    expect(d.title).toBe('Moved to Interview')
    expect(d.stageMove).toEqual({ from: 'Applied', to: 'Interview' })
    expect(d.tone).toBe('neutral')
  })

  it('never shows a stage id whose stage was deleted (nothing to resolve it to)', () => {
    const d = getEventDisplay(ev({ from_stage: 'fa37baa8-62dd-4e8f-a63e-f7ad06bac04d', to_stage: '72774910-c06c-475a-9fd7-4cf39e5e962a' }))
    expect(d.title).toBe('Moved to another stage')
    expect(d.detail).toMatch(/removed/)
    expect(d.stageMove).toEqual({ from: null, to: null })
    expect(getEventDisplay(ev({ event_type: 'applied', to_stage: '72774910-c06c-475a-9fd7-4cf39e5e962a' })).detail).toBeUndefined()
  })

  it('status changes read as outcomes, not raw values', () => {
    expect(getEventDisplay(ev({ event_type: 'status_changed', to_stage: 'hired' })).title).toBe('Marked as hired')
    expect(getEventDisplay(ev({ event_type: 'status_changed', to_stage: 'rejected' })).tone).toBe('danger')
  })

  it('email subject surfaces as the detail line', () => {
    const d = getEventDisplay(ev({ event_type: 'email_sent', metadata: { subject: 'Next steps' } }))
    expect(d.detail).toBe('Next steps')
  })

  it('every type the platform writes has a dedicated entry (no bare snake_case leaks)', () => {
    const types = ['applied', 'sourced', 'stage_moved', 'status_changed', 'rejected', 'note', 'note_added', 'email_sent', 'email_received',
      'interview_scheduled', 'interview_completed', 'interview_cancelled', 'phone_screen_started', 'phone_screen', 'assessment_sent',
      'scorecard_added', 'review_triaged', 'referral_added', 'offer_created', 'offer_approved', 'offer_sent', 'offer_accepted',
      'offer_declined', 'whatsapp_sent', 'whatsapp_received', 'whatsapp_opt_out']
    for (const t of types) {
      const d = getEventDisplay(ev({ event_type: t }))
      expect(d.title, t).not.toMatch(/_/)
      expect(d.Icon, t).toBeTruthy()
    }
  })

  it('unknown types still get a readable headline', () => {
    expect(getEventDisplay(ev({ event_type: 'some_new_thing' })).title).toBe('Some new thing')
    expect(humanizeEventType('phone_screen_started')).toBe('Phone screen started')
  })
})

describe('getActorDisplay', () => {
  it('maps machine actors to readable labels', () => {
    expect(getActorDisplay('automation')).toEqual({ label: 'Automation rule', isSystem: true })
    expect(getActorDisplay('Seed')).toEqual({ label: 'Seed data', isSystem: true })
    expect(getActorDisplay('🤖 AI Analysis')).toEqual({ label: 'AI Analysis', isSystem: true })
    expect(getActorDisplay('AI Phone Screen').isSystem).toBe(true)
  })
  it('never shows raw ids', () => {
    expect(getActorDisplay('user_3GoyaWnnalhJk45k5PLwtBd4vTl').label).toBe('Team member')
    expect(getActorDisplay('org_3Goyt93ZE5QdKZ0zPMCgG1OzWtC').label).toBe('RecruiterStack')
    expect(getActorDisplay('fa37baa8-62dd-4e8f-a63e-f7ad06bac04d').label).toBe('RecruiterStack')
    expect(getActorDisplay('')).toEqual({ label: 'System', isSystem: true })
  })
  it('keeps real names', () => {
    expect(getActorDisplay('Wareesha Nazeer')).toEqual({ label: 'Wareesha Nazeer', isSystem: false })
    expect(getActorDisplay('Recruiter')).toEqual({ label: 'Recruiter', isSystem: false })
  })
})

describe('isBoilerplateNote', () => {
  it('hides notes that only restate the actor', () => {
    expect(isBoilerplateNote('Moved by an automation rule')).toBe(true)
    expect(isBoilerplateNote('Strong on SQL, weak on comms')).toBe(false)
    expect(isBoilerplateNote(null)).toBe(false)
  })
})
