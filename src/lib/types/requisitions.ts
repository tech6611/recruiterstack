// Requisition module types — hand-written to match the migrations 032–039.
// Keep in lockstep with the SQL schema; no auto-generation.

// ── Users & Membership ───────────────────────────────────────

export type OrgRole = 'admin' | 'recruiter' | 'hiring_manager' | 'interviewer'

export interface User {
  id: string
  clerk_user_id: string
  email: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  avatar_url: string | null
  delegate_user_id: string | null
  deactivated_at: string | null
  out_of_office_until: string | null
  created_at: string
  updated_at: string
}

export interface UserInsert extends Omit<User, 'id' | 'created_at' | 'updated_at' | 'first_name' | 'last_name' | 'full_name' | 'avatar_url' | 'delegate_user_id' | 'deactivated_at' | 'out_of_office_until'> {
  id?: string
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  avatar_url?: string | null
  delegate_user_id?: string | null
  deactivated_at?: string | null
  out_of_office_until?: string | null
  created_at?: string
  updated_at?: string
}

export interface UserUpdate extends Partial<UserInsert> {}

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  is_active: boolean
  onboarded_at: string | null
  created_at: string
  updated_at: string
}

export interface OrgMemberInsert extends Omit<OrgMember, 'id' | 'created_at' | 'updated_at' | 'is_active' | 'onboarded_at'> {
  id?: string
  is_active?: boolean
  onboarded_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface OrgMemberUpdate extends Partial<OrgMemberInsert> {}

// ── Departments & Locations ──────────────────────────────────

export interface Department {
  id: string
  org_id: string
  name: string
  slug: string | null
  parent_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DepartmentInsert extends Omit<Department, 'id' | 'created_at' | 'updated_at' | 'slug' | 'parent_id' | 'is_active'> {
  id?: string
  slug?: string | null
  parent_id?: string | null
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface DepartmentUpdate extends Partial<DepartmentInsert> {}

export type LocationRemoteType = 'onsite' | 'remote' | 'hybrid'

export interface Location {
  id: string
  org_id: string
  name: string
  city: string | null
  state: string | null
  country: string | null
  postal_code: string | null
  remote_type: LocationRemoteType
  timezone: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface LocationInsert extends Omit<Location, 'id' | 'created_at' | 'updated_at' | 'city' | 'state' | 'country' | 'postal_code' | 'timezone' | 'is_active' | 'remote_type'> {
  id?: string
  city?: string | null
  state?: string | null
  country?: string | null
  postal_code?: string | null
  timezone?: string | null
  is_active?: boolean
  remote_type?: LocationRemoteType
  created_at?: string
  updated_at?: string
}

export interface LocationUpdate extends Partial<LocationInsert> {}

// ── Compensation Bands ───────────────────────────────────────

export interface CompensationBand {
  id: string
  org_id: string
  name: string
  level: string
  department_id: string | null
  location_id: string | null
  min_salary: number
  max_salary: number
  currency: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CompensationBandInsert extends Omit<CompensationBand, 'id' | 'created_at' | 'updated_at' | 'is_active' | 'currency' | 'department_id' | 'location_id'> {
  id?: string
  is_active?: boolean
  currency?: string
  department_id?: string | null
  location_id?: string | null
  created_at?: string
  updated_at?: string
}

export interface CompensationBandUpdate extends Partial<CompensationBandInsert> {}

// ── Openings ─────────────────────────────────────────────────

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'intern' | 'temp'

export type OpeningStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'open'
  | 'filled'
  | 'closed'
  | 'archived'

export interface Opening {
  id: string
  org_id: string
  external_id: string | null
  title: string
  department_id: string | null
  location_id: string | null
  employment_type: EmploymentType
  comp_min: number | null
  comp_max: number | null
  comp_currency: string
  comp_band_id: string | null
  out_of_band: boolean
  target_start_date: string | null            // DATE as YYYY-MM-DD
  hiring_manager_id: string | null
  recruiter_id: string | null
  justification: string | null
  status: OpeningStatus
  approval_id: string | null
  custom_fields: Record<string, unknown>
  created_by: string
  created_at: string
  updated_at: string
}

export interface OpeningInsert extends Omit<Opening,
  'id' | 'created_at' | 'updated_at' | 'external_id' | 'department_id' | 'location_id' |
  'comp_min' | 'comp_max' | 'comp_band_id' | 'target_start_date' | 'hiring_manager_id' |
  'recruiter_id' | 'justification' | 'approval_id' | 'out_of_band' | 'custom_fields' |
  'comp_currency' | 'employment_type' | 'status'> {
  id?: string
  external_id?: string | null
  department_id?: string | null
  location_id?: string | null
  comp_min?: number | null
  comp_max?: number | null
  comp_band_id?: string | null
  target_start_date?: string | null
  hiring_manager_id?: string | null
  recruiter_id?: string | null
  justification?: string | null
  approval_id?: string | null
  out_of_band?: boolean
  custom_fields?: Record<string, unknown>
  comp_currency?: string
  employment_type?: EmploymentType
  status?: OpeningStatus
  created_at?: string
  updated_at?: string
}

export interface OpeningUpdate extends Partial<OpeningInsert> {}

// ── Jobs ─────────────────────────────────────────────────────

export type JobConfidentiality = 'public' | 'confidential'

export type JobStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'open'
  | 'closed'
  | 'archived'

export interface Job {
  id: string
  org_id: string
  title: string
  department_id: string | null
  description: string | null
  hiring_team_id: string | null
  interview_plan_id: string | null
  scorecard_id: string | null
  confidentiality: JobConfidentiality
  status: JobStatus
  approval_id: string | null
  custom_fields: Record<string, unknown>
  created_by: string
  created_at: string
  updated_at: string
}

export interface JobInsert extends Omit<Job,
  'id' | 'created_at' | 'updated_at' | 'department_id' | 'description' | 'hiring_team_id' |
  'interview_plan_id' | 'scorecard_id' | 'confidentiality' | 'status' | 'approval_id' |
  'custom_fields'> {
  id?: string
  department_id?: string | null
  description?: string | null
  hiring_team_id?: string | null
  interview_plan_id?: string | null
  scorecard_id?: string | null
  confidentiality?: JobConfidentiality
  status?: JobStatus
  approval_id?: string | null
  custom_fields?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export interface JobUpdate extends Partial<JobInsert> {}

// ── Job ↔ Opening link ───────────────────────────────────────

export interface JobOpening {
  job_id: string
  opening_id: string
  linked_at: string
  linked_by: string | null
}

// ── Job Postings ─────────────────────────────────────────────

export type PostingChannel = 'careers_page' | 'linkedin' | 'indeed' | 'glassdoor' | 'custom'

export interface ExternalLocation {
  city?: string | null
  state?: string | null
  country?: string | null
  remote_type?: LocationRemoteType
}

export interface JobPosting {
  id: string
  job_id: string
  title: string
  description: string | null
  location_text: string | null
  external_location: ExternalLocation | null
  application_form_id: string | null
  channel: PostingChannel
  channel_config: Record<string, unknown>
  is_live: boolean
  published_at: string | null
  unpublished_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface JobPostingInsert extends Omit<JobPosting,
  'id' | 'created_at' | 'updated_at' | 'description' | 'location_text' | 'external_location' |
  'application_form_id' | 'channel' | 'channel_config' | 'is_live' | 'published_at' | 'unpublished_at'> {
  id?: string
  description?: string | null
  location_text?: string | null
  external_location?: ExternalLocation | null
  application_form_id?: string | null
  channel?: PostingChannel
  channel_config?: Record<string, unknown>
  is_live?: boolean
  published_at?: string | null
  unpublished_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface JobPostingUpdate extends Partial<JobPostingInsert> {}

// ── Hiring Teams ─────────────────────────────────────────────

export type HiringTeamRole = 'hiring_manager' | 'recruiter' | 'recruiting_coordinator' | 'sourcer' | 'interviewer'

export interface HiringTeam {
  id: string
  org_id: string
  name: string
  job_id: string | null
  is_template: boolean
  created_at: string
  updated_at: string
}

export interface HiringTeamInsert extends Omit<HiringTeam, 'id' | 'created_at' | 'updated_at' | 'job_id' | 'is_template'> {
  id?: string
  job_id?: string | null
  is_template?: boolean
  created_at?: string
  updated_at?: string
}

export interface HiringTeamUpdate extends Partial<HiringTeamInsert> {}

export interface HiringTeamMember {
  id: string
  hiring_team_id: string
  user_id: string
  role: HiringTeamRole
  created_at: string
}

export interface HiringTeamMemberInsert extends Omit<HiringTeamMember, 'id' | 'created_at'> {
  id?: string
  created_at?: string
}

// ── Custom Field Definitions ─────────────────────────────────

export type CustomFieldObjectType = 'opening' | 'job' | 'posting'

export type CustomFieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'boolean'
  | 'user'

export interface CustomFieldOption {
  value: string
  label: string
}

export interface CustomFieldDefinition {
  id: string
  org_id: string
  object_type: CustomFieldObjectType
  field_key: string
  label: string
  field_type: CustomFieldType
  options: CustomFieldOption[] | null
  required: boolean
  order_index: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CustomFieldDefinitionInsert extends Omit<CustomFieldDefinition,
  'id' | 'created_at' | 'updated_at' | 'options' | 'required' | 'order_index' | 'is_active'> {
  id?: string
  options?: CustomFieldOption[] | null
  required?: boolean
  order_index?: number
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface CustomFieldDefinitionUpdate extends Partial<CustomFieldDefinitionInsert> {}
