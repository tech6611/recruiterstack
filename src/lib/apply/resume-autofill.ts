/**
 * Resume autofill — the safety layer that sits between the AI and the form.
 *
 * The public apply page lets a candidate upload their CV and have the form
 * fields fill themselves in. The risk with any LLM doing the extraction is
 * hallucination: inventing a phone number or a name that isn't in the document.
 * This module is the guardrail stack that keeps that from reaching the form:
 *
 *   1. Deterministic regex pulls email / phone / LinkedIn directly from the
 *      resume text. These fields follow rigid patterns, so rules extract them
 *      perfectly and — crucially — can never invent a value.
 *   2. The AI handles the fields that need understanding (name, title, etc.).
 *   3. Grounding: every AI-supplied value is checked against the resume's own
 *      text. If the value doesn't actually appear there, we drop it rather than
 *      trust it. Better a blank field the candidate fills in than a wrong one
 *      they don't notice.
 *
 * Everything here is pure (no I/O), so it is unit-tested in resume-autofill.test.ts.
 */

/** The shape the AI extractor is asked to return (before grounding). */
export interface RawParsedResume {
  name?: string | null
  email?: string | null
  phone?: string | null
  linkedin_url?: string | null
  current_title?: string | null
  location?: string | null
  experience_years?: number | null
  skills?: unknown
}

/** The cleaned, grounded result the apply form consumes. */
export interface AutofillCandidate {
  name: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  current_title: string | null
  location: string | null
  experience_years: number | null
  skills: string[]
}

export interface AutofillResult {
  candidate: AutofillCandidate
  meta: {
    /** Fields we actually populated (non-null / non-empty), for the UI hint. */
    filled: string[]
    /** AI values we dropped because they weren't found in the resume text. */
    dropped: string[]
    /** Whether we had resume text to ground against at all. */
    grounded: boolean
  }
}

// ── Deterministic contact extraction ─────────────────────────────────────────

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
// LinkedIn profile URLs — /in/ (personal) or /pub/ (legacy). Scheme optional.
const LINKEDIN_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[a-z0-9\-_%]+\/?/i
// A run of 8–20 characters that looks like a phone number: an optional leading
// "+", then digits with spaces / dots / dashes / parens. Validated afterwards
// by digit count so we don't mistake a long ID or year range for a phone.
const PHONE_RE = /\+?\d[\d\s().-]{6,18}\d/g

/** Pull the fields that follow rigid patterns straight from the text. */
export function extractContacts(text: string): {
  email: string | null
  phone: string | null
  linkedin_url: string | null
} {
  const email = text.match(EMAIL_RE)?.[0]?.toLowerCase() ?? null

  const linkedinRaw = text.match(LINKEDIN_RE)?.[0] ?? null
  const linkedin_url = linkedinRaw
    ? linkedinRaw.startsWith('http')
      ? linkedinRaw
      : `https://${linkedinRaw}`
    : null

  return { email, phone: pickPhone(text), linkedin_url }
}

/**
 * Choose the most phone-like match: 8–15 digits, rejecting year ranges (an
 * education line like "2014-2018" otherwise looks like a phone) and preferring
 * an international "+"-prefixed number over a bare digit run.
 */
function pickPhone(text: string): string | null {
  const candidates = text.match(PHONE_RE) ?? []
  let best: string | null = null
  let bestScore = -Infinity
  for (const raw of candidates) {
    const digits = raw.replace(/\D/g, '').length
    if (digits < 8 || digits > 15) continue
    // A "2014-2018" style year range is an education/employment date, not a phone.
    if (/\b(?:19|20)\d\d\s*[-–]\s*(?:19|20)\d\d\b/.test(raw)) continue
    const score = digits + (raw.trim().startsWith('+') ? 20 : 0)
    if (score > bestScore) {
      best = raw.trim()
      bestScore = score
    }
  }
  return best
}

// ── Grounding ────────────────────────────────────────────────────────────────

/** Lowercase and strip everything but letters/numbers, for lenient matching. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Is `value` actually present in the resume text? True if its normalized form
 * is a substring, or (for multi-word values like "Jane Smith" or
 * "Bengaluru, India") if every significant word-token appears — which tolerates
 * reordering and punctuation differences between the AI's output and the text.
 */
export function isGrounded(value: string, normalizedText: string): boolean {
  const nv = normalize(value)
  if (!nv) return false
  if (normalizedText.includes(nv)) return true
  const tokens = value.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3)
  if (tokens.length === 0) return false
  return tokens.every(t => normalizedText.includes(t))
}

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t || t.toLowerCase() === 'null' || t.toLowerCase() === 'n/a') return null
  return t
}

/**
 * Combine deterministic extraction with grounded AI output into the final
 * candidate. `raw` is the AI's parsed object; `sourceText` is the resume text
 * we extracted server-side (may be empty if extraction failed).
 */
export function buildAutofill(raw: RawParsedResume, sourceText: string): AutofillResult {
  const grounded = sourceText.trim().length > 0
  const normText = normalize(sourceText)
  const rawLower = sourceText.toLowerCase()
  const digitsText = sourceText.replace(/\D/g, '')
  const dropped: string[] = []

  // Deterministic contacts win over anything the AI produced.
  const regex = extractContacts(sourceText)

  // Name / title / location: keep only if grounded in the resume text.
  const groundStr = (field: string, v: unknown): string | null => {
    const s = cleanString(v)
    if (s == null) return null
    if (!grounded) return s // nothing to check against — defer to human review
    if (isGrounded(s, normText)) return s
    dropped.push(field)
    return null
  }

  // A contact value from the AI is accepted only as a fallback, and only if it
  // genuinely appears in the text (or we have no text to check).
  const groundEmail = (v: unknown): string | null => {
    const s = cleanString(v)?.toLowerCase() ?? null
    if (!s) return null
    // Compare on alphanumerics only, so a header the text-extractor spaced out
    // ("wareesha . sn @ gmail . com") still matches the AI's clean read. An
    // invented email still fails — its letters won't appear in the document.
    if (!grounded || normText.includes(normalize(s))) return s
    dropped.push('email')
    return null
  }
  const groundLinkedin = (v: unknown): string | null => {
    const s = cleanString(v)
    if (!s) return null
    if (!grounded || rawLower.includes(s.toLowerCase().replace(/^https?:\/\//, ''))) return s
    dropped.push('linkedin_url')
    return null
  }
  // The AI's phone is preferred over the regex fragment when its digits genuinely
  // appear in the resume — it survives header garbling that breaks the regex,
  // while an invented number (digits not in the doc) is still dropped.
  const groundAiPhone = (v: unknown): string | null => {
    const s = cleanString(v)
    if (!s) return null
    const d = s.replace(/\D/g, '')
    if (d.length < 8 || d.length > 15) return null
    if (!grounded || digitsText.includes(d)) return s
    dropped.push('phone')
    return null
  }

  const skills = groundSkills(raw.skills, normText, grounded)

  const candidate: AutofillCandidate = {
    name:         groundStr('name', raw.name),
    email:        regex.email ?? groundEmail(raw.email),
    phone:        groundAiPhone(raw.phone) ?? regex.phone,
    linkedin_url: regex.linkedin_url ?? groundLinkedin(raw.linkedin_url),
    current_title: groundStr('current_title', raw.current_title),
    location:      groundStr('location', raw.location),
    experience_years:
      typeof raw.experience_years === 'number' && raw.experience_years >= 0
        ? Math.round(raw.experience_years)
        : null,
    skills,
  }

  const filled = (Object.keys(candidate) as (keyof AutofillCandidate)[]).filter(k => {
    const v = candidate[k]
    return Array.isArray(v) ? v.length > 0 : v != null
  })

  // A field the AI failed but a deterministic fallback then filled isn't dropped.
  const filledSet = new Set<string>(filled)
  const finalDropped = dropped.filter(f => !filledSet.has(f))

  return { candidate, meta: { filled, dropped: finalDropped, grounded } }
}

function groundSkills(v: unknown, normText: string, grounded: boolean): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of v) {
    const s = cleanString(item)
    if (!s) continue
    if (grounded && !isGrounded(s, normText)) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= 15) break
  }
  return out
}
