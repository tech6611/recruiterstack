import type { InterviewType } from './database'

/** A job's hiring plan (one per job; reserved by `jobs.interview_plan_id`). */
export interface InterviewPlan {
  id: string
  org_id: string
  job_id: string
  created_at: string
  updated_at: string
}

/** One interview round within a plan. */
export interface InterviewPlanRound {
  id: string
  org_id: string
  plan_id: string
  order_index: number
  name: string
  interview_type: InterviewType
  duration_minutes: number
  interviewer_role: string | null
  interviewer_user_id: string | null
  interviewer_name: string | null
  stage_id: string | null
  scorecard_id: string | null
  created_at: string
  updated_at: string
}

/** Editable fields the client sends per round when saving a plan. */
export interface InterviewRoundInput {
  name: string
  interview_type: InterviewType
  duration_minutes: number
  interviewer_role?: string | null
  interviewer_user_id?: string | null
  interviewer_name?: string | null
  stage_id?: string | null
  scorecard_id?: string | null
}
