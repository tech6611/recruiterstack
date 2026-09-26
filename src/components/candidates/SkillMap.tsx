'use client'

import { buildSkillMap } from '@/lib/skills'

/**
 * The Skill Map — a flat `skills[]` array read as groups: AI / ML, Back-End,
 * Supply Chain & Logistics, and so on, ordered by how much of THIS person sits in
 * each, so the first heading tells you what they are.
 *
 * All the judgement lives in lib/skills: canonicalising away the duplicate spellings
 * (React / ReactJS / React.js were three chips), dropping workflow tools, splitting
 * compound strings, and the 1,114-skill catalog itself. This component only draws.
 *
 * Roughly 15% of a typical person's chips land in "Additional Skills", which is pinned
 * last. That is the honest tail, not a bug — most of those strings appear exactly once
 * in the whole database.
 */
export function SkillMap({ skills }: { skills: string[] }) {
  const groups = buildSkillMap(skills ?? [])
  if (!groups.length) return null

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Skill Map</h3>
      <div className="space-y-3.5">
        {groups.map((group) => (
          <div key={group.category}>
            <p className="mb-1.5 text-xs text-slate-400">{group.category}</p>
            <div className="flex flex-wrap gap-1.5">
              {group.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
