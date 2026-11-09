import { confidentialFilter, jobVisible } from '@/lib/jobs/confidential'
import type { McpContext } from './guard'

/**
 * Which jobs the caller may see through an AI assistant — the same rules as the app:
 *   - confidential jobs only for admins/owners, the creator and the job's hiring team
 *     (src/lib/jobs/confidential.ts)
 *   - limited viewers (no recruiting:view, e.g. hiring managers) only the jobs they're on
 * A job that fails these checks is reported as "not found", never "forbidden", so its
 * existence isn't leaked.
 */
export async function jobVisibility(ctx: McpContext): Promise<(job: { id: string; confidentiality: string | null }) => boolean> {
  const conf = await confidentialFilter(ctx.supabase, ctx.orgId, ctx.viewer)
  const limited = !ctx.viewer.capabilities.has('recruiting:view')
  return (job) => {
    if (limited && !ctx.viewer.jobIds.has(job.id)) return false
    return jobVisible(conf, { id: job.id, confidentiality: job.confidentiality })
  }
}

export function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.recruiterstack.in').replace(/\/$/, '')
  return `${base}${path}`
}
