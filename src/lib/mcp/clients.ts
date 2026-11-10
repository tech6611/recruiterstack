/**
 * Which AI apps (OAuth clients) may use RecruiterStack's MCP server.
 *
 * Why this exists: Clerk's OAuth access tokens carry no `aud` (audience), so we
 * can't check "this pass was minted for RecruiterStack's MCP server" the way the
 * MCP spec asks. Instead we only accept passes issued to approved assistants.
 * (Defence in depth: Clerk's "Client admission" setting is the first lock.)
 *
 * - CIMD clients identify themselves with an HTTPS URL on their own domain, which
 *   Clerk fetched and validated — so a prefix on the vendor's domain is safe.
 * - Extra exact IDs (e.g. the pre-registered local test client) come from the
 *   MCP_EXTRA_CLIENT_IDS env var, comma-separated.
 */

const APPROVED_CLIENT_PREFIXES = [
  'https://chatgpt.com/oauth/', // ChatGPT (OpenAI) — see developers.openai.com/plugins/build/auth
  'https://claude.ai/oauth/', // Claude web/desktop/mobile + Claude Code
] as const

function extraClientIds(): string[] {
  return (process.env.MCP_EXTRA_CLIENT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function isApprovedClient(clientId: string): boolean {
  if (!clientId) return false
  if (APPROVED_CLIENT_PREFIXES.some((p) => clientId.startsWith(p))) return true
  return extraClientIds().includes(clientId)
}

/**
 * The permissions (OAuth scopes) AI apps should ask Clerk for, published in our
 * protected-resource metadata as `scopes_supported`. Must match the scopes allowed
 * on each AI app's Clerk entry, or Clerk rejects the sign-in with `invalid_scope`.
 * `candidates:contact` is deliberately left out until it's enabled in Clerk.
 */
export const MCP_REQUESTED_SCOPES = [
  'openid', 'profile', 'email', 'offline_access', 'user:org:read',
  'jobs:read', 'candidates:read', 'sourcing:run', 'pipeline:write', 'notes:write',
] as const
