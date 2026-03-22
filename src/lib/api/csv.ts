/**
 * CSV export utilities.
 * Handles proper escaping (RFC 4180) and streaming for large datasets.
 */

/**
 * Escape a single CSV field value.
 * Wraps in quotes if it contains commas, quotes, or newlines.
 */
function escapeField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = Array.isArray(value) ? value.join('; ') : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Convert an array of field values into a CSV row string.
 */
export function toCsvRow(fields: unknown[]): string {
  return fields.map(escapeField).join(',')
}

/**
 * Create a streaming CSV Response.
 * Writes the header row first, then fetches data via the provided fetcher
 * and writes each row as it's produced.
 */
export function toCsvResponse(
  filename: string,
  headers: string[],
  rows: unknown[][],
): Response {
  const headerRow = toCsvRow(headers)
  const bodyRows = rows.map(row => toCsvRow(row))
  const csv = [headerRow, ...bodyRows].join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    },
  })
}
