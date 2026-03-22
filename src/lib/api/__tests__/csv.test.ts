import { describe, it, expect } from 'vitest'
import { toCsvRow, toCsvResponse } from '../csv'

describe('toCsvRow', () => {
  it('joins simple values with commas', () => {
    expect(toCsvRow(['Alice', 'alice@test.com', 'Engineer'])).toBe('Alice,alice@test.com,Engineer')
  })

  it('wraps values containing commas in quotes', () => {
    expect(toCsvRow(['Last, First'])).toBe('"Last, First"')
  })

  it('escapes double quotes by doubling them', () => {
    expect(toCsvRow(['She said "hello"'])).toBe('"She said ""hello"""')
  })

  it('wraps values containing newlines in quotes', () => {
    expect(toCsvRow(['line1\nline2'])).toBe('"line1\nline2"')
  })

  it('handles null and undefined as empty strings', () => {
    expect(toCsvRow([null, undefined, 'valid'])).toBe(',,valid')
  })

  it('joins arrays with semicolons', () => {
    expect(toCsvRow([['React', 'TypeScript', 'Node.js']])).toBe('React; TypeScript; Node.js')
  })

  it('handles empty array', () => {
    expect(toCsvRow([])).toBe('')
  })

  it('handles numeric values', () => {
    expect(toCsvRow([42, 3.14, 0])).toBe('42,3.14,0')
  })

  it('handles boolean values', () => {
    expect(toCsvRow([true, false])).toBe('true,false')
  })
})

describe('toCsvResponse', () => {
  it('creates a Response with correct headers', () => {
    const response = toCsvResponse('test.csv', ['Name', 'Email'], [['Alice', 'a@b.com']])

    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="test.csv"')
  })

  it('includes header row and data rows', async () => {
    const response = toCsvResponse('test.csv', ['Name', 'Email'], [
      ['Alice', 'alice@test.com'],
      ['Bob', 'bob@test.com'],
    ])

    const text = await response.text()
    const lines = text.split('\n')

    expect(lines[0]).toBe('Name,Email')
    expect(lines[1]).toBe('Alice,alice@test.com')
    expect(lines[2]).toBe('Bob,bob@test.com')
  })

  it('handles empty data', async () => {
    const response = toCsvResponse('empty.csv', ['A', 'B'], [])
    const text = await response.text()
    expect(text).toBe('A,B')
  })
})
