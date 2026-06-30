import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { parseCandidatesCsv, SourcingError } from '@/modules/ats/domain/sourcing'

export const maxDuration = 60

// POST /api/sourcing/import
// Body: { csv_text: string }
// Returns: { candidates: ParsedCandidate[], count: number }
//
// The AI parse lives in the shared sourcing facade so the copilot
// `import_candidates_csv` tool uses the exact same parser.
export const POST = withCapability('recruiting:edit', async (request) => {
  let body: { csv_text: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const candidates = await parseCandidatesCsv(body.csv_text)
    return NextResponse.json({ candidates, count: candidates.length })
  } catch (err) {
    if (err instanceof SourcingError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
})
