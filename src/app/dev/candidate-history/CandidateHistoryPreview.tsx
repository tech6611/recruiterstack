'use client'

import { CandidateHeader } from '@/components/candidates/CandidateHeader'
import { ProfileDocument } from '@/components/candidates/ProfileDocument'
import type { Candidate } from '@/lib/types/database'
import type { EducationEntry } from '@/components/candidates/EducationList'
import type { WorkRole } from '@/lib/ui/work-history'
import fixture from './fixture.json'

/**
 * DEVELOPMENT ONLY. The Career-history panel's new presentation, rendered against four
 * real candidates' role histories — person names removed, everything else untouched,
 * because the messy part (19 roles, repeated employers, undated rows, employer strings
 * with taglines) is exactly what the layout has to survive.
 *
 * `now` is pinned so the durations don't drift between reviews.
 */
const NOW = new Date('2026-09-26T00:00:00Z')

interface FixtureCandidate {
  name: string
  education: EducationEntry[]
  experiences: WorkRole[]
  skills: string[]
}

export function CandidateHistoryPreview() {
  const candidates = fixture as FixtureCandidate[]
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-bold text-slate-900">Career history</h1>
      <p className="mt-1 text-sm text-slate-500">
        Four real histories from the database, names removed, each with a real skills array.
        The tabs are anchors into one document — Education shows Education then Skills.
        Logos only load when you are signed in — <code>/api/brand-icon</code> requires a session.
      </p>
      <div className="mt-8 space-y-6">
        {candidates.map((candidate) => (
          <div key={candidate.name} className="rounded-xl border border-slate-200 bg-white">
            <div className="flex gap-5 border-b border-slate-100 p-5">
              {/* The left rail, at its real width, so the header is judged in situ. */}
              <div className="w-64 shrink-0">
                <CandidateHeader
                  candidate={{
                    id: 'fixture',
                    name: candidate.name,
                    current_title: candidate.experiences[0]?.title ?? null,
                    current_company: candidate.experiences.find((e) => e.employer)?.employer ?? null,
                    location: candidate.experiences.find((e) => e.location)?.location ?? null,
                    education: candidate.education,
                    email: 'fixture@example.com',
                    phone: '+91 00000 00000',
                    linkedin_url: 'https://linkedin.com/in/example',
                    resume_url: 'resume.pdf',
                  } as Candidate}
                />
              </div>
              <p className="self-center text-sm text-slate-400">{candidate.experiences.length} roles</p>
            </div>
            <div className="px-5 py-4">
              <ProfileDocument
                experiences={candidate.experiences}
                education={candidate.education}
                skills={candidate.skills}
                now={NOW}
              />
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
