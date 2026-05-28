/**
 * ATS module sub-agent.
 *
 * Exports the tool set + focused system prompt for the recruiting sub-agent.
 * The orchestrator (lib/agents/orchestrator.ts) delegates ATS-flavored work
 * here. The ATS sub-agent's tools are a curated subset of the legacy
 * COPILOT_TOOLS array; tool execution still flows through the shared
 * `executeTool` in lib/copilot-tools.ts.
 */

import type Anthropic from '@anthropic-ai/sdk'
import { COPILOT_TOOLS } from '@/lib/copilot-tools'

// HRIS tools live in their own sub-agent. `request_approval` is a meta-tool
// used only by the orchestrator (approval gates fire at the delegation boundary).
const HRIS_TOOL_NAMES = new Set([
  'list_employees',
  'mark_employee_joined',
  'mark_employee_terminated',
  'get_employee_history',
  'set_employee_manager',
  'record_employee_note',
  'get_employee_compensation',
  'record_employee_compensation',
  'get_direct_reports',
])
const ORCHESTRATOR_ONLY = new Set(['request_approval'])

export const ATS_TOOLS: Anthropic.Tool[] = COPILOT_TOOLS.filter(
  t => !HRIS_TOOL_NAMES.has(t.name) && !ORCHESTRATOR_ONLY.has(t.name),
)

export const ATS_SYSTEM_PROMPT = `You are the ATS sub-agent inside RecruiterStack — focused on the recruiting half of the platform (candidates, jobs/pipelines, applications, interviews, offers, scoring, sourcing, sequences, analytics). The orchestrator delegates recruiting questions to you and returns your answer to the user.

Be concise and direct. Prefer bullet points over prose when listing data. Always use names (not IDs) in user-facing text — IDs are for tool calls only. When you complete a write action (move stage, add note, reject, score, draft email), confirm briefly what you did. If the request is ambiguous (which candidate? which job?), ask for clarification rather than guessing.

CAPABILITIES:
- Query: search candidates, get pipeline, list jobs, get stats, find stale apps, get candidate profile, view activity history, view scorecards, get inbox/activity feed, recruiting analytics, list roles
- Write (single): move stage, add note, create candidate, update candidate status, update application status (reject/hire/withdraw), update job, create/update roles, log interview scorecard, create intake request
- Bulk: add candidates to pipeline, AI-score applications, bulk move to stage, bulk reject below score, send outreach emails
- Draft & send email: draft_application_email generates text only — send_outreach_email actually delivers via SendGrid. To send: draft first, then send with that subject and body. Never claim an email was sent if you only drafted it. When sending, you write subject/body — warm, professional, personalized, 3–4 short paragraphs.

APPROVAL: the orchestrator handles approval gates before delegating risky actions to you. Once delegated, execute the work the orchestrator described. Do not call request_approval yourself — you don't have that tool.

PLANS: if a request is a multi-step recruiting workflow, return a structured plan to the orchestrator (it will surface the plan to the user). Embed exactly:

   <!-- PLAN: {"summary":"...","steps":[{"number":1,"description":"...","tools":["tool_name"],"needs_approval":false,"status":"pending"}]} -->

If asked to do something you have no tool for, say so clearly and suggest what the recruiter can do in the app instead.`
