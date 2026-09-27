'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { fitBucketFor } from '@/lib/ai/fit-bucket'

interface Item {
  source: 'yours' | 'market'
  ref_id: string
  name: string
  title: string | null
  company: string | null
  location: string | null
  score: number
  fit_bucket: string
  rationale: string
  gate_failures: string[]
  reachable?: boolean
}
interface Archetype { name: string; thesis: string; where_from?: string | null; is_non_obvious?: boolean }
interface Brief {
  role_title: string | null
  reasoning: string | null
  archetypes: Archetype[]
  shortlist: Item[]
  counts: { total: number; yours: number; market: number; great: number; good: number; okay: number }
}

const BUCKET_LABEL: Record<string, string> = { great: 'Great', good: 'Good', okay: 'Okay', weak: 'Weak' }

/** The shortlist as plain text for the hiring manager: what we're looking for, the bets,
 *  and the top candidates across both pools. PURE. */
export function shortlistText(brief: Brief): string {
  const lines: string[] = []
  lines.push(`Shortlist — ${brief.role_title ?? 'this role'}`)
  lines.push('')
  if (brief.reasoning) { lines.push('What we’re looking for:'); lines.push(brief.reasoning); lines.push('') }
  if (brief.archetypes?.length) {
    lines.push('Who could fit (the bets we’re making):')
    brief.archetypes.forEach((a) => lines.push(`- ${a.name}${a.is_non_obvious ? ' (non-obvious)' : ''}: ${a.thesis}`))
    lines.push('')
  }
  lines.push(`Top candidates (${brief.counts.total} — ${brief.counts.yours} from our pool, ${brief.counts.market} from the market):`)
  brief.shortlist.forEach((i, n) => {
    const where = [i.title, i.company].filter(Boolean).join(' @ ')
    const bk = fitBucketFor(i.score, i.gate_failures.length === 0)
    lines.push(`${n + 1}. ${i.name}${where ? ` — ${where}` : ''} [${BUCKET_LABEL[bk] ?? 'Fit'}, ${i.score}/100${i.source === 'market' ? ', market' : ''}]`)
    if (i.rationale) lines.push(`   ${i.rationale}`)
  })
  return lines.join('\n')
}

/**
 * "Copy shortlist" — the hiring-manager hand-off from the one results table. It used to
 * be a separate Shortlist brief section: a third ranked list that re-showed the ICP's
 * reasoning (which now lives once, on the Scoring tab). The brief is fetched ahead of
 * the click (`refreshKey` changes after every rank / find), because browsers only allow
 * a clipboard write straight from the click.
 */
export function CopyShortlistButton({ jobId, refreshKey }: { jobId: string; refreshKey: number }) {
  const [brief, setBrief] = useState<Brief | null>(null)

  const load = useCallback(async (): Promise<Brief | null> => {
    const res = await fetch(`/api/jobs/${jobId}/brief`)
    if (!res.ok) return null
    const { data } = await res.json()
    setBrief(data as Brief)
    return data as Brief
  }, [jobId])

  useEffect(() => { load() }, [load, refreshKey])

  async function copy() {
    const b = brief ?? (await load())
    if (!b || b.shortlist.length === 0) { toast('Nothing to copy yet — rank candidates first.'); return }
    navigator.clipboard.writeText(shortlistText(b)).then(
      () => toast.success(`Shortlist of ${b.counts.total} copied — paste it to your hiring manager.`),
      () => toast.error('Could not copy — your browser blocked the clipboard.'),
    )
  }

  return (
    <Button size="sm" variant="outline" onClick={copy} disabled={!!brief && brief.shortlist.length === 0}
      title="Copy the ranked shortlist across your candidates and the market, with the reasoning, as text for the hiring manager">
      <Copy className="h-3.5 w-3.5" /> Copy shortlist
    </Button>
  )
}
