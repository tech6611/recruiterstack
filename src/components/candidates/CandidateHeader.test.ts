import { describe, it, expect } from 'vitest'
import { shortSchoolName } from './CandidateHeader'

// Real strings from the education records in the database.
describe('shortSchoolName', () => {
  it('abbreviates the Indian institute families, keeping the campus', () => {
    expect(shortSchoolName('Indian Institute of Technology, Guwahati')).toBe('IIT Guwahati')
    expect(shortSchoolName('Indian Institute of Management Ahmedabad')).toBe('IIM Ahmedabad')
    expect(shortSchoolName('National Institute of Technology, Calicut')).toBe('NIT Calicut')
  })
  it('keeps the campus, which is the part truncation would eat', () => {
    // "Indian Institute of Technology, Guw…" hides the only identifying word.
    expect(shortSchoolName('Indian Institute of Technology, Madras')).toBe('IIT Madras')
  })
  it('shortens "University of X" the way Juicebox does', () => {
    expect(shortSchoolName('University of Virginia')).toBe('U of Virginia')
    expect(shortSchoolName('University of California, Berkeley')).toBe('U of California')
  })
  it('drops a leading "The" and a trailing qualifier', () => {
    expect(shortSchoolName('The University of Texas at Austin')).toBe('U of Texas at Austin')
    expect(shortSchoolName('Christ University, Bangalore')).toBe('Christ University')
  })
  it('leaves a name that is already short alone', () => {
    expect(shortSchoolName('Stanford University')).toBe('Stanford University')
    expect(shortSchoolName('Masai School')).toBe('Masai School')
  })
})
