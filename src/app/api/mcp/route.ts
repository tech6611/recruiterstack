import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod'
import { verifyMcpToken, callerFrom } from '@/lib/mcp/verify-token'

/**
 * RecruiterStack MCP server — the "front door" that ChatGPT, Claude and other
 * AI assistants call. Phase 1 / Step 2: one harmless tool (`whoami`) to prove the
 * connection, the Clerk access-pass check and the workspace mapping.
 *
 * Auth: this route bypasses the Clerk browser middleware (see src/middleware.ts);
 * `withMcpAuth` + `verifyMcpToken` guard it instead. No valid pass → 401 with a
 * pointer to our protected-resource metadata, which tells the assistant to log in
 * through Clerk.
 */

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'whoami',
      {
        title: 'Who am I (RecruiterStack)',
        description:
          'Returns which RecruiterStack user and workspace this connection is signed in as, ' +
          'and which permissions were granted. Use it to check the connection is working.',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
      async (_args, ctx) => {
        const caller = callerFrom(ctx.http?.authInfo)
        const extra = ctx.http?.authInfo?.extra ?? {}
        const result = {
          user_id: caller.userId,
          workspace_id: caller.orgId,
          client_id: caller.clientId,
          scopes: caller.scopes,
          // Spike-only diagnostics (removed in Step 3)
          token_audience: extra.audience ?? null,
          token_type: extra.tokenType ?? null,
        }
        return {
          structuredContent: result,
          content: [{ type: 'text', text: JSON.stringify(result) }],
        }
      },
    )
  },
  { serverInfo: { name: 'recruiterstack', version: '0.1.0' } },
)

const authHandler = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource/api/mcp',
})

export { authHandler as GET, authHandler as POST, authHandler as DELETE }
