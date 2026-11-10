import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod'
import { verifyMcpToken } from '@/lib/mcp/verify-token'
import { MCP_REQUESTED_SCOPES } from '@/lib/mcp/clients'
import { guarded } from '@/lib/mcp/tool'
import { registerJobTools } from '@/lib/mcp/tools/jobs'
import { registerCandidateTools } from '@/lib/mcp/tools/candidates'
import { registerRankingTools } from '@/lib/mcp/tools/ranking'
import { registerOutreachTools } from '@/lib/mcp/tools/outreach'
import { registerActionTools } from '@/lib/mcp/tools/actions'

/**
 * RecruiterStack MCP server — the "front door" that ChatGPT, Claude and other
 * AI assistants call.
 *
 * Two layers of protection:
 *   1. withMcpAuth + verifyMcpToken: no valid Clerk OAuth access pass → 401, with a
 *      pointer to our protected-resource metadata so the assistant logs in via Clerk.
 *   2. guarded(...): EVERY tool re-checks approved app, scope, membership, role,
 *      workspace switch and revocation, and writes an audit row (src/lib/mcp/guard.ts).
 *
 * This route bypasses the Clerk browser middleware (see src/middleware.ts).
 */

// Scoring up to 25 candidates (5 at a time, ~7s each) needs headroom; Claude's own limit is 240s.
export const maxDuration = 300 // market sourcing (fetch + embed + score) can take ~1 min

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'whoami',
      {
        title: 'Who am I (RecruiterStack)',
        description:
          'Returns which RecruiterStack workspace and role this connection is signed in as, ' +
          'and which permissions were granted. Use it to check the connection is working.',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
      guarded('whoami', { scope: null, capability: 'recruiting:view' }, async (_args, ctx) => {
        const result = {
          workspace_id: ctx.orgId,
          role: ctx.viewer.role,
          // Only RecruiterStack's own permissions, not the standard login ones (openid, email, ...)
          permissions_granted: ctx.caller.scopes.filter((s) => s.includes(':') && s !== 'user:org:read'),
          ai_app_access: 'on',
        }
        return {
          structuredContent: result,
          content: [{ type: 'text', text: JSON.stringify(result) }],
          resultCount: 1,
        }
      }),
    )

    registerJobTools(server)
    registerCandidateTools(server)
    registerRankingTools(server)
    registerOutreachTools(server)
    registerActionTools(server)
  },
  { serverInfo: { name: 'recruiterstack', version: '0.1.0' } },
)

const authHandler = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource/api/mcp',
})

/**
 * Name the permissions to request in the 401 "please log in" challenge (RFC 6750 `scope`).
 * MCP clients check this first; without it claude.ai requests Clerk's ENTIRE scope list
 * (incl. public_metadata, private_metadata, candidates:contact), which its Clerk entry
 * isn't allowed, so Clerk refuses the sign-in with `invalid_scope`.
 * Only the header text changes; token checking is untouched.
 */
async function withScopeHint(req: Request): Promise<Response> {
  const res = await authHandler(req)
  const challenge = res.headers.get('www-authenticate')
  if (res.status !== 401 || !challenge || /\bscope=/.test(challenge)) return res
  const headers = new Headers(res.headers)
  headers.set('www-authenticate', `${challenge}, scope="${MCP_REQUESTED_SCOPES.join(' ')}"`)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export { withScopeHint as GET, withScopeHint as POST, withScopeHint as DELETE }
