'use client'

import { PipelinePlanEditor } from '@/components/req-jobs/PipelinePlanEditor'
import { AutomationActivity } from '@/components/req-jobs/AutomationActivity'

/**
 * "Interview plan" tab — the pipeline plan (stages, per-stage interview panel,
 * automation rules) plus the automation activity log.
 *
 * The older rounds-based "Interview Plan" editor and the inline "Team on this
 * job" roster used to live here too; both were removed (2026-09-08). The roster
 * still shows in the Overview sidebar (JobDetail → JobTeamRoster).
 */
export function InterviewPlanTab({ jobId }: { jobId: string }) {
  return (
    <div className="space-y-4">
      <PipelinePlanEditor jobId={jobId} />
      <AutomationActivity jobId={jobId} />
    </div>
  )
}
