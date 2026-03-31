/**
 * POST /api/queue/process
 *
 * Worker endpoint that drains the job queue. Called by Vercel Cron every minute.
 * Protected by CRON_SECRET to prevent unauthorized access.
 */

import { NextRequest, NextResponse } from 'next/server'
import { processJobs } from '@/lib/api/job-queue'

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

  return NextResponse.json({ processed })
}
