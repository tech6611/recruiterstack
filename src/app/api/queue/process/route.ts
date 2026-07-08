/**
 * POST /api/queue/process
 *
 * Worker endpoint that drains the job queue. Called by Vercel Cron every minute.
 * Protected by CRON_SECRET to prevent unauthorized access.
 */

import { NextRequest, NextResponse } from 'next/server'
import { processJobs } from '@/lib/api/job-queue'
import { createAdminClient } from '@/lib/supabase/server'
import { scanAutomations } from '@/modules/crm/domain/automations'
import { logger } from '@/lib/logger'

// Register all handlers on first import
import '@/lib/api/job-handlers'

export const maxDuration = 60 // seconds — plenty for a batch of 5 jobs

export async function POST(req: NextRequest) {
  // Verify the request is from Vercel Cron or an authorized caller
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const processed = await processJobs(5)

  // Evaluate auto-enrollment rules on the same cron tick (cheap no-op when no
  // rules exist). Never let a scan failure fail the queue drain.
  let automations: Record<string, number> = {}
  try {
    automations = await scanAutomations(createAdminClient())
  } catch (err) {
    logger.error('Automation scan failed', err)
  }

  return NextResponse.json({ processed, automations })
}
