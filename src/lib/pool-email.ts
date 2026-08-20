/**
 * Some Candidate-Pool profiles have contact channels (LinkedIn, phone) but no email.
 * A candidate record still needs an email (people.email is unique + not-null), so we
 * mint a clearly NON-DELIVERABLE placeholder using the reserved `.invalid` TLD
 * (RFC 2606) — it can never route to a real inbox, so it can't bounce off a real
 * domain. Dependency-free so both the server and the UI can use it.
 */

/** A guaranteed-undeliverable placeholder email for a contactless-but-unlockable profile. */
export function poolPlaceholderEmail(profileId: string): string {
  return `pool-${profileId}@no-email.invalid`
}

/** True if an email is a pool placeholder (new `.invalid` form, or the old
 *  `@unlocked.recruiterstack.in` one) — i.e. "no real email on file". */
export function isPoolPlaceholderEmail(email: string | null | undefined): boolean {
  const e = (email ?? '').toLowerCase().trim()
  return e.endsWith('.invalid') || e.endsWith('@unlocked.recruiterstack.in')
}
