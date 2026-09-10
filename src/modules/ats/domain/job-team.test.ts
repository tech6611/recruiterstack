import { describe, it, expect } from 'vitest'
import { assembleJobTeam, type JobTeamInput } from './job-team'

const p = (name: string, email: string | null, user_id: string | null = null) => ({ user_id, name, email })
const base = (over: Partial<JobTeamInput> = {}): JobTeamInput => ({
  hiringManager: null, skipLevel: null, openings: [], jobCreator: null, stages: [], ...over,
})

describe('assembleJobTeam', () => {
  it('orders HM, skip-level, recruiter, then panel-only interviewers in stage order', () => {
    const rows = assembleJobTeam(base({
      hiringManager: { ...p('Master Admin', 'ma@x.com', 'u1'), source: 'assigned' },
      skipLevel: p('Sky Boss', 'sky@x.com', 'u2'),
      openings: [{ id: 'o1', title: 'Ops Mgr', hiring_manager: null, recruiter: p('Rae Cruiter', 'rae@x.com', 'u3') }],
      stages: [
        { name: 'Culture Fit', interview_panel: [{ name: 'Tech Team', email: 'tech@x.com' }] },
        { name: 'Skip-level', interview_panel: [{ name: 'Sky Boss', email: 'SKY@x.com' }] },
      ],
    }))
    expect(rows.map(r => r.name)).toEqual(['Master Admin', 'Sky Boss', 'Rae Cruiter', 'Tech Team'])
    expect(rows[0].tags.map(t => t.label)).toEqual(['Hiring manager'])
    expect(rows[2].tags[0].from).toBe('from requisition')
    expect(rows[3].stages).toEqual(['Culture Fit'])
  })

  it('merges the same person by email, case-insensitively, keeping every tag and stage', () => {
    const rows = assembleJobTeam(base({
      hiringManager: { ...p('Master Admin', 'MA@x.com', 'u1'), source: 'assigned' },
      stages: [{ name: 'Hiring Manager', interview_panel: [{ name: 'Master Admin', email: 'ma@x.com' }] }],
    }))
    expect(rows).toHaveLength(1)
    expect(rows[0].tags.map(t => t.role)).toEqual(['hiring_manager'])
    expect(rows[0].stages).toEqual(['Hiring Manager'])
  })

  it('falls back to the job creator as recruiter only when no requisition names one', () => {
    const creator = p('Creator', 'c@x.com', 'u9')
    const none = assembleJobTeam(base({ jobCreator: creator }))
    expect(none[0].name).toBe('Creator')
    expect(none[0].tags[0]).toMatchObject({ role: 'recruiter', from: 'created this job' })

    const withReq = assembleJobTeam(base({
      jobCreator: creator,
      openings: [{ id: 'o1', title: 'T', hiring_manager: null, recruiter: p('Rae', 'rae@x.com', 'u3') }],
    }))
    expect(withReq.map(r => r.name)).toEqual(['Rae'])
  })

  it('names the requisition on tags only when more than one is linked', () => {
    const rows = assembleJobTeam(base({
      openings: [
        { id: 'o1', title: 'Seat A', hiring_manager: p('HM A', 'a@x.com', 'u1'), recruiter: null },
        { id: 'o2', title: 'Seat B', hiring_manager: p('HM B', 'b@x.com', 'u2'), recruiter: p('Rae', 'rae@x.com', 'u3') },
      ],
    }))
    expect(rows.map(r => r.name)).toEqual(['HM A', 'HM B', 'Rae'])
    expect(rows[0].tags[0].from).toBe('from requisition “Seat A”')
    expect(rows[2].tags[0].from).toBe('from requisition “Seat B”')
  })

  it('shows an intake-only HM and skips a "none" HM and blank panel emails', () => {
    const intake = assembleJobTeam(base({ hiringManager: { user_id: null, name: 'Intake HM', email: null, source: 'intake' } }))
    expect(intake).toHaveLength(0) // no email and no user_id → cannot key the row
    const withEmail = assembleJobTeam(base({ hiringManager: { user_id: null, name: 'Intake HM', email: 'i@x.com', source: 'intake' } }))
    expect(withEmail[0].tags[0].from).toBe('from intake')
    const none = assembleJobTeam(base({
      hiringManager: { user_id: null, name: null, email: null, source: 'none' },
      stages: [{ name: 'S', interview_panel: [{ name: 'Blank', email: '  ' }] }],
    }))
    expect(none).toHaveLength(0)
  })
})
