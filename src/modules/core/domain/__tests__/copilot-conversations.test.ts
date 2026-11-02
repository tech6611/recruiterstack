import { describe, it, expect } from 'vitest'
import { cleanTitle, isMissingTable, MAX_TITLE_LENGTH } from '../copilot-conversations'

describe('copilot conversations helpers', () => {
  it('cleans titles: trims, collapses spaces, defaults, truncates', () => {
    expect(cleanTitle('  Create   a job  ')).toBe('Create a job')
    expect(cleanTitle('')).toBe('New chat')
    expect(cleanTitle(undefined)).toBe('New chat')
    const long = cleanTitle('x'.repeat(200))
    expect(long.length).toBe(MAX_TITLE_LENGTH)
    expect(long.endsWith('…')).toBe(true)
  })

  it('recognises "table not created yet" errors so the UI can fall back', () => {
    expect(isMissingTable({ code: 'PGRST205', message: "Could not find the table 'public.copilot_conversations' in the schema cache" })).toBe(true)
    expect(isMissingTable({ code: '42P01', message: 'relation "copilot_conversations" does not exist' })).toBe(true)
    expect(isMissingTable({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isMissingTable(null)).toBe(false)
  })
})
