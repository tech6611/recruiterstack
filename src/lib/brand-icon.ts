/**
 * Brand icons — resolving an entity NAME to the domain its logo hangs off.
 *
 * Replaces lib/company-logo.ts, whose provider (logo.clearbit.com) no longer
 * resolves: every <CompanyLogo> in the app has been silently falling back to a grey
 * initial. Fetching moved server-side (/api/brand-icon) for two reasons — the browser
 * hotlinking a logo provider would leak every candidate's employer list to a third
 * party on each page view, and only the server can tell a real logo from the generic
 * globe a favicon service returns when it has nothing.
 *
 * SHAPE OF THE PROBLEM, measured over all 1,370 role rows and 498 education rows we
 * hold: 866 distinct employers and 365 distinct schools. No table covers that tail, so
 * this file is deliberately two-speed — an alias table for the dirty head ("GOLDMAN
 * SACHS", "Boston Consulting Group (BCG)"), a conservative guess for the rest, and a
 * monogram for everything else. The monogram is the COMMON case, not an error state.
 *
 * A GUESS IS ONLY WORTH MAKING WHEN IT COULD BE RIGHT. Employer strings arrive as
 * LinkedIn-style "Brand | tagline" lines and long descriptive names; slugging those
 * yields confident nonsense (googlesummerofcodefedora.com) and a wasted round-trip.
 * So we cut the tagline, then refuse to guess past three words.
 *
 * COMPANIES AND SCHOOLS NORMALISE DIFFERENTLY. Stripping "technology"/"science" as a
 * legal suffix turns "SRM Institute of Science and Technology" into "srm institute of
 * science and", and splitting at the comma turns "Indian Institute of Technology,
 * Madras" into a campus-less name that can never resolve. Schools therefore get their
 * own, near-untouched normalisation.
 *
 * PURE. No I/O, no network, no clock — so the head table stays testable.
 */

export type BrandKind = 'company' | 'school'

/** Names that are not an organisation at all — straight to a monogram, never a lookup. */
const NOT_AN_ORG =
  /^(?:freelance|freelancer|self[\s-]?employed|self|independent|independent consultant|consultant|unemployed|career break|sabbatical|student|various|multiple|n\/?a|none|personal projects?|side projects?|open source)$/i

/** Student-society and campus roles — an employer field, but not an employer. */
const CAMPUS = /\b(?:e-?cell|student council|student ambassadors?|hostel)\b/i

/** Legal-form and generic suffixes that are never part of a COMPANY domain. */
const SUFFIXES =
  /\b(?:inc|llc|ltd|limited|corp|corporation|company|co|plc|gmbh|pvt|private|technologies|labs|laboratories|software|systems|solutions|services|group|holdings|ventures|partners|india|the)\b/gi

/**
 * A LinkedIn-style employer line is "Brand — what the brand does". Everything after the
 * first separator is a tagline, not part of the name.
 */
const TAGLINE = /\s+(?:[|·•‧]|[-–—:;])\s+/

/** An employer string that is really an educational institution. */
const ACADEMIC = /\b(?:university|universidad|institute|college|school|polytechnic|iit|iim|nit|iisc|iiit)\b/

/**
 * Employers whose domain a bare-slug + ".com" guess gets wrong, plus the spellings our
 * own data actually contains. Keys are company-normalised (see `normalizeName`).
 */
const COMPANY_DOMAINS: Record<string, string> = {
  // dirty spellings observed in our data
  'goldman sachs': 'goldmansachs.com',
  'mckinsey': 'mckinsey.com',
  'mckinsey and': 'mckinsey.com',
  'bain and': 'bain.com',
  'bain': 'bain.com',
  'boston consulting': 'bcg.com',
  'bcg': 'bcg.com',
  'facebook': 'meta.com',
  'meta': 'meta.com',
  'alphabet': 'google.com',
  'aws': 'aws.amazon.com',
  'amazon web': 'aws.amazon.com',
  'ab inbev': 'ab-inbev.com',
  'anheuser busch inbev': 'ab-inbev.com',
  'tvs motor': 'tvsmotor.com',
  'indusind bank': 'indusind.com',
  'sahaj': 'sahaj.ai',
  'red hat': 'redhat.com',
  'hewlett packard enterprise': 'hpe.com',
  'hewlett packard': 'hp.com',
  'cambridge university press and assessment': 'cambridge.org',
  'linux foundation': 'linuxfoundation.org',
  'python foundation': 'python.org',
  'python': 'python.org',
  // products whose domain isn't .com
  'notion': 'notion.so',
  'x': 'x.com',
  'twitter': 'x.com',
  'tome': 'tome.app',
  'letsdive': 'letsdive.io',
  // professional services
  'ey': 'ey.com',
  'ernst and young': 'ey.com',
  'pwc': 'pwc.com',
  'pricewaterhousecoopers': 'pwc.com',
  'kpmg': 'kpmg.com',
  'deloitte': 'deloitte.com',
  'jll': 'jll.com',
  'jp morgan': 'jpmorganchase.com',
  'jpmorgan': 'jpmorganchase.com',
  'jpmorgan chase': 'jpmorganchase.com',
  'morgan stanley': 'morganstanley.com',
  // Indian IT & internet
  'tcs': 'tcs.com',
  'tata consultancy': 'tcs.com',
  'hcl': 'hcltech.com',
  'hcltech': 'hcltech.com',
  'tech mahindra': 'techmahindra.com',
  'ola': 'olacabs.com',
  'byjus': 'byjus.com',
  'paytm': 'paytm.com',
  'clover health': 'cloverhealth.com',
  'aditya birla fashion and retail': 'abfrl.com',
}

/**
 * Schools, keyed on the school normalisation (punctuation gone, wording intact). Name
 * -to-domain guessing is hopeless here — "Indian Institute of Technology, Madras" is
 * iitm.ac.in — so this is a table plus the campus families below, and a monogram for
 * the rest.
 */
const SCHOOL_DOMAINS: Record<string, string> = {
  'masai school': 'masaischool.com',
  'stanford university': 'stanford.edu',
  'massachusetts institute of technology': 'mit.edu',
  'mit': 'mit.edu',
  'harvard university': 'harvard.edu',
  'harvard business school': 'harvard.edu',
  'princeton university': 'princeton.edu',
  'columbia university': 'columbia.edu',
  'cornell university': 'cornell.edu',
  'yale university': 'yale.edu',
  'duke university': 'duke.edu',
  'carnegie mellon university': 'cmu.edu',
  'georgia institute of technology': 'gatech.edu',
  'georgia tech': 'gatech.edu',
  'new york university': 'nyu.edu',
  'university of pennsylvania': 'upenn.edu',
  'the wharton school': 'upenn.edu',
  'texas a and m university': 'tamu.edu',
  'washington university in st louis': 'wustl.edu',
  'indian institute of foreign trade': 'iift.edu',
  'indian institute of engineering science and technology shibpur': 'iiests.ac.in',
  'university of california berkeley': 'berkeley.edu',
  'uc berkeley': 'berkeley.edu',
  'university of california los angeles': 'ucla.edu',
  'ucla': 'ucla.edu',
  'university of southern california': 'usc.edu',
  'university of michigan': 'umich.edu',
  'university of illinois urbana champaign': 'illinois.edu',
  'university of illinois': 'illinois.edu',
  'university of texas at austin': 'utexas.edu',
  'university of texas at san antonio': 'utsa.edu',
  'university of virginia': 'virginia.edu',
  'university of freiburg': 'uni-freiburg.de',
  'universidad de los andes': 'uniandes.edu.co',
  // India
  'indian institute of science': 'iisc.ac.in',
  'indian institute of science bangalore': 'iisc.ac.in',
  'pes university': 'pes.edu',
  'christ university': 'christuniversity.in',
  'shri ram college of commerce': 'srcc.edu',
  'srcc': 'srcc.edu',
  'birla institute of technology and science pilani': 'bits-pilani.ac.in',
  'bits pilani': 'bits-pilani.ac.in',
  'university of delhi': 'du.ac.in',
  'delhi university': 'du.ac.in',
  'vellore institute of technology': 'vit.ac.in',
  'manipal institute of technology': 'manipal.edu',
  'srm institute of science and technology': 'srmist.edu.in',
  'anna university': 'annauniv.edu',
  'jadavpur university': 'jaduniv.edu.in',
  'chandigarh university': 'cuchd.in',
  'bangalore university': 'bangaloreuniversity.ac.in',
  'b m s college of engineering': 'bmsce.in',
  'international institute of information technology bangalore': 'iiitb.ac.in',
  'gujarat technological university': 'gtu.ac.in',
  'visvesvaraya technological university': 'vtu.ac.in',
}

/** IIT / IIM / NIT campuses. The wording varies far too much for a flat table. */
const IIT_CAMPUS: Record<string, string> = {
  madras: 'iitm.ac.in', bombay: 'iitb.ac.in', mumbai: 'iitb.ac.in', delhi: 'iitd.ac.in',
  kanpur: 'iitk.ac.in', kharagpur: 'iitkgp.ac.in', roorkee: 'iitr.ac.in',
  guwahati: 'iitg.ac.in', hyderabad: 'iith.ac.in', indore: 'iiti.ac.in',
  bhubaneswar: 'iitbbs.ac.in', ropar: 'iitrpr.ac.in', gandhinagar: 'iitgn.ac.in',
  patna: 'iitp.ac.in', mandi: 'iitmandi.ac.in', jodhpur: 'iitj.ac.in',
  varanasi: 'iitbhu.ac.in', bhu: 'iitbhu.ac.in', dhanbad: 'iitism.ac.in',
}
const IIM_CAMPUS: Record<string, string> = {
  ahmedabad: 'iima.ac.in', bangalore: 'iimb.ac.in', bengaluru: 'iimb.ac.in',
  calcutta: 'iimcal.ac.in', kolkata: 'iimcal.ac.in', kozhikode: 'iimk.ac.in',
  lucknow: 'iiml.ac.in', indore: 'iimidr.ac.in', udaipur: 'iimu.ac.in',
  shillong: 'iimshillong.ac.in', raipur: 'iimraipur.ac.in', rohtak: 'iimrohtak.ac.in',
}
const NIT_CAMPUS: Record<string, string> = {
  trichy: 'nitt.edu', tiruchirappalli: 'nitt.edu', calicut: 'nitc.ac.in',
  warangal: 'nitw.ac.in', surathkal: 'nitk.ac.in', rourkela: 'nitrkl.ac.in',
  kurukshetra: 'nitkkr.ac.in', durgapur: 'nitdgp.ac.in',
}

/** Shared first pass: accents out, parentheticals out, tagline cut, punctuation to space. */
function baseNormalize(name: string): string {
  return (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')        // "VideoVerse (Magnifi)" → "videoverse"
    .split(TAGLINE)[0]                  // "Calry | Unified API for…" → "calry"
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The key both lookup tables are written in, and the key the `brand_domains` override
 * table stores. Companies lose legal suffixes and anything after a comma; schools keep
 * both, because the comma carries the campus and "Technology" carries the name.
 */
export function normalizeName(name: string, kind: BrandKind = 'company'): string {
  const base = baseNormalize(name)
  if (kind === 'school') {
    return base.replace(/,/g, ' ').replace(/^the\s+/, '').replace(/\s+/g, ' ').trim()
  }
  return base
    .split(',')[0]                      // "Tryton, Python Software Foundation" → first segment
    .replace(SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when the name isn't an organisation we should ever look up. */
export function isUnbrandable(name: string): boolean {
  const raw = (name ?? '').trim()
  if (!raw) return true
  if (CAMPUS.test(raw)) return true
  return NOT_AN_ORG.test(normalizeName(raw)) || NOT_AN_ORG.test(raw.toLowerCase())
}

/** Resolve an IIT/IIM/NIT name to its campus domain. Null when no family matches. */
function campusDomain(n: string): string | null {
  const pick = (table: Record<string, string>) =>
    Object.entries(table).find(([city]) => new RegExp(`\\b${city}\\b`).test(n))?.[1] ?? null
  if (/\biit\b/.test(n) || /indian institute of technology/.test(n)) {
    const d = pick(IIT_CAMPUS)
    if (d) return d
  }
  if (/\biim\b/.test(n) || /indian institute of management/.test(n)) {
    const d = pick(IIM_CAMPUS)
    if (d) return d
  }
  if (/\bnit\b/.test(n) || /national institute of technology/.test(n)) {
    const d = pick(NIT_CAMPUS)
    if (d) return d
  }
  return null
}

/**
 * Best-effort domain for a name. Null means "no lookup worth making" — render the
 * monogram instead of asking a provider a question it can't answer.
 */
export function brandDomain(name: string, kind: BrandKind = 'company'): string | null {
  if (isUnbrandable(name)) return null
  const n = normalizeName(name, kind)
  if (!n) return null

  if (kind === 'school') {
    if (SCHOOL_DOMAINS[n]) return SCHOOL_DOMAINS[n]
    const campus = campusDomain(n)
    if (campus) return campus
    // Longest table key contained in the name: "stanford university graduate school of
    // business" → stanford.edu. Guarded at 8 chars so "mit" can't match inside a word.
    const hit = Object.keys(SCHOOL_DOMAINS)
      .filter((k) => k.length >= 8 && n.includes(k))
      .sort((a, b) => b.length - a.length)[0]
    if (hit) return SCHOOL_DOMAINS[hit]
    // A guessed .com for a school is almost always wrong. Monogram instead.
    return null
  }

  if (COMPANY_DOMAINS[n]) return COMPANY_DOMAINS[n]
  // Universities turn up in the employer field too (research assistants, campus staff).
  // Route them at the school tables rather than slugging "indian institute of…".
  if (ACADEMIC.test(n)) {
    const asSchool = brandDomain(name, 'school')
    if (asSchool) return asSchool
  }
  // Past three words it stops being a brand and starts being a description, and the
  // slug would be confident nonsense. Monogram is the honest answer.
  if (n.split(' ').length > 3) return null
  const bare = n.replace(/[^a-z0-9]/g, '')
  if (bare.length < 2 || bare.length > 26) return null
  return `${bare}.com`
}

/** Words that carry no identity, so they must never supply a monogram letter. */
const STOPWORDS = /^(?:of|the|and|at|for|in|on|a|an|de|du|la|le)$/i

/**
 * 1–2 letter fallback mark: "Stripe" → "S", "Palo Alto Networks" → "PA".
 *
 * Stopwords are dropped first. Taking the first two words blindly gave every
 * university the same "UO" — University of Manitoba, University of California and
 * University of Illinois were one indistinguishable mark, which is worse than no mark
 * at all. Parentheticals go too: "Techevince (The Annual Exhibition…)" is "T".
 */
export function brandInitials(name: string): string {
  const cleaned = (name ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^A-Za-z0-9À-ɏ\s]/g, ' ')
    .trim()
  const words = cleaned.split(/\s+/).filter(Boolean)
  const meaningful = words.filter((w) => !STOPWORDS.test(w))
  const use = meaningful.length ? meaningful : words
  if (!use.length) return '?'
  if (use.length === 1) return use[0].slice(0, 1).toUpperCase()
  return (use[0][0] + use[1][0]).toUpperCase()
}

/** The proxy URL the <BrandIcon> img points at, or null when only a monogram applies. */
export function brandIconSrc(name: string, kind: BrandKind = 'company'): string | null {
  if (!brandDomain(name, kind)) return null
  return `/api/brand-icon?name=${encodeURIComponent(name.trim())}&kind=${kind}`
}
