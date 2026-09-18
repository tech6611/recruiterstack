/**
 * Seed HOUSE KNOWLEDGE: school tiers per market. No vendor knows what "Tier 1" means —
 * it is the recruiter's reverse-engineering of the job — so the lists live here, the
 * brief may override them per job, and recruiter edits to the spec win over both.
 *
 * Values are the literal all-words search terms a source matches against the free-text
 * school name ("Indian Institute of Technology, Madras", "BITS Pilani, Hyderabad
 * Campus"). A generic institution name covers every campus in one term.
 */
export interface SchoolTiers {
  tier1: string[]
  tier2: string[]
}

const IN: SchoolTiers = {
  tier1: [
    'Indian Institute of Technology', 'IIT',
    'Indian Institute of Management', 'IIM',
    'Indian School of Business', 'ISB',
    'BITS Pilani', 'Birla Institute of Technology and Science',
    'National Institute of Technology', 'NIT',
    'Faculty of Management Studies', 'FMS Delhi',
    'XLRI',
    'Shri Ram College of Commerce', 'SRCC',
    "St. Stephen's College",
  ],
  tier2: [
    'Delhi Technological University', 'DTU', 'Netaji Subhas', 'NSIT', 'NSUT',
    'Vellore Institute of Technology', 'VIT',
    'Jadavpur University', 'Anna University', 'College of Engineering, Pune',
    'International Institute of Information Technology', 'IIIT',
    'Indian Institute of Foreign Trade', 'IIFT',
    'Management Development Institute', 'MDI Gurgaon',
    'SP Jain', 'S.P. Jain', 'SPJIMR',
    'NMIMS', 'Symbiosis', 'Jamnalal Bajaj', 'JBIMS',
    'Lady Shri Ram', 'Hindu College', 'Hansraj College',
  ],
}

const GB: SchoolTiers = {
  tier1: ['University of Oxford', 'University of Cambridge', 'London School of Economics', 'LSE', 'Imperial College London', 'UCL', 'University College London', 'University of Warwick'],
  tier2: ['University of Edinburgh', 'University of Manchester', "King's College London", 'University of Bristol', 'Durham University', 'University of Bath', 'University of St Andrews'],
}

const AE: SchoolTiers = { ...IN, tier1: [...IN.tier1, ...GB.tier1, 'American University of Beirut', 'AUB'], tier2: [...IN.tier2, ...GB.tier2, 'American University of Sharjah'] }

const BY_COUNTRY: Record<string, SchoolTiers> = { IN, GB, AE }

/** House tier lists for a country code, or null when we have none for that market. */
export function schoolTiersFor(country: string | null | undefined): SchoolTiers | null {
  if (!country) return null
  return BY_COUNTRY[country.toUpperCase()] ?? null
}
