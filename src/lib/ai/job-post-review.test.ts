import { describe, it, expect } from 'vitest'
import { buildJobPostReviewPrompt, htmlToPlainText } from './job-post-review'

describe('htmlToPlainText', () => {
  it('flattens block tags to newlines and strips markup', () => {
    const t = htmlToPlainText('<h1>Role</h1><p>Build things</p><ul><li>Ship</li></ul>')
    expect(t).toContain('Role')
    expect(t).toContain('Build things')
    expect(t).toContain('Ship')
    expect(t).not.toContain('<')
  })
})

describe('buildJobPostReviewPrompt', () => {
  it('is framed as QA (not scratch generation) and includes the post + dimensions', () => {
    const p = buildJobPostReviewPrompt({
      title: 'Staff Engineer',
      description: '<p>Own the platform.</p>',
      level: 'staff',
      location: 'Remote',
    })
    expect(p).toContain('Staff Engineer')
    expect(p).toContain('Own the platform.')
    expect(p.toLowerCase()).toContain('do not rewrite it from scratch')
    expect(p).toContain('inclusivity')
    expect(p).toContain('Level: staff')
  })

  it('degrades gracefully with an empty description', () => {
    const p = buildJobPostReviewPrompt({ title: 'X', description: '' })
    expect(p).toContain('(no description provided)')
  })
})
