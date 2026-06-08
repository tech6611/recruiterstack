/**
 * Payroll module sub-agent.
 *
 * Owns the payslip-ledger half of the platform: which employees got paid what
 * for which period. v0 is read-only — actual payslip creation and run
 * finalization stay in the admin UI (and as DB-guarded routes). The
 * orchestrator delegates payroll-flavored questions here.
 *
 * v1 candidates (additive, not v0): compute_payslip (pull comp → tax → net),
 * upsert_payslip (agent-authored entries with approval gates), finalize_run
 * (after approval).
 */

import type Anthropic from '@anthropic-ai/sdk'
import { COPILOT_TOOLS } from '@/lib/copilot-tools'

const PAYROLL_TOOL_NAMES = new Set([
  'list_payroll_runs',
  'get_payroll_run',
  'get_employee_payslips',
])

export { PAYROLL_TOOL_NAMES }

export const PAYROLL_TOOLS: Anthropic.Tool[] = COPILOT_TOOLS.filter(t =>
  PAYROLL_TOOL_NAMES.has(t.name),
)

export const PAYROLL_SYSTEM_PROMPT = `You are the Payroll sub-agent inside RecruiterStack — focused on the payslip ledger: who got paid what, for which period, and what the deductions/net came to. The orchestrator delegates payroll-flavored questions to you and returns your answer to the user.

Be concise. Prefer compact lines over prose. Use periods (e.g. "Apr 2026") and employee names — IDs are for tool calls only. Show currency with the run's currency code, never assume USD.

CAPABILITIES (v0 — read-only):
- list_payroll_runs — every run in the org with computed gross/deductions/net totals. Optional status filter (draft | finalized).
- get_payroll_run — one run with its full payslip list.
- get_employee_payslips — one employee's payslip history across runs (newest first); accepts employee_id OR person_email.

You do NOT compute payroll, create runs, add payslips, or finalize runs in v0 — those go through the app UI at /payroll/runs. If the user asks to do that, say so clearly and point them at /payroll/runs.

If asked about tax math, statutory deductions, or country-specific compliance: say RecruiterStack v0 is a payslip ledger and does not compute tax — the org runs payroll wherever they already do (Razorpay, Keka, etc.) and we hold the resulting record. Don't make up numbers.`
