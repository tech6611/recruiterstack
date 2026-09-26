'use client'

import { useState } from 'react'
import { ExperienceTimeline } from '@/components/candidates/ExperienceTimeline'
import { EducationList, type EducationEntry } from '@/components/candidates/EducationList'
import { SkillMap } from '@/components/candidates/SkillMap'
import type { WorkRole } from '@/lib/ui/work-history'

/**
 * The profile as ONE document, with the tabs acting as anchors into it.
 *
 * This is the part of Juicebox that is easy to get wrong. The tabs are not four
 * separate screens: Education shows Education *and then* Skills; Skills shows Skills
 * alone; Overview shows the whole thing from the top. Same blocks, same order, every
 * time — a tab only chooses where to start reading. Rebuilding it as four independent
 * panels would look right in a screenshot and feel wrong in use, because scrolling past
 * the end of Education would stop dead instead of arriving at Skills.
 *
 * WHERE WE DIVERGE, AND WHY. Juicebox's Overview opens with Status / Email / Phone /
 * Tags because its drawer is the whole profile. Ours is not — the left rail already
 * owns contact details and tags, and repeating them here would be the same facts twice
 * on one screen. So Overview is the full document and the tabs below it are the jumps.
 * If the left rail ever slims down, that block belongs here.
 */

export const TABS = ['Overview', 'Experience', 'Education', 'Skills'] as const
export type Tab = (typeof TABS)[number]

/** Which section each tab starts at. Overview starts at the top. */
const START_AT: Record<Tab, number> = { Overview: 0, Experience: 0, Education: 1, Skills: 2 }

/**
 * The whole "tabs are anchors" rule, as a pure function: given which sections have
 * content, which tabs are worth offering and which section indices each one shows.
 *
 * A tab is offered only when something sits at or below its anchor — an empty "Skills"
 * tab that silently shows Education instead is worse than no tab at all.
 */
export function tabPlan(present: boolean[]): { tabs: Tab[]; sectionsFor: (tab: Tab) => number[] } {
  const from = (tab: Tab) =>
    present.map((has, i) => (has && i >= START_AT[tab] ? i : -1)).filter((i) => i >= 0)
  return { tabs: TABS.filter((t) => from(t).length > 0), sectionsFor: from }
}

export interface ProfileDocumentProps {
  experiences: WorkRole[]
  education: EducationEntry[]
  skills: string[]
  /** Roles that ended before graduation are campus work, not employment (tag rules). */
  graduationYear?: number | null
  now?: Date
}

export function ProfileDocument({ experiences, education, skills, graduationYear, now }: ProfileDocumentProps) {
  const [tab, setTab] = useState<Tab>('Overview')

  // Built in document order, then sliced — so a tab can never reorder the page.
  const sections = [
    experiences.length ? <ExperienceTimeline key="experience" roles={experiences} graduationYear={graduationYear} now={now} /> : null,
    education.length ? <EducationList key="education" education={education} /> : null,
    skills.length ? <SkillMap key="skills" skills={skills} /> : null,
  ]

  const { tabs: available, sectionsFor } = tabPlan(sections.map(Boolean))
  const active = available.includes(tab) ? tab : available[0]
  const visible = active ? sectionsFor(active).map((i) => sections[i]) : []

  if (!visible.length) return null

  return (
    <div>
      {available.length > 1 && (
        <div className="mb-5 flex gap-5 border-b border-slate-200" role="tablist">
          {available.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === active}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 pb-2 text-sm transition-colors ${
                t === active
                  ? 'border-slate-900 font-semibold text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-6">{visible}</div>
    </div>
  )
}
