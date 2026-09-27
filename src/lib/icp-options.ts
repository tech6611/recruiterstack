import { SECTOR_RULES } from '@/lib/industries/sectors'
import type { CriterionKind } from '@/lib/types/search-spec'

/**
 * The vocabularies behind the ideal-profile pickers.
 *
 * TWO KINDS OF LIST. Some fields have a genuinely CLOSED vocabulary — a funding stage
 * is one of a dozen words, a seniority is one of a ladder — and writing them out means
 * a recruiter never has to guess whether we call it "Series A" or "SeriesA". Others
 * are open (companies, titles, cities) and come from the database via
 * /api/icp/options; there the list is a spelling aid, not a constraint.
 *
 * INDUSTRY IS THE SAME 35 SECTORS WE LABEL CANDIDATES WITH. Reusing the taxonomy from
 * lib/industries means a recruiter who filters for "Fintech" gets exactly the people
 * whose profile chip says Fintech. A separate hand-written list here would drift from
 * it within a month and the filter would quietly stop agreeing with the display.
 *
 * PURE. No I/O; the fetched lists are passed in.
 */

/** The ladder, lowest first. Ordering is information: a picker should not be alphabetical here. */
export const SENIORITY_LEVELS = [
  'Intern', 'Entry level', 'Junior', 'Mid-level', 'Senior', 'Staff', 'Principal',
  'Lead', 'Manager', 'Senior Manager', 'Director', 'Senior Director', 'VP', 'SVP',
  'C-level', 'Founder',
]

/** Headcount bands, which is how a recruiter thinks about size — not exact numbers. */
export const COMPANY_SIZES = [
  '1–10', '11–50', '51–200', '201–500', '501–1,000', '1,001–5,000',
  '5,001–10,000', '10,001+',
]

export const COMPANY_TYPES = [
  'Startup', 'Scale-up', 'Big Tech', 'Public company', 'Private equity backed',
  'Bootstrapped', 'Agency', 'Consultancy', 'Non-profit', 'Government', 'University',
]

/** In the order a company passes through them, so the picker reads as a timeline. */
export const FUNDING_STAGES = [
  'Pre-seed', 'Seed', 'Angel', 'Series A', 'Series B', 'Series C', 'Series D',
  'Series E', 'Series F', 'Series G+', 'Growth', 'Pre-IPO', 'Public', 'Acquired',
  'Bootstrapped',
]

export const FUNCTIONS = [
  'Engineering', 'Product', 'Design', 'Data', 'Sales', 'Marketing', 'Customer Success',
  'Support', 'Operations', 'Finance', 'Legal', 'People / HR', 'Recruiting',
  'IT', 'Security', 'Research', 'Strategy', 'General Management',
]

export const DEGREE_FIELDS = [
  'Computer Science', 'Information Technology', 'Software Engineering',
  'Electrical Engineering', 'Electronics & Communication', 'Mechanical Engineering',
  'Civil Engineering', 'Chemical Engineering', 'Mathematics', 'Statistics', 'Physics',
  'Economics', 'Business Administration', 'Finance', 'Accounting', 'Marketing',
  'Human Resources', 'Operations Research', 'Data Science', 'Design', 'Law',
  'Medicine', 'Biotechnology', 'Psychology',
]

/** Every sector a candidate can be labelled with — the taxonomy, not a copy of it. */
export const INDUSTRY_SECTORS = Array.from(new Set(SECTOR_RULES.map((r) => r.sector))).sort()

/** The bands a recruiter actually asks for, not every arithmetic possibility. */
export interface YearsBand { label: string; min: number | null; max: number | null }
export const YEARS_BANDS: YearsBand[] = [
  { label: '0–2 years',   min: 0,  max: 2 },
  { label: '1–3 years',   min: 1,  max: 3 },
  { label: '2–5 years',   min: 2,  max: 5 },
  { label: '3–6 years',   min: 3,  max: 6 },
  { label: '4–8 years',   min: 4,  max: 8 },
  { label: '5–10 years',  min: 5,  max: 10 },
  { label: '6–12 years',  min: 6,  max: 12 },
  { label: '8–15 years',  min: 8,  max: 15 },
  { label: '10+ years',   min: 10, max: null },
  { label: '15+ years',   min: 15, max: null },
]

/** Radii people actually search in: a city, its metro, its region. */
export const RADIUS_KM = [10, 25, 50, 100, 250, 500]

/** The lists that have to be read out of the database. */
export interface FetchedOptions {
  cities: string[]
  titles: string[]
  companies: string[]
  skills: string[]
  departments: string[]
}

export const EMPTY_OPTIONS: FetchedOptions = { cities: [], titles: [], companies: [], skills: [], departments: [] }

/**
 * The suggestion list for one criterion kind, or [] when a field is genuinely open
 * (a school name) and a half-guessed list would only get in the way.
 */
export function optionsFor(kind: CriterionKind, fetched: FetchedOptions = EMPTY_OPTIONS): string[] {
  switch (kind) {
    case 'location':          return fetched.cities
    case 'title_current':
    case 'title_any':         return fetched.titles
    case 'employer_current':
    case 'employer_past':
    case 'employer_any':      return fetched.companies
    case 'skill':             return fetched.skills
    case 'function':          return Array.from(new Set([...FUNCTIONS, ...fetched.departments]))
    case 'industry':          return INDUSTRY_SECTORS
    case 'seniority':         return SENIORITY_LEVELS
    case 'company_size':      return COMPANY_SIZES
    case 'company_type':      return COMPANY_TYPES
    case 'funding_stage':     return FUNDING_STAGES
    case 'degree_field':      return DEGREE_FIELDS
    default:                  return []
  }
}

/** The preset that matches a min/max exactly, so an existing band shows as chosen. */
export function bandLabel(min: number | null | undefined, max: number | null | undefined): string | null {
  return YEARS_BANDS.find((b) => b.min === (min ?? null) && b.max === (max ?? null))?.label ?? null
}
