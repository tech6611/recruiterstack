/**
 * Non-streaming inner agent loop for a single module's sub-agent.
 *
 * The orchestrator (delegate_to_*) calls this; it runs the model with the
 * sub-agent's curated tool set + focused system prompt, executes any tool
 * calls via the shared `executeTool`, and returns the final assistant text.
 * The orchestrator surfaces that text to the user (and may compose it with
 * other delegations).
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { executeTool } from '@/lib/copilot-tools'
import type { Capability } from '@/lib/permissions'

const MAX_ITERATIONS = 8
const MAX_TOKENS = 2048

export interface SubAgentOptions {
  client: Anthropic
  model: string
  tools: Anthropic.Tool[]
  systemPrompt: string
  /** The natural-language task the orchestrator is delegating. */
  task: string
  orgId: string
  supabase: SupabaseClient
  /** Caller's RBAC capabilities. When set, tools are capability-gated; omit for
   *  background/system contexts (WhatsApp responder, autopilot) to run unrestricted. */
  capabilities?: Set<Capability> | null
  /** Override the tool-loop cap (default 8). */
  maxIterations?: number
}

export async function runSubAgent(opts: SubAgentOptions): Promise<string> {
  const conversation: Anthropic.MessageParam[] = [
    { role: 'user', content: opts.task },
  ]

  const maxIterations = opts.maxIterations ?? MAX_ITERATIONS
  for (let i = 0; i < maxIterations; i++) {
    const msg = await opts.client.messages.create({
      model:      opts.model,
      max_tokens: MAX_TOKENS,
      system:     opts.systemPrompt,
      tools:      opts.tools,
      messages:   conversation,
    })

    conversation.push({ role: 'assistant', content: msg.content })

    const toolUses = msg.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )

    if (msg.stop_reason !== 'tool_use' || toolUses.length === 0) {
      // Done — return the assistant's final text.
      return msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim()
    }

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const input = (tu.input ?? {}) as Record<string, unknown>
      const result = await executeTool(tu.name, input, opts.orgId, opts.supabase, opts.capabilities)
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: result })
    }
    conversation.push({ role: 'user', content: results })
  }

  return '(sub-agent reached iteration limit without finishing)'
}
