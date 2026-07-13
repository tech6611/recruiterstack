import { logger } from '@/lib/logger'
import { createAdminClient } from '@/lib/supabase/server'

/** Approximate cost per 1M tokens (USD) as of 2025 */
const PRICING: Record<string, { input: number; output: number }> = {
  // Gemini (current provider)
  'gemini-2.5-pro':   { input: 1.25, output: 10.0 },
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
}

interface Usage {
  input_tokens: number
  output_tokens: number
}

/**
 * Who triggered an AI call, for per-client / per-employee cost attribution.
 * Both fields are optional: public token flows (apply, parse-cv) and background
 * jobs have no signed-in user, and a handful of system flows have no resolved
 * org. Pass whatever is available at the call site.
 */
export interface UsageIdentity {
  /** Clerk org id (the client / workspace). */
  orgId?: string | null
  /** Our internal users.id UUID (NOT the raw Clerk id). */
  userId?: string | null
}

/**
 * Log token usage and estimated cost for an AI API call.
 * Called after every AI API call for cost visibility.
 *
 * Emits a structured stdout line (as before) AND persists one row to the
 * `ai_usage` table (migration 086) tagged with who triggered it, so cost per
 * client and per employee can be queried from real data. The DB write is
 * best-effort and fire-and-forget: it never blocks the caller's response and a
 * logging failure never surfaces as a user-facing error.
 */
export function trackUsage(
  module: string,
  model: string,
  usage: Usage,
  identity: UsageIdentity = {},
): void {
  const pricing = PRICING[model] ?? { input: 3.0, output: 15.0 }
  const costUsd =
    (usage.input_tokens / 1_000_000) * pricing.input +
    (usage.output_tokens / 1_000_000) * pricing.output
  const estimatedCostUsd = Math.round(costUsd * 10000) / 10000 // 4 decimal places

  logger.info('ai_usage', {
    module,
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    estimated_cost_usd: estimatedCostUsd,
    org_id: identity.orgId ?? null,
    user_id: identity.userId ?? null,
  })

  // Fire-and-forget: persist for reporting without making the caller wait.
  void persistUsage(module, model, usage, estimatedCostUsd, identity)
}

async function persistUsage(
  module: string,
  model: string,
  usage: Usage,
  estimatedCostUsd: number,
  identity: UsageIdentity,
): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('ai_usage').insert({
      org_id: identity.orgId ?? null,
      user_id: identity.userId ?? null,
      module,
      model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      estimated_cost_usd: estimatedCostUsd,
    })
    if (error) {
      logger.error('ai_usage persist failed', undefined, {
        module,
        code: error.code,
        message: error.message,
      })
    }
  } catch (err) {
    logger.error('ai_usage persist threw', err, { module })
  }
}
