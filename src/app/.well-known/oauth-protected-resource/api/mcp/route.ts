import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from 'mcp-handler'
import { clerkIssuer } from '@/lib/mcp/verify-token'

/**
 * Public "where do I log in?" file for our MCP server (RFC 9728 Protected
 * Resource Metadata). ChatGPT / Claude read it after our MCP route answers 401,
 * and learn that Clerk is the authorization server.
 * Must stay public: no login, no secrets in it.
 */
export function GET(req: Request) {
  return protectedResourceHandler({ authServerUrls: [clerkIssuer()] })(req)
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
