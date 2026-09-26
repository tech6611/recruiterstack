import { describe, it, expect } from 'vitest'
import { tabPlan } from './ProfileDocument'

// Section order is fixed: 0 Experience, 1 Education, 2 Skills.
const ALL = [true, true, true]

describe('tabPlan — tabs are anchors into one document', () => {
  it('Overview and Experience both show the whole document', () => {
    const { sectionsFor } = tabPlan(ALL)
    expect(sectionsFor('Overview')).toEqual([0, 1, 2])
    expect(sectionsFor('Experience')).toEqual([0, 1, 2])
  })

  it('a tab shows its own section AND everything below it', () => {
    const { sectionsFor } = tabPlan(ALL)
    // This is the rule that is easy to get wrong: Education is not "Education only".
    expect(sectionsFor('Education')).toEqual([1, 2])
    expect(sectionsFor('Skills')).toEqual([2])
  })

  it('never reorders — a later tab is always a suffix of an earlier one', () => {
    const { sectionsFor } = tabPlan(ALL)
    const overview = sectionsFor('Overview')
    for (const tab of ['Experience', 'Education', 'Skills'] as const) {
      const shown = sectionsFor(tab)
      expect(overview.slice(overview.length - shown.length)).toEqual(shown)
    }
  })

  it('offers no tab that would show nothing of its own or below', () => {
    // Experience and education only: a "Skills" tab would be empty.
    expect(tabPlan([true, true, false]).tabs).toEqual(['Overview', 'Experience', 'Education'])
    // Skills only: the upper tabs would just show the skills, so they are not offered.
    expect(tabPlan([false, false, true]).tabs).toEqual(['Overview', 'Experience', 'Education', 'Skills'])
  })

  it('skips a missing middle section without shifting the ones below', () => {
    const { sectionsFor } = tabPlan([true, false, true])
    expect(sectionsFor('Overview')).toEqual([0, 2])
    expect(sectionsFor('Skills')).toEqual([2])
  })

  it('offers nothing when the candidate has nothing', () => {
    expect(tabPlan([false, false, false]).tabs).toEqual([])
  })
})
