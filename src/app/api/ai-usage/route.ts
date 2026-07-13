import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'

/**
 * GET /api/ai-usage?days=7|30|90
 *
 * Admin-only, per-org summary of AI token usage and estimated cost, read from
 * the `ai_usage` ledger (migration 086). Strictly org-scoped — every row is
 * filtered by the caller's org, so an admin only ever sees their own org's data.
 * Aggregation happens in JS (per-org windows are modest); paginates past the
 * 1000-row PostgREST cap with a safety limit.
 */
export const GET = withCapability('settings:edit', async (req, orgId, supabase) => {
  const daysParam = Number(new URL(req.url).searchParams.get('days'))
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const PAGE = 1000
  const MAX_ROWS = 50_000 // hard cap so a huge window can't exhaust memory
  type Row = {
    user_id: string | null
    module: string
    model: string
    input_tokens: number
    output_tokens: number
    estimated_cost_usd: number
    created_at: string
  }

  const rows: Row[] = []
  let truncated = false
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const { data, error } = await supabase
      .from('ai_usage')
      .select('user_id, module, model, input_tokens, output_tokens, estimated_cost_usd, created_at')
      .eq('org_id', orgId)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) return handleSupabaseError(error)

    const batch = (data ?? []) as Row[]
    rows.push(...batch)
    if (batch.length < PAGE) break
    if (offset + PAGE >= MAX_ROWS) truncated = true
  }

  // NUMERIC columns can arrive as strings for high precision — coerce defensively.
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
  const round = (n: number) => Math.round(n * 1e6) / 1e6

  let totalCost = 0
  let totalIn = 0
  let totalOut = 0
  const byModule = new Map<string, { calls: number; cost: number; input: number; output: number }>()
  const byModel = new Map<string, { calls: number; cost: number }>()
  const byUser = new Map<string, { calls: number; cost: number }>() // key = user_id, or '__none__' for background/public
  const byDay = new Map<string, { cost: number; calls: number }>()

  for (const r of rows) {
    const cost = num(r.estimated_cost_usd)
    const inTok = num(r.input_tokens)
    const outTok = num(r.output_tokens)
    totalCost += cost
    totalIn += inTok
    totalOut += outTok

    const mod = byModule.get(r.module) ?? { calls: 0, cost: 0, input: 0, output: 0 }
    mod.calls++; mod.cost += cost; mod.input += inTok; mod.output += outTok
    byModule.set(r.module, mod)

    const mdl = byModel.get(r.model) ?? { calls: 0, cost: 0 }
    mdl.calls++; mdl.cost += cost
    byModel.set(r.model, mdl)

    const ukey = r.user_id ?? '__none__'
    const usr = byUser.get(ukey) ?? { calls: 0, cost: 0 }
    usr.calls++; usr.cost += cost
    byUser.set(ukey, usr)

    const day = r.created_at.slice(0, 10)
    const d = byDay.get(day) ?? { cost: 0, calls: 0 }
    d.cost += cost; d.calls++
    byDay.set(day, d)
  }

  // Resolve display names for the per-employee breakdown.
  const userIds = Array.from(byUser.keys()).filter((k) => k !== '__none__')
  const nameById = new Map<string, { name: string; email: string | null }>()
  if (userIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, first_name, last_name, email')
      .in('id', userIds)
    for (const u of (users ?? []) as Array<Record<string, string | null>>) {
      const name =
        u.full_name ||
        [u.first_name, u.last_name].filter(Boolean).join(' ') ||
        u.email ||
        'Unknown'
      nameById.set(u.id as string, { name, email: u.email ?? null })
    }
  }

  const perFeature = Array.from(byModule.entries())
    .map(([module, v]) => ({
      module,
      calls: v.calls,
      cost: round(v.cost),
      input_tokens: v.input,
      output_tokens: v.output,
    }))
    .sort((a, b) => b.cost - a.cost)

  const perModel = Array.from(byModel.entries())
    .map(([model, v]) => ({ model, calls: v.calls, cost: round(v.cost) }))
    .sort((a, b) => b.cost - a.cost)

  const perUser = Array.from(byUser.entries())
    .map(([key, v]) => ({
      user_id: key === '__none__' ? null : key,
      name: key === '__none__' ? 'Automated / no user' : nameById.get(key)?.name ?? 'Unknown user',
      email: key === '__none__' ? null : nameById.get(key)?.email ?? null,
      calls: v.calls,
      cost: round(v.cost),
    }))
    .sort((a, b) => b.cost - a.cost)

  // Fill every day in the window so the trend renders as a continuous series.
  const trend: Array<{ date: string; cost: number; calls: number }> = []
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    const d = byDay.get(day)
    trend.push({ date: day, cost: round(d?.cost ?? 0), calls: d?.calls ?? 0 })
  }

  return NextResponse.json({
    data: {
      days,
      truncated,
      totals: {
        cost: round(totalCost),
        calls: rows.length,
        input_tokens: totalIn,
        output_tokens: totalOut,
      },
      per_feature: perFeature,
      per_model: perModel,
      per_user: perUser,
      trend,
    },
  })
})
