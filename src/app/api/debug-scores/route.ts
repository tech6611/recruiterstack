import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { scoreApplicationForJob } from '@/lib/ai/job-scorer'
import type { Candidate, HiringRequest } from '@/lib/types/database'

// GET /api/debug-scores?job_id=xxx[&app_id=yyy&dry_run=1]
//
// Diagnostics:
//   1. Column presence  — does ai_criterion_scores exist in the DB schema?
//   2. Stored values    — what is currently in ai_criterion_scores for each app?
//   3. Dry-run score    — call Claude for one application (app_id) and show the
//                         raw JobScoreResult WITHOUT writing anything to the DB.
//
// This tells you exactly where the chain breaks without side effects.

export async function GET(req: NextRequest) {
  const supabase = createAdminClient()
  const jobId   = req.nextUrl.searchParams.get('job_id') ?? ''
  const appId   = req.nextUrl.searchParams.get('app_id')    // optional
  const dryRun  = req.nextUrl.searchParams.get('dry_run') === '1'

  // ── 1. Schema check: does ai_criterion_scores exist? ──────────────────────
  const { data: colCheck, error: colErr } = await supabase
    .from('applications')
    .select('ai_criterion_scores')
    .limit(1)

  const columnExists = !colErr && colCheck !== null
  const columnError  = colErr?.message ?? null

  // ── 2. Stored values for all apps in this job ──────────────────────────────
  const { data: apps, error: appsErr } = await supabase
    .from('applications')
    .select('id, ai_score, ai_recommendation, ai_scored_at, ai_criterion_scores, candidate:candidates(name)')
    .eq('hiring_request_id', jobId)
    .limit(20)

  const appsSummary = (apps ?? []).map(a => {
    const r = a as Record<string, unknown>
    return {
      id:                  r.id,
      candidate:           (r.candidate as Record<string, unknown>)?.name ?? '?',
      ai_score:            r.ai_score,
      ai_scored_at:        r.ai_scored_at,
      has_criterion_scores: Array.isArray(r.ai_criterion_scores) && (r.ai_criterion_scores as unknown[]).length > 0,
      criterion_scores:    r.ai_criterion_scores ?? null,
    }
  })

  // ── 3. Dry-run score for a specific app (no DB write) ─────────────────────
  let dryRunResult: Record<string, unknown> | null = null
  let dryRunError: string | null = null

  if (dryRun && appId) {
    try {
      const { data: appRow } = await supabase
        .from('applications')
        .select('*, candidate:candidates(*)')
        .eq('id', appId)
        .single()

      const { data: jobRow } = await supabase
        .from('hiring_requests')
        .select('*')
        .eq('id', jobId)
        .single()

      if (!appRow || !jobRow) {
        dryRunError = 'Could not load app or job row'
      } else {
        const candidate = (appRow as Record<string, unknown>).candidate as Candidate
        const job       = jobRow as HiringRequest

        const result = await scoreApplicationForJob(candidate, job)
        dryRunResult = {
          score:             result.score,
          recommendation:    result.recommendation,
          strengths:         result.strengths,
          gaps:              result.gaps,
          criterion_scores:  result.criterion_scores ?? null,
          has_criterion_scores: Array.isArray(result.criterion_scores) && result.criterion_scores.length > 0,
          job_has_scoring_criteria: Array.isArray(job.scoring_criteria) && job.scoring_criteria.length > 0,
          scoring_criteria_count:   Array.isArray(job.scoring_criteria) ? job.scoring_criteria.length : 0,
        }
      }
    } catch (e) {
      dryRunError = e instanceof Error ? e.message : String(e)
    }
  }

  return NextResponse.json({
    // Column check
    column_exists:      columnExists,
    column_error:       columnError,

    // Per-app stored values
    apps_checked:       appsSummary.length,
    apps:               appsSummary,
    apps_error:         appsErr?.message ?? null,

    // Dry run
    dry_run_requested:  dryRun && !!appId,
    dry_run_app_id:     appId,
    dry_run_result:     dryRunResult,
    dry_run_error:      dryRunError,
  })
}
