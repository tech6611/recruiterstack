/**
 * Non-streaming inner agent loop for a single module's sub-agent.
 *
 * The orchestrator (delegate_to_*) calls this; it runs the model with the
 * sub-agent's curated tool set + focused system prompt, executes any tool
 * calls via the shared `executeTool`, and returns the final assistant text.
 * The orchestrator surfaces that text to the user (and may compose it with
 * other delegations).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { executeTool } from '@/lib/copilot-tools'
import { runToolLoop, type ToolSchema } from '@/lib/ai/llm'
import { trackUsage } from '@/lib/ai/track-usage'
import type { Capability } from '@/lib/permissions'

const MAX_TOKENS = 2048

export interface SubAgentOptions {
  model: string
  tools: ToolSchema[]
  systemPrompt: string
  /** The natural-language task the orchestrator is delegating. */
  task: string
  orgId: string
  /** Internal users.id of the acting user — threaded to tools that stamp
   *  created_by (e.g. canonical job creation). Null in background contexts. */
  userId?: string | null
  supabase: SupabaseClient
  /** Caller's RBAC capabilities. When set, tools are capability-gated; omit for
   *  background/system contexts (WhatsApp responder, autopilot) to run unrestricted. */
  capabilities?: Set<Capability> | null
  /** Override the tool-loop cap (default 8). */
  maxIterations?: number
}

export async function runSubAgent(opts: SubAgentOptions): Promise<string> {
  const { text, usage, model } = await runToolLoop({
    model:         opts.model,
    system:        opts.systemPrompt,
    tools:         opts.tools,
    task:          opts.task,
    maxTokens:     MAX_TOKENS,
    maxIterations: opts.maxIterations,
    executeTool:   (name, args) =>
      executeTool(name, args, opts.orgId, opts.supabase, opts.capabilities, opts.userId),
  })
  trackUsage('sub-agent', model, usage, { orgId: opts.orgId, userId: opts.userId })
  return text
}
