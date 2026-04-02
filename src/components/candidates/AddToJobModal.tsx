'use client'

import { Loader2, Plus, Briefcase, X } from 'lucide-react'
import { useCandidateProfile } from './CandidateProfileContext'

export default function AddToJobModal() {
  const { candidate, showAddToJob, closeAddToJob, jobs, addingToJob, jobsLoading, addToJob, reload } = useCandidateProfile()

  if (!showAddToJob || !candidate) return null

  const existingJobIds = new Set(candidate.applications.map(a => a.hiring_request_id))
  const availableJobs = jobs.filter(j => !existingJobIds.has(j.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={closeAddToJob} />
      <div role="dialog" aria-modal="true" aria-labelledby="add-to-job-title" className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 id="add-to-job-title" className="text-sm font-bold text-slate-900">Add to Job</h3>
            <p className="text-xs text-slate-400 mt-0.5">Select a job to add {candidate.name} to</p>
          </div>
          <button
            onClick={closeAddToJob}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {jobsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
            </div>
          ) : availableJobs.length === 0 ? (
            <div className="py-10 text-center px-4">
              <Briefcase className="h-8 w-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-500">No available jobs</p>
              <p className="text-xs text-slate-400 mt-1">
                {jobs.length === 0
                  ? 'No jobs exist yet \u2014 create one first'
                  : 'Candidate is already in all active jobs'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {availableJobs.map(job => (
                <button
                  key={job.id}
                  onClick={() => addToJob(job.id, reload)}
                  disabled={addingToJob === job.id}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors text-left disabled:opacity-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{job.position_title}</p>
                    {job.department && <p className="text-xs text-slate-400 mt-0.5">{job.department}</p>}
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    {job.ticket_number && (
                      <span className="font-mono text-xs text-slate-400">{job.ticket_number}</span>
                    )}
                    {addingToJob === job.id
                      ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      : <Plus className="h-4 w-4 text-slate-300" />
                    }
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
