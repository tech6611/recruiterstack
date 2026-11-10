import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from 'mcp-handler'
import { clerkIssuer } from '@/lib/mcp/verify-token'
import { MCP_REQUESTED_SCOPES } from '@/lib/mcp/clients'

/**
 * Public "where do I log in?" file for our MCP server (RFC 9728 Protected
 * Resource Metadata). ChatGPT / Claude read it after our MCP route answers 401,
 * and learn that Clerk is the authorization server.
 * Must stay public: no login, no secrets in it.
 *
 * `scopes_supported` tells AI apps exactly which permissions to ask Clerk for.
 * Without it, claude.ai falls back to Clerk's full list (incl. scopes its Clerk
 * client isn't allowed) and Clerk rejects the sign-in with `invalid_scope`.
 */
export async function GET(req: Request) {
  const base = await protectedResourceHandler({ authServerUrls: [clerkIssuer()] })(req).json()
  return new Response(JSON.stringify({ ...base, scopes_supported: MCP_REQUESTED_SCOPES }), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'max-age=300',
      'Content-Type': 'application/json',
    },
  })
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
