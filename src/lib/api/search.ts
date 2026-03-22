import { sanitizeSearch } from '@/lib/api/helpers'

/**
 * Build a PostgREST `.or()` filter string for ilike search across multiple fields.
 * Returns null if the search term is empty/whitespace (caller should skip filtering).
 *
 * @example
 *   buildSearchFilter('John', ['name', 'email'])
 *   // → "name.ilike.%John%,email.ilike.%John%"
 */
export function buildSearchFilter(term: string, fields: string[]): string | null {
  const trimmed = term.trim()
  if (!trimmed) return null

  const sanitized = sanitizeSearch(trimmed)
  return fields
    .map(field => `${field}.ilike.%${sanitized}%`)
    .join(',')
}
