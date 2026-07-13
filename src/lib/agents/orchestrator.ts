/**
 * Top-level orchestrator for the RecruiterStack copilot.
 *
 * Routes a user's natural-language request to the right module sub-agent(s)
 * (ATS for recruiting, HRIS for employees), composes their replies, and owns
 * cross-module concerns: approval gates and structured-plan emission.
 *
 * The orchestrator's own tool surface is intentionally tiny — delegation +
 * approval only. The sub-agents do the actual domain work.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolSchema } from '@/lib/ai/llm'
import type { Capability } from '@/lib/permissions'
import { ATS_SYSTEM_PROMPT, ATS_TOOLS } from '@/modules/ats/agent'
import { HRIS_SYSTEM_PROMPT, HRIS_TOOLS } from '@/modules/hris/agent'
import { CRM_SYSTEM_PROMPT, CRM_TOOLS } from '@/modules/crm/agent'
import { PAYROLL_SYSTEM_PROMPT, PAYROLL_TOOLS } from '@/modules/payroll/agent'
import { runSubAgent } from '@/lib/agents/sub-agent'

export const ORCHESTRATOR_TOOLS: ToolSchema[] = [
  {
    name: 'delegate_to_ats',
    description:
      'Delegate a recruiting task to the ATS sub-agent. Use for anything about candidates, jobs/pipelines, applications, interviews, offers, scoring, sourcing, sequences, recruiting analytics, intake, scorecards, or sending recruiter emails. Pass the full task in natural language; the sub-agent has all recruiting tools.',
    input_schema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            'The complete task to delegate, in natural language. Include any specifics the sub-agent needs (job/candidate names, status filters, criteria, draft instructions).',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'delegate_to_hris',
    description:
      'Delegate an employee/HRIS task to the HRIS sub-agent. Use for listing employees, marking pre-hires as joined (active), terminating employees, or anything about people in their employee role (post-hire).',
    input_schema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'The complete employee/HRIS task, in natural language.',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'delegate_to_crm',
    description:
      'Delegate an outreach/sequence/CRM task to the CRM sub-agent. Use for listing outreach sequences, fetching sequence details and stages, or checking a candidate\'s enrollment history. v1 is read-only — sequence writes/enrollment go through the app UI.',
    input_schema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'The complete CRM/outreach task, in natural language.',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'delegate_to_payroll',
    description:
      "Delegate a payroll/payslip task to the Payroll sub-agent. Use for listing payroll runs and totals, viewing what a run paid out, or fetching one employee's payslip history. v0 is read-only — run creation and finalization go through the app UI.",
    input_schema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'The complete payroll/payslip task, in natural language.',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'request_approval',
    description:
      'Pause and ask the recruiter to approve a significant action before delegating. Use BEFORE delegating any task that involves: sending emails or WhatsApp messages, creating jobs, bulk actions affecting 3+ candidates, rejecting/withdrawing candidates, creating offers, scheduling interviews, or terminating an employee.',
    input_schema: {
      type: 'object',
      properties: {
        action_summary: { type: 'string', description: 'Short summary of the action to confirm.' },
        details:        { type: 'string', description: 'Specifics — who, what, how many.' },
        impact:         { type: 'string', description: 'What changes if approved (emails sent, records updated, etc.).' },
      },
      required: ['action_summary', 'impact'],
    },
  },
]

export const ORCHESTRATOR_SYSTEM_PROMPT = `You are the top-level RecruiterStack copilot. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

RecruiterStack is a unified ATS + CRM + HRIS + Payroll suite — one person record flows from lead to candidate to hire to employee to paid employee. You don't do the work yourself; you decide which module sub-agent to delegate to, gate risky actions behind the recruiter's approval, and compose answers.

ROUTING — pick the right delegate:
- delegate_to_ats: candidates, jobs, pipelines, applications, interviews, offers, scoring, sourcing, recruiting analytics, intake, scorecards, recruiter outreach emails or WhatsApp messages to specific applications.
- delegate_to_crm: outreach sequences (list, detail, stages), a candidate's enrollment history across sequences. v1 is read-only.
- delegate_to_hris: employees, pre-hires, marking someone joined, terminating, comp, time-off, onboarding, HR cases, documents, leave balances, OKRs — anything post-hire / people-platform.
- delegate_to_payroll: payroll runs, payslips, what an employee was paid in a period, gross/deductions/net totals across the org. v0 is read-only.
- Cross-module tasks ("hire Jane AND mark her joined Monday"): delegate to ATS for the hire, then to HRIS for the join. Do them in sequence in your response.

When delegating, pass a clear self-contained task in natural language — include all the specifics (names, filters, criteria) the sub-agent needs. The sub-agent's reply comes back as a tool result; relay the useful parts to the user concisely.

APPROVAL GATES — call request_approval BEFORE delegating any task that will:
- Send emails or WhatsApp messages to candidates
- Create jobs or intake requests
- Bulk-act on 3+ candidates (move/reject/score)
- Reject or withdraw candidates
- Create offers
- Schedule interviews
- Terminate an employee
- Change or set employee compensation (any new comp record)
- Submit a time-off request (commits days off; auto-routes to the requester's manager)
- Start an onboarding plan for an employee (instantiates a checklist + notifies the new hire)

For simple read/lookup requests, delegate immediately — no approval needed.

PLANS — for multi-step workflows or hiring initiatives, ask for missing critical info, then emit a structured plan in your response exactly like this:

   <!-- PLAN: {"summary":"...","steps":[{"number":1,"description":"...","tools":["delegate_to_ats"],"needs_approval":false,"status":"pending"}]} -->

Then call request_approval so the recruiter can review and approve before you start delegating.

ASK FOR THE MINIMUM: before asking the recruiter anything, reason about what the task actually requires. Only ask for information that is genuinely required and that you cannot infer or have a sub-agent look up (a lookup delegation is cheaper than a question). Don't ask for optional details, and don't ask for inputs that belong to a later step or a different entity — each entity has its own real preconditions (e.g. a requisition needs no job description; a job depends on an approved requisition; an approver is assigned automatically, never named by the user). When you must ask, batch the missing required inputs into ONE short question.

Be concise. Use names, not IDs.`

interface ExecutorContext {
  model:     string
  orgId:     string
  /** Internal users.id of the acting user — set as created_by on writes that
   *  require it (e.g. canonical jobs). Null in background/system contexts. */
  userId?:   string | null
  supabase:  SupabaseClient
  /** Caller's RBAC capabilities, threaded to sub-agent tools (RBAC Slice 3). */
  capabilities?: Set<Capability> | null
}

/**
 * Execute one orchestrator tool. Delegate tools run a non-streaming inner
 * sub-agent loop and return its final text. `request_approval` is intentionally
 * unhandled here — the route detects it and emits a checkpoint event without
 * executing.
 */
export async function executeOrchestratorTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ExecutorContext,
): Promise<string> {
  const task = typeof input.task === 'string' ? input.task : ''

  switch (name) {
    case 'delegate_to_ats':
      return runSubAgent({
        model:        ctx.model,
        tools:        ATS_TOOLS,
        systemPrompt: ATS_SYSTEM_PROMPT,
        task,
        orgId:        ctx.orgId,
        userId:       ctx.userId,
        supabase:     ctx.supabase,
        capabilities: ctx.capabilities,
      })

    case 'delegate_to_hris':
      return runSubAgent({
        model:        ctx.model,
        tools:        HRIS_TOOLS,
        systemPrompt: HRIS_SYSTEM_PROMPT,
        task,
        orgId:        ctx.orgId,
        userId:       ctx.userId,
        supabase:     ctx.supabase,
        capabilities: ctx.capabilities,
      })

    case 'delegate_to_crm':
      return runSubAgent({
        model:        ctx.model,
        tools:        CRM_TOOLS,
        systemPrompt: CRM_SYSTEM_PROMPT,
        task,
        orgId:        ctx.orgId,
        userId:       ctx.userId,
        supabase:     ctx.supabase,
        capabilities: ctx.capabilities,
      })

    case 'delegate_to_payroll':
      return runSubAgent({
        model:        ctx.model,
        tools:        PAYROLL_TOOLS,
        systemPrompt: PAYROLL_SYSTEM_PROMPT,
        task,
        orgId:        ctx.orgId,
        userId:       ctx.userId,
        supabase:     ctx.supabase,
        capabilities: ctx.capabilities,
      })

    default:
      return `Unknown orchestrator tool: ${name}`
  }
}
