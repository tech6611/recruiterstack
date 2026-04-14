import Link from 'next/link'
import {
  FileText,
  Search,
  Brain,
  CalendarCheck,
  BadgeCheck,
  Check,
  ChevronRight,
} from 'lucide-react'
import { MarketingNav } from '@/components/marketing/MarketingNav'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'
import { EmailCapture } from '@/components/EmailCapture'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Agent {
  n: string
  name: string
  role: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  bullets: string[]
  connects: string
  pricing: string
  color: string
  border: string
  bg: string
  badge: string
  iconColor: string
  preview: React.ReactNode
}

// ── Preview mockups (CSS-only, no images) ─────────────────────────────────────

const DrafterPreview = (
  <div className="rounded-xl border border-blue-500/20 bg-[#061D46] p-5 font-mono text-xs leading-relaxed">
    <div className="mb-3 flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-blue-500" />
      <span className="text-blue-400 font-semibold">Drafter — JD generated</span>
    </div>
    <p className="text-blue-200/40 uppercase tracking-widest text-[10px] mb-1">Senior Product Designer</p>
    <div className="space-y-1.5 text-blue-100/60">
      <p className="text-blue-100 font-semibold">About the role</p>
      <p>We are looking for a Senior Product Designer to shape the end-to-end experience of our B2B SaaS platform...</p>
      <p className="text-blue-100 font-semibold mt-2">What you will do</p>
      <p>· Lead design for 0→1 features across web and mobile</p>
      <p>· Partner with product and engineering from discovery to ship</p>
      <p>· Define and maintain our design system</p>
      <p className="text-blue-100 font-semibold mt-2">You bring</p>
      <p>· 5+ years of product design experience</p>
      <p>· Fluency in Figma and design systems</p>
    </div>
    <div className="mt-3 flex gap-2">
      <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-300">Draft</span>
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-blue-100/60">Awaiting approval</span>
    </div>
  </div>
)

const ScoutPreview = (
  <div className="rounded-xl border border-blue-500/20 bg-[#061D46] p-5 text-xs">
    <div className="mb-3 flex items-center justify-between">
      <span className="text-blue-400 font-semibold">Scout — 247 imported</span>
      <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-300">CSV</span>
    </div>
    <div className="space-y-2">
      {[
        { name: 'Priya Sharma',    src: 'LinkedIn',  score: 91 },
        { name: 'James Okafor',   src: 'Indeed',    score: 87 },
        { name: 'Leila Nazari',   src: 'Naukri',    score: 84 },
        { name: 'Tom Brecker',    src: 'CSV upload', score: 79 },
        { name: 'Ana Sousa',      src: 'LinkedIn',  score: 72 },
      ].map((c) => (
        <div key={c.name} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
          <div>
            <p className="text-zinc-200 font-medium">{c.name}</p>
            <p className="text-zinc-600 text-[10px]">{c.src}</p>
          </div>
          <span className={`text-[11px] font-bold ${c.score >= 85 ? 'text-blue-400' : 'text-blue-200/40'}`}>
            {c.score}
          </span>
        </div>
      ))}
    </div>
    <p className="mt-3 text-center text-[10px] text-zinc-700">3 duplicates removed automatically</p>
  </div>
)

const SifterPreview = (
  <div className="rounded-xl border border-fuchsia-500/20 bg-[#061D46] p-5 text-xs">
    <div className="mb-3 flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-fuchsia-500" />
      <span className="text-fuchsia-400 font-semibold">Sifter — Score breakdown</span>
    </div>
    <p className="mb-3 text-blue-100 font-semibold">Priya Sharma · 91/100</p>
    {[
      { label: 'Skills match',      score: 95 },
      { label: 'Experience level',  score: 88 },
      { label: 'Domain knowledge',  score: 92 },
      { label: 'Location fit',      score: 100 },
      { label: 'Education',         score: 80 },
    ].map((row) => (
      <div key={row.label} className="mb-2">
        <div className="mb-0.5 flex justify-between text-[10px] text-blue-200/40">
          <span>{row.label}</span>
          <span className="text-fuchsia-400">{row.score}</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10">
          <div
            className="h-1.5 rounded-full bg-fuchsia-500"
            style={{ width: `${row.score}%` }}
          />
        </div>
      </div>
    ))}
    <div className="mt-3 rounded-lg bg-fuchsia-500/10 px-3 py-2">
      <p className="text-[10px] text-fuchsia-300 font-semibold">Strengths</p>
      <p className="text-[10px] text-blue-100/60 mt-0.5">Strong Figma background, shipped 3 B2B products</p>
    </div>
  </div>
)

const SchedulerPreview = (
  <div className="rounded-xl border border-emerald-500/20 bg-[#061D46] p-5 text-xs">
    <div className="mb-3 flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      <span className="text-emerald-400 font-semibold">Scheduler — Interview queue</span>
    </div>
    <div className="space-y-2">
      {[
        { name: 'Priya Sharma',   time: 'Mon 14 Mar · 10:00 AM', round: 'Phone screen',    status: 'Confirmed' },
        { name: 'James Okafor',  time: 'Mon 14 Mar · 2:00 PM',  round: 'Technical round', status: 'Pending' },
        { name: 'Leila Nazari',  time: 'Tue 15 Mar · 11:00 AM', round: 'Final panel',     status: 'Confirmed' },
      ].map((slot) => (
        <div key={slot.name} className="rounded-lg bg-white/5 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-zinc-200 font-medium">{slot.name}</p>
              <p className="text-zinc-600 text-[10px]">{slot.round}</p>
              <p className="text-emerald-500/70 text-[10px] mt-0.5">{slot.time}</p>
            </div>
            <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              slot.status === 'Confirmed'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-white/10 text-blue-200/40'
            }`}>
              {slot.status}
            </span>
          </div>
        </div>
      ))}
    </div>
    <p className="mt-3 text-center text-[10px] text-zinc-700">Reminders sent 24 h before each slot</p>
  </div>
)

const CloserPreview = (
  <div className="rounded-xl border border-amber-500/20 bg-[#061D46] p-5 font-mono text-xs leading-relaxed">
    <div className="mb-3 flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-amber-500" />
      <span className="text-amber-400 font-semibold">Closer — Offer letter draft</span>
    </div>
    <div className="rounded-lg bg-white/5 p-3 text-blue-100 text-[11px] leading-loose">
      <p className="text-blue-200/40 text-[10px] uppercase tracking-widest mb-2">Offer of Employment</p>
      <p>Dear <span className="text-amber-300">Priya</span>,</p>
      <p className="mt-1">We are delighted to offer you the position of <span className="text-amber-300">Senior Product Designer</span> at RecruiterStack, commencing <span className="text-amber-300">1 April 2026</span>.</p>
      <p className="mt-1">Compensation: <span className="text-amber-300">$130,000 / yr</span> + equity</p>
      <p className="mt-2 text-blue-200/40">— Awaiting finance approval —</p>
    </div>
    <div className="mt-3 flex gap-2">
      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">Draft</span>
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-blue-200/40">Not sent</span>
    </div>
  </div>
)

// ── Agent definitions ──────────────────────────────────────────────────────────

const AGENTS: Agent[] = [
  {
    n:           '01',
    name:        'Drafter',
    role:        'Job Creation & Tracking',
    icon:        FileText,
    description: 'Drafter turns a short intake form into a complete, tailored job description in under 10 seconds. It then tracks every requisition through the approval chain, onto job boards, and through to close — so your team always knows exactly where each open role stands.',
    bullets: [
      'AI-drafted JDs from intake form answers',
      'Configurable requisition approval chains',
      'One-click multi-board posting links',
      'Intake forms for hiring manager alignment',
      'Role status dashboard (open / paused / closed)',
      'Time-to-fill and pipeline velocity analytics',
      'Version history for every job description',
      'Inline hiring manager comment threads',
    ],
    connects: 'Drafter hands newly approved roles directly to Scout, which begins sourcing candidates the moment a JD is finalised.',
    pricing:  'From $19/mo as a standalone agent.',
    color:     'text-blue-600',
    border:    'border-blue-200',
    bg:        'bg-blue-50',
    badge:     'bg-blue-100 text-blue-700',
    iconColor: 'text-blue-600',
    preview:   DrafterPreview,
  },
  {
    n:           '02',
    name:        'Scout',
    role:        'Sourcing',
    icon:        Search,
    description: 'Scout fills your pipeline without manual data entry. Upload a CSV export from LinkedIn, Indeed, or Naukri; paste raw candidate text; or drop PDF CVs — Scout parses, deduplicates, and creates structured candidate profiles automatically. Your sourcing bottleneck disappears.',
    bullets: [
      'Bulk CSV import from any job board',
      'PDF CV parsing powered by AI',
      'Paste-to-candidate from raw text blocks',
      'Email-based automatic deduplication',
      'Source attribution tagging per candidate',
      'Normalised, searchable structured profiles',
      'Platform-specific export guides (LinkedIn, Naukri, Indeed)',
      'Bulk role assignment after import',
    ],
    connects: 'Every candidate Scout imports is immediately queued for Sifter to score against the relevant job description.',
    pricing:  'From $29/mo as a standalone agent.',
    color:     'text-blue-600',
    border:    'border-blue-200',
    bg:        'bg-blue-50',
    badge:     'bg-blue-100 text-blue-700',
    iconColor: 'text-blue-600',
    preview:   ScoutPreview,
  },
  {
    n:           '03',
    name:        'Sifter',
    role:        'Screening & Scoring',
    icon:        Brain,
    description: 'Sifter reads every CV against your job description the moment it arrives and returns a 0–100 fit score, a structured strengths summary, and a gaps analysis. Recruiters stop reading CVs they would reject anyway and start every day focused on the candidates who actually match.',
    bullets: [
      'JD-vs-CV fit scoring (0–100) on arrival',
      'Per-candidate strengths and gaps analysis',
      'Automatic top-10% shortlist flag',
      'Bulk stage moves and rejection actions',
      'Customisable scoring weights per criterion',
      'AI-generated pre-screening questions from the JD',
      'Score audit trail for defensible decisions',
      'Automatic re-score when the JD changes',
    ],
    connects: 'Shortlisted candidates from Sifter are passed to Scheduler, which sends interview invitations automatically.',
    pricing:  'From $29/mo as a standalone agent.',
    color:     'text-fuchsia-600',
    border:    'border-fuchsia-200',
    bg:        'bg-fuchsia-50',
    badge:     'bg-fuchsia-100 text-fuchsia-700',
    iconColor: 'text-fuchsia-600',
    preview:   SifterPreview,
  },
  {
    n:           '04',
    name:        'Scheduler',
    role:        'Interview Coordination',
    icon:        CalendarCheck,
    description: 'Scheduler eliminates the back-and-forth of booking interviews. It sends personalised invitations with candidate prep packs attached, fires automatic reminders to both sides, and tracks feedback submission — so no interview falls through the cracks and no reminder is missed.',
    bullets: [
      'Automated personalised interview invitations',
      'Candidate prep packs attached to every invite',
      'Multi-round scheduling (screen, technical, panel)',
      'Automatic reminders 24 h before each slot',
      'Google Calendar / Outlook sync (coming soon)',
      'Structured interviewer feedback scorecards',
      'One-click reschedule flow with candidate notification',
      'Stage-gated progression after feedback submission',
    ],
    connects: 'After all feedback is collected, Scheduler surfaces the decision-ready candidate to Closer for offer drafting.',
    pricing:  'From $19/mo as a standalone agent.',
    color:     'text-emerald-600',
    border:    'border-emerald-200',
    bg:        'bg-emerald-50',
    badge:     'bg-emerald-100 text-emerald-700',
    iconColor: 'text-emerald-600',
    preview:   SchedulerPreview,
  },
  {
    n:           '05',
    name:        'Closer',
    role:        'Offer Management',
    icon:        BadgeCheck,
    description: 'Closer takes over the moment you decide on a hire. It drafts a compliant, personalised offer letter from your template in seconds, routes it through finance and legal for approval, delivers it digitally, and tracks exactly when the candidate opens and signs — without a single chasing email.',
    bullets: [
      'AI-drafted offer letters from templates',
      'Configurable finance and legal approval chain',
      'Digital delivery with built-in e-signature',
      'Real-time acceptance and view tracking',
      'Counter-offer and revision thread',
      'Inline salary-band hints based on role and location',
      'Decline reason codes for compensation intelligence',
      'Onboarding task-list trigger on acceptance',
    ],
    connects: 'On acceptance, Closer triggers your onboarding checklist and marks the requisition closed in Drafter.',
    pricing:  'From $19/mo as a standalone agent.',
    color:     'text-amber-600',
    border:    'border-amber-200',
    bg:        'bg-amber-50',
    badge:     'bg-amber-100 text-amber-700',
    iconColor: 'text-amber-600',
    preview:   CloserPreview,
  },
]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />

      {/* Hero */}
      <section className="bg-[#061D46] py-24 text-center">
        <div className="mx-auto max-w-6xl px-6">
          <span className="mb-4 inline-block rounded-full border border-blue-500/20 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-blue-400">
            The Agents
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Your AI recruiting team
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-blue-100/60">
            5 specialised agents. One for each stage of the hiring funnel.
            Deploy individually or together.
          </p>
        </div>
      </section>

      {/* Agent sections */}
      {AGENTS.map((agent, idx) => {
        const Icon = agent.icon
        const isEven = idx % 2 === 0
        return (
          <section
            key={agent.name}
            className={`border-b border-slate-200 py-20 ${isEven ? 'bg-white' : 'bg-slate-50'}`}
          >
            <div className="mx-auto max-w-6xl px-6">
              <div className={`flex flex-col gap-12 lg:flex-row lg:items-start ${isEven ? '' : 'lg:flex-row-reverse'}`}>

                {/* Left / right text */}
                <div className="flex-1">
                  {/* Number + name */}
                  <div className="mb-6 flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold tracking-widest ${agent.badge}`}>
                      {agent.n}
                    </span>
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${agent.border} ${agent.bg}`}>
                      <Icon className={`h-4.5 w-4.5 ${agent.iconColor}`} />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">{agent.name}</h2>
                  </div>
                  <p className={`text-sm font-semibold uppercase tracking-widest ${agent.color} mb-3`}>
                    {agent.role}
                  </p>
                  <p className="text-base text-slate-500 leading-relaxed mb-7 max-w-lg">
                    {agent.description}
                  </p>

                  {/* Feature bullets */}
                  <ul className="mb-7 grid gap-2 sm:grid-cols-2">
                    {agent.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2.5">
                        <Check className={`mt-0.5 h-4 w-4 shrink-0 ${agent.iconColor}`} />
                        <span className="text-sm text-slate-700">{b}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Integration note */}
                  <div className={`mb-5 rounded-xl border ${agent.border} ${agent.bg} px-4 py-3`}>
                    <p className={`text-xs font-semibold uppercase tracking-widest ${agent.color} mb-1`}>
                      How it connects
                    </p>
                    <p className="text-xs text-slate-500">{agent.connects}</p>
                  </div>

                  {/* Pricing note */}
                  <p className="mb-5 text-xs text-slate-400">{agent.pricing}</p>

                  {/* CTA */}
                  <Link
                    href="/sign-up"
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-400 transition-colors"
                  >
                    Try {agent.name} free
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>

                {/* Preview mockup */}
                <div className="w-full max-w-md shrink-0 lg:w-96">
                  {agent.preview}
                </div>
              </div>
            </div>
          </section>
        )
      })}

      {/* Bottom CTA */}
      <section className="bg-[#061D46] py-24 text-center">
        <div className="mx-auto max-w-2xl px-6">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Start with one. Scale to all five.
          </h2>
          <p className="mt-4 text-blue-100/60">
            All 5 agents. One platform. Zero manual handoffs between stages.
          </p>
          <div className="mt-8">
            <EmailCapture
              source="agents-page"
              placeholder="Enter your work email"
              buttonLabel="Get early access"
            />
          </div>
          <p className="mt-4 text-xs text-blue-200/40">
            Free to start · No credit card required · Cancel any time
          </p>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}
