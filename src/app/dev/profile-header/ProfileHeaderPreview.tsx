'use client'

import { CandidateHeader } from '@/components/candidates/CandidateHeader'
import type { Candidate } from '@/lib/types/database'

/**
 * DEVELOPMENT ONLY. The left-rail header for three real candidates' field values —
 * names replaced — chosen because each broke the header's shape differently: no
 * location, a title that wraps to an orphaned "2", and a company name long enough to
 * fill the rail. The link row falls back to LinkedIn here (the links route needs a
 * session); logos also need a session, so expect monograms.
 */
const CASES: Partial<Candidate>[] = [
  {
    name: 'Candidate A',
    current_title: 'Senior Manager, Strategy & Operations',
    current_company: 'Plivo',
    location: null,
    linkedin_url: 'https://www.linkedin.com/in/example',
    education: [{ school: 'IIM Kozhikode', year: 2021 }],
  },
  {
    name: 'Candidate B',
    current_title: 'Software Development Engineer 2',
    current_company: 'MindTickle Interactive Media Pvt Ltd.',
    location: 'Pune, India',
    linkedin_url: 'example-slug',
    education: [{ school: 'Bharati Vidyapeeth College of Engineering', year: 2022 }],
  },
  {
    name: 'Candidate C',
    current_title: 'Senior Software Engineer, Backend',
    current_company: 'Nykaa',
    location: 'Bengaluru, India',
    linkedin_url: null,
    education: [{ school: 'Indian Institute of Technology, Guwahati', year: 2018 }],
  },
]

export function ProfileHeaderPreview() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-xl font-bold text-slate-900">Profile header</h1>
      <div className="mt-8 flex gap-6">
        {CASES.map((c, i) => (
          <div key={i} className="w-64 shrink-0 rounded-xl border border-slate-200 bg-white p-5">
            <CandidateHeader candidate={{ id: `fixture-${i}`, ...c } as Candidate} />
          </div>
        ))}
      </div>
    </main>
  )
}
