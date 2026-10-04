import type { RecruiterBrief, IcpCompetency } from '@/lib/types/icp'

/**
 * DEVELOPMENT ONLY. The Strategy & Operations Manager job's recruiter brief, competencies
 * and screening probes, as they read on Scoring today — for the overhaul preview.
 */
export const BRIEF: RecruiterBrief = {
  niche: 'Strategy & Ops / BizOps · Bengaluru',
  persona_short: 'Places first G&A/Ops hires at founder-led startups',
  persona: 'I specialize in placing the first G&A/Ops hires into founder-led, high-potential tech startups. I screen first on raw intellectual horsepower (pedigree as a proxy), hands-on analytical skills (SQL is a must), and evidence of thriving in a chaotic, unstructured environment.',
  market_short: 'Bengaluru · on-site',
  market: 'Bengaluru, Karnataka, IN. The role is on-site. The local talent pool is deep for this profile, but highly competitive. Relocation from other Indian metros is feasible; international relocation and visa sponsorship are not realistic for a company this size.',
  experience_band: { min_years: 2, max_years: 6, rationale: 'Ceiling enforced' },
  feeder_pools: [
    { label: 'Top-Tier Management Consulting', companies: ['McKinsey & Company', 'Bain & Company', 'Boston Consulting Group (BCG)'], role_types: ['Business Analyst', 'Associate', 'Consultant'], priority: 1 },
    { label: 'High-Growth Startup BizOps/Strategy', companies: ['Udaan', 'Swiggy', 'Razorpay', 'CRED', 'Flipkart', 'Zomato', 'Google (Strategy/BizOps teams)'], role_types: ['Strategy Manager', 'Business Operations Manager', 'Program Manager', "Chief of Staff's Office"], priority: 2 },
    { label: 'Investment Banking / Venture Capital', companies: ['Goldman Sachs', 'Morgan Stanley', 'Sequoia Capital', 'Accel', 'Lightspeed Venture Partners'], role_types: ['Analyst', 'Associate'], priority: 3 },
  ],
  title_families: ['Strategy & Operations Manager', 'Business Operations Manager', 'Strategy Manager', 'Growth & Operations Manager', 'Program Manager', 'Chief of Staff'],
  market_gates: [
    { requirement: 'Experience in coding with SQL, Python, or R', short: 'SQL / Python / R' },
    { requirement: 'Degree from a top university', short: 'Tier-1 degree' },
  ],
  jd_translations: [
    { phrase: 'fast-paced environment', means_here: 'Experience at a top-tier consulting firm (MBB), investment bank, high-growth startup during its scaling phase, or a comparable elite corporate rotation program.', short: 'MBB · IB · scale-up' },
    { phrase: '2:1 degree from a top university', means_here: 'Graduate of a Tier-1 institute (IITs, IIMs A/B/C/L/K/I, ISB, BITS Pilani, top NITs, FMS, XLRI).', short: 'IIT · IIM · ISB · BITS' },
    { phrase: 'A magic skill to break complex problems into smaller ones', means_here: 'Demonstrable structured thinking, likely honed in a consulting or similarly rigorous environment. Expect to test this with a case study.', short: 'Structured thinking → case' },
  ],
  market_norms: [
    { topic: 'Compensation', norm: 'For a 1-10 person startup, cash will likely be at or slightly below market for larger firms, but this must be offset by a significant and clearly explained ESOP grant.', short: 'Lean cash + ESOP', kind: 'pay' },
    { topic: 'Notice Periods', norm: 'Standard notice periods are 2-3 months. This is a critical factor for timeline planning, and buyouts are rare for startups.', short: '2–3 months', kind: 'notice' },
    { topic: 'Work Authorisation', norm: 'Local candidates only. The company is too small to handle visa sponsorship complexities.', short: 'Locals only', kind: 'visa' },
  ],
  normal_red_flags: ['Job hopping every 12-18 months is common for high-potential talent in the Indian startup scene and shouldn\'t be an automatic disqualifier if the trajectory is logical and progressive.'],
  normal_red_flags_short: ['12–18 mo stints'],
  unsure_about_short: ['Why “interest in finance”?'],
  unsure_about: ["The 'interest in the financial industry' requirement is unusual for a recruiting SaaS. I need to clarify with the hiring manager if this is a proxy for quantitative skills, knowledge of the VC/PE space, or if they have a FinTech client focus."],
  corrections: '',
}

export const REASONING = "This is effectively the 'first Ops hire' at a 10-person, highly technical startup. The job isn't about optimizing existing processes; it's about creating the company's entire operating system from scratch. The successful candidate will be a 'human Swiss Army knife' who can single-handedly tackle ambiguous, complex problems. Therefore, the profile must be heavily weighted on raw, structured problem-solving ability and the hands-on analytical horsepower to be self-sufficient with data (SQL/Python). These two skills, combined with a high degree of ownership and scrappiness, are the strongest predictors of success, far more than any specific domain experience."

export const REASONING_SHORT = 'First ops hire at a 10-person startup — a hands-on problem solver who does their own SQL.'

export const PROBES = [
  { requirement: 'A magic skill to break complex problems into smaller ones', short: 'Breaks problems down' },
  { requirement: 'To enjoy working with data', short: 'Enjoys data' },
]

/** The same brief as one written before the AI wrote short tags — tiles fall back to clipped lines. */
export const OLD_BRIEF: RecruiterBrief = {
  ...BRIEF,
  persona_short: null,
  market_short: null,
  market_gates: BRIEF.market_gates.map((g) => ({ ...g, short: null })),
  jd_translations: BRIEF.jd_translations.map((t) => ({ ...t, short: null })),
  market_norms: BRIEF.market_norms.map((n) => ({ ...n, short: null, kind: null })),
  normal_red_flags_short: undefined,
  unsure_about_short: undefined,
}

export const COMPETENCIES: IcpCompetency[] = [
  { id: 'c1', name: 'Structured Problem-Solving', weight: 40, behaviours: ['Breaks an ambiguous problem into a clear tree', 'States assumptions before solving', 'Prioritises by impact, not effort', 'Lands on a recommendation', 'Has run a case or diagnostic end to end'] },
  { id: 'c2', name: 'Hands-On Analytical Horsepower', weight: 30, behaviours: ['Writes their own SQL', 'Builds models without a template', 'Sanity-checks numbers unprompted', 'Turns data into a decision'] },
  { id: 'c3', name: 'Ownership & Bias for Action', weight: 20, behaviours: ['Ships before it is perfect', 'Owns outcomes, not tasks', 'Has built something from zero'] },
  { id: 'c4', name: 'Strategic & Commercial Acumen', weight: 10, behaviours: ['Knows how the business makes money', 'Spots second-order effects'] },
]
