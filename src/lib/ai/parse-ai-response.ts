import { type ZodType, ZodError } from 'zod'
import { logger } from '@/lib/logger'

/**
 * Parse an AI text response as JSON and validate with a Zod schema.
 *
 * Handles common Claude response quirks:
 * - Markdown code fences (```json ... ```)
 * - Leading/trailing text around JSON object
 * - Extra whitespace
 *
 * Uses schema.strip() to ignore unexpected extra fields from the AI.
 */
export function parseAiJson<T>(raw: string, schema: ZodType<T>, label = 'AI'): T {
  const trimmed = raw.trim()

  // Strip markdown code fences
  let json = trimmed.startsWith('```')
    ? trimmed.replace(/```(?:json)?\n?/g, '').trim()
    : trimmed

  // If not starting with {, try to extract a JSON object
  if (!json.startsWith('{')) {
    const match = json.match(/\{[\s\S]*\}/)
    if (match) {
      json = match[0]
    }
  }

  // Parse JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    logger.error(`${label}: failed to parse JSON from AI response`, err, {
      rawLength: raw.length,
      rawPreview: raw.slice(0, 200),
    })
    throw new Error(`${label}: AI returned invalid JSON`)
  }

  // Validate with Zod
  try {
    return schema.parse(parsed)
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
      logger.error(`${label}: AI response failed validation`, undefined, { issues })
      throw new Error(`${label}: AI response validation failed — ${issues}`)
    }
    throw err
  }
}
