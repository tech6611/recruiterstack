/**
 * Fixture payloads for `vendor:crustdata` (Slice 1).
 *
 * Shaped exactly like Crustdata's POST /person/search response `profiles[]` entries
 * (verified against a live call on 2026-09-16) — nested `basic_profile`,
 * `experience.employment_details.current[]` / `past[]` role lists, ISO-timestamp
 * dates, a `metadata.updated_at` freshness stamp. When we tune the adapter later it
 * should stay a small diff from mock/adapter.ts.
 *
 * Like the mock fixtures, these aren't only happy paths — each edge case encodes a
 * failure the ingest spine must survive, and adapter.test.ts asserts on exactly it.
 *
 * NOTE: Person Search does NOT return skills, emails or phones — only a
 * `contact.has_business_email` flag. So a searched person's only identifier is
 * usually their LinkedIn URL; skills/contacts arrive later via Person/Contact Enrich.
 */

/** One role under experience.employment_details.current[] or past[]. */
export interface CrustRole {
  name?: string | null
  title?: string | null
  seniority_level?: string | null
  function_category?: string | null
  start_date?: string | null
  end_date?: string | null
  years_at_company_raw?: number | null
  is_default?: boolean
  location?: { raw?: string | null } | null
  description?: string | null
}

export interface CrustSchool {
  school?: string | null
  degree?: string | null
  field_of_study?: string | null
  start_year?: number | null
  end_year?: number | null
}

/** A single entry from the `profiles[]` array of POST /person/search. */
export interface CrustdataPersonPayload {
  crustdata_person_id?: number | string | null
  basic_profile?: {
    name?: string | null
    first_name?: string | null
    last_name?: string | null
    headline?: string | null
    current_title?: string | null
    location?: {
      city?: string | null
      state?: string | null
      country?: string | null
      full_location?: string | null
      raw?: string | null
    } | null
  } | null
  experience?: {
    employment_details?: {
      current?: CrustRole[]
      past?: CrustRole[]
    } | null
  } | null
  education?: { schools?: CrustSchool[] } | null
  social_handles?: {
    professional_network_identifier?: { profile_url?: string | null } | null
    dev_platform_identifier?: { profile_url?: string | null } | null
    twitter_identifier?: { slug?: string | null } | null
  } | null
  contact?: { has_business_email?: boolean } | null
  metadata?: { updated_at?: string | null } | null
  /** Present on some records only; omit the experience_years claim when absent. */
  years_of_experience_raw?: number | null
  /** Not returned by search; defensively supported for enrich payloads. */
  skills?: string[] | null
}

/**
 * A real, unedited profile returned by POST /person/search (Bengaluru backend
 * engineers, 2026-09-16). Deliberately kept as the live shape, including its two
 * quirks the adapter must handle:
 *  - TWO current roles (Vimeo + Mercor, both open-ended); only Vimeo is `is_default`,
 *    so it — not the later-started Mercor — is the "current company".
 *  - `years_of_experience_raw` is null, so no experience_years claim should be emitted.
 */
export const FIXTURE_COMPLETE: CrustdataPersonPayload = {
  crustdata_person_id: 1410707,
  basic_profile: {
    name: 'Robin Singh',
    first_name: null,
    last_name: null,
    headline: 'Senior Software Engineer @ Vimeo | Go | Python | AI/RAG | Platform Integrations | System Design & Distributed Systems',
    current_title: 'Senior Software Engineer (Backend, AI & Full-Stack)',
    location: {
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      full_location: 'Bengaluru, Karnataka, India',
      raw: 'Bengaluru, Karnataka, India',
    },
  },
  experience: {
    employment_details: {
      current: [
        {
          name: 'Vimeo',
          title: 'Senior Software Engineer (Backend, AI & Full-Stack)',
          seniority_level: 'Senior',
          function_category: 'Engineering',
          start_date: '2023-05-01T00:00:00',
          years_at_company_raw: 3,
          is_default: true,
          location: { raw: 'Bengaluru' },
        },
        {
          name: 'Mercor',
          title: 'AI Engineer',
          seniority_level: 'Entry Level',
          function_category: 'Engineering',
          start_date: '2026-03-01T00:00:00',
          years_at_company_raw: 0,
          is_default: false,
        },
      ],
      past: [
        {
          name: 'Internshala',
          title: 'Software Engineer II',
          seniority_level: 'Entry Level',
          function_category: 'Engineering',
          start_date: '2022-07-01T00:00:00',
          end_date: '2023-05-01T00:00:00',
          is_default: false,
          location: { raw: 'Gurugram, Haryana, India' },
        },
        {
          name: 'Internshala',
          title: 'Software Engineer',
          seniority_level: 'Entry Level',
          function_category: 'Engineering',
          start_date: '2020-11-01T00:00:00',
          end_date: '2022-07-01T00:00:00',
          is_default: false,
          location: { raw: 'Gurugram, Haryana, India' },
        },
      ],
    },
  },
  education: {
    schools: [
      { school: 'Lovely Professional University', degree: 'Bachelor of Technology - BTech', start_year: 2017, end_year: 2021 },
    ],
  },
  social_handles: {
    professional_network_identifier: { profile_url: 'https://www.linkedin.com/in/robin-singh-35797a166' },
    dev_platform_identifier: { profile_url: null },
  },
  contact: { has_business_email: true },
  metadata: { updated_at: '2026-09-15T05:52:32+00:00' },
  years_of_experience_raw: null,
}

/**
 * Same person, but the vendor gave no freshness stamp. The claim date must fall back
 * to the newest date the record itself asserts (the latest role start), NEVER now() —
 * faking freshness re-creates the migration-117 tenure bug.
 */
export const FIXTURE_NO_STAMP: CrustdataPersonPayload = {
  ...FIXTURE_COMPLETE,
  metadata: { updated_at: null },
}

/**
 * Reachable by GitHub but not LinkedIn, and with a real years-of-experience number.
 * Must still be usable (an identifier exists) and must emit an experience_years claim.
 */
export const FIXTURE_GITHUB_ONLY: CrustdataPersonPayload = {
  crustdata_person_id: 2200500,
  basic_profile: {
    name: 'Priya Nair',
    headline: 'Staff Engineer',
    current_title: 'Staff Engineer',
    location: { full_location: 'Kochi, Kerala, India', raw: 'Kochi, Kerala, India' },
  },
  experience: {
    employment_details: {
      current: [
        { name: 'Freshworks', title: 'Staff Engineer', seniority_level: 'Senior', function_category: 'Engineering', start_date: '2021-02-01T00:00:00', is_default: true },
      ],
      past: [],
    },
  },
  education: { schools: [{ school: 'NIT Calicut', degree: 'B.Tech', field_of_study: 'Computer Science', end_year: 2013 }] },
  social_handles: {
    professional_network_identifier: { profile_url: null },
    dev_platform_identifier: { profile_url: 'https://github.com/priyanair' },
  },
  contact: { has_business_email: false },
  metadata: { updated_at: '2026-05-20T00:00:00+00:00' },
  years_of_experience_raw: 12,
}

/**
 * Charged, returned in the results, and worth nothing: no name, no history, no
 * identifier. Must be reported unusable (not thrown) so the ledger records we paid
 * for this id and never buys it again.
 */
export const FIXTURE_UNUSABLE: CrustdataPersonPayload = {
  crustdata_person_id: 9999001,
  basic_profile: { name: null },
  experience: { employment_details: { current: [], past: [] } },
  social_handles: { professional_network_identifier: { profile_url: null }, dev_platform_identifier: { profile_url: null } },
  metadata: { updated_at: '2026-06-01T00:00:00+00:00' },
}

export const ALL_FIXTURES: CrustdataPersonPayload[] = [
  FIXTURE_COMPLETE,
  FIXTURE_NO_STAMP,
  FIXTURE_GITHUB_ONLY,
  FIXTURE_UNUSABLE,
]
