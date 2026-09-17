/**
 * Fixture payloads for `vendor:mock` (S1).
 *
 * Deliberately shaped like Coresignal's multi-source employee record — snake_case
 * keys, `date_from`/`date_to` strings of mixed precision, an `active_experience`
 * flag, a vendor-side `last_updated_at`. When the real adapter lands, it should be
 * a small diff from mock/adapter.ts rather than a new design.
 *
 * These aren't happy-path samples. Each one encodes a failure this pipeline has to
 * survive, and the adapter/ingest tests assert on exactly that.
 */

export interface MockVendorPayload {
  id: number | string
  full_name?: string | null
  headline?: string | null
  location_full?: string | null
  active_experience_title?: string | null
  active_experience_company?: string | null
  total_experience_months?: number | null
  experience?: {
    position_title?: string | null
    company_name?: string | null
    location?: string | null
    date_from?: string | null
    date_to?: string | null
    active_experience?: 0 | 1
    description?: string | null
  }[]
  education?: {
    institution_title?: string | null
    degree?: string | null
    field_of_study?: string | null
    date_to?: string | null
  }[]
  inferred_skills?: string[] | null
  primary_professional_email?: string | null
  professional_emails?: string[] | null
  linkedin_url?: string | null
  phone?: string | null
  websites?: string[] | null
  /** The vendor's own freshness stamp. Becomes evidence_as_of. */
  last_updated_at?: string | null
}

/** The straightforward case: complete, fresh, unambiguous. */
export const FIXTURE_COMPLETE: MockVendorPayload = {
  id: 90001,
  full_name: 'Asha Rao',
  headline: 'Engineering Manager @ Razorpay | ex-Flipkart',
  location_full: 'Bengaluru, Karnataka, India',
  active_experience_title: 'Engineering Manager',
  active_experience_company: 'Razorpay Software Private Limited',
  total_experience_months: 122,
  experience: [
    {
      position_title: 'Engineering Manager',
      company_name: 'Razorpay Software Private Limited',
      location: 'Bengaluru',
      date_from: '2023-04',
      date_to: null,
      active_experience: 1,
      description: 'Leads the payments platform team of 9.',
    },
    {
      position_title: 'Senior Software Engineer',
      company_name: 'Flipkart Internet Pvt Ltd',
      location: 'Bengaluru',
      date_from: '2019-07',
      date_to: '2023-03',
      active_experience: 0,
    },
    {
      position_title: 'Software Engineer',
      company_name: 'Infosys',
      location: 'Pune',
      date_from: '2016-06',
      date_to: '2019-06',
      active_experience: 0,
    },
  ],
  education: [
    { institution_title: 'BITS Pilani', degree: 'B.E.', field_of_study: 'Computer Science', date_to: '2016' },
  ],
  inferred_skills: ['Go', 'Kubernetes', 'PostgreSQL', 'Distributed Systems', 'go'],
  primary_professional_email: 'Asha.Rao+jobs@Gmail.com',
  linkedin_url: 'https://www.linkedin.com/in/asha-rao/?trk=public_profile',
  phone: '+91 98450 12345',
  last_updated_at: '2026-07-15',
}

/**
 * The same human as FIXTURE_COMPLETE, from a different vendor id, with a DIFFERENT
 * current employer and an older stamp. Two things must happen: it must resolve onto
 * the same profile via the shared (normalized) email, and fusion must prefer the
 * fresher employer rather than flip-flopping.
 */
export const FIXTURE_DUPLICATE_STALE: MockVendorPayload = {
  id: 90002,
  full_name: 'Asha Rao',
  headline: 'Senior Software Engineer at Flipkart',
  location_full: 'Bangalore, India',
  active_experience_title: 'Senior Software Engineer',
  active_experience_company: 'Flipkart',
  experience: [
    {
      position_title: 'Senior Software Engineer',
      company_name: 'Flipkart',
      date_from: '2019-07',
      date_to: null,
      active_experience: 1,
    },
  ],
  inferred_skills: ['Java', 'Go'],
  // Same mailbox as FIXTURE_COMPLETE once normalized: dots and +tag removed.
  primary_professional_email: 'asharao@gmail.com',
  last_updated_at: '2022-01-10',
}

/**
 * Charged, returned HTTP 200, and worth nothing: no name, no history, no identity.
 * This is the record that must be marked 'unusable' — if it isn't, the pre-buy
 * check never learns we paid for it and we buy it again on every future search.
 */
export const FIXTURE_UNUSABLE: MockVendorPayload = {
  id: 90003,
  full_name: null,
  headline: null,
  experience: [],
  last_updated_at: '2026-06-01',
}

/**
 * Loose dates a vendor really does emit: a bare year, a "Present" end, and a role
 * with no dates at all. The mapper must not silently invent precision.
 */
export const FIXTURE_LOOSE_DATES: MockVendorPayload = {
  id: 90004,
  full_name: 'Vikram Iyer',
  location_full: 'Gurugram',
  active_experience_title: 'Head of Growth',
  active_experience_company: 'Meesho',
  experience: [
    { position_title: 'Head of Growth', company_name: 'Meesho', date_from: '2021', date_to: 'Present', active_experience: 1 },
    { position_title: 'Growth Lead', company_name: 'Paytm', date_from: 'Jan 2018', date_to: 'Dec 2020' },
    { position_title: 'Consultant', company_name: 'Bain & Company' },
  ],
  inferred_skills: ['Performance Marketing', 'SQL'],
  linkedin_url: 'in.linkedin.com/in/vikram-iyer',
  last_updated_at: '2026-08-01',
}

/**
 * Reachable only by LinkedIn — no email. Must still count as `reachable`, and must
 * NOT be discarded for lacking an email.
 */
export const FIXTURE_NO_EMAIL: MockVendorPayload = {
  id: 90005,
  full_name: 'Priya Nair',
  headline: 'Customer Success Lead',
  location_full: 'Kochi, Kerala',
  active_experience_title: 'Customer Success Lead',
  active_experience_company: 'Freshworks',
  experience: [
    { position_title: 'Customer Success Lead', company_name: 'Freshworks', date_from: '2022-02', date_to: null, active_experience: 1 },
  ],
  inferred_skills: ['Account Management'],
  linkedin_url: 'linkedin.com/in/priya-nair',
  last_updated_at: '2026-05-20',
}

export const ALL_FIXTURES: MockVendorPayload[] = [
  FIXTURE_COMPLETE,
  FIXTURE_DUPLICATE_STALE,
  FIXTURE_UNUSABLE,
  FIXTURE_LOOSE_DATES,
  FIXTURE_NO_EMAIL,
]
