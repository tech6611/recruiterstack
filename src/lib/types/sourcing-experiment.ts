import type { IcpDraftInput, SourcingMap } from '@/lib/types/icp'
import type { SearchSpec } from '@/lib/types/search-spec'

export type ExperimentVariantKey = 'baseline' | 'challenger'
export type ExperimentDecision = 'yes' | 'maybe' | 'no' | null

export interface ExperimentCandidate {
  profile_id: string
  name: string | null
  current_title: string | null
  current_company: string | null
  location: string | null
  score: number
  fit_bucket: string
  rationale: string
  level: number | null
  level_label: string | null
  competencies: { name: string; rating: number; evidence?: string }[]
  gate_unknown: string[]
  gate_failures: string[]
  decision: ExperimentDecision
}

export interface ExperimentVariant {
  label: string
  prompt_version: 'current' | 'challenger'
  draft?: IcpDraftInput
  sourcing_map?: SourcingMap | null
  search_spec?: SearchSpec
  plan?: unknown
  fetched?: number
  matched?: number | null
  credits_used?: number
  candidates: ExperimentCandidate[]
  error?: string | null
}

export interface SourcingExperiment {
  id: string
  org_id: string
  job_id: string
  status: 'running' | 'completed' | 'failed'
  count_per_variant: number
  baseline: ExperimentVariant
  challenger: ExperimentVariant
  created_by: string | null
  created_at: string
  completed_at: string | null
  error: string | null
}
