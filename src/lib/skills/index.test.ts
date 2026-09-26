import { describe, it, expect } from 'vitest'
import {
  buildSkillMap,
  canonicalSkill,
  categoryOf,
  catalogSize,
  isDroppedTool,
  normalizeSkill,
  splitCompound,
} from './index'

// Every string below is a real value from the candidates or pool_profiles skills array.

describe('normalizeSkill', () => {
  it('collapses case and punctuation', () => {
    expect(normalizeSkill('Node.js')).toBe(normalizeSkill('NodeJS'))
    expect(normalizeSkill('JavaScript')).toBe(normalizeSkill('Javascript'))
    expect(normalizeSkill('Tailwind CSS')).toBe(normalizeSkill('TailwindCSS'))
  })
  it('keeps + and #, which are the whole difference between C, C++ and C#', () => {
    expect(normalizeSkill('C')).not.toBe(normalizeSkill('C++'))
    expect(normalizeSkill('C++')).not.toBe(normalizeSkill('C#'))
  })
})

describe('canonicalSkill', () => {
  it('folds spelling variants onto one label', () => {
    expect(canonicalSkill('ReactJS')).toBe('React')
    expect(canonicalSkill('React.js')).toBe('React')
    expect(canonicalSkill('NodeJS')).toBe('Node.js')
    expect(canonicalSkill('Node')).toBe('Node.js')
    expect(canonicalSkill('GoLang')).toBe('Go')
    expect(canonicalSkill('MS Excel')).toBe('Excel')
    expect(canonicalSkill('Tensorflow')).toBe('TensorFlow')
  })
  it('never lets one language swallow another by substring', () => {
    // The classic bug: "Java" matching inside "JavaScript".
    expect(canonicalSkill('Java')).toBe('Java')
    expect(canonicalSkill('JavaScript')).toBe('JavaScript')
    expect(categoryOf('Java')).toBe('Programming Languages')
    expect(canonicalSkill('C')).toBe('C')
    expect(canonicalSkill('C#')).toBe('C#')
    expect(canonicalSkill('R')).toBe('R')
  })
  it('retries without a restating parenthetical', () => {
    expect(canonicalSkill('Domain-Driven Design (DDD)')).toBe('Domain-Driven Design')
  })
  it('is null for something the catalog has never seen', () => {
    expect(canonicalSkill('Asynchronous Advantageous Actor-Critic')).toBeNull()
  })
})

describe('categoryOf', () => {
  it('places common skills where a recruiter would expect', () => {
    expect(categoryOf('PyTorch')).toBe('AI / ML')
    expect(categoryOf('Kubernetes')).toBe('DevOps & Reliability')
    expect(categoryOf('PostgreSQL')).toBe('Databases')
    expect(categoryOf('Supply Chain Management')).toBe('Supply Chain & Logistics')
    expect(categoryOf('Financial Modeling')).toBe('Financial Planning & Analysis')
    expect(categoryOf('SEO')).toBe('SEO & Content')
    expect(categoryOf('Recruiting')).toBe('Talent Acquisition')
  })
  it('keeps analyst tools out of the marketing bucket', () => {
    expect(categoryOf('Excel')).toBe('Business Intelligence')
    expect(categoryOf('Tableau')).toBe('Business Intelligence')
    expect(categoryOf('Mixpanel')).toBe('Product & Growth Analytics')
  })
  it('falls back rather than dropping an unknown skill', () => {
    expect(categoryOf('Rubik&apos;s Cube')).toBe('Additional Skills')
  })
})

describe('isDroppedTool', () => {
  it('drops workflow tools that say nothing about capability', () => {
    for (const tool of ['VS Code', 'Vim', 'Postman', 'Jira', 'GitHub', 'Slack', 'Trello', 'Microsoft Word']) {
      expect(isDroppedTool(tool), tool).toBe(true)
    }
  })
  it('keeps tools a job is actually done in', () => {
    for (const keep of ['Figma', 'Tableau', 'Salesforce', 'Excel', 'Git']) {
      expect(isDroppedTool(keep), keep).toBe(false)
    }
  })
})

describe('splitCompound', () => {
  it('splits a list of skills stored as one string', () => {
    expect(splitCompound('Jest / Playwright / Cypress')).toEqual(['Jest', 'Playwright', 'Cypress'])
    expect(splitCompound('Redux / Zustand')).toEqual(['Redux', 'Zustand'])
    expect(splitCompound('FastAPI/Django')).toEqual(['FastAPI', 'Django'])
  })
  it('leaves an idiom alone', () => {
    // Splitting these produces two wrong chips and loses the original wording.
    expect(splitCompound('C/C++')).toEqual(['C/C++'])
    expect(splitCompound('HTML/CSS')).toEqual(['HTML/CSS'])
    expect(splitCompound('EKS/GKE')).toEqual(['EKS/GKE'])
  })
  it('refuses to split when any side is unrecognised', () => {
    expect(splitCompound('Search/ML Infra Manager')).toEqual(['Search/ML Infra Manager'])
  })
})

describe('buildSkillMap', () => {
  it('de-duplicates spelling variants into one chip', () => {
    const map = buildSkillMap(['React', 'ReactJS', 'React.js', 'JavaScript', 'Javascript'])
    const all = map.flatMap((g) => g.skills)
    expect(all.filter((s) => s === 'React')).toHaveLength(1)
    expect(all.filter((s) => s === 'JavaScript')).toHaveLength(1)
  })

  it('removes dropped tools entirely', () => {
    const map = buildSkillMap(['Python', 'VS Code', 'Jira'])
    expect(map.flatMap((g) => g.skills)).toEqual(['Python'])
  })

  it('leads with the category the person has most of', () => {
    const mlEngineer = buildSkillMap(['PyTorch', 'TensorFlow', 'Machine Learning', 'Deep Learning', 'Python'])
    expect(mlEngineer[0].category).toBe('AI / ML')
    const supplyLead = buildSkillMap(['Logistics', 'Inventory Management', 'Demand Planning', 'Excel'])
    expect(supplyLead[0].category).toBe('Supply Chain & Logistics')
  })

  it('pins Additional Skills and Spoken Languages last however large', () => {
    const map = buildSkillMap(['Python', 'zzz one', 'zzz two', 'zzz three', 'zzz four', 'English', 'Hindi'])
    expect(map[map.length - 1].category).toBe('Additional Skills')
    expect(map[map.length - 2].category).toBe('Spoken Languages')
  })

  it('handles an empty list', () => {
    expect(buildSkillMap([])).toEqual([])
  })

  it('carries a catalog big enough to be worth having', () => {
    const size = catalogSize()
    expect(size.skills).toBeGreaterThan(1000)
    expect(size.categories).toBeGreaterThan(50)
  })
})
