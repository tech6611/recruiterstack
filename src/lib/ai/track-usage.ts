import { logger } from '@/lib/logger'

/** Approximate cost per 1M tokens (USD) as of 2025 */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':           { input: 15.0,  output: 75.0  },
  'claude-sonnet-4-6':         { input: 3.0,   output: 15.0  },
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.0   },
}

interface Usage {
  input_tokens: number
  output_tokens: number
}

/**
 * Log token usage and estimated cost for an AI API call.
 * Called after every Anthropic API call for cost visibility.
 */
export function trackUsage(module: string, model: string, usage: Usage): void {
  const pricing = PRICING[model] ?? { input: 3.0, output: 15.0 }
  const costUsd =
    (usage.input_tokens / 1_000_000) * pricing.input +
    (usage.output_tokens / 1_000_000) * pricing.output

  logger.info('ai_usage', {
    module,
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    estimated_cost_usd: Math.round(costUsd * 10000) / 10000, // 4 decimal places
  })
}
