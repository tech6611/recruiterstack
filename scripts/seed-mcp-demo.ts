/**
 * Seed (or reset) the fake "MCP demo" data used to test the RecruiterStack MCP
 * server, and later as the reviewer demo workspace for the ChatGPT / Claude
 * directories.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/seed-mcp-demo.ts            # seed (skips if already seeded)
 *   npx tsx --tsconfig tsconfig.json scripts/seed-mcp-demo.ts --reset    # remove ONLY the demo rows, then re-seed
 *
 * Safety:
 *   - Refuses to run unless .env.local points at the DEV database (recruiterstack-dev).
 *   - Every row it creates is tagged: openings/jobs custom_fields.seed = 'mcp-demo',
 *     candidate emails end in '.mcpdemo@example.com' (reserved domain), applications
 *     source_detail = 'seed:mcp-demo'. --reset deletes only rows carrying those tags,
 *     inside the demo workspace only.
 *   - All people, companies and résumés are fictional.
 *
 * Uses the app's own domain functions (requisition → job → pipeline trigger,
 * candidate profile, application, ICP draft → approve) so the data is shaped
 * exactly as the product would create it.
 */
import { readFileSync } from 'fs'

for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}

const DEV_REF = 'pnnvjrnvknjbsfmyblox'
const ORG = process.env.MCP_DEMO_ORG_ID ?? 'org_3AezudTBXrGG7mwimkk7QQ0Eaz9' // "Coming Soon" in dev Clerk
const ACTOR_CLERK_ID = process.env.MCP_DEMO_ACTOR_CLERK_ID ?? 'user_3AezsY4iQLh75YFVcM41ZHNByLH' // tech@ (dev)
const TAG = 'mcp-demo'
const EMAIL_SUFFIX = '.mcpdemo@example.com'

type JobSpec = {
  key: string
  title: string
  location: string
  description: string
  comp: [number, number]
  mustHaves: Array<{ label: string; attribute: string; operator: string; value: string | number | string[] }>
  competencies: Array<{ id: string; name: string; weight: number; description: string; behaviours: string[] }>
}

const JOBS: JobSpec[] = [
  {
    key: 'backend',
    title: 'Backend Engineer',
    location: 'Bengaluru (hybrid)',
    comp: [2500000, 4000000],
    description:
      'Northwind Labs builds logistics software for mid-size retailers. As a Backend Engineer you will design and run the APIs and data pipelines behind our routing engine (Python/Go, PostgreSQL, AWS). You will own services end to end, from design review to on-call.',
    mustHaves: [
      { label: '3+ years building backend services', attribute: 'min_experience', operator: 'gte', value: 3 },
      { label: 'Production experience in Python or Go', attribute: 'skill', operator: 'one_of', value: ['Python', 'Go'] },
      { label: 'Based in or willing to work from Bengaluru', attribute: 'location', operator: 'equals', value: 'Bengaluru' },
    ],
    competencies: [
      { id: 'system_design', name: 'System design', weight: 30, description: 'Designs services that scale and fail safely', behaviours: ['Explains trade-offs between consistency and availability', 'Has designed an API used by other teams'] },
      { id: 'backend_coding', name: 'Backend engineering', weight: 30, description: 'Writes reliable, tested service code', behaviours: ['Ships services with tests and monitoring', 'Debugs production incidents'] },
      { id: 'data', name: 'Data and databases', weight: 20, description: 'Models data and tunes queries', behaviours: ['Designs relational schemas', 'Has tuned slow PostgreSQL queries'] },
      { id: 'ownership', name: 'Ownership', weight: 20, description: 'Takes services from idea to on-call', behaviours: ['Led a feature end to end', 'Participates in on-call'] },
    ],
  },
  {
    key: 'designer',
    title: 'Product Designer',
    location: 'Remote (India)',
    comp: [1800000, 3000000],
    description:
      'Design the dispatcher and store-manager experiences in Northwind Labs\' web and mobile apps. You will run discovery with customers, prototype in Figma, and work daily with engineers to ship.',
    mustHaves: [
      { label: '3+ years in product (UX/UI) design', attribute: 'min_experience', operator: 'gte', value: 3 },
      { label: 'Portfolio with shipped B2B or SaaS work', attribute: 'screening', operator: 'criterion', value: 'B2B/SaaS portfolio' },
    ],
    competencies: [
      { id: 'interaction', name: 'Interaction design', weight: 35, description: 'Turns complex workflows into clear flows', behaviours: ['Simplified a multi-step workflow', 'Designs for dense, data-heavy screens'] },
      { id: 'research', name: 'User research', weight: 25, description: 'Learns from customers directly', behaviours: ['Runs customer interviews', 'Uses research to change a roadmap decision'] },
      { id: 'visual', name: 'Visual craft', weight: 20, description: 'Consistent, accessible UI', behaviours: ['Contributes to a design system'] },
      { id: 'collaboration', name: 'Collaboration with engineering', weight: 20, description: 'Ships with engineers', behaviours: ['Writes clear specs', 'Reviews builds before release'] },
    ],
  },
  {
    key: 'sdr',
    title: 'Sales Development Representative',
    location: 'Mumbai',
    comp: [800000, 1400000],
    description:
      'Open new retail accounts for Northwind Labs. You will research prospects, run outbound email and phone sequences, and book qualified meetings for account executives.',
    mustHaves: [
      { label: '1+ year of B2B outbound sales', attribute: 'min_experience', operator: 'gte', value: 1 },
      { label: 'Based in Mumbai', attribute: 'location', operator: 'equals', value: 'Mumbai' },
    ],
    competencies: [
      { id: 'prospecting', name: 'Prospecting', weight: 35, description: 'Finds and researches the right accounts', behaviours: ['Builds targeted account lists', 'Personalises outreach'] },
      { id: 'communication', name: 'Communication', weight: 30, description: 'Clear, confident on phone and email', behaviours: ['Handles objections calmly'] },
      { id: 'resilience', name: 'Resilience', weight: 20, description: 'Keeps going through rejection', behaviours: ['Consistent activity through slow months'] },
      { id: 'crm', name: 'CRM discipline', weight: 15, description: 'Keeps pipeline data clean', behaviours: ['Logs every touch in the CRM'] },
    ],
  },
]

type CandSpec = {
  name: string; title: string; company: string; location: string; years: number; skills: string[]
  job: string; stage: number; source: 'applied' | 'sourced'
  history: Array<{ title: string; employer: string; start: string; end: string | null; summary: string }>
}

// stage = index into the job's pipeline stages (0 = first)
const CANDIDATES: CandSpec[] = [
  // Backend Engineer — a spread of strong, partial and weak fits
  { name: 'Aarav Mehta', title: 'Senior Backend Engineer', company: 'Kestrel Payments', location: 'Bengaluru', years: 6, skills: ['Python', 'Go', 'PostgreSQL', 'AWS', 'Kafka'], job: 'backend', stage: 3, source: 'sourced',
    history: [{ title: 'Senior Backend Engineer', employer: 'Kestrel Payments', start: '2022-03-01', end: null, summary: 'Owns the payouts API (40k req/min); led the move from a monolith to 6 Go services; on-call lead.' },
              { title: 'Backend Engineer', employer: 'Lumen Retail', start: '2019-06-01', end: '2022-02-28', summary: 'Built order and inventory services in Python/Django on PostgreSQL.' }] },
  { name: 'Ishita Rao', title: 'Backend Engineer', company: 'Fernway Logistics', location: 'Bengaluru', years: 4, skills: ['Go', 'PostgreSQL', 'gRPC', 'Kubernetes'], job: 'backend', stage: 2, source: 'applied',
    history: [{ title: 'Backend Engineer', employer: 'Fernway Logistics', start: '2021-01-01', end: null, summary: 'Wrote the route-planning service in Go; cut p95 latency 45% by reworking PostgreSQL indexes.' }] },
  { name: 'Rohan Kulkarni', title: 'Software Engineer II', company: 'Brightdesk', location: 'Pune', years: 3, skills: ['Python', 'FastAPI', 'MySQL', 'Redis'], job: 'backend', stage: 1, source: 'applied',
    history: [{ title: 'Software Engineer II', employer: 'Brightdesk', start: '2022-07-01', end: null, summary: 'Builds REST APIs for a helpdesk product; open to relocating to Bengaluru.' }] },
  { name: 'Neha Joshi', title: 'Staff Engineer', company: 'Quarry Analytics', location: 'Bengaluru', years: 10, skills: ['Java', 'Scala', 'Spark', 'PostgreSQL', 'System design'], job: 'backend', stage: 1, source: 'sourced',
    history: [{ title: 'Staff Engineer', employer: 'Quarry Analytics', start: '2018-04-01', end: null, summary: 'Architect for the data platform (Spark/Scala). No production Python or Go.' }] },
  { name: 'Vikram Singh', title: 'Backend Developer', company: 'Tinyloop', location: 'Bengaluru', years: 2, skills: ['Node.js', 'MongoDB', 'Express'], job: 'backend', stage: 0, source: 'applied',
    history: [{ title: 'Backend Developer', employer: 'Tinyloop', start: '2023-08-01', end: null, summary: 'Node.js APIs for a consumer app.' }] },
  { name: 'Priya Nair', title: 'Platform Engineer', company: 'Cobalt Cloud', location: 'Bengaluru', years: 5, skills: ['Go', 'Terraform', 'AWS', 'PostgreSQL'], job: 'backend', stage: 0, source: 'sourced',
    history: [{ title: 'Platform Engineer', employer: 'Cobalt Cloud', start: '2020-05-01', end: null, summary: 'Builds internal Go tooling and owns the PostgreSQL fleet; part of the on-call rotation.' }] },
  { name: 'Karan Malhotra', title: 'Backend Engineer', company: 'Saffron Foods', location: 'Hyderabad', years: 4, skills: ['Python', 'Django', 'PostgreSQL', 'Celery'], job: 'backend', stage: 0, source: 'applied',
    history: [{ title: 'Backend Engineer', employer: 'Saffron Foods', start: '2021-02-01', end: null, summary: 'Order management backend in Django; not open to relocating.' }] },
  { name: 'Ananya Iyer', title: 'Software Engineer', company: 'Fernway Logistics', location: 'Bengaluru', years: 3, skills: ['Python', 'Go', 'PostgreSQL'], job: 'backend', stage: 2, source: 'sourced',
    history: [{ title: 'Software Engineer', employer: 'Fernway Logistics', start: '2022-01-01', end: null, summary: 'Ships fleet-tracking services in Python and Go; wrote the team\'s load-testing harness.' }] },

  // Product Designer
  { name: 'Meera Pillai', title: 'Senior Product Designer', company: 'Ledgerly', location: 'Kochi', years: 7, skills: ['Figma', 'User research', 'Design systems', 'Prototyping'], job: 'designer', stage: 3, source: 'sourced',
    history: [{ title: 'Senior Product Designer', employer: 'Ledgerly', start: '2020-09-01', end: null, summary: 'Redesigned invoicing for SMB accountants (B2B SaaS); runs monthly customer interviews.' }] },
  { name: 'Arjun Desai', title: 'Product Designer', company: 'Quickcart', location: 'Ahmedabad', years: 4, skills: ['Figma', 'Mobile design', 'Usability testing'], job: 'designer', stage: 2, source: 'applied',
    history: [{ title: 'Product Designer', employer: 'Quickcart', start: '2021-03-01', end: null, summary: 'Consumer grocery app checkout and search; limited B2B work.' }] },
  { name: 'Sana Sheikh', title: 'UX Designer', company: 'Opsgrid', location: 'Remote', years: 3, skills: ['Figma', 'Dashboards', 'Design systems'], job: 'designer', stage: 1, source: 'applied',
    history: [{ title: 'UX Designer', employer: 'Opsgrid', start: '2022-06-01', end: null, summary: 'Designs data-heavy monitoring dashboards for IT teams (B2B SaaS).' }] },
  { name: 'Tanvi Kapoor', title: 'Visual Designer', company: 'Studio Marigold', location: 'Delhi', years: 2, skills: ['Illustrator', 'Branding', 'Figma'], job: 'designer', stage: 0, source: 'applied',
    history: [{ title: 'Visual Designer', employer: 'Studio Marigold', start: '2023-01-01', end: null, summary: 'Brand and marketing design for agency clients.' }] },
  { name: 'Dev Bhatia', title: 'Product Designer', company: 'Fieldnote', location: 'Bengaluru', years: 5, skills: ['Figma', 'User research', 'Workflow design'], job: 'designer', stage: 1, source: 'sourced',
    history: [{ title: 'Product Designer', employer: 'Fieldnote', start: '2019-11-01', end: null, summary: 'Field-service scheduling product for enterprise customers; shipped the dispatcher console.' }] },
  { name: 'Riya Sen', title: 'Junior UX Designer', company: 'Pixelpath', location: 'Kolkata', years: 1, skills: ['Figma', 'Wireframing'], job: 'designer', stage: 0, source: 'applied',
    history: [{ title: 'Junior UX Designer', employer: 'Pixelpath', start: '2024-05-01', end: null, summary: 'Wireframes for client websites.' }] },

  // Sales Development Representative
  { name: 'Aditya Rane', title: 'Sales Development Representative', company: 'Stackpay', location: 'Mumbai', years: 2, skills: ['Outbound', 'Cold calling', 'HubSpot', 'Sequencing'], job: 'sdr', stage: 2, source: 'sourced',
    history: [{ title: 'SDR', employer: 'Stackpay', start: '2023-02-01', end: null, summary: 'Books 18-22 qualified meetings/month selling payments software to retailers.' }] },
  { name: 'Pooja Shetty', title: 'Inside Sales Executive', company: 'Brightdesk', location: 'Mumbai', years: 3, skills: ['Inbound sales', 'Salesforce', 'Demos'], job: 'sdr', stage: 1, source: 'applied',
    history: [{ title: 'Inside Sales Executive', employer: 'Brightdesk', start: '2021-10-01', end: null, summary: 'Mostly inbound lead qualification and demos; some outbound.' }] },
  { name: 'Farhan Qureshi', title: 'Business Development Associate', company: 'Kiranaplus', location: 'Mumbai', years: 1, skills: ['Field sales', 'Cold calling'], job: 'sdr', stage: 0, source: 'applied',
    history: [{ title: 'Business Development Associate', employer: 'Kiranaplus', start: '2024-03-01', end: null, summary: 'Signs up neighbourhood stores in person and by phone.' }] },
  { name: 'Sneha Patil', title: 'SDR', company: 'Cobalt Cloud', location: 'Pune', years: 2, skills: ['Outbound', 'LinkedIn Sales Navigator', 'Salesforce'], job: 'sdr', stage: 0, source: 'sourced',
    history: [{ title: 'SDR', employer: 'Cobalt Cloud', start: '2023-04-01', end: null, summary: 'Outbound to mid-market IT buyers; willing to move to Mumbai.' }] },
  { name: 'Rahul Verma', title: 'Customer Support Lead', company: 'Quickcart', location: 'Mumbai', years: 4, skills: ['Customer support', 'Zendesk'], job: 'sdr', stage: 0, source: 'applied',
    history: [{ title: 'Customer Support Lead', employer: 'Quickcart', start: '2020-08-01', end: null, summary: 'Leads a 6-person support team; wants to move into sales.' }] },
  // One candidate in two pipelines
  { name: 'Ishaan Gupta', title: 'Full-stack Engineer', company: 'Opsgrid', location: 'Bengaluru', years: 4, skills: ['Python', 'React', 'PostgreSQL', 'Figma'], job: 'backend', stage: 0, source: 'applied',
    history: [{ title: 'Full-stack Engineer', employer: 'Opsgrid', start: '2021-05-01', end: null, summary: 'Python APIs plus React front ends for dashboards; prototypes in Figma.' }] },
]

function emailFor(name: string) {
  return name.toLowerCase().replace(/[^a-z]+/g, '.') + EMAIL_SUFFIX
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (!url.includes(DEV_REF)) throw new Error(`Refusing to run: .env.local does not point at the dev database (${DEV_REF}).`)

  const { createAdminClient } = await import('../src/lib/supabase/server')
  const { createCanonicalJobFromApprovedOpening, listJobStages } = await import('../src/modules/ats/domain/job-pipelines')
  const { createCandidateProfile } = await import('../src/modules/ats/domain/candidates')
  const { createApplication } = await import('../src/modules/ats/domain/applications')
  const { createIcpDraft, approveIcp } = await import('../src/modules/ats/domain/icp')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any

  const { data: actor } = await sb.from('users').select('id').eq('clerk_user_id', ACTOR_CLERK_ID).maybeSingle()
  if (!actor) throw new Error('Demo actor user not found in dev DB — run scripts/backfill-clerk.ts first.')
  const actorId = actor.id as string

  if (process.argv.includes('--reset')) await reset(sb)

  const { data: existing } = await sb.from('jobs').select('id').eq('org_id', ORG).eq('custom_fields->>seed', TAG)
  if ((existing ?? []).length) { console.log(`Already seeded (${existing.length} demo jobs). Use --reset to rebuild.`); return }

  // Workspace display name (only if the workspace has none yet)
  const { data: settings } = await sb.from('org_settings').select('org_id, company_name').eq('org_id', ORG).maybeSingle()
  if (!settings) await sb.from('org_settings').insert({ org_id: ORG, company_name: 'Northwind Labs (demo)' })
  else if (!settings.company_name) await sb.from('org_settings').update({ company_name: 'Northwind Labs (demo)' }).eq('org_id', ORG)

  const jobIds: Record<string, string> = {}
  const stagesByJob: Record<string, Array<{ id: string; name: string }>> = {}

  for (const spec of JOBS) {
    // Requisition (approved) → job, exactly like the product's "job must come from an approved requisition" rule
    const { data: opening, error: oErr } = await sb.from('openings').insert({
      org_id: ORG, title: spec.title, status: 'approved', created_by: actorId,
      comp_min: spec.comp[0], comp_max: spec.comp[1], comp_currency: 'INR',
      custom_fields: { seed: TAG },
    }).select('id').single()
    if (oErr) throw oErr

    const job = await createCanonicalJobFromApprovedOpening(sb, ORG, opening.id, {
      title: spec.title, department_id: null, description: spec.description,
      custom_fields: { seed: TAG, intake: { location: spec.location } },
    }, actorId)
    await sb.from('jobs').update({ status: 'open' }).eq('id', job.id).eq('org_id', ORG)
    jobIds[spec.key] = job.id
    // Hiring stages only (Applied=0, Screening=1, …). Negative order_index stages are the
    // sourcing-outreach zone (New lead / Reached out / Replied) and are skipped here.
    stagesByJob[spec.key] = (await listJobStages(sb, ORG, job.id)).filter((s) => s.order_index >= 0)

    // Approved ideal-candidate profile (ICP), so ranking works
    const icp = await createIcpDraft(sb, ORG, job.id, {
      source: 'manual',
      must_haves: spec.mustHaves.map((m, i) => ({ id: `${spec.key}_mh_${i + 1}`, ...m, enforcement: 'hard' as const })),
      competencies: spec.competencies,
    }, { createdBy: actorId })
    await approveIcp(sb, ORG, icp.id, actorId)
    console.log(`job: ${spec.title} (${stagesByJob[spec.key].length} stages, ICP approved)`)
  }

  let apps = 0
  for (const c of CANDIDATES) {
    const cand = await createCandidateProfile(sb, ORG, {
      name: c.name, email: emailFor(c.name), current_title: c.title, current_company: c.company,
      location: c.location, skills: c.skills, experience_years: c.years,
    })
    await sb.from('candidate_experiences').insert(c.history.map((h, i) => ({
      org_id: ORG, candidate_id: cand.id, title: h.title, employer: h.employer,
      start_date: h.start, end_date: h.end, is_current: h.end === null, summary: h.summary, sort_order: i,
    })))
    const stages = stagesByJob[c.job]
    const stage = stages[Math.min(c.stage, stages.length - 1)]
    await createApplication(sb, {
      orgId: ORG, candidateId: cand.id, jobId: jobIds[c.job], stageId: stage.id,
      source: c.source, sourceDetail: `seed:${TAG}`,
    } as never)
    apps++
    // Ishaan also applied to the designer role
    if (c.name === 'Ishaan Gupta') {
      await createApplication(sb, { orgId: ORG, candidateId: cand.id, jobId: jobIds.designer, stageId: stagesByJob.designer[0].id, source: 'applied', sourceDetail: `seed:${TAG}` } as never)
      apps++
    }
  }
  console.log(`candidates: ${CANDIDATES.length}, applications: ${apps}`)
}

// Remove ONLY rows this script created (by tag), inside the demo workspace only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function reset(sb: any) {
  const { data: jobs } = await sb.from('jobs').select('id').eq('org_id', ORG).eq('custom_fields->>seed', TAG)
  const jobIds = (jobs ?? []).map((j: { id: string }) => j.id)
  const { data: cands } = await sb.from('candidates').select('id, person_id').eq('org_id', ORG).like('email', `%${EMAIL_SUFFIX}`)
  const candIds = (cands ?? []).map((c: { id: string }) => c.id)
  const personIds = (cands ?? []).map((c: { person_id: string }) => c.person_id).filter(Boolean)
  const del = async (table: string, col: string, ids: string[]) => {
    if (!ids.length) return
    const { error } = await sb.from(table).delete().eq('org_id', ORG).in(col, ids)
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  await del('applications', 'job_id', jobIds)
  await del('applications', 'candidate_id', candIds)
  await del('candidate_experiences', 'candidate_id', candIds)
  await del('icps', 'job_id', jobIds)
  await del('pipeline_stages', 'job_id', jobIds)
  if (jobIds.length) await sb.from('job_openings').delete().in('job_id', jobIds)
  await del('jobs', 'id', jobIds)
  await sb.from('openings').delete().eq('org_id', ORG).eq('custom_fields->>seed', TAG)
  await del('candidates', 'id', candIds)
  await del('people', 'id', personIds)
  console.log(`reset: removed ${jobIds.length} demo jobs and ${candIds.length} demo candidates`)
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
