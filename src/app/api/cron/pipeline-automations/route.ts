/**
 * Pipeline-automation scheduler (Phase B trigger).
 *
 * The engine (`scanPipelineAutomations`) — condition evaluation, action dispatch,
 * the `automation_runs` ledger and per-tick caps — already exists; it just needed
 * something to call it on a schedule. This endpoint is that caller.
 *
 * Triggered every few minutes by the GitHub Actions workflow
 * `.github/workflows/pipeline-automations-cron.yml` (POST). GET is also accepted
 * so a Vercel Cron could drive it instead.
 *
 * SAFETY: the scan is a DRY RUN (evaluates + logs suggestions, fires nothing)
 * unless `PIPELINE_AUTOMATIONS_MODE === 'live'`. So merging this changes nothing
 * for candidates until that env is flipped. Auth is the shared CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { scanPipelineAutomations } from '@/modules/ats/domain/automation-engine'
import { logger } from '@/lib/logger'

export const maxDuration = 60 // seconds

async function run(req: NextRequest) {
  // Auth: match the shared CRON_SECRET when it is configured. (When unset the
  // endpoint is open — set CRON_SECRET on Vercel + the GitHub secret to lock it.)
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const pipeline = await scanPipelineAutomations(createAdminClient())
    // pipeline = { acted, suggested, live } — `live:false` means dry run.
    return NextResponse.json({ ok: true, pipeline })
  } catch (err) {
    logger.error('Pipeline automation cron scan failed', err)
    return NextResponse.json({ ok: false, error: 'scan failed' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
