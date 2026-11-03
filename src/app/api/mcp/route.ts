import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod'
import { verifyMcpToken } from '@/lib/mcp/verify-token'
import { guarded } from '@/lib/mcp/tool'

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
  },
  { serverInfo: { name: 'recruiterstack', version: '0.1.0' } },
)

const authHandler = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource/api/mcp',
})

export { authHandler as GET, authHandler as POST, authHandler as DELETE }
