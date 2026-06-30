import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { createCandidatesFromParsed, type ParsedCandidate } from '@/modules/ats/domain/sourcing'

// POST /api/sourcing/confirm
// Body: { candidates: ParsedCandidate[] }
// Returns: { created: number, skipped: number, errors: string[] }
//
// Each row goes through the shared sourcing facade (findOrCreateCandidateProfile
// under the hood), the same path the copilot `import_candidates_csv` tool uses.
export const POST = withCapability('recruiting:edit', async (request, orgId, supabase) => {
  let body: { candidates: ParsedCandidate[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { candidates } = body
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return NextResponse.json({ error: 'candidates array is required' }, { status: 400 })
  }

  const result = await createCandidatesFromParsed(supabase, orgId, candidates)
  return NextResponse.json(result)
})
