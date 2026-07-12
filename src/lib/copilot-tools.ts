/**
 * AI Copilot — Tool definitions and implementations
 *
 * COPILOT_TOOLS  : Claude-format tool schema array (translated to Gemini by lib/ai/llm.ts)
 * executeTool()  : Routes a tool call to the right Supabase query
 */

import { generateText, type ClaudeTool } from '@/lib/ai/llm'
import sgMail from '@sendgrid/mail'
import { SupabaseClient } from '@supabase/supabase-js'
import type { Capability } from '@/lib/permissions'
import { scoreApplicationForJob } from '@/lib/ai/job-scorer'
import {
  countCanonicalJobs,
  createCanonicalJobFromApprovedOpening,
  findCanonicalJobsForAgent,
  getCanonicalJobBoardDetail,
  getCanonicalJobById,
  getCanonicalJobScoringContext,
  getFirstJobStage,
  getPipelineStageById,
  listCanonicalJobBoardSummaries,
  updateCanonicalJob,
  type CanonicalJobUpdate,
} from '@/modules/ats/domain/job-pipelines'
import {
  getOpeningById,
  listApprovedOpenings,
  listOpenings,
  createOpening,
} from '@/modules/ats/domain/openings'
import {
  openingToolInputSchema,
  buildOpeningCreateInput,
  FieldResolutionError,
} from '@/modules/ats/domain/opening-fields'
import { submitForApproval, ApprovalError } from '@/lib/approvals/engine'
import {
  searchCandidatesForAgent,
  countCandidatesByStatus,
  getCandidateForAgentLookup,
  searchCandidatePoolForAgent,
  getCandidateNameAndStatus,
  setCandidateStatus,
  markCandidateOfferExtended,
  markCandidateHired,
} from '@/modules/ats/domain/candidates'
import {
  listActiveApplicationsByCandidatesWithJobTitle,
  listActiveApplicationsForStaleCheck,
  listApplicationsForCandidateWithJobAndStage,
  getApplicationStageContext,
  updateApplicationStage,
  getApplicationCandidateAndJob,
  listExistingApplicationCandidateIds,
  insertPipelineApplication,
  listUnscoredActiveApplicationsWithCandidate,
  applyAiScoreToApplication,
  getApplicationCandidateEmailAndJob,
  getApplicationCandidateIdAndJob,
  findApplicationIdInOrg,
  updateApplicationStatusInOrg,
  getApplicationStageNameInOrg,
  updateApplicationStageById,
  listActiveApplicationsBelowScore,
  updateApplicationStatusById,
  listStaleActiveApplicationsForInbox,
  getApplicationCandidateFullNameAndJob,
  getApplicationForEmailDraft,
} from '@/modules/ats/domain/applications'
import {
  listRoleSummaries,
  createRoleReturningSummary,
  getRoleTitleForOrg,
  updateRoleFields,
} from '@/modules/ats/domain/role-profiles'
import {
  scheduleInterview as scheduleInterviewRow,
  listInterviews,
  updateInterviewStatus as updateInterviewStatusRow,
  createSelfScheduleInterview,
} from '@/modules/ats/domain/interviews'
import { ensureInterviewerPreferenceLink } from '@/modules/ats/domain/interviewer-preferences'
import { runInterviewCancellationSideEffects } from '@/lib/interviews/cancel'
import {
  createOfferRow,
  updateOfferRow,
  listOffers,
} from '@/modules/ats/domain/offers'
import { fetchCanonicalAnalyticsInputs } from '@/modules/ats/domain/reporting'
import {
  getEmployeeByPerson,
  listDirectReports,
  listEmployeeEvents,
  listEmployees,
  markEmployeeJoined,
  markEmployeeTerminated,
  recordEmployeeNote,
  setEmployeeManager,
} from '@/modules/hris/domain/employees'
import {
  formatComp,
  getCurrentCompensation,
  listCompensationHistory,
  recordCompensation,
} from '@/modules/hris/domain/compensation'
import {
  approveTimeOffRequest,
  cancelTimeOffRequest,
  createTimeOffRequest,
  formatTimeOffRange,
  listTimeOffRequests,
  rejectTimeOffRequest,
} from '@/modules/hris/domain/time-off'
import {
  completeTask as completeOnboardingTask,
  createPlanFromTemplate,
  getActivePlanForEmployee,
  listPlanTasks,
  listPlans as listOnboardingPlans,
  listTemplates as listOnboardingTemplates,
} from '@/modules/hris/domain/onboarding'
import {
  listAllDocuments,
  listExpiringSoon,
  listVisibleForEmployee,
} from '@/modules/hris/domain/documents'
import {
  getLeaveBalance,
  listHolidays,
} from '@/modules/hris/domain/leave-balances'
import {
  addKeyResult as addOkrKr,
  createOkr,
  getOkrDetail,
  listOkrsForEmployee,
  updateKeyResult as updateOkrKr,
  updateOkr,
} from '@/modules/hris/domain/okrs'
import {
  getSequence as getCrmSequence,
  listCandidateEnrollments as listCrmCandidateEnrollments,
  listSequences as listCrmSequences,
} from '@/modules/crm/domain/sequences'
import {
  getRun  as getPayrollRun,
  listRuns as listPayrollRuns,
} from '@/modules/payroll/domain/runs'
import {
  listEmployeePayslips,
  listPayslipsForRun,
} from '@/modules/payroll/domain/payslips'
import { findPersonByEmail } from '@/modules/core/domain/people'
import type {
  EmployeeProfile,
  EmployeeStatus,
  TimeOffRequestType,
  TimeOffStatus,
} from '@/lib/types/database'

// ── Tool definitions ──────────────────────────────────────────────────────────

export const COPILOT_TOOLS: ClaudeTool[] = [
  {
    name: 'search_candidates',
    description:
      'Search for candidates by name, current job title, or skills. Returns matching candidates with status and active job applications.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Name, title, or keyword (e.g. "Jane", "React", "Software Engineer")',
        },
        status: {
          type: 'string',
          enum: ['active', 'inactive', 'interviewing', 'offer_extended', 'hired', 'rejected'],
          description: 'Optional: filter by candidate status',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_job_pipeline',
    description:
      "Get a job's complete hiring pipeline: all stages with candidate names, AI scores, and application IDs. Use this before moving candidates to get stage IDs.",
    input_schema: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'UUID of the job/hiring request — use when you have the exact ID',
        },
        job_title_query: {
          type: 'string',
          description: 'Job title to search for (e.g. "Senior PM", "Backend Engineer") — use when you don\'t have the exact ID',
        },
      },
    },
  },
  {
    name: 'list_jobs',
    description:
      'List all hiring requests with status, hiring manager, department, and active candidate counts.',
    input_schema: {
      type: 'object',
      properties: {
        status_filter: {
          type: 'string',
          enum: ['intake_pending', 'intake_submitted', 'jd_generated', 'jd_sent', 'jd_approved', 'posted'],
          description: 'Optional: filter by job status',
        },
      },
    },
  },
  {
    name: 'get_dashboard_stats',
    description:
      'Get high-level recruiting metrics: total jobs, active candidates, interviewing count, and total hired.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'find_stale_applications',
    description:
      'Find active applications with no pipeline activity in the last N days. Helps identify neglected candidates.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Inactivity threshold in days (default: 7)',
        },
      },
    },
  },
  {
    name: 'get_candidate',
    description:
      'Get full profile for a specific candidate: skills, experience, status, and all applications with current stage.',
    input_schema: {
      type: 'object',
      properties: {
        candidate_id: {
          type: 'string',
          description: 'UUID of the candidate — use when you have the exact ID',
        },
        candidate_name_query: {
          type: 'string',
          description: 'Candidate name to search for — use when you don\'t have the exact ID',
        },
      },
    },
  },
  {
    name: 'move_application_to_stage',
    description:
      "Move a candidate's application to a specific pipeline stage. Call get_job_pipeline first to get valid stage IDs.",
    input_schema: {
      type: 'object',
      properties: {
        application_id: {
          type: 'string',
          description: 'UUID of the application to move',
        },
        stage_id: {
          type: 'string',
          description: 'UUID of the target pipeline stage',
        },
        note: {
          type: 'string',
          description: 'Optional note explaining the move',
        },
      },
      required: ['application_id', 'stage_id'],
    },
  },
  {
    name: 'add_note_to_application',
    description: "Add a text note to an application's activity log.",
    input_schema: {
      type: 'object',
      properties: {
        application_id: {
          type: 'string',
          description: 'UUID of the application',
        },
        note: {
          type: 'string',
          description: 'The note text to record',
        },
      },
      required: ['application_id', 'note'],
    },
  },

  // ── Autonomous workflow tools ─────────────────────────────────────────────
  {
    name: 'create_job_and_pipeline',
    description:
      'Create a new job (with auto-created pipeline stages) from an APPROVED requisition. A job cannot be created without one — pass the opening_id of an approved requisition. If you don\'t have it, call the tool without opening_id: it returns the approved requisitions to choose from, or tells you none exist (create + approve a requisition first).',
    input_schema: {
      type: 'object',
      properties: {
        position_title:       { type: 'string',  description: 'Job title, e.g. "Senior Backend Engineer"' },
        opening_id:           { type: 'string',  description: 'ID of the APPROVED requisition (opening) this job is created from. Required to actually create the job. Omit to get the list of approved requisitions to pick from.' },
        location:             { type: 'string',  description: 'City / remote policy, e.g. "New York" or "Remote"' },
        headcount:            { type: 'number',  description: 'Number of hires needed (default: 1)' },
        department:           { type: 'string',  description: 'Department or team, e.g. "Engineering"' },
        level:                { type: 'string',  description: 'Seniority level, e.g. "Senior" or "L5"' },
        key_requirements:     { type: 'string',  description: 'Core requirements as free text' },
        nice_to_haves:        { type: 'string',  description: 'Nice-to-have qualifications' },
        remote_ok:            { type: 'boolean', description: 'Whether remote is acceptable (default: false)' },
      },
      required: ['position_title'],
    },
  },
  {
    name: 'search_candidate_pool',
    description:
      'Search the internal candidate database for people matching skills, location, and experience. Returns candidate IDs to use with bulk_add_to_pipeline.',
    input_schema: {
      type: 'object',
      properties: {
        skills_keywords: { type: 'string',  description: 'Comma-separated skills or title keywords, e.g. "React, TypeScript, frontend"' },
        location:        { type: 'string',  description: 'Location to filter by, e.g. "New York", "San Francisco"' },
        min_experience:  { type: 'number',  description: 'Minimum years of experience' },
        max_experience:  { type: 'number',  description: 'Maximum years of experience' },
        limit:           { type: 'number',  description: 'Max results to return (default: 50)' },
      },
    },
  },
  {
    name: 'bulk_add_to_pipeline',
    description:
      'Add multiple candidates to a job\'s pipeline at once. Skips any who already have an application for this job.',
    input_schema: {
      type: 'object',
      properties: {
        job_id:       { type: 'string', description: 'UUID of the hiring request / job' },
        candidate_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of candidate UUIDs to add',
        },
        source: {
          type: 'string',
          enum: ['sourced', 'manual', 'referral'],
          description: 'How these candidates were found (default: sourced)',
        },
      },
      required: ['job_id', 'candidate_ids'],
    },
  },
  {
    name: 'bulk_score_applications',
    description:
      'Run AI scoring on all active, unscored applications for a job. Returns top candidates and score distribution.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string', description: 'UUID of the job to score' },
        min_score_threshold: {
          type: 'number',
          description: 'Score threshold to highlight top candidates (default: 70)',
        },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'send_outreach_email',
    description:
      'Send a personalized outreach email to one candidate about a job. YOU write the subject and body — make it warm and specific to the candidate\'s skills and the role.',
    input_schema: {
      type: 'object',
      properties: {
        application_id:  { type: 'string', description: 'UUID of the application' },
        subject:         { type: 'string', description: 'Email subject line' },
        body:            { type: 'string', description: 'Email body text (you write this — personalized, 3-4 short paragraphs)' },
        recruiter_name:  { type: 'string', description: 'Your name / sender name for the signature' },
      },
      required: ['application_id', 'subject', 'body'],
    },
  },
  {
    name: 'send_whatsapp_message',
    description:
      'Send a WhatsApp message to one candidate about a job. YOU write the body — warm, specific, 2-4 short sentences, plain text (no markdown). Requires the org to have WhatsApp connected and the candidate to have a phone number. If the candidate has not messaged us within the last 24 hours, Meta rules require the org\'s pre-approved outreach template to be sent instead of your free-form text — the result will tell you which happened.',
    input_schema: {
      type: 'object',
      properties: {
        application_id:  { type: 'string', description: 'UUID of the application' },
        body:            { type: 'string', description: 'Message text (you write this — personalized, 2-4 short sentences, plain text)' },
        template_params: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional explicit params for the outreach template (first name, recruiter name, company, job title, apply link). Derived automatically if omitted.',
        },
      },
      required: ['application_id', 'body'],
    },
  },
  {
    name: 'send_whatsapp_reply',
    description:
      'Reply within an existing WhatsApp conversation (used when responding to an inbound candidate message). Short, plain text, one message.',
    input_schema: {
      type: 'object',
      properties: {
        conversation_id: { type: 'string', description: 'UUID of the WhatsApp conversation' },
        body:            { type: 'string', description: 'Reply text — short, plain, conversational' },
      },
      required: ['conversation_id', 'body'],
    },
  },
  {
    name: 'escalate_to_recruiter',
    description:
      'Hand a WhatsApp conversation to a human recruiter and mute the AI responder. Use when the candidate asks for a human, asks about compensation/offers, seems frustrated, or asks something you cannot answer from context.',
    input_schema: {
      type: 'object',
      properties: {
        conversation_id: { type: 'string', description: 'UUID of the WhatsApp conversation' },
        reason:          { type: 'string', description: 'Why this needs a human, e.g. "Candidate asked about salary range"' },
      },
      required: ['conversation_id', 'reason'],
    },
  },
  {
    name: 'request_approval',
    description:
      'Pause the workflow and ask the recruiter to approve before taking a bulk or irreversible action (sending emails or WhatsApp messages, creating jobs, moving many candidates). ALWAYS call this before affecting 3+ candidates or sending any emails or WhatsApp messages.',
    input_schema: {
      type: 'object',
      properties: {
        action_summary: { type: 'string', description: 'Short description of what you are about to do, e.g. "Send outreach emails to 12 candidates"' },
        details:        { type: 'string', description: 'Extra context: what criteria, which candidates, etc.' },
        impact:         { type: 'string', description: 'Scope of the action, e.g. "12 emails will be sent, 12 application events logged"' },
      },
      required: ['action_summary', 'impact'],
    },
  },

  // ── Extended platform tools ───────────────────────────────────────────────
  {
    name: 'create_candidate',
    description: 'Add a new candidate to the system manually.',
    input_schema: {
      type: 'object',
      properties: {
        name:             { type: 'string', description: 'Full name (required)' },
        email:            { type: 'string', description: 'Email address (required)' },
        current_title:    { type: 'string', description: 'Current job title' },
        location:         { type: 'string', description: 'City or location, e.g. "New York"' },
        experience_years: { type: 'number', description: 'Years of professional experience' },
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of skills, e.g. ["React", "TypeScript"]',
        },
        phone:        { type: 'string', description: 'Phone number' },
        linkedin_url: { type: 'string', description: 'LinkedIn profile URL' },
      },
      required: ['name', 'email'],
    },
  },
  {
    name: 'update_candidate_status',
    description: "Update a candidate's overall status. Use 'hired' when closing an offer, 'inactive' when no longer pursuing, 'interviewing' when in active interviews.",
    input_schema: {
      type: 'object',
      properties: {
        candidate_id: { type: 'string', description: 'UUID of the candidate' },
        status: {
          type: 'string',
          enum: ['active', 'inactive', 'interviewing', 'offer_extended', 'hired', 'rejected'],
          description: 'New candidate status',
        },
        reason: { type: 'string', description: 'Optional reason for the change' },
      },
      required: ['candidate_id', 'status'],
    },
  },
  {
    name: 'update_application_status',
    description: 'Change the status of one or more applications (reject, hire, withdraw, or re-activate). For bulk rejection after scoring, prefer bulk_reject_below_score.',
    input_schema: {
      type: 'object',
      properties: {
        application_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of application UUIDs',
        },
        status: {
          type: 'string',
          enum: ['active', 'rejected', 'hired', 'withdrawn'],
          description: 'Target status',
        },
        reason: { type: 'string', description: 'Optional reason (stored in event log)' },
      },
      required: ['application_ids', 'status'],
    },
  },
  {
    name: 'bulk_move_to_stage',
    description: 'Move multiple applications to a specific pipeline stage at once. Use after bulk_score_applications to advance high-scorers.',
    input_schema: {
      type: 'object',
      properties: {
        application_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of application UUIDs to move',
        },
        stage_id: { type: 'string', description: 'Target pipeline stage UUID (get from get_job_pipeline)' },
        note:     { type: 'string', description: 'Optional note logged for all moved applications' },
      },
      required: ['application_ids', 'stage_id'],
    },
  },
  {
    name: 'bulk_reject_below_score',
    description: 'Reject all active applications for a job whose AI score is strictly below a threshold. Always run bulk_score_applications first.',
    input_schema: {
      type: 'object',
      properties: {
        job_id:      { type: 'string', description: 'UUID of the job' },
        below_score: { type: 'number', description: 'Reject apps with AI score < this value, e.g. 50' },
        reason:      { type: 'string', description: 'Rejection reason stored in event log' },
      },
      required: ['job_id', 'below_score'],
    },
  },
  {
    name: 'get_application_events',
    description: 'Get the full activity timeline for an application: stage moves, notes, emails sent, status changes. Useful for understanding candidate history.',
    input_schema: {
      type: 'object',
      properties: {
        application_id: { type: 'string', description: 'UUID of the application' },
      },
      required: ['application_id'],
    },
  },
  {
    name: 'update_job',
    description: "Update an existing job's status, title, hiring manager, or requirements. Use status 'posted' to publish, 'paused' to pause, or update details after creation.",
    input_schema: {
      type: 'object',
      properties: {
        job_id:               { type: 'string', description: 'UUID of the hiring request' },
        status:               { type: 'string', enum: ['intake_pending', 'intake_submitted', 'jd_generated', 'jd_sent', 'jd_approved', 'posted'], description: 'New status' },
        position_title:       { type: 'string', description: 'Updated job title' },
        hiring_manager_name:  { type: 'string', description: 'Updated hiring manager name' },
        key_requirements:     { type: 'string', description: 'Updated key requirements' },
        location:             { type: 'string', description: 'Updated location' },
        headcount:            { type: 'number', description: 'Updated headcount' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'get_scorecard',
    description: "Get interview scorecards for an application. Shows interviewer name, recommendation, scores per criterion, and notes.",
    input_schema: {
      type: 'object',
      properties: {
        application_id: { type: 'string', description: 'UUID of the application' },
      },
      required: ['application_id'],
    },
  },
  // ── Gap-fill tools: full platform parity ───────────────────────────────────
  {
    name: 'list_roles',
    description: 'List all roles in the ATS (roles are distinct from hiring requests — they define standing job templates with scoring thresholds).',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'active', 'paused', 'closed'],
          description: 'Optional: filter by role status',
        },
      },
    },
  },
  {
    name: 'create_role',
    description: 'Create a new role template in the ATS with scoring criteria.',
    input_schema: {
      type: 'object',
      properties: {
        job_title:               { type: 'string',  description: 'Title of the role (required)' },
        required_skills:         { type: 'array', items: { type: 'string' }, description: 'List of required skill keywords (e.g. ["React", "TypeScript"])' },
        min_experience:          { type: 'number',  description: 'Minimum years of experience required (default: 0)' },
        location:                { type: 'string',  description: 'Location or "Remote"' },
        salary_min:              { type: 'number',  description: 'Minimum salary (USD)' },
        salary_max:              { type: 'number',  description: 'Maximum salary (USD)' },
        status:                  { type: 'string',  enum: ['draft', 'active', 'paused', 'closed'], description: 'Role status (default: active)' },
        auto_advance_threshold:  { type: 'number',  description: 'AI score threshold (0-100) to auto-advance candidates' },
        auto_reject_threshold:   { type: 'number',  description: 'AI score threshold (0-100) to auto-reject candidates' },
      },
      required: ['job_title'],
    },
  },
  {
    name: 'update_role',
    description: 'Update an existing role: change title, skills, location, salary range, status, or scoring thresholds.',
    input_schema: {
      type: 'object',
      properties: {
        role_id:                 { type: 'string',  description: 'UUID of the role to update' },
        job_title:               { type: 'string',  description: 'New title' },
        required_skills:         { type: 'array', items: { type: 'string' }, description: 'Updated required skills list' },
        min_experience:          { type: 'number',  description: 'Updated minimum years of experience' },
        location:                { type: 'string',  description: 'Updated location' },
        salary_min:              { type: 'number',  description: 'Updated minimum salary' },
        salary_max:              { type: 'number',  description: 'Updated maximum salary' },
        status:                  { type: 'string',  enum: ['draft', 'active', 'paused', 'closed'], description: 'New status' },
        auto_advance_threshold:  { type: 'number',  description: 'New auto-advance AI score threshold' },
        auto_reject_threshold:   { type: 'number',  description: 'New auto-reject AI score threshold' },
      },
      required: ['role_id'],
    },
  },
  {
    name: 'get_recruiting_analytics',
    description: 'Get detailed recruiting analytics: per-job pipeline funnel with stage counts, source distribution of applications, and average days per stage across active applications.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_inbox',
    description: 'Get the recruiter inbox: recent activity events (stage moves, notes, status changes) and a list of active applications stale for 14+ days that need attention.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_scorecard',
    description: 'Log an interview scorecard for an application. Records the interviewer name, recommendation, optional per-criterion scores, and notes.',
    input_schema: {
      type: 'object',
      properties: {
        application_id:   { type: 'string', description: 'UUID of the application being scored' },
        interviewer_name: { type: 'string', description: 'Full name of the interviewer' },
        stage_name:       { type: 'string', description: 'Interview stage (e.g. "Technical Screen", "Final Round")' },
        recommendation:   { type: 'string', enum: ['strong_yes', 'yes', 'maybe', 'no'], description: 'Overall hiring recommendation' },
        overall_notes:    { type: 'string', description: 'Overall interview notes or summary' },
      },
      required: ['application_id', 'interviewer_name', 'recommendation'],
    },
  },
  {
    name: 'draft_application_email',
    description: 'Generate an AI-drafted email for a candidate application. Use for interview invitations, rejections, offer letters, or follow-ups. Returns subject + body for recruiter review.',
    input_schema: {
      type: 'object',
      properties: {
        application_id:   { type: 'string', description: 'UUID of the application (used to fetch candidate name, job title, and current stage)' },
        template:         { type: 'string', enum: ['interview_invite', 'rejection', 'offer', 'followup'], description: 'Email type to draft' },
        recruiter_name:   { type: 'string', description: 'Recruiter name for the sign-off (default: "The Recruiting Team")' },
        recruiter_title:  { type: 'string', description: 'Recruiter title (optional)' },
        company_name:     { type: 'string', description: 'Company name to use in the email body' },
      },
      required: ['application_id', 'template'],
    },
  },
  {
    name: 'create_requisition',
    description: 'Create a new requisition (an "opening" — approved-headcount request). This is the FIRST step in opening a role: it appears on the Requisitions page as a draft. Only the position title is required; you may also set department, work location, hiring manager, employment type, compensation, target start date, and justification. To move it toward approval, follow with submit_requisition. Do NOT use this to create a job pipeline — a job comes later, from an APPROVED requisition (create_job_and_pipeline).',
    // Schema is generated from the opening field manifest (single source of
    // truth) so it can never drift from what the save path accepts.
    input_schema: openingToolInputSchema(),
  },
  {
    name: 'list_requisitions',
    description: 'List requisitions (openings) for the org, newest first, with their status. Use to answer "what requisitions do I have", "which are approved/awaiting approval", etc. Optional status filter.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'pending_approval', 'approved', 'open', 'filled', 'closed', 'archived'], description: 'Optional status filter' },
      },
      required: [],
    },
  },
  {
    name: 'submit_requisition',
    description: 'Submit a DRAFT requisition for approval — moves it to pending_approval and routes it to the right approver automatically (by department). Requires a justification of at least 50 characters on the requisition. In orgs where the requester is the only approver, this auto-approves immediately. Do not name an approver — routing is automatic.',
    input_schema: {
      type: 'object',
      properties: {
        opening_id: { type: 'string', description: 'UUID of the draft requisition to submit (from create_requisition or list_requisitions)' },
      },
      required: ['opening_id'],
    },
  },
  // ── Interview & Offer tools ───────────────────────────────────────────────
  {
    name: 'schedule_interview',
    description: 'Schedule an interview for a candidate application. Creates an interview record and logs a timeline event. Optionally generates a self-schedule link for the candidate.',
    input_schema: {
      type: 'object',
      properties: {
        application_id:     { type: 'string', description: 'UUID of the application' },
        candidate_id:       { type: 'string', description: 'UUID of the candidate' },
        hiring_request_id:  { type: 'string', description: 'UUID of the hiring request / job' },
        interviewer_name:   { type: 'string', description: 'Full name of the interviewer' },
        interview_type:     { type: 'string', enum: ['video', 'phone', 'in_person', 'panel', 'technical', 'assessment'], description: 'Type of interview (default: video)' },
        scheduled_at:       { type: 'string', description: 'ISO 8601 datetime for the interview, e.g. "2026-03-20T14:00:00Z"' },
        duration_minutes:   { type: 'number', description: 'Duration in minutes (default: 60)' },
        location:           { type: 'string', description: 'Zoom link, office address, or phone number' },
        notes:              { type: 'string', description: 'Topics to cover or special instructions' },
        generate_self_schedule: { type: 'boolean', description: 'Generate a self-schedule link for the candidate (default: false)' },
      },
      required: ['application_id', 'candidate_id', 'hiring_request_id', 'interviewer_name', 'scheduled_at'],
    },
  },
  {
    name: 'get_interviews',
    description: 'Get scheduled and past interviews for a candidate or application.',
    input_schema: {
      type: 'object',
      properties: {
        application_id: { type: 'string', description: 'UUID of the application (filter by application)' },
        candidate_id:   { type: 'string', description: 'UUID of the candidate (get all their interviews)' },
        upcoming_only:  { type: 'boolean', description: 'If true, only return upcoming scheduled interviews' },
      },
    },
  },
  {
    name: 'update_interview_status',
    description: 'Mark an interview as completed, cancelled, or no-show. Logs a timeline event.',
    input_schema: {
      type: 'object',
      properties: {
        interview_id: { type: 'string', description: 'UUID of the interview' },
        status:       { type: 'string', enum: ['completed', 'cancelled', 'no_show', 'rescheduled'], description: 'New status' },
        notes:        { type: 'string', description: 'Optional notes about the outcome' },
      },
      required: ['interview_id', 'status'],
    },
  },
  {
    name: 'create_offer',
    description: 'Create a formal job offer for a candidate application. Sets candidate status to offer_extended. Offer starts in draft status and must be approved before sending.',
    input_schema: {
      type: 'object',
      properties: {
        application_id:    { type: 'string', description: 'UUID of the application' },
        candidate_id:      { type: 'string', description: 'UUID of the candidate' },
        hiring_request_id: { type: 'string', description: 'UUID of the hiring request' },
        position_title:    { type: 'string', description: 'Job title for the offer' },
        base_salary:       { type: 'number', description: 'Annual base salary in USD' },
        bonus:             { type: 'number', description: 'Annual bonus or signing bonus in USD' },
        equity:            { type: 'string', description: 'Equity terms, e.g. "0.05% over 4 years"' },
        start_date:        { type: 'string', description: 'Target start date (YYYY-MM-DD)' },
        expiry_date:       { type: 'string', description: 'Offer expiry date (YYYY-MM-DD)' },
        notes:             { type: 'string', description: 'Special terms, relocation, signing bonus notes' },
        offer_letter_text: { type: 'string', description: 'Full offer letter text' },
      },
      required: ['application_id', 'candidate_id', 'hiring_request_id', 'position_title'],
    },
  },
  {
    name: 'update_offer_status',
    description: 'Approve, send, or record the candidate response for a job offer. Use "approved" after review, "sent" after emailing the candidate, "accepted" or "declined" based on candidate response.',
    input_schema: {
      type: 'object',
      properties: {
        offer_id:    { type: 'string', description: 'UUID of the offer' },
        status:      { type: 'string', enum: ['pending_approval', 'approved', 'sent', 'accepted', 'declined', 'withdrawn', 'expired'], description: 'New offer status' },
        approved_by: { type: 'string', description: 'Name of the approver (required when status=approved)' },
        notes:       { type: 'string', description: 'Optional notes or reason for status change' },
      },
      required: ['offer_id', 'status'],
    },
  },
  {
    name: 'get_offers',
    description: 'Get job offers for a candidate or application, with full compensation details and current status.',
    input_schema: {
      type: 'object',
      properties: {
        application_id: { type: 'string', description: 'Filter by application UUID' },
        candidate_id:   { type: 'string', description: 'Filter by candidate UUID — returns all offers for this person' },
        status:         { type: 'string', enum: ['draft', 'pending_approval', 'approved', 'sent', 'accepted', 'declined', 'withdrawn', 'expired'], description: 'Filter by offer status' },
      },
    },
  },
  {
    name: 'send_assessment',
    description: 'Send an assessment or take-home test to a candidate. Logs the event in the timeline and marks what was sent. Generates a shareable assessment link if a URL is provided.',
    input_schema: {
      type: 'object',
      properties: {
        application_id:  { type: 'string', description: 'UUID of the application' },
        assessment_name: { type: 'string', description: 'Name of the assessment (e.g. "Take-home coding challenge", "HackerRank test")' },
        assessment_url:  { type: 'string', description: 'URL of the assessment platform or test link' },
        due_date:        { type: 'string', description: 'Due date for submission (YYYY-MM-DD or ISO datetime)' },
        notes:           { type: 'string', description: 'Instructions or notes for the candidate' },
      },
      required: ['application_id', 'assessment_name'],
    },
  },
  {
    name: 'create_self_schedule_invite',
    description: 'Generate a self-schedule link the candidate uses to book their own interview slot. The link shows only times over the next 7 business days that fit the interviewer(s) preferred hours AND are free on their calendar — so ALWAYS pass interviewer_email (and additional_interviewer_emails for a panel), otherwise no availability can be shown. Returns the link to share.',
    input_schema: {
      type: 'object',
      properties: {
        application_id:    { type: 'string', description: 'UUID of the application' },
        candidate_id:      { type: 'string', description: 'UUID of the candidate' },
        hiring_request_id: { type: 'string', description: 'UUID of the hiring request' },
        interviewer_name:  { type: 'string', description: 'Interviewer who will conduct the interview' },
        interviewer_email: { type: 'string', description: 'Email of the interviewer — REQUIRED for the link to show real availability' },
        additional_interviewer_emails: { type: 'array', items: { type: 'string' }, description: 'Emails of other panel members (all must be free for a slot to show)' },
        interview_type:    { type: 'string', enum: ['video', 'phone', 'in_person', 'panel', 'technical'], description: 'Type of interview' },
        duration_minutes:  { type: 'number', description: 'Interview duration in minutes (default: 60)' },
        expires_in_days:   { type: 'number', description: 'Days until the self-schedule link expires (default: 7)' },
      },
      required: ['application_id', 'candidate_id', 'hiring_request_id', 'interviewer_name'],
    },
  },
  {
    name: 'create_interviewer_availability_link',
    description: 'Generate a no-login link a hiring manager / interviewer can use to set their preferred interview hours (which days, what times, their timezone). Use this before self-scheduling so their availability is accurate. Optionally email the link to them. Returns the link to share.',
    input_schema: {
      type: 'object',
      properties: {
        interviewer_email: { type: 'string', description: 'Email of the interviewer / hiring manager' },
        interviewer_name:  { type: 'string', description: 'Their name, for the page + email (optional)' },
        send_email:        { type: 'boolean', description: 'If true, email the link to the interviewer (default: false)' },
      },
      required: ['interviewer_email'],
    },
  },
  {
    name: 'list_employees',
    description: 'List people who have moved from candidate to employee. "pending" = hired, serving notice, not yet started; "active" = has joined the org; "terminated" = left. Each row includes the employee_id used by mark_employee_joined.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'active', 'terminated'], description: 'Filter by employee status' },
      },
    },
  },
  {
    name: 'mark_employee_joined',
    description: 'Mark a pre-hire (pending) employee as having joined the org — flips them to active and sets their start date. This is the moment a hired candidate becomes a working employee. Identify them by employee_id (from list_employees) or by person_email.',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:  { type: 'string', description: 'UUID of the employee_profile (from list_employees)' },
        person_email: { type: 'string', description: 'Email of the person, used to find their employee record if employee_id is not known' },
        start_date:   { type: 'string', description: 'First working day (YYYY-MM-DD). Defaults to today.' },
      },
    },
  },
  {
    name: 'mark_employee_terminated',
    description: 'End an employee\'s employment (sets status to terminated). Identify them by employee_id (from list_employees) or by person_email.',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:  { type: 'string', description: 'UUID of the employee_profile (from list_employees)' },
        person_email: { type: 'string', description: 'Email of the person, used to find their employee record if employee_id is not known' },
      },
    },
  },
  {
    name: 'get_employee_history',
    description: 'Get an employee\'s full timeline: hire → joined → manager changes → termination → manual notes. Identify by employee_id or person_email.',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:  { type: 'string', description: 'UUID of the employee_profile' },
        person_email: { type: 'string', description: 'Email of the person — used if employee_id is not known' },
        limit:        { type: 'number', description: 'Max events to return (default 50)' },
      },
    },
  },
  {
    name: 'set_employee_manager',
    description: 'Set who an employee reports to (the org-chart reporting line). Identify the employee by employee_id or person_email. Identify the new manager by manager_employee_id or manager_email. Set clear=true to remove the current manager (no reporting line).',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:         { type: 'string', description: 'UUID of the employee being updated' },
        person_email:        { type: 'string', description: 'Email of the employee being updated (alternative to employee_id)' },
        manager_employee_id: { type: 'string', description: 'UUID of the manager\'s employee_profile' },
        manager_email:       { type: 'string', description: 'Email of the manager (alternative to manager_employee_id)' },
        clear:               { type: 'boolean', description: 'Set true to remove the current manager (no reporting line)' },
      },
    },
  },
  {
    name: 'record_employee_note',
    description: 'Add a manual note to an employee\'s timeline — an observation, decision, or context that isn\'t a structural transition. Identify by employee_id or person_email.',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:  { type: 'string' },
        person_email: { type: 'string' },
        note:         { type: 'string', description: 'The note text to record on the timeline.' },
      },
      required: ['note'],
    },
  },
  {
    name: 'get_employee_compensation',
    description: 'Get an employee\'s current compensation and their full comp history (every change with effective date and reason). Identify by employee_id or person_email.',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:  { type: 'string' },
        person_email: { type: 'string' },
      },
    },
  },
  {
    name: 'request_time_off',
    description: 'Submit a time-off request for an employee. The approver is auto-set to their manager (from the HRIS reporting structure). The orchestrator must request_approval BEFORE calling this.',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:  { type: 'string', description: 'UUID of the employee' },
        person_email: { type: 'string', description: 'Email of the employee (alternative to employee_id)' },
        request_type: { type: 'string', enum: ['vacation', 'sick', 'personal', 'unpaid'] },
        start_date:   { type: 'string', description: 'First day off (YYYY-MM-DD)' },
        end_date:     { type: 'string', description: 'Last day off, inclusive (YYYY-MM-DD)' },
        hours_total:  { type: 'number', description: 'Total hours (optional; useful for partial-day or hourly schedules)' },
        reason:       { type: 'string', description: 'Optional reason / note' },
      },
      required: ['request_type', 'start_date', 'end_date'],
    },
  },
  {
    name: 'list_time_off',
    description: 'List time-off requests for an employee, optionally filtered by status (pending | approved | rejected | cancelled).',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:  { type: 'string' },
        person_email: { type: 'string' },
        status:       { type: 'string', enum: ['pending', 'approved', 'rejected', 'cancelled'] },
      },
    },
  },
  {
    name: 'decide_time_off',
    description: 'Approve, reject, or cancel a pending time-off request. Identify by request_id (from list_time_off).',
    input_schema: {
      type: 'object',
      properties: {
        request_id: { type: 'string', description: 'UUID of the time_off_request' },
        action:     { type: 'string', enum: ['approve', 'reject', 'cancel'] },
        note:       { type: 'string', description: 'Optional note explaining the decision' },
      },
      required: ['request_id', 'action'],
    },
  },
  {
    name: 'get_direct_reports',
    description: 'List the people who report directly to a given employee (their direct reports / team). Identify the manager by employee_id or person_email.',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:  { type: 'string', description: 'UUID of the manager\'s employee_profile' },
        person_email: { type: 'string', description: 'Email of the manager (alternative to employee_id)' },
      },
    },
  },
  {
    name: 'list_sequences',
    description: 'List every outreach sequence in this org with stage count, enrollment count, and reply count. Use this when someone asks "what sequences are running?" or for an overview of outreach activity.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_sequence',
    description: 'Fetch one sequence with its full ordered stage list (subject, body, delay) and enrollment/reply counts. Identify by sequence_id (from list_sequences).',
    input_schema: {
      type: 'object',
      properties: { sequence_id: { type: 'string' } },
      required: ['sequence_id'],
    },
  },
  {
    name: 'list_candidate_sequence_history',
    description: 'List every sequence a specific candidate has been enrolled in — across all sequences — with enrollment status, current stage, and next-send time. Use when asked "is this candidate still in our outreach?" / "what sequences has X been in?".',
    input_schema: {
      type: 'object',
      properties: {
        candidate_id: { type: 'string', description: 'UUID of the candidate' },
      },
      required: ['candidate_id'],
    },
  },
  {
    name: 'list_onboarding_templates',
    description: 'List the active onboarding templates in this org. Each org has at least one default template (seeded). Returns id + name so you can pass an id to start_onboarding.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_onboarding_plans',
    description: 'List onboarding plans across the org with progress counts. Optionally filter by status.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['in_progress', 'completed', 'cancelled'] },
      },
    },
  },
  {
    name: 'start_onboarding',
    description: 'Start an onboarding plan for an employee from a template. The plan instantiates all template tasks with computed due dates anchored to start_date (defaults to the employee\'s start_date or today). The new hire is notified. The orchestrator must request_approval BEFORE calling this.',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:  { type: 'string' },
        person_email: { type: 'string' },
        template_id:  { type: 'string', description: 'UUID of the template (from list_onboarding_templates)' },
        start_date:   { type: 'string', description: 'Override anchor date (YYYY-MM-DD). Defaults to employee start_date or today.' },
      },
      required: ['template_id'],
    },
  },
  {
    name: 'get_employee_onboarding',
    description: 'Get the active onboarding plan and all its tasks (with status) for a given employee. Returns null when there is no in-progress plan.',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:  { type: 'string' },
        person_email: { type: 'string' },
      },
    },
  },
  {
    name: 'complete_onboarding_task',
    description: 'Mark an onboarding task as completed. Identify by task_id (from get_employee_onboarding or list_onboarding_plans). The plan auto-completes when all its tasks are done.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'list_employee_okrs',
    description: 'List an employee\'s OKRs (Objectives + Key Results) for a cycle (e.g. "2026-Q3"). Returns each objective with its computed progress (avg of KR progress).',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:  { type: 'string' },
        person_email: { type: 'string' },
        cycle:        { type: 'string', description: 'Filter to a specific cycle. Omit to return all cycles for that employee.' },
      },
    },
  },
  {
    name: 'get_okr',
    description: 'Get a single OKR with its key results and current progress. Identify by okr_id.',
    input_schema: {
      type: 'object',
      properties: {
        okr_id: { type: 'string' },
      },
      required: ['okr_id'],
    },
  },
  {
    name: 'create_okr',
    description: 'Create a new objective for an employee in a cycle. Optionally seed key results in a follow-up call to add_okr_key_result.',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:  { type: 'string' },
        person_email: { type: 'string' },
        title:        { type: 'string' },
        description:  { type: 'string' },
        cycle:        { type: 'string', description: 'e.g. 2026-Q3, 2026-H1' },
        status:       { type: 'string', enum: ['draft','active','achieved','missed','abandoned'] },
      },
      required: ['title', 'cycle'],
    },
  },
  {
    name: 'add_okr_key_result',
    description: 'Add a key result to an objective.',
    input_schema: {
      type: 'object',
      properties: {
        okr_id:        { type: 'string' },
        title:         { type: 'string' },
        description:   { type: 'string' },
        target_metric: { type: 'string', description: 'Free-text target ("hit $50k MRR", "ship v2")' },
        progress:      { type: 'number', description: '0–100; defaults to 0' },
      },
      required: ['okr_id', 'title'],
    },
  },
  {
    name: 'update_kr_progress',
    description: 'Update the progress on a key result (0–100).',
    input_schema: {
      type: 'object',
      properties: {
        key_result_id: { type: 'string' },
        progress:      { type: 'number', description: '0–100' },
      },
      required: ['key_result_id', 'progress'],
    },
  },
  {
    name: 'update_okr_status',
    description: 'Update an OKR\'s status (draft / active / achieved / missed / abandoned). Use at end of cycle to close out objectives.',
    input_schema: {
      type: 'object',
      properties: {
        okr_id: { type: 'string' },
        status: { type: 'string', enum: ['draft','active','achieved','missed','abandoned'] },
      },
      required: ['okr_id', 'status'],
    },
  },
  {
    name: 'get_employee_leave_balance',
    description: 'Get an employee\'s current-year leave balance broken down by type (vacation, sick, personal, unpaid): granted, used (approved), pending, and available days. Use this when anyone asks "how many vacation days do I have left?" or similar.',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:  { type: 'string' },
        person_email: { type: 'string' },
      },
    },
  },
  {
    name: 'list_holidays',
    description: 'List upcoming organization holidays from today onwards.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max holidays to return (default 20)' },
      },
    },
  },
  {
    name: 'list_employee_documents',
    description: 'List documents on file for an employee (offer letter, ID, certifications, contracts, payslips, etc.). Returns title, category, URL, optional expiry date. Use this when someone asks "where is X document?" or "do I have a current ID on file?".',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:  { type: 'string' },
        person_email: { type: 'string' },
        category:     { type: 'string', enum: ['offer_letter','id_proof','contract','certification','policy','payslip','tax_form','other'] },
      },
    },
  },
  {
    name: 'list_org_documents',
    description: 'List org-level documents available to all employees: handbook, policies, codes of conduct, anything in the "policy" category. Use this when someone asks "where\'s the handbook?" or "what\'s our policy on X?".',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['offer_letter','id_proof','contract','certification','policy','payslip','tax_form','other'] },
      },
    },
  },
  {
    name: 'list_expiring_documents',
    description: 'List employee documents expiring soon (default within 30 days). Useful for compliance / renewals reviews.',
    input_schema: {
      type: 'object',
      properties: {
        days_ahead: { type: 'number', description: 'Look-ahead window in days (default 30)' },
      },
    },
  },
  {
    name: 'record_employee_compensation',
    description: 'Record a NEW compensation record for an employee — every change is a new row with an effective date (immutable history). The change auto-appears on the employee timeline. The orchestrator must request_approval BEFORE calling this.',
    input_schema: {
      type: 'object',
      properties: {
        employee_id:        { type: 'string' },
        person_email:       { type: 'string' },
        effective_date:     { type: 'string', description: 'When this comp takes effect (YYYY-MM-DD)' },
        base_salary:        { type: 'number', description: 'Base salary amount in the given currency' },
        currency:           { type: 'string', description: '3-letter ISO code, default USD (e.g. USD, INR, GBP)' },
        pay_frequency:      { type: 'string', enum: ['annual', 'monthly', 'hourly'], description: 'Default annual' },
        bonus_amount:       { type: 'number', description: 'Bonus amount (annual/target), optional' },
        equity_notes:       { type: 'string', description: 'Free-text equity terms, optional' },
        variable_pay_notes: { type: 'string', description: 'Free-text variable comp / commission notes, optional' },
        reason:             { type: 'string', description: 'Why: hire, promotion, annual_review, market_adjustment, or free text' },
      },
      required: ['effective_date', 'base_salary'],
    },
  },
  {
    name: 'list_payroll_runs',
    description: 'List payroll runs for this org with computed totals (gross/deductions/net) per run. Use for "show me recent payroll runs" or "what did we pay out last month?". Optional status filter (draft | finalized).',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'finalized'] },
        limit:  { type: 'number', description: 'Max rows to return (default 20)' },
      },
    },
  },
  {
    name: 'get_payroll_run',
    description: 'Fetch one payroll run with its full payslip list (per-employee gross/deductions/net). Identify by run_id (from list_payroll_runs).',
    input_schema: {
      type: 'object',
      properties: { run_id: { type: 'string' } },
      required: ['run_id'],
    },
  },
  {
    name: 'get_employee_payslips',
    description: "Fetch one employee's payslip history across runs (newest first). Identify by employee_id or person_email. Use for 'what has Asha been paid this year?'.",
    input_schema: {
      type: 'object',
      properties: {
        employee_id:  { type: 'string' },
        person_email: { type: 'string', description: 'Alternative to employee_id' },
        limit:        { type: 'number', description: 'Max payslips to return (default 24)' },
      },
    },
  },
]

// ── Tool executor ─────────────────────────────────────────────────────────────

/**
 * RBAC: capability required to run each tool (RBAC Slice 3). Tools not listed
 * need no capability (system/self/governance tools, e.g. escalate_to_recruiter,
 * send_whatsapp_reply, request_approval). Enforced only when executeTool is given
 * a capability set — user-facing copilot passes one; background jobs (WhatsApp
 * responder, autopilot) omit it and run unrestricted.
 */
const TOOL_CAPABILITIES: Record<string, Capability> = {
  // Recruiting — read
  search_candidates: 'recruiting:view', search_candidate_pool: 'recruiting:view',
  get_candidate: 'recruiting:view', get_job_pipeline: 'recruiting:view',
  list_jobs: 'recruiting:view', get_dashboard_stats: 'recruiting:view',
  find_stale_applications: 'recruiting:view', get_application_events: 'recruiting:view',
  get_inbox: 'recruiting:view', get_scorecard: 'recruiting:view', get_offers: 'recruiting:view',
  get_interviews: 'recruiting:view', get_sequence: 'recruiting:view',
  list_sequences: 'recruiting:view', list_candidate_sequence_history: 'recruiting:view',
  list_roles: 'recruiting:view',
  // Recruiting — write
  add_note_to_application: 'recruiting:edit', move_application_to_stage: 'recruiting:edit',
  bulk_add_to_pipeline: 'recruiting:edit', bulk_move_to_stage: 'recruiting:edit',
  bulk_reject_below_score: 'recruiting:edit', bulk_score_applications: 'recruiting:edit',
  create_candidate: 'recruiting:edit', create_job_and_pipeline: 'recruiting:edit',
  update_job: 'recruiting:edit', update_candidate_status: 'recruiting:edit',
  update_application_status: 'recruiting:edit', create_offer: 'recruiting:edit',
  update_offer_status: 'recruiting:edit', create_scorecard: 'recruiting:edit',
  schedule_interview: 'recruiting:edit', update_interview_status: 'recruiting:edit',
  create_self_schedule_invite: 'recruiting:edit', send_outreach_email: 'recruiting:edit',
  create_interviewer_availability_link: 'recruiting:edit',
  send_whatsapp_message: 'recruiting:edit', send_assessment: 'recruiting:edit',
  draft_application_email: 'recruiting:edit', create_role: 'recruiting:edit',
  update_role: 'recruiting:edit',
  create_requisition: 'recruiting:edit', submit_requisition: 'recruiting:edit',
  list_requisitions: 'recruiting:view',
  // Analytics
  get_recruiting_analytics: 'analytics:view',
  // People
  list_employees: 'people:view', get_employee_history: 'people:view', get_direct_reports: 'people:view',
  mark_employee_joined: 'people:edit', mark_employee_terminated: 'people:edit',
  set_employee_manager: 'people:edit', record_employee_note: 'people:edit',
  // Payroll
  get_employee_compensation: 'payroll:view', get_employee_payslips: 'payroll:view',
  get_payroll_run: 'payroll:view', list_payroll_runs: 'payroll:view',
  record_employee_compensation: 'payroll:edit',
  // Onboarding
  get_employee_onboarding: 'onboarding:view', list_onboarding_plans: 'onboarding:view',
  list_onboarding_templates: 'onboarding:view', start_onboarding: 'onboarding:edit',
  complete_onboarding_task: 'onboarding:edit',
  // OKRs
  list_employee_okrs: 'okrs:view', get_okr: 'okrs:view', create_okr: 'okrs:edit',
  add_okr_key_result: 'okrs:edit', update_kr_progress: 'okrs:edit', update_okr_status: 'okrs:edit',
  // Documents
  list_employee_documents: 'documents:view', list_org_documents: 'documents:view',
  list_expiring_documents: 'documents:view',
  // Leave
  get_employee_leave_balance: 'leave:view', list_holidays: 'leave:view',
  list_time_off: 'leave:view', request_time_off: 'leave:view', decide_time_off: 'leave:approve',
}

export async function executeTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
  /** When provided, the tool runs only if its required capability is held.
   *  Omit (background jobs) to run unrestricted. */
  capabilities?: Set<Capability> | null,
  /** Internal users.id of the acting user — stamped as created_by on writes
   *  that require it (canonical job creation). Null in background contexts. */
  userId?: string | null,
): Promise<string> {
  if (capabilities) {
    const required = TOOL_CAPABILITIES[name]
    if (required && !capabilities.has(required)) {
      return `Permission denied: this action requires the "${required}" capability, which you don't have. Ask an admin to grant it.`
    }
  }
  try {
    switch (name) {
      case 'search_candidates':     return await searchCandidates(input, orgId, supabase)
      case 'get_job_pipeline':      return await getJobPipeline(input, orgId, supabase)
      case 'list_jobs':             return await listJobs(input, orgId, supabase)
      case 'get_dashboard_stats':   return await getDashboardStats(orgId, supabase)
      case 'find_stale_applications': return await findStaleApplications(input, orgId, supabase)
      case 'get_candidate':         return await getCandidate(input, orgId, supabase)
      case 'move_application_to_stage': return await moveApplicationToStage(input, orgId, supabase)
      case 'add_note_to_application':   return await addNoteToApplication(input, orgId, supabase)
      // Autonomous workflow tools
      case 'create_job_and_pipeline':   return await createJobAndPipeline(input, orgId, supabase, userId)
      case 'search_candidate_pool':     return await searchCandidatePool(input, orgId, supabase)
      case 'bulk_add_to_pipeline':      return await bulkAddToPipeline(input, orgId, supabase)
      case 'bulk_score_applications':   return await bulkScoreApplications(input, orgId, supabase)
      case 'send_outreach_email':       return await sendOutreachEmail(input, orgId, supabase)
      case 'send_whatsapp_message':     return await sendWhatsAppMessageTool(input, orgId, supabase)
      case 'send_whatsapp_reply':       return await sendWhatsAppReplyTool(input, orgId, supabase)
      case 'escalate_to_recruiter':     return await escalateToRecruiterTool(input, orgId, supabase)
      case 'request_approval':
        return `CHECKPOINT: ${input.action_summary}. Impact: ${input.impact}.${input.details ? ' ' + input.details : ''}`
      // Extended platform tools
      case 'create_candidate':           return await createCandidate(input, orgId, supabase)
      case 'update_candidate_status':    return await updateCandidateStatus(input, orgId, supabase)
      case 'update_application_status':  return await updateApplicationStatus(input, orgId, supabase)
      case 'bulk_move_to_stage':         return await bulkMoveToStage(input, orgId, supabase)
      case 'bulk_reject_below_score':    return await bulkRejectBelowScore(input, orgId, supabase)
      case 'get_application_events':     return await getApplicationEvents(input, orgId, supabase)
      case 'update_job':                 return await updateJob(input, orgId, supabase)
      case 'get_scorecard':              return await getScorecard(input, orgId, supabase)
      // Gap-fill tools
      case 'list_roles':                 return await listRoles(input, orgId, supabase)
      case 'create_role':                return await createRole(input, orgId, supabase)
      case 'update_role':                return await updateRole(input, orgId, supabase)
      case 'get_recruiting_analytics':   return await getRecruitingAnalytics(orgId, supabase)
      case 'get_inbox':                  return await getInbox(orgId, supabase)
      case 'create_scorecard':           return await createScorecard(input, orgId, supabase)
      case 'draft_application_email':    return await draftApplicationEmail(input, orgId, supabase)
      case 'create_requisition':         return await createRequisition(input, orgId, supabase, userId)
      case 'list_requisitions':          return await listRequisitions(input, orgId, supabase)
      case 'submit_requisition':         return await submitRequisition(input, orgId, supabase, userId)
      case 'schedule_interview':         return await scheduleInterview(input, orgId, supabase)
      case 'get_interviews':             return await getInterviews(input, orgId, supabase)
      case 'update_interview_status':    return await updateInterviewStatus(input, orgId, supabase)
      case 'create_offer':               return await createOffer(input, orgId, supabase)
      case 'update_offer_status':        return await updateOfferStatus(input, orgId, supabase)
      case 'get_offers':                 return await getOffers(input, orgId, supabase)
      case 'send_assessment':            return await sendAssessment(input, orgId, supabase)
      case 'create_self_schedule_invite': return await createSelfScheduleInvite(input, orgId, supabase)
      case 'create_interviewer_availability_link': return await createInterviewerAvailabilityLink(input, orgId, supabase)
      // Employee lifecycle tools
      case 'list_employees':             return await listEmployeesTool(input, orgId, supabase)
      case 'mark_employee_joined':       return await markEmployeeJoinedTool(input, orgId, supabase)
      case 'mark_employee_terminated':   return await markEmployeeTerminatedTool(input, orgId, supabase)
      case 'get_employee_history':       return await getEmployeeHistoryTool(input, orgId, supabase)
      case 'set_employee_manager':       return await setEmployeeManagerTool(input, orgId, supabase)
      case 'record_employee_note':       return await recordEmployeeNoteTool(input, orgId, supabase)
      case 'get_employee_compensation':  return await getEmployeeCompensationTool(input, orgId, supabase)
      case 'record_employee_compensation': return await recordEmployeeCompensationTool(input, orgId, supabase)
      case 'get_direct_reports':         return await getDirectReportsTool(input, orgId, supabase)
      case 'request_time_off':           return await requestTimeOffTool(input, orgId, supabase)
      case 'list_time_off':              return await listTimeOffTool(input, orgId, supabase)
      case 'decide_time_off':            return await decideTimeOffTool(input, orgId, supabase)
      case 'list_onboarding_templates':  return await listOnboardingTemplatesTool(orgId, supabase)
      case 'list_onboarding_plans':      return await listOnboardingPlansTool(input, orgId, supabase)
      case 'start_onboarding':           return await startOnboardingTool(input, orgId, supabase)
      case 'get_employee_onboarding':    return await getEmployeeOnboardingTool(input, orgId, supabase)
      case 'complete_onboarding_task':   return await completeOnboardingTaskTool(input, orgId, supabase)
      case 'list_employee_documents':    return await listEmployeeDocumentsTool(input, orgId, supabase)
      case 'list_org_documents':         return await listOrgDocumentsTool(input, orgId, supabase)
      case 'list_expiring_documents':    return await listExpiringDocumentsTool(input, orgId, supabase)
      case 'get_employee_leave_balance': return await getEmployeeLeaveBalanceTool(input, orgId, supabase)
      case 'list_holidays':              return await listHolidaysTool(input, orgId, supabase)
      case 'list_sequences':             return await listSequencesTool(orgId, supabase)
      case 'get_sequence':               return await getSequenceTool(input, orgId, supabase)
      case 'list_candidate_sequence_history': return await listCandidateSequenceHistoryTool(input, orgId, supabase)
      case 'list_employee_okrs':         return await listEmployeeOkrsTool(input, orgId, supabase)
      case 'get_okr':                    return await getOkrTool(input, orgId, supabase)
      case 'create_okr':                 return await createOkrTool(input, orgId, supabase)
      case 'add_okr_key_result':         return await addOkrKeyResultTool(input, orgId, supabase)
      case 'update_kr_progress':         return await updateKrProgressTool(input, orgId, supabase)
      case 'update_okr_status':          return await updateOkrStatusTool(input, orgId, supabase)
      case 'list_payroll_runs':          return await listPayrollRunsTool(input, orgId, supabase)
      case 'get_payroll_run':            return await getPayrollRunTool(input, orgId, supabase)
      case 'get_employee_payslips':      return await getEmployeePayslipsTool(input, orgId, supabase)
      default:                      return `Unknown tool: ${name}`
    }
  } catch (err) {
    return `Error executing ${name}: ${err instanceof Error ? err.message : 'Unknown error'}`
  }
}

// ── Read tools ────────────────────────────────────────────────────────────────

async function searchCandidates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { query, status } = input

  const { data, error } = await searchCandidatesForAgent(supabase, orgId, { query, status })
  if (error) return `Error: ${error.message}`
  if (!data || data.length === 0) return `No candidates found matching "${query}"${status ? ` with status "${status}"` : ''}.`

  // Active applications per candidate
  const candidateIds = data.map((c: { id: string }) => c.id)
  const apps = await listActiveApplicationsByCandidatesWithJobTitle(supabase, orgId, candidateIds)

  const appsByCandidate: Record<string, string[]> = {}
  for (const app of apps ?? []) {
    const cid = (app as { candidate_id: string }).candidate_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const title = (app.hiring_request as any)?.position_title
    if (!appsByCandidate[cid]) appsByCandidate[cid] = []
    if (title) appsByCandidate[cid].push(title)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = data.map((c: any) => {
    const jobs = appsByCandidate[c.id] ?? []
    return [
      `• ${c.person?.name ?? '(unknown)'}`,
      c.current_title ?? 'No title',
      `${c.experience_years ?? 0}y exp`,
      `status: ${c.status}`,
      c.person?.email ?? '',
      jobs.length > 0 ? `active in: ${jobs.join(', ')}` : null,
      `ID: ${c.id}`,
    ].filter(Boolean).join(' | ')
  })

  return `Found ${data.length} candidate(s):\n${lines.join('\n')}`
}

async function getJobPipeline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { job_id, job_title_query } = input

  if (!job_id && !job_title_query) {
    return 'Error: provide either job_id or job_title_query'
  }

  const jobs = await findCanonicalJobsForAgent(supabase, orgId, {
    jobId: job_id,
    titleQuery: job_title_query,
  })
  if (jobs.length === 0) return `No job found matching "${job_title_query ?? job_id}".`

  if (jobs.length > 1 && !job_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return `Multiple jobs found — be more specific or use job_id:\n${jobs.map((j: any) => `• ${j.title} (${j.status}) — ID: ${j.id}`).join('\n')}`
  }

  let detail
  try {
    detail = await getCanonicalJobBoardDetail(supabase, orgId, jobs[0].id)
  } catch (err) {
    return `Error fetching stages: ${err instanceof Error ? err.message : 'Unknown error'}`
  }
  if (!detail) return `No job found matching "${job_title_query ?? job_id}".`

  const job = detail
  const stages = detail.pipeline_stages
  // Match prior behavior: only active applications appear in the pipeline view.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apps = (detail.applications as any[]).filter(a => a.status === 'active')

  // Group candidates by stage
  const stageMap: Record<string, { name: string; candidates: string[] }> = {}
  for (const s of stages) stageMap[s.id] = { name: s.name, candidates: [] }

  const unstaged: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const app of apps as any[]) {
    const name  = app.candidate?.name ?? 'Unknown'
    const score = app.ai_score ? ` (score: ${app.ai_score})` : ''
    const entry = `${name}${score} [appId: ${app.id}]`

    if (app.stage_id && stageMap[app.stage_id]) {
      stageMap[app.stage_id].candidates.push(entry)
    } else {
      unstaged.push(entry)
    }
  }

  let result = `**${job.position_title}** (${job.status})\n`
  result += `Hiring Manager: ${job.hiring_manager_name}${job.department ? ` | ${job.department}` : ''}\n`
  result += `Total active candidates: ${apps.length}\n`
  result += `\nPipeline:\n`

  for (const stage of stages) {
    const { name, candidates } = stageMap[stage.id]
    result += `\n${name} (${candidates.length} candidates):\n`
    for (const c of candidates) result += `  • ${c}\n`
    if (candidates.length === 0) result += `  (empty)\n`
  }

  if (unstaged.length > 0) {
    result += `\nUnassigned (${unstaged.length}):\n`
    for (const c of unstaged) result += `  • ${c}\n`
  }

  result += `\nStage IDs (for move_application_to_stage):\n`
  for (const stage of stages) result += `• ${stage.name}: ${stage.id}\n`

  return result
}

async function listJobs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { status_filter } = input

  const summaries = await listCanonicalJobBoardSummaries(supabase, orgId)
  const jobs = status_filter
    ? summaries.filter(j => j.status === status_filter)
    : summaries
  if (jobs.length === 0) return 'No jobs found.'

  const lines = jobs.map(j => {
    // Active candidates per job (matches prior active-only count): sum the
    // per-stage active counts the board summary computes.
    const count = j.stage_counts.reduce((sum, s) => sum + s.count, 0)
    return `• ${j.position_title}${j.department ? ` (${j.department})` : ''} | ${j.status} | HM: ${j.hiring_manager_name} | ${count} candidates | ID: ${j.id}`
  })

  return `${jobs.length} job(s):\n${lines.join('\n')}`
}

async function getDashboardStats(orgId: string, supabase: SupabaseClient): Promise<string> {
  const [totalJobs, activeCount, interviewingCount, hiredCount] = await Promise.all([
    countCanonicalJobs(supabase, orgId),
    countCandidatesByStatus(supabase, orgId, 'active'),
    countCandidatesByStatus(supabase, orgId, 'interviewing'),
    countCandidatesByStatus(supabase, orgId, 'hired'),
  ])

  return `Recruiting overview:
• Total jobs: ${totalJobs}
• Active candidates: ${activeCount}
• Currently interviewing: ${interviewingCount}
• Total hired: ${hiredCount}`
}

async function findStaleApplications(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const days   = input.days ?? 7
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data: apps, error: appsErr } = await listActiveApplicationsForStaleCheck(supabase, orgId)

  if (appsErr) return `Error: ${appsErr.message}`
  if (!apps || apps.length === 0) return 'No active applications found.'

  const appIds = apps.map((a: { id: string }) => a.id)

  // Get most recent event per application
  const { data: events } = await supabase
    .from('application_events')
    .select('application_id, created_at')
    .in('application_id', appIds)
    .order('created_at', { ascending: false })

  const latestEvent: Record<string, string> = {}
  for (const ev of events ?? []) {
    const e = ev as { application_id: string; created_at: string }
    if (!latestEvent[e.application_id]) latestEvent[e.application_id] = e.created_at
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stale = (apps as any[]).filter(app => {
    const last = latestEvent[app.id] ?? app.applied_at
    return last < cutoff
  })

  if (stale.length === 0) return `No stale applications — all have activity in the last ${days} days. ✓`

  stale.sort((a: { id: string; applied_at: string }, b: { id: string; applied_at: string }) => {
    const aDate = latestEvent[a.id] ?? a.applied_at
    const bDate = latestEvent[b.id] ?? b.applied_at
    return aDate < bDate ? -1 : 1
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = stale.map((app: any) => {
    const last     = latestEvent[app.id] ?? app.applied_at
    const daysAgo  = Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000)
    const job      = app.hiring_request?.position_title ?? 'Unknown job'
    const candidate = app.candidate?.name ?? 'Unknown'
    const stage    = app.pipeline_stages?.name ?? 'Unassigned'
    return `• ${candidate} | ${job} | Stage: ${stage} | Last activity: ${daysAgo}d ago | appId: ${app.id}`
  })

  return `${stale.length} stale application(s) (no activity in ${days}+ days):\n${lines.join('\n')}`
}

async function getCandidate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { candidate_id, candidate_name_query } = input

  if (!candidate_id && !candidate_name_query) {
    return 'Error: provide either candidate_id or candidate_name_query'
  }

  const { data: candidates, error } = await getCandidateForAgentLookup(supabase, orgId, {
    candidateId: candidate_id,
    nameQuery: candidate_name_query,
  })
  if (error) return `Error: ${error.message}`
  if (!candidates || candidates.length === 0) return `No candidate found matching "${candidate_name_query ?? candidate_id}".`

  if (candidates.length > 1) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return `Multiple candidates found — be more specific:\n${candidates.map((c: any) => `• ${c.name} | ${c.current_title ?? 'No title'} | ${c.email} | ID: ${c.id}`).join('\n')}`
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = candidates[0] as any

  const apps = await listApplicationsForCandidateWithJobAndStage(supabase, orgId, c.id)

  let result = `${c.name}\n`
  result += `Email: ${c.email}${c.phone ? ` | Phone: ${c.phone}` : ''}\n`
  result += `Title: ${c.current_title ?? 'Not specified'} | ${c.experience_years ?? 0} years exp\n`
  result += `Location: ${c.location ?? 'Not specified'} | Status: ${c.status}\n`
  if (c.skills?.length > 0) result += `Skills: ${c.skills.join(', ')}\n`
  if (c.linkedin_url) result += `LinkedIn: ${c.linkedin_url}\n`
  result += `ID: ${c.id}\n`

  if (apps && apps.length > 0) {
    result += `\nApplications:\n`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const app of apps as any[]) {
      const job   = app.hiring_request?.position_title ?? 'Unknown'
      const stage = app.pipeline_stages?.name ?? 'Unassigned'
      const score = app.ai_score ? ` | AI score: ${app.ai_score}` : ''
      result += `• ${job} | Stage: ${stage} | ${app.status}${score} | appId: ${app.id}\n`
    }
  }

  return result
}

// ── Write tools ───────────────────────────────────────────────────────────────

async function moveApplicationToStage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_id, stage_id, note } = input

  // Verify application exists in this org
  const { data: current, error: fetchErr } = await getApplicationStageContext(supabase, orgId, application_id)

  if (fetchErr || !current) return `Application not found or not in your organization.`

  // Verify new stage exists in this org
  const newStage = await getPipelineStageById(supabase, orgId, stage_id)

  if (!newStage) return `Stage not found in your organization.`

  const { error: updateErr } = await updateApplicationStage(supabase, orgId, application_id, stage_id)

  if (updateErr) return `Error moving application: ${updateErr.message}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromStage     = (current.pipeline_stages as any)?.name ?? 'unknown'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateName = (current.candidate as any)?.name ?? 'Candidate'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobTitle      = (current.hiring_request as any)?.position_title ?? 'Unknown job'

  await supabase.from('application_events').insert({
    application_id,
    event_type: 'stage_moved',
    from_stage: fromStage,
    to_stage:   newStage.name,
    note:       note ?? 'Moved by AI Copilot',
    created_by: 'AI Copilot',
    org_id:     orgId,
  } as never)

  return `Moved ${candidateName} from "${fromStage}" to "${newStage.name}" in ${jobTitle}.`
}

async function addNoteToApplication(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_id, note } = input

  if (!note?.trim()) return 'Error: note cannot be empty'

  const { data: app, error: fetchErr } = await getApplicationCandidateAndJob(supabase, orgId, application_id)

  if (fetchErr || !app) return `Application not found or not in your organization.`

  const { error: insertErr } = await supabase.from('application_events').insert({
    application_id,
    event_type: 'note_added',
    note,
    created_by: 'AI Copilot',
    org_id:     orgId,
  } as never)

  if (insertErr) return `Error adding note: ${insertErr.message}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateName = (app.candidate as any)?.name ?? 'Candidate'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobTitle      = (app.hiring_request as any)?.position_title ?? 'Unknown job'

  return `Note added to ${candidateName}'s application for ${jobTitle}.`
}

// ── Autonomous workflow tools ─────────────────────────────────────────────────

async function createJobAndPipeline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
  userId?: string | null,
): Promise<string> {
  const { position_title, key_requirements, opening_id } = input

  if (!userId) {
    return 'Error: could not identify the acting user, so the job was not created.'
  }

  // GATE: a job can only be created from an APPROVED requisition (opening),
  // mirroring POST /api/req-jobs. Without one, refuse — no orphan/req-less jobs.
  if (!opening_id) {
    const approved = await listApprovedOpenings(supabase, orgId)
    if (approved.length === 0) {
      return (
        `Can't create the job yet — every job must come from an approved requisition, and this org has none approved. ` +
        `Create a requisition first and get it approved, then I can create the job against it.`
      )
    }
    const list = approved.map(o => `• ${o.title} (opening_id: ${o.id})`).join('\n')
    return (
      `A job must be created from an approved requisition. Which one should I use?\n${list}\n` +
      `Reply with the requisition, and I'll create the job against it.`
    )
  }

  const opening = await getOpeningById(supabase, orgId, opening_id)
  if (!opening) {
    return `That requisition wasn't found. Pick one of the org's approved requisitions.`
  }
  if (opening.status !== 'approved') {
    return (
      `The requisition "${opening.title}" isn't approved yet (status: ${opening.status}). ` +
      `A job can only be created from an approved requisition.`
    )
  }

  // `department` arrives as free text from the agent, not a department_id FK, so
  // we omit it from the canonical insert; title + description carry over.
  const job = await createCanonicalJobFromApprovedOpening(supabase, orgId, opening_id, {
    title:       position_title,
    description: key_requirements ?? null,
  }, userId)

  return `Created job "${job.title}" from approved requisition "${opening.title}" — ID: ${job.id}. Pipeline stages are being auto-created.`
}

async function searchCandidatePool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { skills_keywords, location, min_experience, max_experience, limit = 50 } = input

  // Fetch 3x limit to allow for client-side skill filtering
  const { data, error } = await searchCandidatePoolForAgent(supabase, orgId, {
    location,
    minExperience: min_experience,
    maxExperience: max_experience,
    fetchLimit: (limit as number) * 3,
  })
  if (error) return `Error: ${error.message}`
  if (!data || data.length === 0) return 'No candidates found matching the criteria.'

  // Client-side skill keyword filtering
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let candidates: any[] = data
  if (skills_keywords) {
    const keywords: string[] = (skills_keywords as string)
      .toLowerCase()
      .split(',')
      .map((k: string) => k.trim())
      .filter(Boolean)

    candidates = candidates.filter(c => {
      const skills = (c.skills ?? []).map((s: string) => s.toLowerCase())
      const title  = (c.current_title ?? '').toLowerCase()
      return keywords.some(kw => skills.some((s: string) => s.includes(kw)) || title.includes(kw))
    })
  }

  candidates = candidates.slice(0, limit as number)

  if (candidates.length === 0) {
    return `No candidates found matching skills "${skills_keywords}"${location ? ` in ${location}` : ''}.`
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = candidates.map((c: any) =>
    `• ${c.name} | ${c.current_title ?? 'No title'} | ${c.experience_years ?? 0}yr | ${c.location ?? 'No location'} | ID: ${c.id}`
  )

  const ids = candidates.map((c: { id: string }) => c.id).join(', ')
  return `Found ${candidates.length} candidate(s):\n${lines.join('\n')}\n\nCandidate IDs: ${ids}`
}

async function bulkAddToPipeline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { job_id, candidate_ids, source = 'sourced' } = input

  if (!Array.isArray(candidate_ids) || candidate_ids.length === 0) {
    return 'Error: candidate_ids must be a non-empty array'
  }

  // Get first pipeline stage for the job
  let stage
  try {
    stage = await getFirstJobStage(supabase, orgId, job_id)
  } catch (err) {
    return `Error fetching pipeline stages: ${err instanceof Error ? err.message : 'Unknown error'}`
  }
  const firstStage = stage

  // Check for existing applications (skip duplicates)
  const existing = await listExistingApplicationCandidateIds(supabase, orgId, job_id, candidate_ids)

  const existingIds = new Set((existing ?? []).map((e: { candidate_id: string }) => e.candidate_id))
  const toAdd = (candidate_ids as string[]).filter(id => !existingIds.has(id))

  if (toAdd.length === 0) {
    return `All ${candidate_ids.length} candidates already have applications for this job — no duplicates added.`
  }

  let added = 0
  for (const candidate_id of toAdd) {
    const { data: app, error: appErr } = await insertPipelineApplication(supabase, orgId, {
      candidateId: candidate_id,
      jobId: job_id,
      stageId: firstStage?.id ?? null,
      source,
    })

    if (appErr || !app) continue

    await supabase.from('application_events').insert({
      application_id: app.id,
      event_type:     'applied',
      note:           `Added to pipeline by AI Copilot (source: ${source})`,
      created_by:     'AI Copilot',
      org_id:         orgId,
    } as never)

    added++
  }

  const skipped = candidate_ids.length - toAdd.length
  const stageNote = firstStage ? ` at stage "${firstStage.name}"` : ''
  const skipNote  = skipped > 0 ? ` ${skipped} skipped (already existed).` : ''
  return `Added ${added} application(s) to the pipeline${stageNote}.${skipNote}`
}

async function bulkScoreApplications(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { job_id, min_score_threshold = 70 } = input

  // Fetch the job (HiringRequest-shaped) used as scoring context.
  const scoringCtx = await getCanonicalJobScoringContext(supabase, orgId, job_id)
  if (!scoringCtx) return 'Job not found.'
  const job = scoringCtx.job

  // Fetch active, unscored applications with full candidate data
  const { data: apps, error: appsErr } = await listUnscoredActiveApplicationsWithCandidate(supabase, orgId, job_id)

  if (appsErr) return `Error fetching applications: ${appsErr.message}`
  if (!apps || apps.length === 0) return 'No unscored active applications found for this job.'

  let scored = 0, aboveThreshold = 0, totalScore = 0
  const topCandidates: string[] = []

  for (const app of apps as Record<string, unknown>[]) {
    const candidate = app.candidate as Record<string, unknown>
    if (!candidate) continue

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await scoreApplicationForJob(candidate as any, job)

      await applyAiScoreToApplication(supabase, app.id as string, result)

      scored++
      totalScore += result.score

      if (result.score >= (min_score_threshold as number)) {
        aboveThreshold++
        topCandidates.push(`${candidate.name} (${result.score})`)
      }
    } catch {
      // Continue scoring remaining candidates on individual failures
    }
  }

  const avgScore = scored > 0 ? Math.round(totalScore / scored) : 0
  const topList  = topCandidates.length > 0
    ? `\nTop candidates (≥${min_score_threshold}): ${topCandidates.slice(0, 10).join(', ')}`
    : ''

  return `Scored ${scored} application(s). ${aboveThreshold} score ≥ ${min_score_threshold}. Avg score: ${avgScore}.${topList}`
}

async function sendOutreachEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_id, subject, body, recruiter_name = 'The Recruiting Team' } = input

  // Fetch application + candidate details
  const { data: app, error: appErr } = await getApplicationCandidateEmailAndJob(supabase, orgId, application_id)

  if (appErr || !app) return 'Application not found or not in your organization.'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = app.candidate as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job       = app.hiring_request as any

  if (!candidate?.email) return 'Candidate has no email address on file.'

  // Send via SendGrid directly (avoid unreliable self-referential fetch on Vercel)
  const sendgridKey  = process.env.SENDGRID_API_KEY
  const fromEmail    = process.env.SENDGRID_FROM_EMAIL
  if (!sendgridKey || !fromEmail) return 'Email not configured: SENDGRID_API_KEY or SENDGRID_FROM_EMAIL is missing.'

  sgMail.setApiKey(sendgridKey)
  try {
    await sgMail.send({
      to:      candidate.email,
      from:    { email: fromEmail, name: recruiter_name },
      subject,
      text:    body,
      html:    body.replace(/\n/g, '<br>'),
    })
  } catch (err: any) {
    const errMsg = err?.response?.body?.errors?.[0]?.message ?? err?.message ?? 'Unknown SendGrid error'
    return `Failed to send email to ${candidate.name}: ${errMsg}`
  }

  // Log the outreach event
  await supabase.from('application_events').insert({
    application_id,
    event_type: 'email_sent',
    note:       `Outreach: "${subject}"`,
    created_by: 'AI Copilot',
    org_id:     orgId,
  } as never)

  return `Email sent to ${candidate.name} (${candidate.email}) re: ${job?.position_title ?? 'the role'}.`
}

// ── WhatsApp tools ────────────────────────────────────────────────────────────

async function sendWhatsAppMessageTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_id, body, template_params } = input

  const { data: app, error: appErr } = await getApplicationCandidateIdAndJob(supabase, orgId, application_id)

  if (appErr || !app) return 'Application not found or not in your organization.'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job = app.hiring_request as any

  const { sendWhatsApp } = await import('@/lib/whatsapp/send')
  const result = await sendWhatsApp({
    supabase,
    orgId,
    candidateId: app.candidate_id as string,
    applicationId: application_id,
    body,
    templateParams: template_params,
    sender: 'agent:scout',
    context: job?.position_title ? { job_title: job.position_title } : undefined,
  })

  return result.message
}

async function sendWhatsAppReplyTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { conversation_id, body } = input

  const { getConversationById } = await import('@/modules/crm/domain/whatsapp')
  const conversation = await getConversationById(supabase, orgId, conversation_id)
  if (!conversation) return 'WhatsApp conversation not found.'

  const { sendWhatsApp } = await import('@/lib/whatsapp/send')
  const result = await sendWhatsApp({
    supabase,
    orgId,
    toPhone: conversation.wa_phone,
    candidateId: conversation.candidate_id ?? undefined,
    applicationId: conversation.application_id ?? undefined,
    body,
    sender: 'agent:responder',
  })

  return result.message
}

async function escalateToRecruiterTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { conversation_id, reason } = input

  const { getConversationById, updateConversation } = await import('@/modules/crm/domain/whatsapp')
  const conversation = await getConversationById(supabase, orgId, conversation_id)
  if (!conversation) return 'WhatsApp conversation not found.'

  await updateConversation(supabase, orgId, conversation_id, {
    status: 'escalated',
    agent_enabled: false,
  })

  const { notify } = await import('@/lib/notifications')
  await notify({
    orgId,
    type: 'system',
    title: 'WhatsApp conversation needs a human',
    body: reason,
    slackText: `📱 A WhatsApp conversation needs recruiter attention: ${reason}`,
    resourceType: 'whatsapp_conversation',
    resourceId: conversation_id,
  })

  return 'Escalated to a recruiter — the AI responder is muted for this conversation.'
}

// ── Extended platform tools ───────────────────────────────────────────────────

async function createCandidate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { name, email, current_title, location, experience_years, skills, phone, linkedin_url } = input

  // Post-Party-Model: identity lives on people; this routes through the
  // canonical write path which creates / reuses a people row first.
  const { findOrCreateCandidateProfile } = await import('@/modules/ats/domain/candidates')
  try {
    const result = await findOrCreateCandidateProfile(supabase, orgId, {
      name, email,
      phone:            phone         ?? null,
      current_title:    current_title ?? null,
      location:         location      ?? null,
      linkedin_url:     linkedin_url  ?? null,
      skills:           skills        ?? [],
      experience_years: experience_years ?? 0,
    })
    if (!result.created) {
      return `A candidate with email ${email} already exists: ${name} (ID: ${result.id}).`
    }
    return `Created candidate ${name} (ID: ${result.id}).`
  } catch (err) {
    return `Error creating candidate: ${err instanceof Error ? err.message : 'unknown'}`
  }
}

async function updateCandidateStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { candidate_id, status, reason } = input

  const candidate = await getCandidateNameAndStatus(supabase, orgId, candidate_id)

  if (!candidate) return 'Candidate not found in your organization.'

  const { error: updateErr } = await setCandidateStatus(supabase, orgId, candidate_id, status)

  if (updateErr) return `Error updating status: ${updateErr.message}`
  return `Updated ${candidate.name}'s status from "${candidate.status}" to "${status}".${reason ? ` Reason: ${reason}` : ''}`
}

async function updateApplicationStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_ids, status, reason } = input

  if (!Array.isArray(application_ids) || application_ids.length === 0) {
    return 'Error: application_ids must be a non-empty array'
  }

  const eventNote = reason ?? `Status changed to ${status} by AI Copilot`
  let updated = 0

  for (const application_id of application_ids as string[]) {
    const app = await findApplicationIdInOrg(supabase, orgId, application_id)

    if (!app) continue

    await updateApplicationStatusInOrg(supabase, orgId, application_id, status)

    await supabase.from('application_events').insert({
      application_id,
      event_type:  'status_changed',
      note:        eventNote,
      created_by:  'AI Copilot',
      org_id:      orgId,
    } as never)

    updated++
  }

  const skipped = application_ids.length - updated
  return `Updated ${updated} application(s) to "${status}".${skipped > 0 ? ` ${skipped} not found or skipped.` : ''}`
}

async function bulkMoveToStage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_ids, stage_id, note } = input

  if (!Array.isArray(application_ids) || application_ids.length === 0) {
    return 'Error: application_ids must be a non-empty array'
  }

  const stage = await getPipelineStageById(supabase, orgId, stage_id)

  if (!stage) return 'Stage not found in your organization.'

  let moved = 0
  for (const application_id of application_ids as string[]) {
    const app = await getApplicationStageNameInOrg(supabase, orgId, application_id)

    if (!app) continue

    await updateApplicationStageById(supabase, application_id, stage_id)

    await supabase.from('application_events').insert({
      application_id,
      event_type: 'stage_moved',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      from_stage: (app.pipeline_stages as any)?.name ?? 'unknown',
      to_stage:   stage.name,
      note:       note ?? `Moved to ${stage.name} by AI Copilot`,
      created_by: 'AI Copilot',
      org_id:     orgId,
    } as never)

    moved++
  }

  return `Moved ${moved} application(s) to stage "${stage.name}".`
}

async function bulkRejectBelowScore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { job_id, below_score, reason = 'Score below threshold' } = input

  const { data: apps, error } = await listActiveApplicationsBelowScore(supabase, orgId, job_id, below_score)

  if (error) return `Error: ${error.message}`
  if (!apps || apps.length === 0) return `No active scored applications below ${below_score} found.`

  let rejected = 0
  for (const app of apps as Record<string, unknown>[]) {
    const appId = app.id as string

    await updateApplicationStatusById(supabase, appId, 'rejected')

    await supabase.from('application_events').insert({
      application_id: appId,
      event_type:     'status_changed',
      note:           `${reason} (AI score: ${app.ai_score})`,
      created_by:     'AI Copilot',
      org_id:         orgId,
    } as never)

    rejected++
  }

  return `Rejected ${rejected} application(s) with AI score < ${below_score}.`
}

async function getApplicationEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_id } = input

  const { data: app, error: appErr } = await getApplicationCandidateAndJob(supabase, orgId, application_id)

  if (appErr || !app) return 'Application not found in your organization.'

  const { data: events, error: eventsErr } = await supabase
    .from('application_events')
    .select('event_type, from_stage, to_stage, note, created_by, created_at')
    .eq('application_id', application_id)
    .order('created_at', { ascending: true })

  if (eventsErr) return `Error fetching events: ${eventsErr.message}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateName = (app.candidate as any)?.name ?? 'Candidate'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobTitle      = (app.hiring_request as any)?.position_title ?? 'Unknown job'

  if (!events || events.length === 0) {
    return `No activity recorded for ${candidateName}'s application to ${jobTitle}.`
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = (events as any[]).map(e => {
    const date   = new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const detail = e.event_type === 'stage_moved'
      ? `${e.from_stage} → ${e.to_stage}`
      : (e.note ?? '')
    return `• [${date}] ${e.event_type.replace(/_/g, ' ')}${detail ? ': ' + detail : ''} (by ${e.created_by})`
  })

  return `Timeline for ${candidateName} / ${jobTitle}:\n${lines.join('\n')}`
}

async function updateJob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { job_id, status, position_title, key_requirements } = input

  const job = await getCanonicalJobById(supabase, orgId, job_id)
  if (!job) return 'Job not found in your organization.'

  // Build update payload only from provided fields, mapped to canonical `jobs`
  // columns (title, description, status). Legacy-only fields (hiring_manager_name,
  // location, headcount) have no canonical column; key_requirements is folded into
  // the job description.
  const updates: CanonicalJobUpdate = {}
  if (status         != null) updates.status      = status
  if (position_title != null) updates.title       = position_title
  if (key_requirements != null) updates.description = key_requirements

  if (Object.keys(updates).length === 0) return 'No fields provided to update.'

  await updateCanonicalJob(supabase, orgId, job_id, updates)

  const changes = Object.entries(updates).map(([k, v]) => `${k}: "${v}"`).join(', ')
  return `Updated "${job.position_title}": ${changes}.`
}

async function getScorecard(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_id } = input

  const { data: app, error: appErr } = await getApplicationCandidateAndJob(supabase, orgId, application_id)

  if (appErr || !app) return 'Application not found in your organization.'

  const { data: scorecards, error } = await supabase
    .from('scorecards')
    .select('interviewer_name, stage_name, recommendation, scores, overall_notes, created_at')
    .eq('application_id', application_id)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) return `Error fetching scorecards: ${error.message}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateName = (app.candidate as any)?.name ?? 'Candidate'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobTitle      = (app.hiring_request as any)?.position_title ?? 'Unknown job'

  if (!scorecards || scorecards.length === 0) {
    return `No scorecards found for ${candidateName}'s application to ${jobTitle}.`
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sections = (scorecards as any[]).map(sc => {
    const date   = new Date(sc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const scores = (sc.scores ?? []).map((s: { criterion: string; rating: number; notes: string }) =>
      `  - ${s.criterion}: ${s.rating}/4${s.notes ? ` (${s.notes})` : ''}`
    ).join('\n')
    return [
      `${sc.interviewer_name}${sc.stage_name ? ` / ${sc.stage_name}` : ''} [${date}] — ${sc.recommendation}`,
      scores,
      sc.overall_notes ? `  Overall: ${sc.overall_notes}` : '',
    ].filter(Boolean).join('\n')
  })

  return `Scorecards for ${candidateName} / ${jobTitle}:\n\n${sections.join('\n\n')}`
}

// ── Gap-fill implementations ───────────────────────────────────────────────────

async function listRoles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { status } = input

  let data
  try {
    data = await listRoleSummaries(supabase, orgId, { status })
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
  if (!data || data.length === 0) return `No roles found${status ? ` with status "${status}"` : ''}.`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = (data as any[]).map(r => {
    const skills  = (r.required_skills ?? []).join(', ') || 'none'
    const salary  = r.salary_min && r.salary_max ? ` | $${r.salary_min.toLocaleString()}–$${r.salary_max.toLocaleString()}` : ''
    const tholds  = r.auto_advance_threshold != null ? ` | auto-advance ≥${r.auto_advance_threshold}` : ''
    return `• ${r.job_title} | ${r.status}${r.location ? ` | ${r.location}` : ''} | ${r.min_experience}y+ exp | skills: ${skills}${salary}${tholds} | ID: ${r.id}`
  })

  return `${data.length} role(s):\n${lines.join('\n')}`
}

async function createRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const {
    job_title, required_skills, min_experience, location,
    salary_min, salary_max, status,
    auto_advance_threshold, auto_reject_threshold,
  } = input

  if (!job_title?.trim()) return 'Error: job_title is required.'

  let data
  try {
    data = await createRoleReturningSummary(supabase, orgId, {
      job_title:              job_title.trim(),
      required_skills:        required_skills ?? [],
      min_experience:         min_experience  ?? 0,
      location:               location        ?? null,
      salary_min:             salary_min      ?? null,
      salary_max:             salary_max      ?? null,
      status:                 status          ?? 'active',
      auto_advance_threshold: auto_advance_threshold ?? null,
      auto_reject_threshold:  auto_reject_threshold  ?? null,
    } as never)
  } catch (error) {
    return `Error creating role: ${error instanceof Error ? error.message : 'Unknown error'}`
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any
  return `Role created: "${r.job_title}" (${r.status}) | ID: ${r.id}`
}

async function updateRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { role_id, ...rest } = input
  if (!role_id) return 'Error: role_id is required.'

  // Verify the role belongs to this org
  const existing = await getRoleTitleForOrg(supabase, orgId, role_id)

  if (!existing) return `Role not found: ${role_id}`

  // Build update payload from provided fields only
  const allowed = ['job_title', 'required_skills', 'min_experience', 'location', 'salary_min', 'salary_max', 'status', 'auto_advance_threshold', 'auto_reject_threshold']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {}
  for (const key of allowed) {
    if (rest[key] !== undefined) updates[key] = rest[key]
  }

  if (Object.keys(updates).length === 0) return 'No fields provided to update.'

  try {
    await updateRoleFields(supabase, orgId, role_id, updates)
  } catch (error) {
    return `Error updating role: ${error instanceof Error ? error.message : 'Unknown error'}`
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const changes = Object.entries(updates).map(([k, v]) => `${k}: "${Array.isArray(v) ? v.join(', ') : v}"`).join(', ')
  return `Updated role "${(existing as any).job_title}": ${changes}.`
}

async function getRecruitingAnalytics(
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { jobs, apps, stages } = await fetchCanonicalAnalyticsInputs(supabase, orgId)

  // Canonical job statuses that count as "actively recruiting" (jobs enum:
  // draft|pending_approval|approved|open|closed|archived). 'open' = live/accepting,
  // 'approved' = ready to post — both can be gathering candidates.
  const ACTIVE_JOB_STATUSES = ['open', 'approved']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeJobs = jobs.filter((j: any) => ACTIVE_JOB_STATUSES.includes(j.status))

  // 1. Jobs funnel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const funnelLines = activeJobs.map((job: any) => {
    const jobStages  = stages.filter((s: any) => s.hiring_request_id === job.id)
    const activeApps = apps.filter((a: any) => a.hiring_request_id === job.id && a.status === 'active')
    const stageStr   = jobStages
      .map((s: any) => `${s.name}: ${activeApps.filter((a: any) => a.stage_id === s.id).length}`)
      .join(' → ')
    return `• ${job.position_title} (${activeApps.length} active) — ${stageStr || 'no stages'}`
  }).slice(0, 10)

  // 2. Source breakdown
  const sourceMap: Record<string, number> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apps.forEach((a: any) => { sourceMap[a.source] = (sourceMap[a.source] ?? 0) + 1 })
  const sourceLines = Object.entries(sourceMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([src, cnt]) => `• ${src}: ${cnt}`)

  // 3. Avg days per stage
  const velocityMap: Record<string, { total: number; count: number }> = {}
  const now = Date.now()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apps.filter((a: any) => a.status === 'active' && a.stage_id).forEach((a: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stage = stages.find((s: any) => s.id === a.stage_id)
    if (!stage) return
    const days = Math.floor((now - new Date(a.applied_at).getTime()) / 86_400_000)
    if (!velocityMap[stage.name]) velocityMap[stage.name] = { total: 0, count: 0 }
    velocityMap[stage.name].total += days
    velocityMap[stage.name].count += 1
  })
  const velocityLines = Object.entries(velocityMap)
    .map(([name, { total, count }]) => `• ${name}: avg ${Math.round(total / count)}d (${count} active)`)

  // 4. Summary
  const totalHired    = apps.filter((a: any) => a.status === 'hired').length
  const totalRejected = apps.filter((a: any) => a.status === 'rejected').length
  const totalActive   = apps.filter((a: any) => a.status === 'active').length

  return [
    `RECRUITING ANALYTICS`,
    `\nSummary: ${activeJobs.length} active jobs | ${totalActive} active applications | ${totalHired} hired | ${totalRejected} rejected`,
    `\nPipeline funnel (top 10 active jobs):`,
    funnelLines.length ? funnelLines.join('\n') : '  No active jobs with candidates.',
    `\nApplication sources:`,
    sourceLines.length ? sourceLines.join('\n') : '  No data.',
    `\nAvg days in stage (active candidates):`,
    velocityLines.length ? velocityLines.join('\n') : '  No data.',
  ].join('\n')
}

async function getInbox(
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const [eventsRes, stale] = await Promise.all([
    supabase
      .from('application_events')
      .select(`
        id, event_type, from_stage, to_stage, note, created_by, created_at,
        application:applications(
          id, status,
          candidate:candidates(full_name, email),
          job:hiring_requests(position_title)
        )
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(20),
    listStaleActiveApplicationsForInbox(supabase, orgId, fourteenDaysAgo),
  ])

  const events = eventsRes.data ?? []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activityLines = (events as any[]).map(ev => {
    const candidate = ev.application?.candidate?.full_name ?? 'Unknown'
    const job       = ev.application?.job?.position_title  ?? 'Unknown job'
    const date      = new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const detail    = ev.event_type === 'stage_change'
      ? `moved ${ev.from_stage ?? '?'} → ${ev.to_stage ?? '?'}`
      : ev.event_type === 'note_added' ? 'note added'
      : ev.event_type === 'status_changed' ? 'status changed'
      : ev.event_type
    return `• [${date}] ${candidate} / ${job} — ${detail}`
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staleLines = (stale as any[]).map(app => {
    const name  = app.candidate?.full_name ?? 'Unknown'
    const job   = app.job?.position_title  ?? 'Unknown job'
    const stage = app.stage?.name          ?? 'Unassigned'
    const days  = Math.floor((Date.now() - new Date(app.applied_at).getTime()) / 86_400_000)
    return `• ${name} / ${job} | Stage: ${stage} | ${days}d stale | appId: ${app.id}`
  })

  return [
    `INBOX`,
    `\nRecent activity (last 20 events):`,
    activityLines.length ? activityLines.join('\n') : '  No recent activity.',
    `\nNeeds attention (stale 14+ days, ${stale.length} found):`,
    staleLines.length ? staleLines.join('\n') : '  All applications are up to date. ✓',
  ].join('\n')
}

async function createScorecard(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_id, interviewer_name, stage_name, recommendation, overall_notes } = input

  if (!application_id || !interviewer_name?.trim() || !recommendation) {
    return 'Error: application_id, interviewer_name, and recommendation are required.'
  }

  // Verify application belongs to org
  const { data: app, error: appErr } = await getApplicationCandidateFullNameAndJob(supabase, orgId, application_id)

  if (appErr || !app) return `Application not found: ${application_id}`

  const { data, error } = await supabase
    .from('scorecards')
    .insert({
      application_id,
      interviewer_name: interviewer_name.trim(),
      stage_name:       stage_name?.trim() || null,
      recommendation,
      scores:           [],
      overall_notes:    overall_notes?.trim() || null,
      org_id:           orgId,
    } as never)
    .select('id')
    .single()

  if (error) return `Error creating scorecard: ${error.message}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateName = (app.candidate as any)?.full_name ?? 'candidate'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobTitle      = (app.job as any)?.position_title ?? 'Unknown job'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sc = data as any

  return `Scorecard logged for ${candidateName} / ${jobTitle}: ${interviewer_name} → ${recommendation}${stage_name ? ` (${stage_name})` : ''}. ID: ${sc.id}`
}

async function draftApplicationEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_id, template, recruiter_name, recruiter_title, company_name } = input

  type TemplateKey = 'interview_invite' | 'rejection' | 'offer' | 'followup'
  const TEMPLATE_DESC: Record<TemplateKey, string> = {
    interview_invite: 'an interview invitation',
    rejection:        'a respectful, empathetic rejection',
    offer:            'an exciting job offer congratulations',
    followup:         'a friendly follow-up to check on their application status',
  }

  const templateKey = (template ?? 'interview_invite') as TemplateKey
  if (!TEMPLATE_DESC[templateKey]) return `Invalid template "${template}". Choose: interview_invite, rejection, offer, followup.`

  const { data: app, error: appErr } = await getApplicationForEmailDraft(supabase, orgId, application_id)

  if (appErr || !app) return `Application not found: ${application_id}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate  = app.candidate as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job        = app.job       as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stage      = app.stage     as any

  const firstName  = candidate?.full_name?.split(' ')[0] ?? 'there'
  const jobTitle   = job?.position_title ?? 'the position'
  const dept       = job?.department?.name
  const stageName  = stage?.name ?? 'Applied'
  const company    = company_name   ?? 'our company'
  const recName    = recruiter_name ?? 'The Recruiting Team'
  const recTitle   = recruiter_title ?? ''

  if (!process.env.GEMINI_API_KEY) return 'Error: GEMINI_API_KEY not configured — cannot draft email.'

  const prompt = `Write ${TEMPLATE_DESC[templateKey]} email from a recruiter to a job candidate.

Context:
- Candidate first name: ${firstName}
- Role: ${jobTitle}${dept ? ` — ${dept}` : ''}
- Current pipeline stage: ${stageName}
- Company: ${company}
- Recruiter: ${recName}${recTitle ? `, ${recTitle}` : ''}

Requirements:
- Professional but warm tone
- Concise (3-5 short paragraphs)
- Address candidate by first name
- Sign off with recruiter name and title
- No placeholder brackets like [date] or [time] — use natural language instead

Respond with ONLY valid JSON: {"subject": "...", "body": "..."}`

  try {
    const { text } = await generateText(prompt, {
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 600,
    })
    const raw   = text.trim()
    const json  = raw.startsWith('{') ? raw : (raw.match(/\{[\s\S]*\}/)?.[0] ?? '')
    const draft = JSON.parse(json) as { subject: string; body: string }
    return `EMAIL DRAFT (${templateKey}) for ${candidate?.full_name ?? 'candidate'}:\n\nSubject: ${draft.subject}\n\n${draft.body}`
  } catch {
    return 'Error: AI email generation failed.'
  }
}

async function createRequisition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
  userId?: string | null,
): Promise<string> {
  if (!input.title?.trim()) {
    return 'Error: a title is required to create a requisition.'
  }
  if (!userId) {
    return 'Error: could not identify the acting user, so the requisition was not created.'
  }

  // Build the create input from the field manifest: every provided arg is either
  // resolved (name/email → id) or written through, and an arg with no home errors
  // instead of being silently dropped. Resolver misses (e.g. unknown location)
  // return a clear, user-facing message.
  let createInput
  try {
    createInput = await buildOpeningCreateInput({ supabase, orgId }, input)
  } catch (e) {
    if (e instanceof FieldResolutionError) return e.message
    throw e
  }

  const opening = await createOpening(supabase, orgId, createInput, userId)

  const lines = [
    `Requisition created for "${opening.title}".`,
    `Status: draft | ID: ${opening.id}`,
    `It now appears on the Requisitions page under "Awaiting Approval".`,
  ]
  if (!createInput.justification || createInput.justification.trim().length < 50) {
    lines.push(`Next: add a justification (at least 50 characters), then submit it for approval.`)
  } else {
    lines.push(`Next: submit it for approval when you're ready.`)
  }
  return lines.join('\n')
}

async function listRequisitions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const rows = await listOpenings(supabase, orgId, input.status ?? null)
  if (rows.length === 0) {
    return input.status
      ? `No requisitions with status "${input.status}".`
      : 'No requisitions yet.'
  }
  const lines = rows
    .slice(0, 25)
    .map(r => `• ${r.title} — ${r.status} | ID: ${r.id}`)
  const header = input.status
    ? `Requisitions (status: ${input.status}): ${rows.length}`
    : `Requisitions: ${rows.length}`
  return [header, ...lines].join('\n')
}

async function submitRequisition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
  userId?: string | null,
): Promise<string> {
  const { opening_id } = input
  if (!opening_id) return 'Error: opening_id is required.'
  if (!userId) {
    return 'Error: could not identify the acting user, so the requisition was not submitted.'
  }

  const opening = await getOpeningById(supabase, orgId, opening_id)
  if (!opening) return `Requisition not found: ${opening_id}`
  if (opening.status !== 'draft') {
    return `This requisition is already "${opening.status}" — only draft requisitions can be submitted.`
  }
  if (!opening.justification || opening.justification.trim().length < 50) {
    return 'This requisition needs a justification of at least 50 characters before it can be submitted. Add one, then submit.'
  }

  let result
  try {
    result = await submitForApproval({
      orgId,
      targetType:  'opening',
      targetId:    opening.id,
      target:      opening as unknown as Record<string, unknown>,
      requesterId: userId,
    })
  } catch (err) {
    if (err instanceof ApprovalError) {
      return `Could not submit for approval: ${err.message}`
    }
    throw err
  }

  const newStatus = result.status === 'approved' ? 'approved' : 'pending_approval'
  await supabase
    .from('openings')
    .update({ approval_id: result.approvalId, status: newStatus } as never)
    .eq('id', opening.id)
    .eq('org_id', orgId)

  if (result.status === 'approved') {
    return `Requisition "${opening.title}" was submitted and auto-approved (you were the only approver). You can now create a job from it.`
  }
  return `Requisition "${opening.title}" was submitted for approval and is now pending_approval.`
}

// ── Interview tools ───────────────────────────────────────────────────────────

async function scheduleInterview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_id, candidate_id, hiring_request_id, interviewer_name,
    interview_type, scheduled_at, duration_minutes, location, notes, generate_self_schedule } = input

  const body: Record<string, unknown> = {
    application_id, candidate_id, hiring_request_id,
    interviewer_name, interview_type: interview_type ?? 'video',
    scheduled_at, duration_minutes: duration_minutes ?? 60,
    location: location ?? null, notes: notes ?? null,
    generate_self_schedule: generate_self_schedule ?? false,
    org_id: orgId,
  }

  const { data, error } = await scheduleInterviewRow(supabase, orgId, body)

  if (error) return `Error: ${error.message}`

  // Log event
  await supabase.from('application_events').insert({
    application_id,
    org_id: orgId,
    event_type: 'interview_scheduled',
    note: `Interview scheduled with ${interviewer_name} — ${new Date(scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    metadata: { interview_id: (data as never as Record<string, unknown>).id, interview_type: interview_type ?? 'video' },
    created_by: orgId,
  } as never)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any
  let result = `Interview scheduled successfully (ID: ${d.id}).`
  if (d.self_schedule_token) {
    result += ` Self-schedule link: /schedule/${d.self_schedule_token}`
  }
  return result
}

async function getInterviews(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { data, error } = await listInterviews(supabase, orgId, {
    applicationId: input.application_id,
    candidateId: input.candidate_id,
    upcomingOnly: input.upcoming_only,
  })
  if (error) return `Error: ${error.message}`
  if (!data || data.length === 0) return 'No interviews found.'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = (data as any[]).map(iv =>
    `• ${iv.interview_type} interview — ${new Date(iv.scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} (${iv.duration_minutes}min) with ${iv.interviewer_name} [${iv.status}]${iv.location ? ' @ ' + iv.location : ''}`
  )
  return lines.join('\n')
}

async function updateInterviewStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { interview_id, status, notes } = input

  const { data, error } = await updateInterviewStatusRow(supabase, orgId, interview_id, status, notes)

  if (error) return `Error: ${error.message}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iv = data as any
  const eventMap: Record<string, string> = { completed: 'interview_completed', cancelled: 'interview_cancelled' }
  const eventType = eventMap[status]
  if (eventType) {
    await supabase.from('application_events').insert({
      application_id: iv.application_id,
      org_id: orgId,
      event_type: eventType,
      note: `Interview ${status}`,
      metadata: { interview_id },
      created_by: orgId,
    } as never)
  }

  // Cancelling here must clean up the real calendar event + notify attendees,
  // exactly like the REST cancel path — otherwise the meeting lingers on the
  // interviewer's calendar.
  if (status === 'cancelled') {
    await runInterviewCancellationSideEffects(supabase, orgId, interview_id)
  }

  return `Interview status updated to "${status}".`
}

// ── Offer tools ───────────────────────────────────────────────────────────────

async function createOffer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_id, candidate_id, hiring_request_id, position_title,
    base_salary, bonus, equity, start_date, expiry_date, notes, offer_letter_text } = input

  let data
  try {
    data = await createOfferRow(supabase, orgId, {
      applicationId: application_id,
      candidateId: candidate_id,
      hiringRequestId: hiring_request_id,
      positionTitle: position_title,
      baseSalary: base_salary,
      bonus,
      equity,
      startDate: start_date,
      expiryDate: expiry_date,
      notes,
      offerLetterText: offer_letter_text,
    })
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
  }

  await supabase.from('application_events').insert({
    application_id,
    org_id: orgId,
    event_type: 'offer_created',
    note: `Offer created — ${position_title}${base_salary ? ` · $${Number(base_salary).toLocaleString()}` : ''}`,
    metadata: { offer_id: (data as never as Record<string, unknown>).id },
    created_by: orgId,
  } as never)

  await markCandidateOfferExtended(supabase, orgId, candidate_id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return `Offer created (ID: ${(data as any).id}, status: draft). Submit for approval with update_offer_status.`
}

async function updateOfferStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { offer_id, status, approved_by, notes } = input

  const updatePayload: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (approved_by)                                       updatePayload.approved_by  = approved_by
  if (status === 'approved')                             updatePayload.approved_at  = new Date().toISOString()
  if (status === 'sent')                                 updatePayload.sent_at      = new Date().toISOString()
  if (status === 'accepted' || status === 'declined')    updatePayload.responded_at = new Date().toISOString()

  let data
  try {
    data = await updateOfferRow(supabase, orgId, offer_id, updatePayload)
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offer = data as any
  const eventMap: Record<string, string> = {
    approved: 'offer_approved', sent: 'offer_sent',
    accepted: 'offer_accepted', declined: 'offer_declined',
  }
  const eventType = eventMap[status]
  if (eventType) {
    await supabase.from('application_events').insert({
      application_id: offer.application_id,
      org_id: orgId,
      event_type: eventType,
      note: `Offer ${status}${approved_by ? ` by ${approved_by}` : ''}${notes ? ` — ${notes}` : ''}`,
      metadata: { offer_id },
      created_by: orgId,
    } as never)

    if (status === 'accepted') {
      await markCandidateHired(supabase, orgId, offer.candidate_id)
    }
  }

  return `Offer status updated to "${status}".${status === 'accepted' ? ' Candidate status set to hired.' : ''}`
}

async function getOffers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  let data
  try {
    data = await listOffers(supabase, orgId, {
      applicationId: input.application_id,
      candidateId: input.candidate_id,
      status: input.status,
    })
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
  }
  if (!data || data.length === 0) return 'No offers found.'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = (data as any[]).map(o =>
    `• ${o.position_title} — $${o.base_salary ? Number(o.base_salary).toLocaleString() : '—'}/yr${o.equity ? ' + ' + o.equity : ''} [${o.status}] (created ${new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
  )
  return lines.join('\n')
}

async function sendAssessment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_id, assessment_name, assessment_url, due_date, notes } = input

  await supabase.from('application_events').insert({
    application_id,
    org_id: orgId,
    event_type: 'assessment_sent',
    note: `Assessment sent: ${assessment_name}${assessment_url ? ` — ${assessment_url}` : ''}${due_date ? ` (due ${due_date})` : ''}${notes ? ` — ${notes}` : ''}`,
    metadata: { assessment_name, assessment_url: assessment_url ?? null, due_date: due_date ?? null },
    created_by: orgId,
  } as never)

  return `Assessment "${assessment_name}" logged and sent for application ${application_id}.${assessment_url ? ` Link: ${assessment_url}` : ''}`
}

async function createSelfScheduleInvite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_id, candidate_id, hiring_request_id, interviewer_name,
    interviewer_email, additional_interviewer_emails, interview_type, duration_minutes, expires_in_days } = input

  const { randomBytes } = await import('crypto')
  const token = randomBytes(20).toString('hex')
  const expires = new Date()
  expires.setDate(expires.getDate() + (expires_in_days ?? 7))

  // Create a placeholder interview with a future scheduled_at
  const placeholderDate = new Date()
  placeholderDate.setDate(placeholderDate.getDate() + 7)

  // Build the panel so the self-schedule page can compute real availability
  // from the interviewers' preferred hours + calendars. Without emails the link
  // still works but shows no interviewer availability.
  const emails: string[] = [
    ...(typeof interviewer_email === 'string' ? [interviewer_email] : []),
    ...(Array.isArray(additional_interviewer_emails) ? additional_interviewer_emails : []),
  ].map((e: string) => (e || '').trim()).filter(Boolean)
  const panel = emails.length
    ? emails.map((email, i) => ({ name: i === 0 ? (interviewer_name ?? '') : '', email }))
    : null

  const { data, error } = await createSelfScheduleInterview(supabase, orgId, {
    application_id, candidate_id, hiring_request_id,
    interviewer_name,
    interviewer_email: emails[0] ?? null,
    interview_type: interview_type ?? 'video',
    scheduled_at: placeholderDate.toISOString(),
    duration_minutes: duration_minutes ?? 60,
    status: 'scheduled',
    self_schedule_token: token,
    self_schedule_expires_at: expires.toISOString(),
    panel,
  } as never)

  if (error) return `Error: ${error.message}`

  await supabase.from('application_events').insert({
    application_id,
    org_id: orgId,
    event_type: 'interview_scheduled',
    note: `Self-schedule invite created — candidate can pick their own time slot`,
    metadata: { interview_id: (data as never as Record<string, unknown>).id, self_schedule_token: token },
    created_by: orgId,
  } as never)

  return `Self-schedule invite created. Share this link with the candidate: /schedule/${token} (expires in ${expires_in_days ?? 7} days)`
}

async function createInterviewerAvailabilityLink(
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const email = typeof input.interviewer_email === 'string' ? input.interviewer_email.trim() : ''
  const name  = typeof input.interviewer_name === 'string' ? input.interviewer_name.trim() : null
  const sendEmail = input.send_email === true
  if (!email) return 'Error: interviewer_email is required'

  const token = await ensureInterviewerPreferenceLink(supabase, orgId, email, name)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  const link = `${appUrl}/interviewer/${token}`

  if (sendEmail) {
    const apiKey    = process.env.SENDGRID_API_KEY
    const fromEmail = process.env.SENDGRID_FROM_EMAIL
    if (apiKey && fromEmail) {
      try {
        const sgMail = (await import('@sendgrid/mail')).default
        sgMail.setApiKey(apiKey)
        const who = name || 'there'
        await sgMail.send({
          to: email,
          from: { email: fromEmail, name: 'RecruiterStack' },
          subject: 'Set your interview availability',
          text: `Hi ${who},\n\nPlease set the days and times you're available to interview candidates. It takes a minute and no login is needed:\n\n${link}\n\nThanks!`,
          html: `<p>Hi ${who},</p><p>Please set the days and times you're available to interview candidates. It takes a minute and no login is needed:</p><p style="margin:24px 0;"><a href="${link}" style="background:#059669;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Set my availability →</a></p><p style="color:#64748b;font-size:13px;">Or paste this link: ${link}</p>`,
        })
        return `Availability link created and emailed to ${email}: ${link}`
      } catch {
        return `Availability link created (email failed to send, share it manually): ${link}`
      }
    }
    return `Availability link created (email is not configured, share it manually): ${link}`
  }

  return `Availability link for ${name || email}: ${link}`
}

// ── Employee lifecycle tools ──────────────────────────────────────────────────

async function listEmployeesTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const status = input.status as EmployeeStatus | undefined
  const employees = await listEmployees(supabase, orgId, status)
  if (employees.length === 0) {
    return status ? `No ${status} employees found.` : 'No employees found yet.'
  }

  // Resolve names from the canonical person record.
  const personIds = Array.from(new Set(employees.map(e => e.person_id)))
  const { data: people } = await supabase
    .from('people')
    .select('id, name, email')
    .in('id', personIds)
  const nameById = new Map(
    (people ?? []).map(p => [(p as { id: string }).id, p as { id: string; name: string; email: string }]),
  )

  const lines = employees.map(e => {
    const person = nameById.get(e.person_id)
    const who = person ? `${person.name} (${person.email})` : e.person_id
    const when =
      e.status === 'active' ? ` | started ${e.start_date ?? '—'}`
      : e.status === 'terminated' ? ` | left ${e.terminated_at?.slice(0, 10) ?? '—'}`
      : ` | hired ${e.hired_at?.slice(0, 10) ?? '—'}, not yet joined`
    return `• ${who} — ${e.status}${when} [employee_id: ${e.id}]`
  })

  return `${employees.length} employee(s):\n${lines.join('\n')}`
}

// Resolve an employee_profile from either an explicit id or a person's email.
async function resolveEmployee(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<EmployeeProfile | string> {
  if (input.employee_id) {
    const { data, error } = await supabase
      .from('employee_profiles')
      .select('*')
      .eq('id', input.employee_id as string)
      .eq('org_id', orgId)
      .maybeSingle()
    if (error) return `Error: ${error.message}`
    if (!data) return `No employee found with id ${input.employee_id}.`
    return data as EmployeeProfile
  }

  if (input.person_email) {
    const person = await findPersonByEmail(supabase, orgId, input.person_email as string)
    if (!person) return `No person found with email ${input.person_email}.`
    const employee = await getEmployeeByPerson(supabase, orgId, person.id)
    if (!employee) return `${person.name} has no employee record (are they marked hired?).`
    return employee
  }

  return 'Provide either employee_id or person_email.'
}

async function markEmployeeJoinedTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const resolved = await resolveEmployee(input, orgId, supabase)
  if (typeof resolved === 'string') return resolved

  if (resolved.status === 'active') {
    return `Already active — joined ${resolved.start_date ?? 'previously'}.`
  }
  if (resolved.status === 'terminated') {
    return 'Cannot mark a terminated employee as joined.'
  }

  const updated = await markEmployeeJoined(supabase, orgId, resolved.id, input.start_date ?? null)
  return `Marked employee as joined — now active, start date ${updated.start_date}. They are officially an employee.`
}

async function markEmployeeTerminatedTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const resolved = await resolveEmployee(input, orgId, supabase)
  if (typeof resolved === 'string') return resolved

  if (resolved.status === 'terminated') return 'Employee is already terminated.'

  await markEmployeeTerminated(supabase, orgId, resolved.id)
  return 'Employee marked as terminated.'
}

// ── HRIS depth: history, manager, notes ──────────────────────────────────────

function formatEventLine(e: { event_type: string; occurred_at: string; details: Record<string, unknown> | null }): string {
  const when = e.occurred_at.slice(0, 10)
  switch (e.event_type) {
    case 'hired':           return `${when} — hired (pre-hire)`
    case 'joined':          return `${when} — joined the org${(e.details?.start_date as string) ? ` (start ${e.details?.start_date})` : ''}`
    case 'manager_changed': return `${when} — manager changed`
    case 'terminated':      return `${when} — terminated`
    case 'note':            return `${when} — note: ${(e.details?.note as string) ?? ''}`
    case 'comp_changed': {
      const from = e.details?.from_salary as number | null | undefined
      const to   = e.details?.to_salary as number | undefined
      const cur  = (e.details?.currency as string) ?? ''
      const freq = (e.details?.pay_frequency as string) ?? ''
      const reason = (e.details?.reason as string) ?? ''
      const change = from != null
        ? `${cur} ${from.toLocaleString()} → ${cur} ${(to ?? 0).toLocaleString()}`
        : `set to ${cur} ${(to ?? 0).toLocaleString()}`
      return `${when} — comp changed (${change}${freq ? ` / ${freq}` : ''}${reason ? `, ${reason}` : ''})`
    }
    case 'time_off_requested':
    case 'time_off_approved':
    case 'time_off_rejected':
    case 'time_off_cancelled': {
      const type   = (e.details?.request_type as string) ?? 'time off'
      const start  = (e.details?.start_date as string) ?? ''
      const end    = (e.details?.end_date as string) ?? ''
      const range  = start === end ? start : `${start} → ${end}`
      const verb   = e.event_type.replace('time_off_', '')
      return `${when} — ${type} ${verb} (${range})`
    }
    default:                return `${when} — ${e.event_type}`
  }
}

async function getEmployeeHistoryTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const resolved = await resolveEmployee(input, orgId, supabase)
  if (typeof resolved === 'string') return resolved

  const limit  = typeof input.limit === 'number' ? input.limit : 50
  const events = await listEmployeeEvents(supabase, orgId, resolved.id, limit)
  if (events.length === 0) return 'No employment events on record yet.'

  const lines = events.map(formatEventLine)
  return `Timeline (${events.length} events):\n${lines.join('\n')}`
}

// Resolve a manager employee_profile from either an id, an email, or the
// explicit clear flag (which returns null = "no manager").
async function resolveManager(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<{ managerId: string | null } | string> {
  if (input.clear === true) return { managerId: null }

  if (input.manager_employee_id) {
    const { data, error } = await supabase
      .from('employee_profiles')
      .select('id')
      .eq('id', input.manager_employee_id as string)
      .eq('org_id', orgId)
      .maybeSingle()
    if (error) return `Error: ${error.message}`
    if (!data) return `No manager found with employee_id ${input.manager_employee_id}.`
    return { managerId: (data as { id: string }).id }
  }

  if (input.manager_email) {
    const person = await findPersonByEmail(supabase, orgId, input.manager_email as string)
    if (!person) return `No person found with email ${input.manager_email}.`
    const mgr = await getEmployeeByPerson(supabase, orgId, person.id)
    if (!mgr) return `${person.name} (${input.manager_email}) is not an employee yet.`
    return { managerId: mgr.id }
  }

  return 'Provide manager_employee_id, manager_email, or clear=true to remove the manager.'
}

async function setEmployeeManagerTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const employee = await resolveEmployee(input, orgId, supabase)
  if (typeof employee === 'string') return employee

  const mgr = await resolveManager(input, orgId, supabase)
  if (typeof mgr === 'string') return mgr

  if (mgr.managerId === employee.id) {
    return 'An employee cannot report to themselves.'
  }

  await setEmployeeManager(supabase, orgId, employee.id, mgr.managerId)
  return mgr.managerId
    ? 'Reporting line updated.'
    : 'Manager cleared (no reporting line).'
}

async function recordEmployeeNoteTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  if (!note) return 'Provide a non-empty note.'

  const resolved = await resolveEmployee(input, orgId, supabase)
  if (typeof resolved === 'string') return resolved

  await recordEmployeeNote(supabase, orgId, resolved.id, note, 'agent')
  return 'Note recorded on the employee\'s timeline.'
}

// ── Compensation tools (HRIS depth, slice 2) ─────────────────────────────────

async function getEmployeeCompensationTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const resolved = await resolveEmployee(input, orgId, supabase)
  if (typeof resolved === 'string') return resolved

  const [current, history] = await Promise.all([
    getCurrentCompensation(supabase, orgId, resolved.id),
    listCompensationHistory(supabase, orgId, resolved.id),
  ])

  if (!current) return 'No compensation records yet for this employee.'

  const lines = history.slice(0, 10).map(h => {
    const reason = h.reason ? `, ${h.reason}` : ''
    return `• ${h.effective_date} — ${formatComp(h)}${reason}`
  })
  return [
    `Current: ${formatComp(current)} (effective ${current.effective_date})`,
    history.length > 1 ? `\nHistory (${history.length} record${history.length === 1 ? '' : 's'}):` : '',
    ...lines,
  ].filter(Boolean).join('\n')
}

async function getDirectReportsTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const resolved = await resolveEmployee(input, orgId, supabase)
  if (typeof resolved === 'string') return resolved

  const reports = await listDirectReports(supabase, orgId, resolved.id)
  if (reports.length === 0) {
    return 'No direct reports.'
  }

  const personIds = Array.from(new Set(reports.map(r => r.person_id).filter((p): p is string => Boolean(p))))
  const { data: people } = await supabase
    .from('people')
    .select('id, name, email')
    .in('id', personIds)
  const byId = new Map((people ?? []).map(p => [(p as { id: string }).id, p as { id: string; name: string; email: string }]))

  const lines = reports.map(r => {
    const person = r.person_id ? byId.get(r.person_id) : null
    const who = person ? `${person.name} (${person.email})` : (r.person_id ?? r.id)
    return `• ${who} — ${r.status} [employee_id: ${r.id}]`
  })
  return `${reports.length} direct report${reports.length === 1 ? '' : 's'}:\n${lines.join('\n')}`
}

async function recordEmployeeCompensationTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const resolved = await resolveEmployee(input, orgId, supabase)
  if (typeof resolved === 'string') return resolved

  if (typeof input.effective_date !== 'string' || !input.effective_date) {
    return 'Provide effective_date (YYYY-MM-DD).'
  }
  if (typeof input.base_salary !== 'number' || !(input.base_salary > 0)) {
    return 'Provide a positive base_salary.'
  }

  const created = await recordCompensation(supabase, orgId, {
    employeeId:       resolved.id,
    effectiveDate:    input.effective_date,
    baseSalary:       input.base_salary,
    currency:         input.currency,
    payFrequency:     input.pay_frequency,
    bonusAmount:      input.bonus_amount       ?? null,
    equityNotes:      input.equity_notes       ?? null,
    variablePayNotes: input.variable_pay_notes ?? null,
    reason:           input.reason             ?? null,
    recordedBy:       'agent',
  })

  return `Compensation recorded: ${formatComp(created)} effective ${created.effective_date}. A comp_changed event was logged on the timeline.`
}

// ── Time-off tools (HRIS depth — time-off slice) ─────────────────────────────

async function requestTimeOffTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const resolved = await resolveEmployee(input, orgId, supabase)
  if (typeof resolved === 'string') return resolved

  const rt = input.request_type as TimeOffRequestType | undefined
  if (!rt) return 'Provide request_type (vacation | sick | personal | unpaid).'
  if (typeof input.start_date !== 'string' || typeof input.end_date !== 'string') {
    return 'Provide start_date and end_date (YYYY-MM-DD).'
  }

  const created = await createTimeOffRequest(supabase, orgId, {
    employeeId:  resolved.id,
    requestType: rt,
    startDate:   input.start_date,
    endDate:     input.end_date,
    hoursTotal:  input.hours_total ?? null,
    reason:      input.reason      ?? null,
  })

  const approverLine = created.approver_user_id
    ? `Awaiting approval from the employee's manager.`
    : `No manager set on the employee record — request is pending and an admin can decide it.`
  return `Time-off requested: ${rt}, ${formatTimeOffRange(created)} [request_id: ${created.id}]. ${approverLine}`
}

async function listTimeOffTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const resolved = await resolveEmployee(input, orgId, supabase)
  if (typeof resolved === 'string') return resolved

  const status = input.status as TimeOffStatus | undefined
  const requests = await listTimeOffRequests(supabase, orgId, { employeeId: resolved.id, status })
  if (requests.length === 0) {
    return status ? `No ${status} time-off requests.` : 'No time-off requests on record.'
  }

  const lines = requests.map(r => {
    const reason = r.reason ? ` — ${r.reason}` : ''
    return `• ${r.request_type} | ${formatTimeOffRange(r)} | ${r.status}${reason} [request_id: ${r.id}]`
  })
  return `${requests.length} request${requests.length === 1 ? '' : 's'}:\n${lines.join('\n')}`
}

async function decideTimeOffTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const requestId = typeof input.request_id === 'string' ? input.request_id : ''
  if (!requestId) return 'Provide request_id (from list_time_off).'

  const action = input.action as 'approve' | 'reject' | 'cancel' | undefined
  if (!action) return 'Provide action: approve | reject | cancel.'

  const note = typeof input.note === 'string' ? input.note : null
  try {
    const fn =
      action === 'approve' ? approveTimeOffRequest
      : action === 'reject' ? rejectTimeOffRequest
      :                       cancelTimeOffRequest
    const updated = await fn(supabase, orgId, requestId, { note })
    return `Time-off request ${updated.status}: ${updated.request_type}, ${formatTimeOffRange(updated)}.`
  } catch (err) {
    return err instanceof Error ? err.message : 'Failed to decide on the request.'
  }
}

// ── Onboarding tools (HRIS depth — onboarding slice) ─────────────────────────

async function listOnboardingTemplatesTool(
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const templates = await listOnboardingTemplates(supabase, orgId)
  if (templates.length === 0) return 'No active onboarding templates.'
  const lines = templates.map(t =>
    `• ${t.name}${t.is_default ? ' (default)' : ''} — ${t.description ?? 'no description'} [template_id: ${t.id}]`,
  )
  return `${templates.length} template(s):\n${lines.join('\n')}`
}

async function listOnboardingPlansTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const status = input.status as 'in_progress' | 'completed' | 'cancelled' | undefined
  const plans = await listOnboardingPlans(supabase, orgId, status)
  if (plans.length === 0) return status ? `No ${status} plans.` : 'No onboarding plans yet.'

  // Resolve employee names for context.
  const empIds = Array.from(new Set(plans.map(p => p.employee_id)))
  const { data: emps } = await supabase
    .from('employee_profiles')
    .select('id, person:people(name, email)')
    .in('id', empIds)
  const byEmp = new Map(
    (emps ?? []).map(e => {
      const row = e as unknown as { id: string; person: { name: string; email: string } | null }
      return [row.id, row.person]
    }),
  )

  const lines = plans.map(p => {
    const who = byEmp.get(p.employee_id)
    const pct = p.total_tasks > 0 ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0
    return `• ${who?.name ?? p.employee_id} (${who?.email ?? '—'}) — ${p.template_name} | ${p.status} | ${p.completed_tasks}/${p.total_tasks} (${pct}%) [plan_id: ${p.id}]`
  })
  return `${plans.length} plan(s):\n${lines.join('\n')}`
}

async function startOnboardingTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const employee = await resolveEmployee(input, orgId, supabase)
  if (typeof employee === 'string') return employee

  const templateId = typeof input.template_id === 'string' ? input.template_id : null
  if (!templateId) return 'Provide template_id (from list_onboarding_templates).'

  try {
    const { plan, tasks } = await createPlanFromTemplate(supabase, orgId, {
      employeeId: employee.id,
      templateId,
      startDate:  input.start_date ?? null,
    })
    return `Started "${plan.template_name}" for the employee — ${tasks.length} task${tasks.length === 1 ? '' : 's'} anchored to ${plan.start_date} [plan_id: ${plan.id}]. The new hire was notified.`
  } catch (err) {
    return err instanceof Error ? err.message : 'Failed to start onboarding'
  }
}

async function getEmployeeOnboardingTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const employee = await resolveEmployee(input, orgId, supabase)
  if (typeof employee === 'string') return employee

  const plan = await getActivePlanForEmployee(supabase, orgId, employee.id)
  if (!plan) return 'No active onboarding plan for this employee.'

  const tasks = await listPlanTasks(supabase, orgId, plan.id)
  const done  = tasks.filter(t => t.status === 'completed').length
  const pct   = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0
  const lines = tasks.map(t => {
    const mark = t.status === 'completed' ? '✓' : '○'
    const due  = t.due_date ? ` (due ${t.due_date})` : ''
    return `  ${mark} ${t.title} — ${t.assignee_role}${due} [task_id: ${t.id}]`
  })
  return [
    `${plan.template_name} | ${plan.status} | ${done}/${tasks.length} (${pct}%)`,
    `Anchored to ${plan.start_date}.`,
    '',
    lines.join('\n'),
  ].join('\n')
}

async function completeOnboardingTaskTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const taskId = typeof input.task_id === 'string' ? input.task_id : ''
  if (!taskId) return 'Provide task_id.'
  try {
    const updated = await completeOnboardingTask(supabase, orgId, taskId, 'agent')
    return `Marked "${updated.title}" as completed.`
  } catch (err) {
    return err instanceof Error ? err.message : 'Failed to complete task'
  }
}

// ── Document tools (read-only) ───────────────────────────────────────────────

function formatDoc(d: { title: string; category: string; url: string; expires_at: string | null; id: string }): string {
  const exp = d.expires_at ? ` · expires ${d.expires_at}` : ''
  return `• ${d.title} — ${d.category}${exp}\n  ${d.url} [doc_id: ${d.id}]`
}

async function listEmployeeDocumentsTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const employee = await resolveEmployee(input, orgId, supabase)
  if (typeof employee === 'string') return employee

  const docs = await listAllDocuments(supabase, orgId, {
    employeeId: employee.id,
    category:   input.category,
  })
  if (docs.length === 0) return 'No documents on file for this employee.'
  return `${docs.length} document(s):\n${docs.map(formatDoc).join('\n')}`
}

async function listOrgDocumentsTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const docs = await listAllDocuments(supabase, orgId, {
    employeeId: null,
    category:   input.category,
  })
  if (docs.length === 0) return 'No org-level documents on file.'
  return `${docs.length} org-level document(s):\n${docs.map(formatDoc).join('\n')}`
}

async function listExpiringDocumentsTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const days = typeof input.days_ahead === 'number' ? input.days_ahead : 30
  const docs = await listExpiringSoon(supabase, orgId, days)
  if (docs.length === 0) return `No documents expiring in the next ${days} days.`
  return `${docs.length} document(s) expiring in the next ${days} days:\n${docs.map(formatDoc).join('\n')}`
}

// Reference listVisibleForEmployee so the import isn't dropped (used for type
// inference and future "my docs" tool). Keeps the import live.
void listVisibleForEmployee

// ── Leave balance tools (read-only) ──────────────────────────────────────────

async function getEmployeeLeaveBalanceTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const employee = await resolveEmployee(input, orgId, supabase)
  if (typeof employee === 'string') return employee

  const balance = await getLeaveBalance(supabase, orgId, employee.id)
  const lines = Object.values(balance.by_type).map(b => {
    const pending = b.pending > 0 ? ` (${b.pending} pending)` : ''
    return `• ${b.leave_type}: ${b.available}/${b.granted} days available — ${b.used} used${pending}`
  })
  return `Leave balance for ${balance.year}:\n${lines.join('\n')}`
}

async function listHolidaysTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const limit = typeof input.limit === 'number' ? input.limit : 20
  const today = new Date().toISOString().slice(0, 10)
  const holidays = await listHolidays(supabase, orgId, { from: today, limit })
  if (holidays.length === 0) return 'No upcoming holidays on the calendar.'
  return `${holidays.length} upcoming holiday(s):\n${holidays.map(h => `• ${h.date} — ${h.name}${h.country ? ` (${h.country})` : ''}`).join('\n')}`
}

// ── OKR tools ────────────────────────────────────────────────────────────────

async function listEmployeeOkrsTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const employee = await resolveEmployee(input, orgId, supabase)
  if (typeof employee === 'string') return employee

  const cycle = typeof input.cycle === 'string' ? input.cycle : undefined
  const okrs = await listOkrsForEmployee(supabase, orgId, employee.id, cycle)
  if (okrs.length === 0) {
    return cycle ? `No OKRs for cycle "${cycle}".` : 'No OKRs on file.'
  }
  const lines = okrs.map(o =>
    `• [${o.cycle}] ${o.title} — ${o.status}, ${o.computed_progress}% (${o.key_result_count} KR${o.key_result_count === 1 ? '' : 's'}) [okr_id: ${o.id}]`,
  )
  return `${okrs.length} OKR(s):\n${lines.join('\n')}`
}

async function getOkrTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const okrId = typeof input.okr_id === 'string' ? input.okr_id : ''
  if (!okrId) return 'Provide okr_id.'
  const detail = await getOkrDetail(supabase, orgId, okrId)
  if (!detail) return 'OKR not found.'

  const header = `[${detail.cycle}] ${detail.title} — ${detail.status}, ${detail.computed_progress}%`
  const desc   = detail.description ? `\n${detail.description}` : ''
  const krs    = detail.key_results.length === 0
    ? '\n  (no key results yet)'
    : '\n' + detail.key_results.map(k => {
        const t = k.target_metric ? ` (${k.target_metric})` : ''
        return `  • ${k.progress}% — ${k.title}${t} [kr_id: ${k.id}]`
      }).join('\n')
  return `${header}${desc}${krs}`
}

async function createOkrTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const employee = await resolveEmployee(input, orgId, supabase)
  if (typeof employee === 'string') return employee

  if (typeof input.title !== 'string' || !input.title.trim()) return 'Provide a title.'
  if (typeof input.cycle !== 'string' || !input.cycle.trim()) return 'Provide a cycle (e.g. 2026-Q3).'

  try {
    const created = await createOkr(supabase, orgId, {
      ownerEmployeeId: employee.id,
      title:           input.title,
      description:     input.description ?? null,
      cycle:           input.cycle,
      status:          input.status,
    })
    return `Created OKR "${created.title}" for ${created.cycle}. [okr_id: ${created.id}]. Add key results with add_okr_key_result.`
  } catch (err) {
    return err instanceof Error ? err.message : 'Failed to create OKR.'
  }
}

async function addOkrKeyResultTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const okrId = typeof input.okr_id === 'string' ? input.okr_id : ''
  if (!okrId) return 'Provide okr_id.'
  if (typeof input.title !== 'string' || !input.title.trim()) return 'Provide a KR title.'

  try {
    const kr = await addOkrKr(supabase, orgId, {
      okrId,
      title:        input.title,
      description:  input.description ?? null,
      progress:     typeof input.progress === 'number' ? input.progress : undefined,
      targetMetric: input.target_metric ?? null,
    })
    return `Added KR "${kr.title}" at ${kr.progress}%. [kr_id: ${kr.id}]`
  } catch (err) {
    return err instanceof Error ? err.message : 'Failed to add KR.'
  }
}

async function updateKrProgressTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const krId = typeof input.key_result_id === 'string' ? input.key_result_id : ''
  if (!krId) return 'Provide key_result_id.'
  if (typeof input.progress !== 'number') return 'Provide progress (0–100).'

  try {
    const updated = await updateOkrKr(supabase, orgId, krId, { progress: input.progress })
    return `Progress updated to ${updated.progress}% on "${updated.title}".`
  } catch (err) {
    return err instanceof Error ? err.message : 'Failed to update KR.'
  }
}

async function updateOkrStatusTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const okrId = typeof input.okr_id === 'string' ? input.okr_id : ''
  if (!okrId) return 'Provide okr_id.'
  if (typeof input.status !== 'string') return 'Provide status.'

  try {
    const updated = await updateOkr(supabase, orgId, okrId, { status: input.status as never })
    return `OKR "${updated.title}" → ${updated.status}.`
  } catch (err) {
    return err instanceof Error ? err.message : 'Failed to update OKR status.'
  }
}

// ── CRM tools (read-only) ────────────────────────────────────────────────────

async function listSequencesTool(orgId: string, supabase: SupabaseClient): Promise<string> {
  const seqs = await listCrmSequences(supabase, orgId)
  if (seqs.length === 0) return 'No sequences yet.'
  const lines = seqs.map(s => {
    const reply = s.enrollment_count > 0
      ? ` · ${s.reply_count}/${s.enrollment_count} replied (${Math.round((s.reply_count / s.enrollment_count) * 100)}%)`
      : ''
    return `• ${s.name} — ${s.status} · ${s.stage_count} stage${s.stage_count === 1 ? '' : 's'}${reply} [sequence_id: ${s.id}]`
  })
  return `${seqs.length} sequence(s):\n${lines.join('\n')}`
}

async function getSequenceTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const seqId = typeof input.sequence_id === 'string' ? input.sequence_id : ''
  if (!seqId) return 'Provide sequence_id.'

  const seq = await getCrmSequence(supabase, orgId, seqId)
  if (!seq) return 'Sequence not found.'

  const header = `${seq.name} — ${seq.status} · ${seq.enrollment_count} enrolled, ${seq.reply_count} replied`
  const desc   = seq.description ? `\n${seq.description}` : ''
  const stages = seq.stages.length === 0
    ? '\n  (no stages yet)'
    : '\n' + seq.stages.map(s => {
        const delay = s.delay_days === 0 ? 'Day 0' : `+${s.delay_days}d`
        return `  ${s.order_index}. ${delay} — ${s.subject}`
      }).join('\n')
  return `${header}${desc}\n\nStages:${stages}`
}

async function listCandidateSequenceHistoryTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const candidateId = typeof input.candidate_id === 'string' ? input.candidate_id : ''
  if (!candidateId) return 'Provide candidate_id.'

  const history = await listCrmCandidateEnrollments(supabase, orgId, candidateId)
  if (history.length === 0) return 'This candidate has never been enrolled in a sequence.'
  const lines = history.map(h => {
    const next = h.next_send_at ? ` · next send ${h.next_send_at.slice(0, 16).replace('T', ' ')}` : ''
    return `• ${h.sequence_name} — ${h.status} · stage ${h.current_stage_index}${next} [enrollment_id: ${h.enrollment_id}]`
  })
  return `${history.length} enrollment(s):\n${lines.join('\n')}`
}

// ── Payroll (read-only) ─────────────────────────────────────────────────────

function fmtPayrollMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(0)}`
  }
}

async function listPayrollRunsTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const status = input.status === 'draft' || input.status === 'finalized' ? input.status : undefined
  const limit  = typeof input.limit === 'number' ? input.limit : 20
  const runs   = await listPayrollRuns(supabase, orgId, { status, limit })
  if (runs.length === 0) return 'No payroll runs yet.'
  const lines = runs.map(r => {
    const period = `${r.period_start} → ${r.period_end}`
    return `• ${period} — ${r.status} · ${r.totals.payslip_count} payslip(s) · gross ${fmtPayrollMoney(r.totals.gross_total, r.currency)} · net ${fmtPayrollMoney(r.totals.net_total, r.currency)} [run_id: ${r.id}]`
  })
  return `${runs.length} payroll run(s):\n${lines.join('\n')}`
}

async function getPayrollRunTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const runId = typeof input.run_id === 'string' ? input.run_id : ''
  if (!runId) return 'Provide run_id.'

  const run = await getPayrollRun(supabase, orgId, runId)
  if (!run) return 'Payroll run not found.'

  const slips = await listPayslipsForRun(supabase, orgId, runId)
  const header = `Payroll run ${run.period_start} → ${run.period_end} — ${run.status} (${run.currency})`
  const totals = `Totals: ${run.totals.payslip_count} payslip(s), gross ${fmtPayrollMoney(run.totals.gross_total, run.currency)}, deductions ${fmtPayrollMoney(run.totals.deductions_total, run.currency)}, net ${fmtPayrollMoney(run.totals.net_total, run.currency)}`
  const lines = slips.length === 0
    ? '\n  (no payslips on this run yet)'
    : '\n' + slips.map(s =>
        `  • ${s.employee_name ?? '(unknown)'} — gross ${fmtPayrollMoney(Number(s.gross), run.currency)} · net ${fmtPayrollMoney(Number(s.net), run.currency)}`,
      ).join('\n')
  return `${header}\n${totals}\n\nPayslips:${lines}`
}

async function getEmployeePayslipsTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  let employeeId = typeof input.employee_id === 'string' ? input.employee_id : ''

  if (!employeeId && typeof input.person_email === 'string') {
    const person = await findPersonByEmail(supabase, orgId, input.person_email)
    if (!person) return `No person with email ${input.person_email}.`
    const emp = await getEmployeeByPerson(supabase, orgId, person.id)
    if (!emp) return `${person.email} has no employee profile.`
    employeeId = emp.id
  }
  if (!employeeId) return 'Provide employee_id or person_email.'

  const limit = typeof input.limit === 'number' ? input.limit : 24
  const slips = await listEmployeePayslips(supabase, orgId, employeeId, limit)
  if (slips.length === 0) return 'No payslips for this employee yet.'

  const lines = slips.map(s => {
    const period = `${s.run.period_start} → ${s.run.period_end}`
    return `• ${period} — gross ${fmtPayrollMoney(Number(s.gross), s.run.currency)} · net ${fmtPayrollMoney(Number(s.net), s.run.currency)} (${s.run.status}) [payslip_id: ${s.id}]`
  })
  return `${slips.length} payslip(s):\n${lines.join('\n')}`
}
