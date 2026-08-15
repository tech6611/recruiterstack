import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { embedTexts } from '@/lib/ai/llm'
import { candidateEmbeddingText } from '@/lib/ai/embeddings'

export const maxDuration = 300

// `candidates.embedding` (migration 108) isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

interface Row {
  id: string
  current_title: string | null
  current_company: string | null
  skills: string[] | null
}

/** POST — backfill embeddings for candidates that don't have one yet (batched;
 *  call repeatedly until `remaining` is 0). Enables semantic sourcing (5c). */
export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase) => {
  const sb = supabase as unknown as LooseSb
  try {
    const { data: rows, error } = await sb
      .from('candidates')
      .select('id, current_title, current_company, skills')
      .eq('org_id', orgId)
      .is('embedding', null)
      .limit(100)
    if (error) return handleSupabaseError(error)
    if (!rows || rows.length === 0) return NextResponse.json({ data: { embedded: 0, remaining: 0 } })

    const vectors = await embedTexts((rows as Row[]).map((r) => candidateEmbeddingText(r)))
    let embedded = 0
    for (let i = 0; i < rows.length; i++) {
      const v = vectors[i]
      if (!v || v.length === 0) continue
      const { error: uErr } = await sb.from('candidates').update({ embedding: v }).eq('id', rows[i].id).eq('org_id', orgId)
      if (!uErr) embedded++
    }

    const { count } = await sb
      .from('candidates')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('embedding', null)

    return NextResponse.json({ data: { embedded, remaining: count ?? 0 } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
