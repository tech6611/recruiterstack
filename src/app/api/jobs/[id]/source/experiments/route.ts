import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { getCanonicalJobScoringContext } from '@/modules/ats/domain/job-pipelines'
import { getJobRoleContext } from '@/modules/ats/domain/job-role-context'
import { getLatestIcp } from '@/modules/ats/domain/icp'
import { createSourcingExperiment, failSourcingExperiment, finishSourcingExperiment, listSourcingExperiments } from '@/modules/ats/domain/sourcing-experiments'
import { generateChallengerIcpWithReasoning, generateIcpWithReasoning } from '@/lib/ai/icp-generator'
import { sourceFromIcp, EmptyIcpQueryError } from '@/modules/pool/domain/crustdata-acquire'
import { embedPoolProfiles, sourcePoolForIcp, type PoolMatch } from '@/modules/pool/domain/pool-sourcing'
import { feederEmployersFromSpec, planEveryone, resolveSearchSpec } from '@/modules/pool/search/spec-from-brief'
import { CrustdataConfigError } from '@/modules/pool/vendors/crustdata/client'
import { getPoolAccess } from '@/modules/pool/domain/pool'
import type { Icp, SourcingMap } from '@/lib/types/icp'
import type { ExperimentCandidate, ExperimentVariant, SourcingExperiment } from '@/lib/types/sourcing-experiment'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

export const maxDuration = 300

type Supabase = SupabaseClient<Database>

const bodySchema = z.object({ count_per_variant: z.number().int().min(1).max(15).default(5) })

function transientIcp(jobId: string, id: string, draft: { must_haves: Icp['must_haves']; competencies: Icp['competencies']; source?: Icp['source'] }, sourcingMap: SourcingMap | null): Icp {
  const now = new Date().toISOString()
  return {
    id, org_id: 'experiment', job_id: jobId, version: 0, status: 'approved', source: draft.source ?? 'intake',
    must_haves: draft.must_haves, competencies: draft.competencies, sourcing_map: sourcingMap,
    changelog: [], supersedes_id: null, created_by: null, approved_by: null, approved_at: now, created_at: now, updated_at: now,
  }
}

function candidateCard(match: PoolMatch): ExperimentCandidate {
  return {
    profile_id: match.profile_id, name: match.name, current_title: match.current_title,
    current_company: match.current_company, location: match.location, score: match.score,
    fit_bucket: match.fit_bucket, rationale: match.rationale,
    level: match.acquired?.level ?? null, level_label: match.acquired?.label ?? null,
    competencies: match.competencies ?? [], gate_unknown: match.gate_unknown ?? [],
    gate_failures: match.gate_failures ?? [], decision: null,
  }
}

async function runVariant(
  key: 'baseline' | 'challenger',
  label: string,
  experiment: SourcingExperiment,
  job: Parameters<typeof generateIcpWithReasoning>[0],
  roleContext: Awaited<ReturnType<typeof getJobRoleContext>>,
  recruiterCorrections: string | null,
  orgId: string,
  userId: string,
  supabase: Supabase,
): Promise<{ variant: ExperimentVariant; needsEmbedding: string[] }> {
  const generator = key === 'baseline' ? generateIcpWithReasoning : generateChallengerIcpWithReasoning
  const { draft, sourcingMap } = await generator(job, { orgId, userId }, null, { roleContext, recruiterCorrections })
  const icp = transientIcp(experiment.job_id, `${experiment.id}-${key}`, draft, sourcingMap)
  const { spec } = resolveSearchSpec(icp, { title: job.position_title, roleContext })
  const sourced = await sourceFromIcp(
    supabase,
    icp,
    { title: job.position_title, roleContext },
    {
      orgId,
      jobId: experiment.job_id,
      maxRecords: experiment.count_per_variant,
      perPage: experiment.count_per_variant,
      // Each arm starts at page one and never advances the live job's cursor.
      cursorScope: `sourcing-experiment:${experiment.id}:${key}`,
    },
  )
  const acquiredIds = Object.keys(sourced.acquired)
  const scored = await sourcePoolForIcp(
    supabase,
    orgId,
    icp,
    { orgId, userId },
    {
      includeIds: acquiredIds,
      includeUnlocked: true,
      acquired: sourced.acquired,
      feederEmployers: feederEmployersFromSpec(spec),
      plan: planEveryone(spec),
      relaxAtByLabel: Object.fromEntries(icp.must_haves.map((gate) => [gate.label, gate.relax_at ?? null])),
    },
  )
  const acquired = new Set(acquiredIds)
  return {
    variant: {
      label,
      prompt_version: key === 'baseline' ? 'current' : 'challenger',
      draft,
      sourcing_map: sourcingMap,
      search_spec: spec,
      plan: sourced.plan,
      fetched: sourced.fetched,
      matched: sourced.matched,
      credits_used: sourced.creditsUsed,
      candidates: scored.status === 'ok' ? scored.matches.filter((match) => acquired.has(match.profile_id)).map(candidateCard) : [],
    },
    needsEmbedding: sourced.ingest.needsReembed,
  }
}

/** GET — recent external-data sourcing comparisons for this job. */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    return NextResponse.json({ data: await listSourcingExperiments(supabase, orgId, params.id) })
  } catch (error) {
    return handleSupabaseError(error as { code: string; message: string })
  }
})

/** POST — run Current versus Challenger against the same job with equal Crustdata budgets. */
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }, _scope, userId) => {
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body
  try {
    const [context, roleContext, previous, poolAccess] = await Promise.all([
      getCanonicalJobScoringContext(supabase, orgId, params.id),
      getJobRoleContext(supabase, orgId, params.id),
      getLatestIcp(supabase, orgId, params.id).catch(() => null),
      getPoolAccess(supabase, orgId),
    ])
    if (!context) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    if (!poolAccess.hasAccess) return NextResponse.json({ error: 'Market access is required before running a sourcing comparison.' }, { status: 403 })

    const experiment = await createSourcingExperiment(supabase, orgId, params.id, body.count_per_variant, userId)
    const corrections = previous?.sourcing_map?.recruiter_brief?.corrections ?? null
    try {
      // Sequential external searches keep credit accounting and provider rate limits predictable.
      const baseline = await runVariant('baseline', 'Current sourcing strategy', experiment, context.job, roleContext, corrections, orgId, userId, supabase)
      const challenger = await runVariant('challenger', 'Challenger strategy', experiment, context.job, roleContext, corrections, orgId, userId, supabase)
      await embedPoolProfiles(supabase, [...baseline.needsEmbedding, ...challenger.needsEmbedding]).catch(() => undefined)
      const completed = await finishSourcingExperiment(supabase, orgId, experiment.id, { baseline: baseline.variant, challenger: challenger.variant })
      return NextResponse.json({ data: completed }, { status: 201 })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await failSourcingExperiment(supabase, orgId, experiment.id, message).catch(() => undefined)
      if (error instanceof CrustdataConfigError) return NextResponse.json({ error: 'Crustdata is not configured.' }, { status: 503 })
      if (error instanceof EmptyIcpQueryError) return NextResponse.json({ error: 'One strategy did not produce a runnable market query. Edit the job details and retry.' }, { status: 400 })
      if (/disabled/i.test(message)) return NextResponse.json({ error: 'Crustdata sourcing is not enabled for this workspace.' }, { status: 409 })
      throw error
    }
  } catch (error) {
    return handleSupabaseError(error as { code: string; message: string })
  }
})
