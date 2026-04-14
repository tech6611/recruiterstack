import Link from 'next/link'
import {
  FileText,
  Search,
  Brain,
  CalendarCheck,
  BadgeCheck,
  Check,
} from 'lucide-react'
import { MarketingNav } from '@/components/marketing/MarketingNav'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgentFeature {
  title: string
  description: string
}

interface Agent {
  n: string
  name: string
  role: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  color: string
  border: string
  bg: string
  badge: string
  iconColor: string
  features: AgentFeature[]
}

// ── Agent data ─────────────────────────────────────────────────────────────────

const AGENTS: Agent[] = [
  {
    n:         '01',
    name:      'Drafter',
    role:      'Job Creation & Tracking',
    icon:      FileText,
    description:
      'Drafter handles everything that happens before the first CV arrives. It uses your intake form answers to generate a complete, tailored job description in seconds, then tracks every requisition through approval, posting, and close — giving your team a single source of truth for every open role.',
    color:     'text-blue-600',
    border:    'border-blue-200',
    bg:        'bg-blue-50',
    badge:     'bg-blue-100 text-blue-700',
    iconColor: 'text-blue-600',
    features: [
      { title: 'AI-drafted job descriptions',       description: 'Generate a full JD from a short intake form in under 10 seconds.' },
      { title: 'Structured intake forms',           description: 'Collect hiring-manager requirements through a guided, shareable form.' },
      { title: 'Requisition approval workflows',    description: 'Route new roles for sign-off with configurable approval chains.' },
      { title: 'Multi-board posting links',         description: 'One-click links for LinkedIn, Indeed, Naukri, and your careers page.' },
      { title: 'Role status tracking',              description: 'See every open, paused, and closed requisition at a glance.' },
      { title: 'Headcount & pipeline analytics',   description: 'Track time-to-fill and candidate throughput per role.' },
      { title: 'Version history for JDs',           description: 'Revert to any previous draft if requirements change mid-search.' },
      { title: 'Hiring manager collaboration',      description: 'Comment threads on JDs so feedback stays tied to the role.' },
    ],
  },
  {
    n:         '02',
    name:      'Scout',
    role:      'Sourcing',
    icon:      Search,
    description:
      'Scout brings candidates in from wherever they live. Upload a CSV from any job board, paste a LinkedIn export, or drop raw CVs — Scout parses, deduplicates, and creates structured candidate profiles automatically. Your pipeline fills without manual data entry.',
    color:     'text-blue-600',
    border:    'border-blue-200',
    bg:        'bg-blue-50',
    badge:     'bg-blue-100 text-blue-700',
    iconColor: 'text-blue-600',
    features: [
      { title: 'Bulk CSV import',                   description: 'Import hundreds of candidates at once from any job board export.' },
      { title: 'PDF CV parsing',                    description: 'Upload raw CVs and let AI extract name, contact, skills, and experience.' },
      { title: 'Paste-to-candidate',                description: 'Paste a block of text and Scout creates a full candidate record instantly.' },
      { title: 'Automatic deduplication',           description: 'Email-based matching prevents the same person appearing twice.' },
      { title: 'Source tracking',                   description: 'Every candidate is tagged with their origin channel for attribution.' },
      { title: 'Structured profile generation',     description: 'Raw CV text is normalised into searchable, filterable structured data.' },
      { title: 'LinkedIn & Naukri export guides',   description: 'Step-by-step instructions for pulling exports from major platforms.' },
      { title: 'Bulk candidate assignment',         description: 'Assign hundreds of imports to a role with one action.' },
    ],
  },
  {
    n:         '03',
    name:      'Sifter',
    role:      'Screening & Scoring',
    icon:      Brain,
    description:
      'Sifter reads every CV against your job description the moment it lands and produces a structured fit score, a strengths summary, and a gaps analysis. Recruiters stop reading CVs they would reject anyway and focus on the top of the pile from day one.',
    color:     'text-fuchsia-600',
    border:    'border-fuchsia-200',
    bg:        'bg-fuchsia-50',
    badge:     'bg-fuchsia-100 text-fuchsia-700',
    iconColor: 'text-fuchsia-600',
    features: [
      { title: 'JD-vs-CV fit scoring',              description: 'Every candidate receives a 0–100 relevance score against the role.' },
      { title: 'Strengths & gaps analysis',         description: 'Sifter surfaces exactly what matches and what is missing for each hire.' },
      { title: 'Automatic top-10% shortlist',       description: 'The highest-scoring candidates are flagged the moment they are scored.' },
      { title: 'Bulk stage moves',                  description: 'Move or reject hundreds of candidates simultaneously with one click.' },
      { title: 'Custom scoring criteria',           description: 'Weight skills, experience, education, and location to match your priorities.' },
      { title: 'Screening question generation',     description: 'Sifter drafts role-specific pre-screen questions from the JD.' },
      { title: 'Score audit trail',                 description: 'See exactly which criteria drove each score for defensible decisions.' },
      { title: 'Re-score on JD change',             description: 'When the JD is updated, all candidates are automatically re-evaluated.' },
    ],
  },
  {
    n:         '04',
    name:      'Scheduler',
    role:      'Interview Coordination',
    icon:      CalendarCheck,
    description:
      'Scheduler eliminates the back-and-forth of interview booking. It sends personalised invitations, attaches prep materials, and fires reminders to both sides automatically. Your team shows up prepared and candidates arrive informed.',
    color:     'text-emerald-600',
    border:    'border-emerald-200',
    bg:        'bg-emerald-50',
    badge:     'bg-emerald-100 text-emerald-700',
    iconColor: 'text-emerald-600',
    features: [
      { title: 'Automated interview invites',       description: 'Send personalised interview invitations directly from the platform.' },
      { title: 'Candidate prep packs',              description: 'Attach role context, company info, and prep tips to every invite.' },
      { title: 'Multi-round scheduling',            description: 'Manage phone screens, technical rounds, and final panels in one place.' },
      { title: 'Automatic reminders',               description: 'Candidates and interviewers receive timely reminders before each slot.' },
      { title: 'Calendar sync (coming soon)',       description: 'Two-way sync with Google Calendar and Outlook to find open slots.' },
      { title: 'Interview feedback templates',      description: 'Structured scorecards are sent to interviewers after each session.' },
      { title: 'No-show & reschedule handling',     description: 'One-click reschedule flows with automatic candidate notification.' },
      { title: 'Stage-gated progression',           description: 'Candidates advance to the next round only after feedback is submitted.' },
    ],
  },
  {
    n:         '05',
    name:      'Closer',
    role:      'Offer Management',
    icon:      BadgeCheck,
    description:
      'Closer takes over once you have decided on a hire. It drafts an offer letter from a template in seconds, tracks the approval chain, sends it to the candidate, and monitors acceptance — all without chasing anyone over email.',
    color:     'text-amber-600',
    border:    'border-amber-200',
    bg:        'bg-amber-50',
    badge:     'bg-amber-100 text-amber-700',
    iconColor: 'text-amber-600',
    features: [
      { title: 'AI-drafted offer letters',          description: 'Generate a compliant, personalised offer from a template in seconds.' },
      { title: 'Offer approval workflows',          description: 'Route draft offers through finance and legal before sending.' },
      { title: 'Digital delivery & e-signature',   description: 'Send offers digitally and collect signatures without third-party tools.' },
      { title: 'Acceptance tracking',              description: 'See exactly when a candidate opens, views, and signs their offer.' },
      { title: 'Negotiation thread',               description: 'Counter-offers and revisions are tracked in a structured conversation.' },
      { title: 'Comp benchmarking hints',          description: 'Inline salary-band suggestions based on role, level, and location.' },
      { title: 'Decline capture & reason codes',  description: 'Record why declined offers happened to improve future compensation.' },
      { title: 'Onboarding handoff',               description: 'Trigger an onboarding task list the moment an offer is accepted.' },
    ],
  },
]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />

      {/* Hero */}
      <section className="bg-[#061D46] py-24 text-center">
        <div className="mx-auto max-w-6xl px-6">
          <span className="mb-4 inline-block rounded-full border border-blue-500/20 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-blue-400">
            Features
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Everything your recruiting<br className="hidden sm:block" /> team needs
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-blue-100/60">
            One capability per agent. All working together.
          </p>
        </div>
      </section>

      {/* Agent sections */}
      {AGENTS.map((agent, idx) => {
        const Icon = agent.icon
        const sectionBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
        return (
          <section
            key={agent.name}
            className={`${sectionBg} border-b border-slate-200 py-20`}
          >
            <div className="mx-auto max-w-6xl px-6">
              {/* Agent header */}
              <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border ${agent.border} ${agent.bg}`}>
                  <Icon className={`h-7 w-7 ${agent.iconColor}`} />
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold tracking-widest ${agent.badge}`}>
                      {agent.n}
                    </span>
                    <h2 className="text-2xl font-bold text-slate-900">{agent.name}</h2>
                  </div>
                  <p className={`text-sm font-semibold uppercase tracking-widest ${agent.color}`}>
                    {agent.role}
                  </p>
                  <p className="mt-3 max-w-2xl text-base text-slate-500 leading-relaxed">
                    {agent.description}
                  </p>
                </div>
              </div>

              {/* Feature grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {agent.features.map((feat) => (
                  <div
                    key={feat.title}
                    className={`rounded-xl border ${agent.border} bg-white p-5 shadow-sm`}
                  >
                    <div className="mb-2 flex items-start gap-2.5">
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${agent.iconColor}`} />
                      <p className="text-sm font-semibold text-slate-900 leading-snug">{feat.title}</p>
                    </div>
                    <p className="pl-6 text-xs text-slate-400 leading-relaxed">{feat.description}</p>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="mt-10">
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-400 transition-colors"
                >
                  Add {agent.name} to your stack
                  <span aria-hidden>→</span>
                </Link>
              </div>
            </div>
          </section>
        )
      })}

      <MarketingFooter />
    </div>
  )
}
