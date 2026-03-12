/**
 * AI Copilot — Tool definitions and implementations
 *
 * COPILOT_TOOLS  : Anthropic tool schema array (passed to the API)
 * executeTool()  : Routes a tool call to the right Supabase query
 */

import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'
import { scoreApplicationForJob } from '@/lib/ai/job-scorer'

// ── Tool definitions ──────────────────────────────────────────────────────────

export const COPILOT_TOOLS: Anthropic.Tool[] = [
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
      'Create a new hiring request (job). Pipeline stages are auto-created. Use filled_by_recruiter=true to set up the full job immediately without sending an intake form to a hiring manager.',
    input_schema: {
      type: 'object',
      properties: {
        position_title:       { type: 'string',  description: 'Job title, e.g. "Senior Backend Engineer"' },
        hiring_manager_name:  { type: 'string',  description: 'Hiring manager\'s name (use "TBD" if unknown)' },
        location:             { type: 'string',  description: 'City / remote policy, e.g. "New York" or "Remote"' },
        headcount:            { type: 'number',  description: 'Number of hires needed (default: 1)' },
        department:           { type: 'string',  description: 'Department or team, e.g. "Engineering"' },
        level:                { type: 'string',  description: 'Seniority level, e.g. "Senior" or "L5"' },
        key_requirements:     { type: 'string',  description: 'Core requirements as free text' },
        nice_to_haves:        { type: 'string',  description: 'Nice-to-have qualifications' },
        remote_ok:            { type: 'boolean', description: 'Whether remote is acceptable (default: false)' },
      },
      required: ['position_title', 'hiring_manager_name'],
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
    name: 'request_approval',
    description:
      'Pause the workflow and ask the recruiter to approve before taking a bulk or irreversible action (sending emails, creating jobs, moving many candidates). ALWAYS call this before affecting 3+ candidates or sending any emails.',
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
    name: 'create_intake_request',
    description: 'Create a new hiring request and generate an intake form link to send to the hiring manager. Returns the intake URL for the recruiter to forward. Does NOT send the email automatically — the recruiter must share the link.',
    input_schema: {
      type: 'object',
      properties: {
        position_title:         { type: 'string', description: 'Job title for the new role' },
        hiring_manager_name:    { type: 'string', description: 'Hiring manager full name' },
        hiring_manager_email:   { type: 'string', description: 'Hiring manager email (required to generate the intake link)' },
        department:             { type: 'string', description: 'Department (optional)' },
        hiring_manager_slack:   { type: 'string', description: 'HM Slack handle e.g. @john (optional — for Slack notification)' },
      },
      required: ['position_title', 'hiring_manager_name', 'hiring_manager_email'],
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
    description: 'Generate a self-schedule link that the candidate can use to book their own interview slot. Returns the link to share with the candidate.',
    input_schema: {
      type: 'object',
      properties: {
        application_id:    { type: 'string', description: 'UUID of the application' },
        candidate_id:      { type: 'string', description: 'UUID of the candidate' },
        hiring_request_id: { type: 'string', description: 'UUID of the hiring request' },
        interviewer_name:  { type: 'string', description: 'Interviewer who will conduct the interview' },
        interview_type:    { type: 'string', enum: ['video', 'phone', 'in_person', 'panel', 'technical'], description: 'Type of interview' },
        duration_minutes:  { type: 'number', description: 'Interview duration in minutes (default: 60)' },
        expires_in_days:   { type: 'number', description: 'Days until the self-schedule link expires (default: 7)' },
      },
      required: ['application_id', 'candidate_id', 'hiring_request_id', 'interviewer_name'],
    },
  },
]

// ── Tool executor ─────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
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
      case 'create_job_and_pipeline':   return await createJobAndPipeline(input, orgId, supabase)
      case 'search_candidate_pool':     return await searchCandidatePool(input, orgId, supabase)
      case 'bulk_add_to_pipeline':      return await bulkAddToPipeline(input, orgId, supabase)
      case 'bulk_score_applications':   return await bulkScoreApplications(input, orgId, supabase)
      case 'send_outreach_email':       return await sendOutreachEmail(input, orgId, supabase)
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
      case 'create_intake_request':      return await createIntakeRequest(input, orgId, supabase)
      case 'schedule_interview':         return await scheduleInterview(input, orgId, supabase)
      case 'get_interviews':             return await getInterviews(input, orgId, supabase)
      case 'update_interview_status':    return await updateInterviewStatus(input, orgId, supabase)
      case 'create_offer':               return await createOffer(input, orgId, supabase)
      case 'update_offer_status':        return await updateOfferStatus(input, orgId, supabase)
      case 'get_offers':                 return await getOffers(input, orgId, supabase)
      case 'send_assessment':            return await sendAssessment(input, orgId, supabase)
      case 'create_self_schedule_invite': return await createSelfScheduleInvite(input, orgId, supabase)
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('candidates')
    .select('id, name, email, current_title, status, skills, experience_years, location')
    .eq('org_id', orgId)

  if (query) {
    q = q.or(`name.ilike.%${query}%,current_title.ilike.%${query}%`)
  }
  if (status) q = q.eq('status', status)

  const { data, error } = await q.order('created_at', { ascending: false }).limit(20)
  if (error) return `Error: ${error.message}`
  if (!data || data.length === 0) return `No candidates found matching "${query}"${status ? ` with status "${status}"` : ''}.`

  // Active applications per candidate
  const candidateIds = data.map((c: { id: string }) => c.id)
  const { data: apps } = await supabase
    .from('applications')
    .select('candidate_id, hiring_request:hiring_requests(position_title)')
    .in('candidate_id', candidateIds)
    .eq('org_id', orgId)
    .eq('status', 'active')

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
      `• ${c.name}`,
      c.current_title ?? 'No title',
      `${c.experience_years ?? 0}y exp`,
      `status: ${c.status}`,
      c.email,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let jobQuery: any = supabase
    .from('hiring_requests')
    .select('id, position_title, status, hiring_manager_name, department')
    .eq('org_id', orgId)

  if (job_id) {
    jobQuery = jobQuery.eq('id', job_id)
  } else if (job_title_query) {
    jobQuery = jobQuery.ilike('position_title', `%${job_title_query}%`)
  } else {
    return 'Error: provide either job_id or job_title_query'
  }

  const { data: jobs, error: jobErr } = await jobQuery.limit(5)
  if (jobErr) return `Error: ${jobErr.message}`
  if (!jobs || jobs.length === 0) return `No job found matching "${job_title_query ?? job_id}".`

  if (jobs.length > 1 && !job_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return `Multiple jobs found — be more specific or use job_id:\n${jobs.map((j: any) => `• ${j.position_title} (${j.status}) — ID: ${j.id}`).join('\n')}`
  }

  const job = jobs[0]

  const [stagesRes, appsRes] = await Promise.all([
    supabase
      .from('pipeline_stages')
      .select('id, name, order_index')
      .eq('hiring_request_id', job.id)
      .eq('org_id', orgId)
      .order('order_index'),
    supabase
      .from('applications')
      .select('id, stage_id, ai_score, candidate:candidates(name)')
      .eq('hiring_request_id', job.id)
      .eq('org_id', orgId)
      .eq('status', 'active'),
  ])

  if (stagesRes.error) return `Error fetching stages: ${stagesRes.error.message}`

  const stages = stagesRes.data ?? []
  const apps   = appsRes.data ?? []

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('hiring_requests')
    .select('id, position_title, status, hiring_manager_name, department, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (status_filter) q = q.eq('status', status_filter)

  const { data: jobs, error } = await q
  if (error) return `Error: ${error.message}`
  if (!jobs || jobs.length === 0) return 'No jobs found.'

  const jobIds = jobs.map((j: { id: string }) => j.id)
  const { data: appCounts } = await supabase
    .from('applications')
    .select('hiring_request_id')
    .in('hiring_request_id', jobIds)
    .eq('org_id', orgId)
    .eq('status', 'active')

  const countByJob: Record<string, number> = {}
  for (const app of appCounts ?? []) {
    const id = (app as { hiring_request_id: string }).hiring_request_id
    countByJob[id] = (countByJob[id] ?? 0) + 1
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = jobs.map((j: any) => {
    const count = countByJob[j.id] ?? 0
    return `• ${j.position_title}${j.department ? ` (${j.department})` : ''} | ${j.status} | HM: ${j.hiring_manager_name} | ${count} candidates | ID: ${j.id}`
  })

  return `${jobs.length} job(s):\n${lines.join('\n')}`
}

async function getDashboardStats(orgId: string, supabase: SupabaseClient): Promise<string> {
  const [jobsRes, activeRes, interviewingRes, hiredRes] = await Promise.all([
    supabase.from('hiring_requests').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('candidates').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active'),
    supabase.from('candidates').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'interviewing'),
    supabase.from('candidates').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'hired'),
  ])

  return `Recruiting overview:
• Total jobs: ${jobsRes.count ?? 0}
• Active candidates: ${activeRes.count ?? 0}
• Currently interviewing: ${interviewingRes.count ?? 0}
• Total hired: ${hiredRes.count ?? 0}`
}

async function findStaleApplications(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const days   = input.days ?? 7
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data: apps, error: appsErr } = await supabase
    .from('applications')
    .select('id, applied_at, pipeline_stages(name), hiring_request:hiring_requests(position_title), candidate:candidates(name)')
    .eq('org_id', orgId)
    .eq('status', 'active')

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('candidates')
    .select('id, name, email, phone, current_title, skills, experience_years, location, status, linkedin_url')
    .eq('org_id', orgId)

  if (candidate_id) {
    q = q.eq('id', candidate_id)
  } else if (candidate_name_query) {
    q = q.ilike('name', `%${candidate_name_query}%`)
  } else {
    return 'Error: provide either candidate_id or candidate_name_query'
  }

  const { data: candidates, error } = await q.limit(3)
  if (error) return `Error: ${error.message}`
  if (!candidates || candidates.length === 0) return `No candidate found matching "${candidate_name_query ?? candidate_id}".`

  if (candidates.length > 1) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return `Multiple candidates found — be more specific:\n${candidates.map((c: any) => `• ${c.name} | ${c.current_title ?? 'No title'} | ${c.email} | ID: ${c.id}`).join('\n')}`
  }

  const c = candidates[0]

  const { data: apps } = await supabase
    .from('applications')
    .select('id, status, applied_at, ai_score, pipeline_stages(name), hiring_request:hiring_requests(position_title, status)')
    .eq('candidate_id', c.id)
    .eq('org_id', orgId)
    .order('applied_at', { ascending: false })

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
  const { data: current, error: fetchErr } = await supabase
    .from('applications')
    .select('id, pipeline_stages(name), candidate:candidates(name), hiring_request:hiring_requests(position_title)')
    .eq('id', application_id)
    .eq('org_id', orgId)
    .single()

  if (fetchErr || !current) return `Application not found or not in your organization.`

  // Verify new stage exists in this org
  const { data: newStage, error: stageErr } = await supabase
    .from('pipeline_stages')
    .select('id, name')
    .eq('id', stage_id)
    .eq('org_id', orgId)
    .single()

  if (stageErr || !newStage) return `Stage not found in your organization.`

  const { error: updateErr } = await supabase
    .from('applications')
    .update({ stage_id } as never)
    .eq('id', application_id)
    .eq('org_id', orgId)

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

  const { data: app, error: fetchErr } = await supabase
    .from('applications')
    .select('id, candidate:candidates(name), hiring_request:hiring_requests(position_title)')
    .eq('id', application_id)
    .eq('org_id', orgId)
    .single()

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
): Promise<string> {
  const {
    position_title,
    hiring_manager_name,
    location,
    headcount = 1,
    department,
    level,
    key_requirements,
    nice_to_haves,
    remote_ok = false,
  } = input

  const { data: job, error } = await supabase
    .from('hiring_requests')
    .insert({
      position_title,
      hiring_manager_name,
      location:              location      ?? null,
      headcount,
      department:            department    ?? null,
      level:                 level         ?? null,
      key_requirements:      key_requirements ?? null,
      nice_to_haves:         nice_to_haves ?? null,
      remote_ok,
      filled_by_recruiter:   true,
      status:                'jd_approved',
      intake_token:          crypto.randomUUID(),
      apply_link_token:      crypto.randomUUID(),
      intake_submitted_at:   new Date().toISOString(),
      auto_email_rejection:  false,
      org_id:                orgId,
    } as never)
    .select('id, position_title, ticket_number')
    .single()

  if (error) return `Error creating job: ${error.message}`

  return `Created job "${job.position_title}"${job.ticket_number ? ` (${job.ticket_number})` : ''} — ID: ${job.id}. Pipeline stages are being auto-created.`
}

async function searchCandidatePool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { skills_keywords, location, min_experience, max_experience, limit = 50 } = input

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('candidates')
    .select('id, name, email, current_title, experience_years, location, skills, status')
    .eq('org_id', orgId)
    .neq('status', 'rejected')

  if (location) q = q.ilike('location', `%${location}%`)
  if (min_experience != null) q = q.gte('experience_years', min_experience)
  if (max_experience != null) q = q.lte('experience_years', max_experience)

  // Fetch 3x limit to allow for client-side skill filtering
  const { data, error } = await q.order('created_at', { ascending: false }).limit((limit as number) * 3)
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
  const { data: stages, error: stageErr } = await supabase
    .from('pipeline_stages')
    .select('id, name')
    .eq('hiring_request_id', job_id)
    .eq('org_id', orgId)
    .order('order_index')
    .limit(1)

  if (stageErr) return `Error fetching pipeline stages: ${stageErr.message}`
  const firstStage = stages?.[0] ?? null

  // Check for existing applications (skip duplicates)
  const { data: existing } = await supabase
    .from('applications')
    .select('candidate_id')
    .eq('hiring_request_id', job_id)
    .eq('org_id', orgId)
    .in('candidate_id', candidate_ids)

  const existingIds = new Set((existing ?? []).map((e: { candidate_id: string }) => e.candidate_id))
  const toAdd = (candidate_ids as string[]).filter(id => !existingIds.has(id))

  if (toAdd.length === 0) {
    return `All ${candidate_ids.length} candidates already have applications for this job — no duplicates added.`
  }

  let added = 0
  for (const candidate_id of toAdd) {
    const { data: app, error: appErr } = await supabase
      .from('applications')
      .insert({
        candidate_id,
        hiring_request_id: job_id,
        stage_id:          firstStage?.id ?? null,
        status:            'active',
        source,
        org_id:            orgId,
        applied_at:        new Date().toISOString(),
      } as never)
      .select('id')
      .single()

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

  // Fetch the hiring request (used as job context for scoring)
  const { data: job, error: jobErr } = await supabase
    .from('hiring_requests')
    .select('*')
    .eq('id', job_id)
    .eq('org_id', orgId)
    .single()

  if (jobErr || !job) return `Job not found: ${jobErr?.message ?? 'not found'}`

  // Fetch active, unscored applications with full candidate data
  const { data: apps, error: appsErr } = await supabase
    .from('applications')
    .select('id, candidate:candidates(*)')
    .eq('hiring_request_id', job_id)
    .eq('org_id', orgId)
    .eq('status', 'active')
    .is('ai_scored_at', null)

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

      await supabase
        .from('applications')
        .update({
          ai_score:          result.score,
          ai_recommendation: result.recommendation,
          ai_strengths:      result.strengths,
          ai_gaps:           result.gaps,
          ai_scored_at:      new Date().toISOString(),
        } as never)
        .eq('id', app.id as string)

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
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select('id, candidate:candidates(name, email), hiring_request:hiring_requests(position_title)')
    .eq('id', application_id)
    .eq('org_id', orgId)
    .single()

  if (appErr || !app) return 'Application not found or not in your organization.'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = app.candidate as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job       = app.hiring_request as any

  if (!candidate?.email) return 'Candidate has no email address on file.'

  // Build absolute URL for internal API call
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const res = await fetch(`${appUrl}/api/email/send`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ to: candidate.email, subject, body, from_name: recruiter_name }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.status.toString())
    return `Failed to send email to ${candidate.name}: ${errText}`
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

// ── Extended platform tools ───────────────────────────────────────────────────

async function createCandidate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { name, email, current_title, location, experience_years, skills, phone, linkedin_url } = input

  // Duplicate check
  const { data: existing } = await supabase
    .from('candidates')
    .select('id, name')
    .eq('email', email)
    .eq('org_id', orgId)
    .maybeSingle()

  if (existing) {
    return `A candidate with email ${email} already exists: ${existing.name} (ID: ${existing.id})`
  }

  const { data: candidate, error } = await supabase
    .from('candidates')
    .insert({
      name,
      email,
      current_title:    current_title    ?? null,
      location:         location         ?? null,
      experience_years: experience_years ?? 0,
      skills:           skills           ?? [],
      phone:            phone            ?? null,
      linkedin_url:     linkedin_url     ?? null,
      status:           'active',
      org_id:           orgId,
    } as never)
    .select('id, name')
    .single()

  if (error) return `Error creating candidate: ${error.message}`
  return `Created candidate ${candidate.name} (ID: ${candidate.id}).`
}

async function updateCandidateStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { candidate_id, status, reason } = input

  const { data: candidate, error: fetchErr } = await supabase
    .from('candidates')
    .select('name, status')
    .eq('id', candidate_id)
    .eq('org_id', orgId)
    .single()

  if (fetchErr || !candidate) return 'Candidate not found in your organization.'

  const { error: updateErr } = await supabase
    .from('candidates')
    .update({ status } as never)
    .eq('id', candidate_id)
    .eq('org_id', orgId)

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
    const { data: app } = await supabase
      .from('applications')
      .select('id')
      .eq('id', application_id)
      .eq('org_id', orgId)
      .single()

    if (!app) continue

    await supabase
      .from('applications')
      .update({ status } as never)
      .eq('id', application_id)
      .eq('org_id', orgId)

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

  const { data: stage, error: stageErr } = await supabase
    .from('pipeline_stages')
    .select('id, name')
    .eq('id', stage_id)
    .eq('org_id', orgId)
    .single()

  if (stageErr || !stage) return 'Stage not found in your organization.'

  let moved = 0
  for (const application_id of application_ids as string[]) {
    const { data: app } = await supabase
      .from('applications')
      .select('id, pipeline_stages(name)')
      .eq('id', application_id)
      .eq('org_id', orgId)
      .single()

    if (!app) continue

    await supabase
      .from('applications')
      .update({ stage_id } as never)
      .eq('id', application_id)

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

  const { data: apps, error } = await supabase
    .from('applications')
    .select('id, ai_score, candidate:candidates(name)')
    .eq('hiring_request_id', job_id)
    .eq('org_id', orgId)
    .eq('status', 'active')
    .not('ai_score', 'is', null)
    .lt('ai_score', below_score)

  if (error) return `Error: ${error.message}`
  if (!apps || apps.length === 0) return `No active scored applications below ${below_score} found.`

  let rejected = 0
  for (const app of apps as Record<string, unknown>[]) {
    const appId = app.id as string

    await supabase
      .from('applications')
      .update({ status: 'rejected' } as never)
      .eq('id', appId)

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

  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select('id, candidate:candidates(name), hiring_request:hiring_requests(position_title)')
    .eq('id', application_id)
    .eq('org_id', orgId)
    .single()

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
  const { job_id, status, position_title, hiring_manager_name, key_requirements, location, headcount } = input

  const { data: job, error: fetchErr } = await supabase
    .from('hiring_requests')
    .select('id, position_title, status')
    .eq('id', job_id)
    .eq('org_id', orgId)
    .single()

  if (fetchErr || !job) return 'Job not found in your organization.'

  // Build update payload only from provided fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {}
  if (status             != null) updates.status              = status
  if (position_title     != null) updates.position_title      = position_title
  if (hiring_manager_name != null) updates.hiring_manager_name = hiring_manager_name
  if (key_requirements   != null) updates.key_requirements    = key_requirements
  if (location           != null) updates.location            = location
  if (headcount          != null) updates.headcount           = headcount

  if (Object.keys(updates).length === 0) return 'No fields provided to update.'

  const { error: updateErr } = await supabase
    .from('hiring_requests')
    .update(updates as never)
    .eq('id', job_id)
    .eq('org_id', orgId)

  if (updateErr) return `Error updating job: ${updateErr.message}`

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

  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select('id, candidate:candidates(name), hiring_request:hiring_requests(position_title)')
    .eq('id', application_id)
    .eq('org_id', orgId)
    .single()

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('roles')
    .select('id, job_title, status, location, min_experience, required_skills, salary_min, salary_max, auto_advance_threshold, auto_reject_threshold, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (status) q = q.eq('status', status)

  const { data, error } = await q.limit(50)
  if (error) return `Error: ${error.message}`
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

  const { data, error } = await supabase
    .from('roles')
    .insert({
      job_title:              job_title.trim(),
      required_skills:        required_skills ?? [],
      min_experience:         min_experience  ?? 0,
      location:               location        ?? null,
      salary_min:             salary_min      ?? null,
      salary_max:             salary_max      ?? null,
      status:                 status          ?? 'active',
      auto_advance_threshold: auto_advance_threshold ?? null,
      auto_reject_threshold:  auto_reject_threshold  ?? null,
      org_id:                 orgId,
    } as never)
    .select('id, job_title, status')
    .single()

  if (error) return `Error creating role: ${error.message}`

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
  const { data: existing, error: fetchErr } = await supabase
    .from('roles')
    .select('id, job_title')
    .eq('id', role_id)
    .eq('org_id', orgId)
    .single()

  if (fetchErr || !existing) return `Role not found: ${role_id}`

  // Build update payload from provided fields only
  const allowed = ['job_title', 'required_skills', 'min_experience', 'location', 'salary_min', 'salary_max', 'status', 'auto_advance_threshold', 'auto_reject_threshold']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {}
  for (const key of allowed) {
    if (rest[key] !== undefined) updates[key] = rest[key]
  }

  if (Object.keys(updates).length === 0) return 'No fields provided to update.'

  const { error } = await supabase
    .from('roles')
    .update(updates as never)
    .eq('id', role_id)
    .eq('org_id', orgId)

  if (error) return `Error updating role: ${error.message}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const changes = Object.entries(updates).map(([k, v]) => `${k}: "${Array.isArray(v) ? v.join(', ') : v}"`).join(', ')
  return `Updated role "${(existing as any).job_title}": ${changes}.`
}

async function getRecruitingAnalytics(
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const [jobsRes, appsRes, stagesRes] = await Promise.all([
    supabase
      .from('hiring_requests')
      .select('id, position_title, department, status')
      .eq('org_id', orgId),
    supabase
      .from('applications')
      .select('id, status, source, stage_id, applied_at, hiring_request_id, candidate_id')
      .eq('org_id', orgId),
    supabase
      .from('pipeline_stages')
      .select('id, name, order_index, hiring_request_id')
      .eq('org_id', orgId)
      .order('order_index'),
  ])

  const jobs   = jobsRes.data   ?? []
  const apps   = appsRes.data   ?? []
  const stages = stagesRes.data ?? []

  const ACTIVE_JOB_STATUSES = ['active', 'jd_approved', 'jd_sent', 'jd_generated', 'posted']
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

  const [eventsRes, staleRes] = await Promise.all([
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
    supabase
      .from('applications')
      .select(`
        id, status, applied_at, stage_id,
        candidate:candidates(full_name),
        job:hiring_requests(position_title),
        stage:pipeline_stages(name)
      `)
      .eq('org_id', orgId)
      .eq('status', 'active')
      .lt('applied_at', fourteenDaysAgo)
      .order('applied_at', { ascending: true })
      .limit(20),
  ])

  const events = eventsRes.data ?? []
  const stale  = staleRes.data  ?? []

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
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select('id, candidate:candidates(full_name), job:hiring_requests(position_title)')
    .eq('id', application_id)
    .eq('org_id', orgId)
    .single()

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

  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select(`
      id, status,
      candidate:candidates(full_name, email),
      job:hiring_requests(position_title, department),
      stage:pipeline_stages(name)
    `)
    .eq('id', application_id)
    .eq('org_id', orgId)
    .single()

  if (appErr || !app) return `Application not found: ${application_id}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate  = app.candidate as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job        = app.job       as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stage      = app.stage     as any

  const firstName  = candidate?.full_name?.split(' ')[0] ?? 'there'
  const jobTitle   = job?.position_title ?? 'the position'
  const dept       = job?.department
  const stageName  = stage?.name ?? 'Applied'
  const company    = company_name   ?? 'our company'
  const recName    = recruiter_name ?? 'The Recruiting Team'
  const recTitle   = recruiter_title ?? ''

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return 'Error: ANTHROPIC_API_KEY not configured — cannot draft email.'

  const client = new Anthropic({ apiKey })
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
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages:   [{ role: 'user', content: prompt }],
    })
    const raw   = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const json  = raw.startsWith('{') ? raw : (raw.match(/\{[\s\S]*\}/)?.[0] ?? '')
    const draft = JSON.parse(json) as { subject: string; body: string }
    return `EMAIL DRAFT (${templateKey}) for ${candidate?.full_name ?? 'candidate'}:\n\nSubject: ${draft.subject}\n\n${draft.body}`
  } catch {
    return 'Error: AI email generation failed.'
  }
}

async function createIntakeRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { position_title, hiring_manager_name, hiring_manager_email, department, hiring_manager_slack } = input

  if (!position_title?.trim() || !hiring_manager_name?.trim() || !hiring_manager_email?.trim()) {
    return 'Error: position_title, hiring_manager_name, and hiring_manager_email are required.'
  }

  const { data: req, error } = await supabase
    .from('hiring_requests')
    .insert({
      position_title:        position_title.trim(),
      hiring_manager_name:   hiring_manager_name.trim(),
      hiring_manager_email:  hiring_manager_email.trim(),
      hiring_manager_slack:  hiring_manager_slack ?? null,
      department:            department ?? null,
      status:                'intake_pending',
      filled_by_recruiter:   false,
      intake_sent_at:        new Date().toISOString(),
      org_id:                orgId,
    } as never)
    .select('id, intake_token, position_title')
    .single()

  if (error) return `Error creating intake request: ${error.message}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = req as any
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL || 'https://app.recruiterstack.com'
  const intakeUrl = `${appUrl}/intake/${r.intake_token}`

  return [
    `Intake request created for "${r.position_title}" (HM: ${hiring_manager_name}).`,
    `Status: intake_pending | ID: ${r.id}`,
    ``,
    `Intake URL (share this with the hiring manager):`,
    intakeUrl,
    ``,
    `Note: Email NOT sent automatically. Copy the URL above and forward it to ${hiring_manager_email}.`,
  ].join('\n')
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

  const { data, error } = await supabase
    .from('interviews')
    .insert({ ...body, status: 'scheduled' } as never)
    .select()
    .single()

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('interviews')
    .select('*')
    .eq('org_id', orgId)

  if (input.application_id) q = q.eq('application_id', input.application_id)
  if (input.candidate_id)   q = q.eq('candidate_id', input.candidate_id)
  if (input.upcoming_only)  q = q.gte('scheduled_at', new Date().toISOString()).eq('status', 'scheduled')

  const { data, error } = await q.order('scheduled_at', { ascending: true })
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

  const { data, error } = await supabase
    .from('interviews')
    .update({ status, notes: notes ?? undefined, updated_at: new Date().toISOString() })
    .eq('id', interview_id)
    .eq('org_id', orgId)
    .select()
    .single()

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

  const { data, error } = await supabase
    .from('offers')
    .insert({
      org_id: orgId,
      application_id, candidate_id, hiring_request_id,
      position_title,
      base_salary: base_salary ?? null,
      bonus: bonus ?? null,
      equity: equity ?? null,
      start_date: start_date ?? null,
      expiry_date: expiry_date ?? null,
      notes: notes ?? null,
      offer_letter_text: offer_letter_text ?? null,
      status: 'draft',
    } as never)
    .select()
    .single()

  if (error) return `Error: ${error.message}`

  await supabase.from('application_events').insert({
    application_id,
    org_id: orgId,
    event_type: 'offer_created',
    note: `Offer created — ${position_title}${base_salary ? ` · $${Number(base_salary).toLocaleString()}` : ''}`,
    metadata: { offer_id: (data as never as Record<string, unknown>).id },
    created_by: orgId,
  } as never)

  await supabase
    .from('candidates')
    .update({ status: 'offer_extended', updated_at: new Date().toISOString() })
    .eq('id', candidate_id).eq('org_id', orgId)

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

  const { data, error } = await supabase
    .from('offers')
    .update(updatePayload)
    .eq('id', offer_id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return `Error: ${error.message}`

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
      await supabase
        .from('candidates')
        .update({ status: 'hired', updated_at: new Date().toISOString() })
        .eq('id', offer.candidate_id).eq('org_id', orgId)
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('offers')
    .select('*')
    .eq('org_id', orgId)

  if (input.application_id) q = q.eq('application_id', input.application_id)
  if (input.candidate_id)   q = q.eq('candidate_id', input.candidate_id)
  if (input.status)         q = q.eq('status', input.status)

  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) return `Error: ${error.message}`
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
    interview_type, duration_minutes, expires_in_days } = input

  const { randomBytes } = await import('crypto')
  const token = randomBytes(20).toString('hex')
  const expires = new Date()
  expires.setDate(expires.getDate() + (expires_in_days ?? 7))

  // Create a placeholder interview with a future scheduled_at
  const placeholderDate = new Date()
  placeholderDate.setDate(placeholderDate.getDate() + 7)

  const { data, error } = await supabase
    .from('interviews')
    .insert({
      org_id: orgId,
      application_id, candidate_id, hiring_request_id,
      interviewer_name,
      interview_type: interview_type ?? 'video',
      scheduled_at: placeholderDate.toISOString(),
      duration_minutes: duration_minutes ?? 60,
      status: 'scheduled',
      self_schedule_token: token,
      self_schedule_expires_at: expires.toISOString(),
    } as never)
    .select()
    .single()

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
