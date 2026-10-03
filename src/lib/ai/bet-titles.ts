/**
 * A bet's TITLES and its EXCLUSIONS, written by the recruiter brain for this job — never
 * from a fixed list. Given the role, one bet (its name, thesis, companies, current titles)
 * and, when we have it, the titles real people at those companies actually hold, the
 * model writes:
 *   - titles: what this bet's people put on their own profiles there, in the line of
 *     work the bet means — never a bare level word ("Associate" fits anyone at the firm);
 *   - exclusions: titles at those companies that share words with them but are another
 *     job (the engineers or assistants a recruiter would skip there);
 *   - line_of_work: a few words naming the work.
 * Used by the brief's repair pass (a pool written as level words only) and by the
 * "Suggest titles" button on a bet card.
 */
import { z } from 'zod'
import { generateText } from '@/lib/ai/llm'
import { parseAiJson } from '@/lib/ai/parse-ai-response'
import { withRetry } from '@/lib/ai/retry'
import { trackUsage, type UsageIdentity } from '@/lib/ai/track-usage'
import { isGenericTitleTerm } from '@/lib/bets'

const MODEL = 'gemini-2.5-flash'

export interface BetTitlesInput {
  role: { title: string; description?: string | null; niche?: string | null; seniority?: string | null }
  bet: { label: string; thesis?: string | null; where_from?: string | null; companies: string[]; titles: string[]; exclusions?: string[]; line_of_work?: string | null }
  /** Titles real people at these companies hold (most common first), with counts. */
  observed?: { title: string; count: number }[]
}

const itemSchema = z.object({ title: z.string().trim().min(2).max(120), why: z.string().trim().max(300).nullish() })
export const betTitlesSchema = z.object({
  line_of_work: z.string().trim().max(120).nullish(),
  titles: z.array(itemSchema).max(15).default([]),
  exclusions: z.array(itemSchema).max(15).default([]),
})
export type BetTitles = z.infer<typeof betTitlesSchema>

/** A title list a search cannot use: every entry is a bare level word. PURE. */
export function onlyLevelWords(titles: string[]): boolean {
  const vals = titles.map((t) => t.trim()).filter(Boolean)
  return vals.length > 0 && vals.every(isGenericTitleTerm)
}

export function buildBetTitlesPrompt(input: BetTitlesInput): string {
  const { role, bet, observed } = input
  const seen = (observed ?? []).slice(0, 40).map((o) => `- ${o.title} (${o.count})`).join('\n')
  return `You are a specialist recruiter${role.niche ? ` (${role.niche})` : ''} hiring for: ${role.title}${role.seniority ? ` — ${role.seniority}` : ''}.
${role.description ? `<role>\n${role.description.slice(0, 2500)}\n</role>\n` : ''}
One of your sourcing bets:
<bet>
Name: ${bet.label}
${bet.thesis ? `Who: ${bet.thesis}\n` : ''}${bet.where_from ? `Where from: ${bet.where_from}\n` : ''}Companies: ${bet.companies.join(', ')}
Titles today: ${bet.titles.join(', ') || '(none)'}
${bet.exclusions?.length ? `Excluded today: ${bet.exclusions.join(', ')}\n` : ''}${bet.line_of_work ? `Line of work: ${bet.line_of_work}\n` : ''}</bet>
${seen ? `<observed_titles>\nTitles real people at these companies hold today, most common first (count):\n${seen}\n</observed_titles>\n` : ''}
Write the titles to search for THIS bet at THESE companies:
- titles: what this bet's people put on their own profiles at these companies, for the work this bet means and at the level this role hires. Include the line of work in the title — never a bare level word ("Analyst", "Associate", "Manager", "Senior" alone match everyone at the firm, including engineers and assistants). Prefer phrasings you see in <observed_titles> when they are this bet's people. 3–10 titles.
- exclusions: titles at these companies that share words with your titles but are a different job (engineering, assistants, back-office, research support — whatever applies HERE). Only ones a recruiter would actually skip. 0–10.
- line_of_work: a few words naming the work this bet's people do.
Give a short why for each. Return ONLY JSON:
{"line_of_work": "", "titles": [{"title": "", "why": ""}], "exclusions": [{"title": "", "why": ""}]}`
}

/** Ask the model for one bet's titles and exclusions. Throws on failure — callers decide the fallback. */
export async function suggestBetTitles(input: BetTitlesInput, identity: UsageIdentity = {}): Promise<BetTitles> {
  const { text, usage, model } = await withRetry(
    () => generateText(buildBetTitlesPrompt(input), { model: MODEL, maxTokens: 4096, json: true }),
    { label: 'Bet titles' },
  )
  trackUsage('bet-titles', model, usage, identity)
  const out = parseAiJson(text, betTitlesSchema, 'Bet titles')
  // The one rule that holds in every industry: a bare level word is not a title.
  return { ...out, titles: out.titles.filter((t) => !isGenericTitleTerm(t.title)) }
}
