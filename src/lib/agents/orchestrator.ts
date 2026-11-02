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
import { runSubAgent, type SubAgentOptions } from '@/lib/agents/sub-agent'

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
    name: 'ask_user_form',
    description:
      'Show the recruiter ONE click-through form with every input still needed for the whole ask (all steps in the chain), instead of asking in text. The chat pauses until they submit; their answers come back as the next message. Submitting the form counts as approval for the steps it lists.',
    input_schema: {
      type: 'object',
      properties: {
        intro: { type: 'string', description: 'One short sentence above the form, e.g. "To open this role I need a few details."' },
        subject: { type: 'string', description: 'What the form is about, e.g. the role title "Senior Sales Manager". Used when the recruiter clicks "Write with AI".' },
        steps: {
          type: 'array',
          description: 'The steps you will take, in order, as short labels, e.g. ["Draft requisition", "Submit for approval", "Create job"].',
          items: { type: 'string' },
        },
        fields: {
          type: 'array',
          description: 'Every field to ask for, required ones first. Pick the type from the FORM FIELD TYPES list in your instructions.',
          items: {
            type: 'object',
            properties: {
              key:        { type: 'string', description: 'The tool argument this answer maps to, e.g. "department", "justification", "job_description".' },
              label:      { type: 'string', description: 'Plain-English label shown to the recruiter.' },
              type:       { type: 'string', enum: ['text', 'rich_text', 'number', 'date', 'yes_no', 'select', 'department', 'location', 'level', 'employment_type', 'currency', 'person'] },
              required:   { type: 'boolean' },
              default:    { type: 'string', description: 'Pre-filled value (for optional fields: the default you will use). For a person: "Name <email>".' },
              options:    { type: 'array', items: { type: 'string' }, description: 'Choices — ONLY for type "select".' },
              help:       { type: 'string', description: 'Short hint under the field.' },
              min_length: { type: 'number', description: 'Minimum characters, e.g. 50 for a requisition justification.' },
            },
            required: ['key', 'label', 'type'],
          },
        },
      },
      required: ['steps', 'fields'],
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

Exception: if the recruiter just submitted an ask_user_form whose steps include the action, that submission is the approval — don't ask again.

For simple read/lookup requests, delegate immediately — no approval needed.

PLANS — for multi-step workflows or hiring initiatives, ask for missing info with ask_user_form (see below). If you used a form, skip the plan + approval below and proceed once it is submitted. Otherwise, emit a structured plan in your response exactly like this:

   <!-- PLAN: {"summary":"...","steps":[{"number":1,"description":"...","tools":["delegate_to_ats"],"needs_approval":false,"status":"pending"}]} -->

Then call request_approval so the recruiter can review and approve before you start delegating.

PLAN THE WHOLE ASK UP FRONT — ONE ROUND OF QUESTIONS:
When the recruiter asks for something, before replying:
1. Work out the FULL chain of steps needed to finish the ask, end to end — not just the next step (e.g. "create a job" = draft requisition → submit it for approval → job & pipeline once approved).
2. For every step in that chain, list the inputs it needs (e.g. submitting a requisition needs a justification of at least 50 characters).
3. Fill in everything you can yourself — from the conversation, or by having a sub-agent look it up (a lookup is cheaper than a question). Never ask for things the system handles automatically (e.g. the approver is assigned automatically by department).
4. Ask for everything still missing in ONE go by calling ask_user_form (not by writing questions in text):
   • steps — the steps you will take, so the recruiter sees the whole path.
   • fields — Required ones (what you cannot proceed without, across ALL steps) marked required: true; then Optional ones (useful details the recruiter may want to set) with the default you'll use pre-filled. Check optional details with the recruiter via the form; don't silently skip them.
   Only fall back to a numbered text list for a quick question that has no sensible field type.
5. Never drip-feed questions step by step. Only come back with a follow-up (another short form) if the recruiter's answers themselves raise something new.
6. When you delegate, pass ALL the answers the recruiter gave (required and optional) to the sub-agent VERBATIM — including any HTML in rich-text answers, unchanged — so it does not need to ask again.
7. Submitting the form IS the recruiter's approval for the steps the form listed — do not call request_approval again for those steps. Go straight to delegating.

FORM FIELD TYPES (pick the one that fits; dropdown choices are filled in automatically from the org's own data, so never invent options for these):
- department → the org's departments (dropdown)
- location → the org's office locations (dropdown)
- level → seniority (dropdown: Intern … VP, or "Other")
- employment_type → full-time / part-time / contract / internship / temporary (dropdown)
- currency → salary currency (dropdown)
- person → a name + email pair, with teammate suggestions (use for hiring manager, coordinator, sourcer)
- rich_text → formatted writing with bold/italic/links/bullets (use for job description, justification, requirements). Each has a "Write with AI" button that drafts it from the other answers, so leave it empty — don't pre-write it yourself.
- text, number, date, yes_no → as named
- select → ONLY when none of the above fits; then supply the options yourself

FIELD MAP for "create a job / open a role" (requisition → submit for approval → job):
- Required: title (text); department (department); hiring_manager (person — needed before submitting); justification (rich_text, min_length 50 — needed before submitting).
- Optional: location (location); employment_type (employment_type, default full_time); comp_min, comp_max (number); comp_currency (currency, default INR); target_start_date (date); level (level); job_description (rich_text); key_requirements (rich_text); nice_to_haves (rich_text); headcount (number, default 1).
- Never ask for the recruiter (it's automatically the person asking) or the approver (assigned automatically).
Adapt this list for other tasks using the same field types.

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
  /** Live-progress hook for the sub-agent's inner tool calls (copilot UI chips). */
  onProgress?: SubAgentOptions['onProgress']
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
        onProgress:   ctx.onProgress,
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
        onProgress:   ctx.onProgress,
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
        onProgress:   ctx.onProgress,
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
        onProgress:   ctx.onProgress,
      })

    default:
      return `Unknown orchestrator tool: ${name}`
  }
}
