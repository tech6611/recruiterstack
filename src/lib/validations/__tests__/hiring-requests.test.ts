import { describe, it, expect } from 'vitest'
import { hiringRequestInsertSchema, scoringCriterionSchema } from '../hiring-requests'

describe('hiringRequestInsertSchema', () => {
  it('accepts valid hiring request (send to HM)', () => {
    const result = hiringRequestInsertSchema.safeParse({
      position_title: 'Software Engineer',
      hiring_manager_name: 'Jane Manager',
      hiring_manager_email: 'jane@example.com',
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid hiring request (fill myself)', () => {
    const result = hiringRequestInsertSchema.safeParse({
      position_title: 'Software Engineer',
      hiring_manager_name: 'Jane Manager',
      filled_by_recruiter: true,
      team_context: 'Backend team',
      level: 'Senior',
    })
    expect(result.success).toBe(true)
  })

  it('requires hiring_manager_email when not filled by recruiter', () => {
    const result = hiringRequestInsertSchema.safeParse({
      position_title: 'Software Engineer',
      hiring_manager_name: 'Jane Manager',
      filled_by_recruiter: false,
    })
    expect(result.success).toBe(false)
  })

  it('requires position_title', () => {
    const result = hiringRequestInsertSchema.safeParse({
      hiring_manager_name: 'Jane',
      hiring_manager_email: 'jane@example.com',
    })
    expect(result.success).toBe(false)
  })

  it('accepts scoring criteria', () => {
    const result = hiringRequestInsertSchema.safeParse({
      position_title: 'Engineer',
      hiring_manager_name: 'Jane',
      hiring_manager_email: 'jane@example.com',
      scoring_criteria: [
        { id: 'tech', name: 'Technical Skills', weight: 60, description: null },
        { id: 'comm', name: 'Communication', weight: 40, description: 'Verbal and written' },
      ],
    })
    expect(result.success).toBe(true)
  })
})

describe('scoringCriterionSchema', () => {
  it('accepts valid criterion', () => {
    const result = scoringCriterionSchema.safeParse({
      id: 'tech-skills',
      name: 'Technical Skills',
      weight: 50,
      description: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects weight outside range', () => {
    expect(scoringCriterionSchema.safeParse({
      id: 'test', name: 'Test', weight: 0, description: null,
    }).success).toBe(false)
    expect(scoringCriterionSchema.safeParse({
      id: 'test', name: 'Test', weight: 101, description: null,
    }).success).toBe(false)
  })
})
