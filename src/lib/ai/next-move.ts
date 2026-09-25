/**
 * The brain's "next move" for the adaptive planner (#3). Given the brief, the plan so
 * far and how far short of the per-role target it is, propose the SINGLE next expansion
 * a specialist recruiter would make — prefer naming MORE same-space companies at the same
 * title, then feeder titles, then (last, and never for remote) a wider location. Cheap
 * model (Flash). Returns null on failure or when there's no useful move.
 */
import { z } from 'zod'
import { generateText } from '@/lib/ai/llm'
import { parseAiJson } from '@/lib/ai/parse-ai-response'
import { withRetry } from '@/lib/ai/retry'
import { trackUsage, type UsageIdentity } from '@/lib/ai/track-usage'
import { logger } from '@/lib/logger'
import type { RecruiterBrief } from '@/lib/types/icp'
import type { AdaptiveMove, NextMoveContext } from '@/modules/pool/search/adaptive-plan'

const FLASH = 'gemini-2.5-flash'

const moveSchema = z.object({
  kind: z.enum(['more_companies', 'feeder_titles', 'wider_location']),
  label: z.string().max(120),
  companies: z.array(z.string().max(80)).max(30).default([]),
  titles: z.array(z.string().max(80)).max(20).default([]),
  rationale: z.string().max(400).default(''),
})

function buildPrompt(brief: RecruiterBrief | null | undefined, ctx: NextMoveContext, remote: boolean): string {
  const levels = ctx.levels.map((l) => `- ${l.label}: ${l.total ?? '?'} people`).join('\n')
  const usedPools = (brief?.feeder_pools ?? []).map((p) => p.label).join(' · ') || '(none)'
  return `You are the SPECIALIST recruiter running this exact search. Your plan so far reaches about ${ctx.reach} people against a target of ${ctx.target} qualified leads — you are ${ctx.remaining} short.

Levels probed so far:
${levels || '(none)'}

Your brief:
- niche: ${brief?.niche || '(unknown)'}
- title families (the exact titles): ${(brief?.title_families ?? []).join(', ') || '(none)'}
- career-progression / feeder titles: ${(brief?.adjacent_titles ?? []).join(', ') || '(none)'}
- feeder pools already in the plan: ${usedPools}

Propose the SINGLE next expansion a recruiter would make to close the gap, in this PRIORITY order:
1. more_companies — name MORE real, same-space employers at the SAME title (direct competitors, close peers, big-tech teams doing this work) that are NOT already listed above. Prefer this FIRST — exhaust company breadth before compromising the title.
2. feeder_titles — step to the logical career-progression titles (the feeders) across the companies already in the plan. Use only once company breadth is genuinely exhausted.
3. wider_location — widen the geography.${remote ? ' NOT ALLOWED here — this role is remote; never choose this.' : ' Last resort only.'}

Name SPECIFIC companies or titles (never categories). Do not repeat anything already in the plan. Respond with ONLY JSON:
{ "kind": "more_companies", "label": "Same-space peers: Greenhouse, Lever, Ashby", "companies": ["Greenhouse", "Lever", "Ashby"], "titles": [], "rationale": "..." }`
}

export async function proposeNextMove(
  brief: RecruiterBrief | null | undefined,
  ctx: NextMoveContext,
  opts: { remote?: boolean; identity?: UsageIdentity } = {},
): Promise<AdaptiveMove | null> {
  try {
    const { text, usage, model } = await withRetry(
      () => generateText(buildPrompt(brief, ctx, !!opts.remote), { model: FLASH, maxTokens: 1500, json: true }),
      { label: 'Adaptive planner next-move' },
    )
    trackUsage('adaptive-next-move', model, usage, opts.identity ?? {})
    const move = parseAiJson(text, moveSchema, 'Adaptive planner next-move')
    if (move.kind === 'wider_location' && opts.remote) return null
    if (move.kind === 'more_companies' && !move.companies.length) return null
    if (move.kind === 'feeder_titles' && !move.titles.length) return null
    return move
  } catch (err) {
    logger.warn('Adaptive planner: next-move failed', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}
