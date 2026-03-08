/**
 * RecruiterStack — sample data seed
 * Run: npx tsx scripts/seed.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Parse .env.local manually (no dotenv dependency needed)
const envPath = resolve(process.cwd(), '.env.local')
const envLines = readFileSync(envPath, 'utf-8').split('\n')
for (const line of envLines) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── 1. JOBS ──────────────────────────────────────────────────────────────────

const jobs = [
  {
    position_title: 'Senior Backend Engineer',
    department: 'Engineering',
    hiring_manager_name: 'Priya Sharma',
    hiring_manager_email: 'priya.sharma@company.com',
    level: 'Senior',
    location: 'Bangalore / Remote',
    remote_ok: true,
    headcount: 2,
    status: 'jd_approved',
    key_requirements: '5+ years Go or Java, distributed systems, PostgreSQL, Kafka, microservices architecture. Prior experience in a FinTech or payments domain preferred.',
    nice_to_haves: 'Open-source contributions, experience with gRPC, knowledge of PCI-DSS compliance.',
    budget_min: 2800000, budget_max: 4000000,
    team_context: 'Core payments infrastructure team handling ₹1B+ daily transaction volume.',
    target_start_date: '2026-05-01',
  },
  {
    position_title: 'Machine Learning Engineer',
    department: 'Data & AI',
    hiring_manager_name: 'David Kim',
    hiring_manager_email: 'david.kim@company.com',
    level: 'Mid',
    location: 'Hyderabad',
    remote_ok: false,
    headcount: 1,
    status: 'posted',
    key_requirements: '3+ years Python, PyTorch or TensorFlow, MLflow or similar experiment tracking, production model serving (Triton/TorchServe). Strong understanding of NLP pipelines.',
    nice_to_haves: 'LLM fine-tuning experience, Hugging Face, RLHF, vector databases (Pinecone/Weaviate).',
    budget_min: 2200000, budget_max: 3200000,
    team_context: 'Building the next-gen AI-powered search and recommendation layer for our e-commerce platform.',
    target_start_date: '2026-04-15',
  },
  {
    position_title: 'Group Product Manager – Checkout & Payments',
    department: 'Product',
    hiring_manager_name: 'Ananya Krishnan',
    hiring_manager_email: 'ananya.k@company.com',
    level: 'Lead',
    location: 'Mumbai',
    remote_ok: true,
    headcount: 1,
    status: 'jd_approved',
    key_requirements: '7+ years in product, 3+ years in a PM leadership role. Deep domain expertise in checkout UX, payment flows, fraud, and conversion optimisation. Exceptional data literacy.',
    nice_to_haves: 'Experience scaling checkout in India\'s UPI / BNPL ecosystem, familiarity with A/B testing platforms.',
    budget_min: 4500000, budget_max: 6500000,
    team_context: 'Responsible for the end-to-end checkout funnel serving 50M+ monthly active users.',
    target_start_date: '2026-06-01',
  },
  {
    position_title: 'Data Engineer – Healthcare Analytics',
    department: 'Data & AI',
    hiring_manager_name: 'Sarah Mitchell',
    hiring_manager_email: 'sarah.mitchell@company.com',
    level: 'Mid',
    location: 'Pune / Remote',
    remote_ok: true,
    headcount: 2,
    status: 'posted',
    key_requirements: '4+ years building data pipelines (Airflow, dbt, Spark), experience with healthcare data standards (HL7, FHIR). Proficient in Python and SQL. Cloud data warehouse expertise (Snowflake or BigQuery).',
    nice_to_haves: 'HIPAA compliance knowledge, experience with real-time streaming (Kafka/Kinesis), prior work in clinical or pharma data.',
    budget_min: 1800000, budget_max: 2600000,
    team_context: 'Building the data platform that powers clinical decision support for 200+ hospitals.',
    target_start_date: '2026-04-01',
  },
  {
    position_title: 'Staff DevOps / Platform Engineer',
    department: 'Infrastructure',
    hiring_manager_name: 'Marcus Thompson',
    hiring_manager_email: 'marcus.t@company.com',
    level: 'Staff',
    location: 'Remote (India)',
    remote_ok: true,
    headcount: 1,
    status: 'jd_approved',
    key_requirements: '8+ years in infrastructure and platform engineering. Expert in Kubernetes, Terraform, ArgoCD. Multi-cloud (AWS + GCP). Experience building internal developer platforms (IDP) with Backstage or similar.',
    nice_to_haves: 'eBPF, Cilium, platform-as-a-product mindset, experience with chaos engineering.',
    budget_min: 4000000, budget_max: 5500000,
    team_context: 'Own the reliability and developer experience platform serving 300+ engineers.',
    target_start_date: '2026-05-15',
  },
  {
    position_title: 'VP of Growth Marketing',
    department: 'Marketing',
    hiring_manager_name: 'Rohini Gupta',
    hiring_manager_email: 'rohini.g@company.com',
    level: 'VP',
    location: 'Delhi NCR',
    remote_ok: false,
    headcount: 1,
    status: 'intake_submitted',
    key_requirements: '10+ years in digital marketing, 3+ years in a VP or Director role. Proven track record of scaling B2C user acquisition across paid, organic, and CRM channels. Analytical leader with P&L accountability.',
    nice_to_haves: 'SaaS or marketplace growth experience, familiarity with product-led growth, network in Indian digital marketing community.',
    budget_min: 6000000, budget_max: 9000000,
    team_context: 'Build and lead a 20-person growth team responsible for top-of-funnel and lifecycle marketing.',
    target_start_date: '2026-07-01',
  },
  {
    position_title: 'Enterprise Account Executive – Cloud Infrastructure',
    department: 'Sales',
    hiring_manager_name: 'James O\'Brien',
    hiring_manager_email: 'james.obrien@company.com',
    level: 'Senior',
    location: 'Bangalore',
    remote_ok: false,
    headcount: 3,
    status: 'posted',
    key_requirements: '5+ years enterprise SaaS or cloud infrastructure sales. Consistent track record of exceeding ₹5Cr+ ARR quota. Experience selling to CTO/CIO level in BFSI and manufacturing verticals. MEDDIC or SPICED methodology.',
    nice_to_haves: 'Existing CISO/CTO network in BFSI, prior experience with AWS/GCP/Azure partner ecosystem.',
    budget_min: 2500000, budget_max: 4000000,
    team_context: 'Strategic accounts team targeting Fortune 500 India with ACV > $500K.',
    target_start_date: '2026-04-01',
  },
  {
    position_title: 'Director of Finance & Financial Planning',
    department: 'Finance',
    hiring_manager_name: 'Kavitha Nair',
    hiring_manager_email: 'kavitha.nair@company.com',
    level: 'Director',
    location: 'Mumbai',
    remote_ok: false,
    headcount: 1,
    status: 'jd_approved',
    key_requirements: 'CA or CFA with 8+ years in FP&A or finance leadership. Experience at a Series B+ startup or high-growth company. Strong modelling skills, fundraising support, board reporting experience.',
    nice_to_haves: 'Prior IPO or ESOP management experience, familiarity with Indian GAAP and Ind-AS, exposure to international entities.',
    budget_min: 4500000, budget_max: 7000000,
    team_context: 'Own financial planning, investor relations support, and controllership for a 500-person company.',
    target_start_date: '2026-05-01',
  },
  {
    position_title: 'Head of People & Culture',
    department: 'Human Resources',
    hiring_manager_name: 'Neha Joshi',
    hiring_manager_email: 'neha.joshi@company.com',
    level: 'Head',
    location: 'Bangalore',
    remote_ok: true,
    headcount: 1,
    status: 'jd_approved',
    key_requirements: '10+ years in HR, 3+ years in a CHRO or Head of People role. Experience scaling culture and talent in a high-growth tech company (100→500+ employees). Strong employer branding, DEI, and performance management expertise.',
    nice_to_haves: 'HR tech stack experience (Darwinbox, Leapsome), coaching certification, experience with remote-first culture.',
    budget_min: 5500000, budget_max: 8000000,
    team_context: 'Build the people strategy for our Series C growth phase — from 300 to 700 employees in 18 months.',
    target_start_date: '2026-06-01',
  },
  {
    position_title: 'Senior UX Designer – Mobile App',
    department: 'Design',
    hiring_manager_name: 'Arjun Mehta',
    hiring_manager_email: 'arjun.mehta@company.com',
    level: 'Senior',
    location: 'Remote (India)',
    remote_ok: true,
    headcount: 2,
    status: 'posted',
    key_requirements: '5+ years UX/product design, strong portfolio of end-to-end mobile app designs. Expert in Figma, deep understanding of iOS and Android design systems. Experience running user research and usability testing.',
    nice_to_haves: 'Interaction design or motion design skills, prior experience in consumer fintech or e-commerce, basic prototyping with Framer.',
    budget_min: 2200000, budget_max: 3500000,
    team_context: 'Design the next generation of our consumer mobile app with 10M+ active users.',
    target_start_date: '2026-04-15',
  },
  {
    position_title: 'Senior Legal Counsel – Technology & Privacy',
    department: 'Legal',
    hiring_manager_name: 'Rekha Iyer',
    hiring_manager_email: 'rekha.iyer@company.com',
    level: 'Senior',
    location: 'Bangalore / Mumbai',
    remote_ok: true,
    headcount: 1,
    status: 'intake_submitted',
    key_requirements: 'LLB/LLM from a top Indian law school, 7+ years experience with a focus on technology law, data privacy (PDPB/GDPR), commercial contracts, and regulatory compliance. In-house tech company experience strongly preferred.',
    nice_to_haves: 'Prior experience with SEBI regulations, cross-border M&A, IP and open-source licensing.',
    budget_min: 4000000, budget_max: 6000000,
    team_context: 'First senior legal hire reporting directly to the General Counsel.',
    target_start_date: '2026-06-15',
  },
  {
    position_title: 'Director of Customer Success',
    department: 'Customer Success',
    hiring_manager_name: 'Lisa Park',
    hiring_manager_email: 'lisa.park@company.com',
    level: 'Director',
    location: 'Remote (India)',
    remote_ok: true,
    headcount: 1,
    status: 'jd_approved',
    key_requirements: '8+ years in customer success or account management, 3+ years leading a CS team in B2B SaaS. Track record of improving NRR >110%, GRR >90%. Experience building QBR frameworks and success metrics dashboards.',
    nice_to_haves: 'Experience with Gainsight or ChurnZero, CS in HR-Tech or FinTech, CSM certification.',
    budget_min: 3500000, budget_max: 5500000,
    team_context: 'Lead a 15-person CS team managing a $12M ARR book of business across 400+ enterprise clients.',
    target_start_date: '2026-05-01',
  },
  {
    position_title: 'Information Security Manager',
    department: 'Security',
    hiring_manager_name: 'Vikram Singh',
    hiring_manager_email: 'vikram.singh@company.com',
    level: 'Manager',
    location: 'Bangalore',
    remote_ok: false,
    headcount: 1,
    status: 'posted',
    key_requirements: '7+ years in information security, CISSP or CISM certified. Experience building and running a SOC, conducting penetration testing oversight, managing ISO 27001 and SOC 2 Type II compliance programmes.',
    nice_to_haves: 'Cloud security (AWS Security Hub, GCP Security Command Center), DevSecOps, prior experience with RBI or SEBI cybersecurity frameworks.',
    budget_min: 3200000, budget_max: 4800000,
    team_context: 'Build and lead the information security function from the ground up — define policies, tools, and team structure.',
    target_start_date: '2026-05-01',
  },
  {
    position_title: 'Supply Chain & Operations Lead',
    department: 'Operations',
    hiring_manager_name: 'Tanvir Ahmed',
    hiring_manager_email: 'tanvir.ahmed@company.com',
    level: 'Lead',
    location: 'Chennai',
    remote_ok: false,
    headcount: 1,
    status: 'jd_approved',
    key_requirements: '6+ years in supply chain management or logistics operations. Experience with demand forecasting, inventory optimisation, and 3PL vendor management at scale. Data-driven decision maker with strong SQL skills.',
    nice_to_haves: 'Experience with SAP/ERP systems, lean/six sigma certification, prior work in D2C or quick commerce (q-commerce).',
    budget_min: 2800000, budget_max: 4200000,
    team_context: 'Own the end-to-end supply chain for a fast-growing D2C brand doing 10K+ orders/day.',
    target_start_date: '2026-04-15',
  },
  {
    position_title: 'Clinical Research Associate – Oncology',
    department: 'Clinical',
    hiring_manager_name: 'Dr. Sunita Rao',
    hiring_manager_email: 'sunita.rao@company.com',
    level: 'Mid',
    location: 'Hyderabad',
    remote_ok: false,
    headcount: 2,
    status: 'posted',
    key_requirements: 'B.Pharma / M.Sc Life Sciences with 3+ years as a CRA in Phase II/III oncology trials. ICH-GCP certified. Experience with regulatory submissions (CDSCO, FDA). Proficient with eClinical trial management systems (Medidata, Veeva).',
    nice_to_haves: 'Experience with ADC (antibody-drug conjugate) trials, knowledge of RECIST criteria, biomarker analysis experience.',
    budget_min: 1200000, budget_max: 1800000,
    team_context: 'Join a team running 4 active Phase III oncology trials across 30+ sites in India.',
    target_start_date: '2026-04-01',
  },
]

// ── 2. CANDIDATES ─────────────────────────────────────────────────────────────

const candidates = [
  // Engineering
  {
    name: 'Rohan Verma',
    email: 'rohan.verma@gmail.com',
    phone: '+91-98765-43210',
    current_title: 'Senior Software Engineer',
    location: 'Bangalore',
    experience_years: 6,
    skills: ['Go', 'Java', 'PostgreSQL', 'Kafka', 'Kubernetes', 'Redis', 'gRPC', 'Microservices'],
    status: 'active' as const,
  },
  {
    name: 'Aditi Bose',
    email: 'aditi.bose@outlook.com',
    phone: '+91-91234-56789',
    current_title: 'Backend Engineer',
    location: 'Hyderabad',
    experience_years: 4,
    skills: ['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'AWS', 'Redis', 'Celery'],
    status: 'active' as const,
  },
  {
    name: 'Wei Zhang',
    email: 'wei.zhang@gmail.com',
    phone: '+91-99887-76655',
    current_title: 'Staff Engineer – Payments',
    location: 'Bangalore',
    experience_years: 9,
    skills: ['Java', 'Spring Boot', 'Kafka', 'PostgreSQL', 'AWS', 'PCI-DSS', 'gRPC', 'Distributed Systems'],
    status: 'active' as const,
  },
  // ML / Data
  {
    name: 'Ishaan Malhotra',
    email: 'ishaan.malhotra@gmail.com',
    phone: '+91-88765-43211',
    current_title: 'Machine Learning Engineer',
    location: 'Hyderabad',
    experience_years: 4,
    skills: ['Python', 'PyTorch', 'HuggingFace', 'MLflow', 'FastAPI', 'Kubernetes', 'NLP', 'LLM Fine-tuning'],
    status: 'active' as const,
  },
  {
    name: 'Preethi Subramaniam',
    email: 'preethi.sub@protonmail.com',
    phone: '+91-77654-32100',
    current_title: 'Data Scientist',
    location: 'Chennai',
    experience_years: 5,
    skills: ['Python', 'TensorFlow', 'scikit-learn', 'SQL', 'Spark', 'Tableau', 'A/B Testing', 'Statistics'],
    status: 'active' as const,
  },
  {
    name: 'Nikhil Agarwal',
    email: 'nikhil.agarwal@gmail.com',
    phone: '+91-98654-21098',
    current_title: 'Data Engineer',
    location: 'Pune',
    experience_years: 5,
    skills: ['Python', 'Airflow', 'dbt', 'Spark', 'Snowflake', 'BigQuery', 'Kafka', 'HL7 FHIR'],
    status: 'active' as const,
  },
  // Product
  {
    name: 'Pooja Iyer',
    email: 'pooja.iyer.pm@gmail.com',
    phone: '+91-97765-54321',
    current_title: 'Product Manager – Payments',
    location: 'Mumbai',
    experience_years: 7,
    skills: ['Product Strategy', 'UPI', 'A/B Testing', 'SQL', 'Figma', 'JTBD', 'OKRs', 'Agile'],
    status: 'active' as const,
  },
  {
    name: 'Arnav Kapoor',
    email: 'arnav.kapoor@gmail.com',
    phone: '+91-91876-54322',
    current_title: 'Group Product Manager',
    location: 'Delhi NCR',
    experience_years: 10,
    skills: ['Product Leadership', 'Growth', 'Checkout UX', 'Payments', 'SQL', 'Roadmapping', 'Stakeholder Mgmt'],
    status: 'active' as const,
  },
  // DevOps / Infra
  {
    name: 'Siddharth Nair',
    email: 'siddharth.nair.devops@gmail.com',
    phone: '+91-98123-45670',
    current_title: 'Platform Engineer',
    location: 'Bangalore',
    experience_years: 7,
    skills: ['Kubernetes', 'Terraform', 'ArgoCD', 'AWS', 'GCP', 'Backstage', 'Prometheus', 'Grafana', 'Helm'],
    status: 'active' as const,
  },
  // Marketing
  {
    name: 'Shreya Saxena',
    email: 'shreya.saxena.mktg@gmail.com',
    phone: '+91-91234-09876',
    current_title: 'Director of Growth Marketing',
    location: 'Delhi NCR',
    experience_years: 11,
    skills: ['Performance Marketing', 'SEO/SEM', 'CRM', 'User Acquisition', 'Attribution', 'SQL', 'Brand Strategy'],
    status: 'active' as const,
  },
  // Sales
  {
    name: 'Karan Mehra',
    email: 'karan.mehra.sales@gmail.com',
    phone: '+91-98765-11223',
    current_title: 'Enterprise Account Executive',
    location: 'Bangalore',
    experience_years: 7,
    skills: ['Enterprise Sales', 'MEDDIC', 'Cloud Infrastructure', 'BFSI', 'CRM (Salesforce)', 'Executive Relationships'],
    status: 'active' as const,
  },
  // Finance
  {
    name: 'Divya Krishnamurthy',
    email: 'divya.krishna.ca@gmail.com',
    phone: '+91-99887-12345',
    current_title: 'Finance Manager – FP&A',
    location: 'Mumbai',
    experience_years: 8,
    skills: ['FP&A', 'Financial Modelling', 'Ind-AS', 'Board Reporting', 'Fundraising Support', 'Excel', 'SQL', 'CA'],
    status: 'active' as const,
  },
  // HR
  {
    name: 'Rhea Pillai',
    email: 'rhea.pillai.hr@gmail.com',
    phone: '+91-97543-21987',
    current_title: 'HR Business Partner – Tech',
    location: 'Bangalore',
    experience_years: 9,
    skills: ['Talent Strategy', 'DEI', 'Performance Management', 'Employer Branding', 'HRBP', 'OKRs', 'Darwinbox'],
    status: 'active' as const,
  },
  // Design
  {
    name: 'Mihir Shah',
    email: 'mihir.shah.design@gmail.com',
    phone: '+91-91122-33445',
    current_title: 'Senior Product Designer',
    location: 'Remote',
    experience_years: 6,
    skills: ['Figma', 'UX Research', 'iOS Design', 'Android Design', 'Prototyping', 'Design Systems', 'Usability Testing'],
    status: 'active' as const,
  },
  // Legal
  {
    name: 'Tara Krishnaswamy',
    email: 'tara.k.legal@gmail.com',
    phone: '+91-98654-43210',
    current_title: 'Legal Counsel – Technology',
    location: 'Bangalore',
    experience_years: 8,
    skills: ['Technology Law', 'GDPR', 'PDPB', 'Commercial Contracts', 'Data Privacy', 'SaaS Agreements', 'IP Law'],
    status: 'active' as const,
  },
  // Customer Success
  {
    name: 'Vivek Rao',
    email: 'vivek.rao.cs@gmail.com',
    phone: '+91-91765-43210',
    current_title: 'Senior Customer Success Manager',
    location: 'Hyderabad',
    experience_years: 7,
    skills: ['Customer Success', 'Gainsight', 'NRR Improvement', 'QBRs', 'B2B SaaS', 'Churn Reduction', 'SQL'],
    status: 'active' as const,
  },
  // Security
  {
    name: 'Aditya Banerjee',
    email: 'aditya.banerjee.sec@gmail.com',
    phone: '+91-98123-54321',
    current_title: 'Information Security Lead',
    location: 'Bangalore',
    experience_years: 8,
    skills: ['CISSP', 'ISO 27001', 'SOC 2', 'Penetration Testing', 'AWS Security', 'SOC Operations', 'Cloud Security'],
    status: 'active' as const,
  },
  // Supply Chain
  {
    name: 'Fatima Sheikh',
    email: 'fatima.sheikh.ops@gmail.com',
    phone: '+91-91234-87654',
    current_title: 'Supply Chain Manager',
    location: 'Chennai',
    experience_years: 7,
    skills: ['Supply Chain Management', 'Demand Forecasting', 'Inventory Optimisation', '3PL Management', 'SQL', 'SAP', 'Lean Six Sigma'],
    status: 'active' as const,
  },
  // Clinical
  {
    name: 'Dr. Ankit Joshi',
    email: 'ankit.joshi.cra@gmail.com',
    phone: '+91-97654-32109',
    current_title: 'Clinical Research Associate',
    location: 'Hyderabad',
    experience_years: 4,
    skills: ['GCP', 'ICH Guidelines', 'Oncology Trials', 'CDSCO', 'Medidata Rave', 'Site Monitoring', 'Phase II/III'],
    status: 'active' as const,
  },
  // Extra candidate
  {
    name: 'Simran Dhaliwal',
    email: 'simran.dhaliwal@gmail.com',
    phone: '+91-98765-00001',
    current_title: 'Product Designer',
    location: 'Chandigarh',
    experience_years: 4,
    skills: ['Figma', 'User Research', 'Mobile UX', 'Design Systems', 'Accessibility', 'Wireframing'],
    status: 'active' as const,
  },
]

// ── helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

async function getStages(jobId: string) {
  const { data } = await supabase
    .from('pipeline_stages')
    .select('id, name, order_index')
    .eq('hiring_request_id', jobId)
    .order('order_index')
  return data ?? []
}

async function addEvent(applicationId: string, type: string, toStage: string, note?: string, daysBack = 0) {
  await supabase.from('application_events').insert({
    application_id: applicationId,
    event_type: type,
    to_stage: toStage,
    note: note ?? null,
    created_by: 'Recruiter',
    created_at: daysAgo(daysBack),
  } as any)
}

// ── main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log('🌱 Seeding RecruiterStack...\n')

  // 1. Insert jobs
  console.log('📋 Creating jobs...')
  const { data: insertedJobs, error: jobsErr } = await supabase
    .from('hiring_requests')
    .insert(jobs as any[])
    .select('id, position_title')

  if (jobsErr) { console.error('Jobs error:', jobsErr); process.exit(1) }
  console.log(`   ✓ ${insertedJobs!.length} jobs created`)

  // 2. Insert candidates
  console.log('👤 Creating candidates...')
  const { data: insertedCandidates, error: candErr } = await supabase
    .from('candidates')
    .insert(candidates as any[])
    .select('id, name')

  if (candErr) { console.error('Candidates error:', candErr); process.exit(1) }
  console.log(`   ✓ ${insertedCandidates!.length} candidates created`)

  // Map by name / title for easy lookup
  const jobMap = Object.fromEntries(insertedJobs!.map(j => [j.position_title, j.id]))
  const candMap = Object.fromEntries(insertedCandidates!.map(c => [c.name, c.id]))

  // 3. Build applications  ───────────────────────────────────────────────────
  // Pattern: [job title, candidate name, stage name, daysAgo, source]
  type AppSpec = [string, string, string, number, string]

  const appSpecs: AppSpec[] = [
    // Senior Backend Engineer
    ['Senior Backend Engineer', 'Rohan Verma',    'Interview',    12, 'applied'],
    ['Senior Backend Engineer', 'Aditi Bose',     'Screening',    18, 'sourced'],
    ['Senior Backend Engineer', 'Wei Zhang',      'Offer',         5, 'referral'],
    ['Senior Backend Engineer', 'Siddharth Nair', 'Phone Screen', 22, 'applied'],
    ['Senior Backend Engineer', 'Ishaan Malhotra','Applied',      30, 'applied'],

    // ML Engineer
    ['Machine Learning Engineer', 'Ishaan Malhotra', 'Offer',        3, 'applied'],
    ['Machine Learning Engineer', 'Preethi Subramaniam','Interview', 8, 'sourced'],
    ['Machine Learning Engineer', 'Nikhil Agarwal', 'Screening',   15, 'applied'],
    ['Machine Learning Engineer', 'Aditi Bose',     'Phone Screen', 20, 'sourced'],

    // Group PM – Checkout
    ['Group Product Manager – Checkout & Payments', 'Arnav Kapoor', 'Interview',    7, 'applied'],
    ['Group Product Manager – Checkout & Payments', 'Pooja Iyer',   'Phone Screen', 14, 'sourced'],
    ['Group Product Manager – Checkout & Payments', 'Shreya Saxena','Screening',    20, 'referral'],

    // Data Engineer – Healthcare
    ['Data Engineer – Healthcare Analytics', 'Nikhil Agarwal',     'Interview',   9,  'applied'],
    ['Data Engineer – Healthcare Analytics', 'Preethi Subramaniam','Screening',   17, 'sourced'],
    ['Data Engineer – Healthcare Analytics', 'Aditi Bose',         'Phone Screen',25, 'applied'],

    // Staff DevOps
    ['Staff DevOps / Platform Engineer', 'Siddharth Nair','Offer',       4,  'applied'],
    ['Staff DevOps / Platform Engineer', 'Rohan Verma',   'Interview',   11, 'sourced'],
    ['Staff DevOps / Platform Engineer', 'Wei Zhang',     'Phone Screen',19, 'applied'],

    // VP Growth Marketing
    ['VP of Growth Marketing', 'Shreya Saxena', 'Interview',    6,  'applied'],
    ['VP of Growth Marketing', 'Rhea Pillai',   'Screening',   16,  'sourced'],

    // Enterprise AE – Cloud
    ['Enterprise Account Executive – Cloud Infrastructure', 'Karan Mehra',  'Offer',       2,  'applied'],
    ['Enterprise Account Executive – Cloud Infrastructure', 'Vivek Rao',    'Interview',   9,  'sourced'],
    ['Enterprise Account Executive – Cloud Infrastructure', 'Arnav Kapoor', 'Phone Screen',20, 'applied'],

    // Director Finance
    ['Director of Finance & Financial Planning', 'Divya Krishnamurthy','Interview',  8,  'applied'],
    ['Director of Finance & Financial Planning', 'Tara Krishnaswamy',  'Screening',  18, 'sourced'],

    // Head of People
    ['Head of People & Culture', 'Rhea Pillai',   'Offer',       3,  'applied'],
    ['Head of People & Culture', 'Shreya Saxena', 'Interview',   10, 'sourced'],

    // Senior UX Designer
    ['Senior UX Designer – Mobile App', 'Mihir Shah',     'Interview',   7,  'applied'],
    ['Senior UX Designer – Mobile App', 'Simran Dhaliwal','Screening',  14,  'applied'],
    ['Senior UX Designer – Mobile App', 'Pooja Iyer',     'Applied',    28,  'sourced'],

    // Legal Counsel
    ['Senior Legal Counsel – Technology & Privacy', 'Tara Krishnaswamy','Offer',     5,  'applied'],
    ['Senior Legal Counsel – Technology & Privacy', 'Divya Krishnamurthy','Screening',21, 'sourced'],

    // Director CS
    ['Director of Customer Success', 'Vivek Rao',   'Offer',       6,  'applied'],
    ['Director of Customer Success', 'Rhea Pillai', 'Interview',  13,  'sourced'],
    ['Director of Customer Success', 'Karan Mehra', 'Screening',  24,  'applied'],

    // InfoSec Manager
    ['Information Security Manager', 'Aditya Banerjee','Interview',  10, 'applied'],
    ['Information Security Manager', 'Siddharth Nair', 'Screening',  17, 'sourced'],

    // Supply Chain Lead
    ['Supply Chain & Operations Lead', 'Fatima Sheikh', 'Interview',  8,  'applied'],
    ['Supply Chain & Operations Lead', 'Nikhil Agarwal','Screening', 20,  'sourced'],

    // CRA – Oncology
    ['Clinical Research Associate – Oncology', 'Dr. Ankit Joshi',  'Offer',       4,  'applied'],
    ['Clinical Research Associate – Oncology', 'Preethi Subramaniam','Interview', 12, 'sourced'],
  ]

  console.log('🔗 Creating applications...')
  let appCount = 0

  for (const [jobTitle, candName, stageName, daysBack, source] of appSpecs) {
    const jobId  = jobMap[jobTitle]
    const candId = candMap[candName]
    if (!jobId)  { console.warn(`  ⚠ Job not found: ${jobTitle}`); continue }
    if (!candId) { console.warn(`  ⚠ Candidate not found: ${candName}`); continue }

    const stages = await getStages(jobId)
    const stage  = stages.find(s => s.name === stageName)
    if (!stage) { console.warn(`  ⚠ Stage not found: ${stageName} for ${jobTitle}`); continue }

    const { data: app, error: appErr } = await supabase
      .from('applications')
      .insert({
        candidate_id:       candId,
        hiring_request_id:  jobId,
        stage_id:           stage.id,
        status:             'active',
        source,
        applied_at:         daysAgo(daysBack),
      } as any)
      .select('id')
      .single()

    if (appErr) {
      if (appErr.code === '23505') {
        // duplicate — skip silently
      } else {
        console.warn(`  ⚠ App insert failed (${candName} → ${jobTitle}):`, appErr.message)
      }
      continue
    }

    // Add timeline events
    await addEvent(app.id, 'applied', stages[0].name, undefined, daysBack)
    if (stageName !== 'Applied') {
      const stageOrder = stage.order_index
      for (let i = 1; i <= stageOrder; i++) {
        const s = stages[i]
        if (!s) break
        await addEvent(app.id, 'stage_moved', s.name,
          i === stageOrder ? `Moved to ${s.name} — strong candidate.` : undefined,
          Math.max(daysBack - i * 3, 0))
      }
    }

    appCount++
  }

  console.log(`   ✓ ${appCount} applications created with timeline events`)
  console.log('\n✅ Seed complete!')
}

run().catch(console.error)
