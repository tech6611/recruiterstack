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
import { executeTool, toolPermissionError } from '@/lib/copilot-tools'
import { needsApproval, describeAction, queuedMessage, type ApprovalQueue } from '@/lib/copilot/approvals'
import { runToolLoop, type ToolSchema, type ToolLoopOptions } from '@/lib/ai/llm'
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
  /** Optional live-progress hook, fired before/after each inner tool call. */
  onProgress?: ToolLoopOptions['onProgress']
  /** Where risky calls (sends, bulk/irreversible changes — see
   *  lib/copilot/approvals.ts) are held for the recruiter's approval. Without a
   *  queue those calls are refused outright: only the copilot chat, which can
   *  show an approval card, may prepare them. */
  approvals?: ApprovalQueue
}

/** Run one tool call for a sub-agent, enforcing (1) its own tool list and
 *  (2) the approval lock. Exported for tests. */
export async function runSubAgentTool(
  opts: Pick<SubAgentOptions, 'tools' | 'orgId' | 'userId' | 'supabase' | 'capabilities' | 'approvals'>,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  // The model may only call tools it was given — never a made-up or
  // other-agent tool name (executeTool itself would run any name).
  if (!opts.tools.some(t => t.name === name)) {
    return `Error: "${name}" is not one of your tools. Use only the tools you were given.`
  }
  if (needsApproval(name, args)) {
    const denied = toolPermissionError(name, opts.capabilities)
    if (denied) return denied
    if (!opts.approvals) {
      return `Not done: "${name}" needs a recruiter's approval and can only be prepared from the copilot chat.`
    }
    const preview = await describeAction(name, args, opts.orgId, opts.supabase)
    opts.approvals.add({ tool: name, args, preview })
    return queuedMessage(preview)
  }
  return executeTool(name, args, opts.orgId, opts.supabase, opts.capabilities, opts.userId)
}

export async function runSubAgent(opts: SubAgentOptions): Promise<string> {
  const { text, usage, model } = await runToolLoop({
    model:         opts.model,
    system:        opts.systemPrompt,
    tools:         opts.tools,
    task:          opts.task,
    maxTokens:     MAX_TOKENS,
    maxIterations: opts.maxIterations,
    onProgress:    opts.onProgress,
    executeTool:  (name, args) => runSubAgentTool(opts, name, args),
  })
  trackUsage('sub-agent', model, usage, { orgId: opts.orgId, userId: opts.userId })
  return text
}
