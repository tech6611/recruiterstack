import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireOrg } from '@/lib/auth'

export const maxDuration = 60

// POST /api/sourcing/import
// Body: { csv_text: string }
// Returns: { candidates: ParsedCandidate[], count: number }
export async function POST(request: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult

  let body: { csv_text: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { csv_text } = body
  if (!csv_text?.trim()) {
    return NextResponse.json({ error: 'csv_text is required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  const client = new Anthropic({ apiKey })

  const prompt = `Parse this CSV data and extract candidate information. Map columns intelligently — handle any header naming convention (e.g. "Full Name", "name", "candidate_name" all map to "name").

Extract these fields per row (all optional, but each row must have at least one of name or email):
- name: full name
- email: email address
- phone: phone number
- current_title: current job title / role
- location: city, country, or region
- experience_years: years of experience as a number (0 if unknown or not present)
- skills: array of skill keywords (parse from a skills/technologies column; if none, infer 1-2 from the title)
- linkedin_url: LinkedIn profile URL if present

Rules:
- Skip rows where both name AND email are empty/missing
- experience_years must be a number, not a string
- For skills: if there's a dedicated column, split on commas/semicolons/pipes. Otherwise infer from title.
- Return ONLY a valid JSON array with no explanation: [{"name":"...","email":"...",...}]
- Omit null/empty fields from each object
- Maximum 100 candidates

CSV data:
${csv_text.slice(0, 10000)}`

  try {
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages:   [{ role: 'user', content: prompt }],
    })

    const raw  = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const json = raw.startsWith('[') ? raw : (raw.match(/\[[\s\S]*\]/)?.[0] ?? '[]')
    const candidates = JSON.parse(json)

    if (!Array.isArray(candidates)) {
      return NextResponse.json({ error: 'Could not parse CSV — no candidate data found' }, { status: 422 })
    }

    // Filter: keep only rows with at least name or email
    const valid = candidates.filter(
      (c: Record<string, unknown>) => (c.name as string)?.trim() || (c.email as string)?.trim()
    )

    return NextResponse.json({ candidates: valid, count: valid.length })
  } catch {
    return NextResponse.json({ error: 'CSV parsing failed — check your API key and CSV format' }, { status: 500 })
  }
}
