import { describe, it, expect } from 'vitest'
import { buildSearchFilter } from '../search'

describe('buildSearchFilter', () => {
  it('builds ilike filter for multiple fields', () => {
    const result = buildSearchFilter('John', ['name', 'email'])
    expect(result).toBe('name.ilike.%John%,email.ilike.%John%')
  })

  it('escapes special characters', () => {
    const result = buildSearchFilter('O%Brien', ['name'])
    expect(result).toBe('name.ilike.%O\\%Brien%')
  })

  it('escapes underscores', () => {
    const result = buildSearchFilter('test_user', ['email'])
    expect(result).toBe('email.ilike.%test\\_user%')
  })

  it('escapes commas to prevent filter injection', () => {
    const result = buildSearchFilter('x,id.eq.secret', ['name'])
    expect(result).toBe('name.ilike.%x\\,id\\.eq\\.secret%')
  })

  it('returns null for empty string', () => {
    expect(buildSearchFilter('', ['name'])).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(buildSearchFilter('   ', ['name'])).toBeNull()
  })

  it('trims whitespace before building filter', () => {
    const result = buildSearchFilter('  test  ', ['name'])
    expect(result).toBe('name.ilike.%test%')
  })

  it('handles single field', () => {
    const result = buildSearchFilter('admin', ['email'])
    expect(result).toBe('email.ilike.%admin%')
  })

  it('handles many fields', () => {
    const result = buildSearchFilter('test', ['a', 'b', 'c', 'd'])
    expect(result).toBe('a.ilike.%test%,b.ilike.%test%,c.ilike.%test%,d.ilike.%test%')
  })
})
