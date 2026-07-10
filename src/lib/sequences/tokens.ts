// Merge-field tokens shared by the stage editor and the send path. A stage body
// like "Hi {{candidate_first_name}}" gets these filled in per candidate at send.
//
// #9 fallback defaults: when a candidate is missing a value (e.g. we never
// captured their current company), we substitute a natural-reading default like
// "your company" instead of leaving an awkward blank in the sentence. This keeps
// the editor and the sender in agreement about what a reader will actually see.

export interface TokenMeta {
  token: string        // the literal {{...}} form
  key: string          // the inner name
  label: string        // human label shown in the editor
  fallback: string     // used when the per-candidate value is blank
}

export const SEQUENCE_TOKENS: TokenMeta[] = [
  { token: '{{candidate_first_name}}', key: 'candidate_first_name', label: 'First Name',      fallback: 'there' },
  { token: '{{candidate_name}}',       key: 'candidate_name',       label: 'Full Name',       fallback: 'there' },
  { token: '{{candidate_title}}',      key: 'candidate_title',      label: 'Current Title',   fallback: 'your role' },
  { token: '{{candidate_company}}',    key: 'candidate_company',    label: 'Current Company', fallback: 'your company' },
  { token: '{{candidate_location}}',   key: 'candidate_location',   label: 'Location',        fallback: 'your area' },
  { token: '{{job_title}}',            key: 'job_title',            label: 'Job Title',       fallback: 'this role' },
  { token: '{{company_name}}',         key: 'company_name',         label: 'Hiring Company',  fallback: 'our company' },
  { token: '{{recruiter_name}}',       key: 'recruiter_name',       label: 'Recruiter',       fallback: 'the hiring team' },
]

const FALLBACK_BY_KEY: Record<string, string> = Object.fromEntries(
  SEQUENCE_TOKENS.map(t => [t.key, t.fallback]),
)

// Replace every {{token}} in `text`. A known token with a blank value falls back
// to its natural default; any unrecognised {{token}} is blanked so a recipient
// never sees a raw placeholder.
export function applyTokens(text: string, values: Record<string, string | null | undefined>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, rawKey: string) => {
    const key = rawKey.trim()
    const value = values[key]
    if (value && value.trim()) return value
    return FALLBACK_BY_KEY[key] ?? ''
  })
}

// Which known tokens appear in the given subject/body — used by the editor to
// warn "these will fall back to defaults if a candidate is missing the value".
export function tokensUsed(...texts: string[]): TokenMeta[] {
  const joined = texts.join(' ')
  return SEQUENCE_TOKENS.filter(t => joined.includes(t.token))
}
