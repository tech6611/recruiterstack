'use client'

import { FileText, Linkedin } from 'lucide-react'
import { ResultCard } from '@/components/ui/ResultCard'
import type { CandidateListItem } from '@/lib/types/database'

/**
 * A candidate in the list, as a card. The shape is shared with the pool browser via
 * <ResultCard>; this supplies the parts that are specific to someone already in your
 * pipeline — their links and how many jobs they are live on.
 */
export function CandidateResultCard({
  candidate,
  onOpen,
}: {
  candidate: CandidateListItem
  onOpen: () => void
}) {
  return (
    <ResultCard
      onOpen={onOpen}
      person={{
        name: candidate.name,
        photoUrl: candidate.avatar_url,
        location: candidate.location,
        currentTitle: candidate.current_title,
        currentCompany: candidate.current_company,
        roles: candidate.experiences ?? [],
        education: candidate.education ?? [],
        summary: candidate.ai_summary?.trim() || null,
      }}
      links={
        <>
          {candidate.linkedin_url && (
            <a
              href={candidate.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="LinkedIn profile"
              className="text-slate-300 transition-colors hover:text-slate-600"
            >
              <Linkedin className="h-3.5 w-3.5" />
            </a>
          )}
          {candidate.resume_url && (
            <a
              href={`/api/candidates/${candidate.id}/resume`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Résumé"
              className="text-slate-300 transition-colors hover:text-slate-600"
            >
              <FileText className="h-3.5 w-3.5" />
            </a>
          )}
        </>
      }
      badges={
        candidate.active_applications_count > 0 ? (
          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            {candidate.active_applications_count} job{candidate.active_applications_count === 1 ? '' : 's'}
          </span>
        ) : null
      }
    />
  )
}
