import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight, ChevronRight,
  FileText, Search, Brain, CalendarCheck, BadgeCheck,
  Plug, Layers, BarChart2, Shield,
} from 'lucide-react'
import { EmailCapture } from '@/components/EmailCapture'
import { MarketingNav } from '@/components/marketing/MarketingNav'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'

// ── Agent definitions (Premium Glass & Emerald Palette) ───────────────

const AGENTS = [
  {
    n:        '01',
    name:     'Drafter',
    role:     'Job Creation & Tracking',
    icon:     FileText,
    color:    'text-emerald-700',
    border:   'border-emerald-200',
    bg:       'bg-emerald-50/50',
    badge:    'bg-emerald-100 text-emerald-800',
    dot:      'bg-emerald-500',
    features: [
      'AI-drafted job descriptions in seconds',
      'Requisition tracking & approval workflows',
      'One-click job board posting links',
      'Intake form for hiring manager alignment',
    ],
  },
  {
    n:        '02',
    name:     'Scout',
    role:     'Sourcing',
    icon:     Search,
    color:    'text-emerald-600',
    border:   'border-emerald-200/60',
    bg:       'bg-emerald-50/50',
    badge:    'bg-emerald-100 text-emerald-700',
    dot:      'bg-emerald-400',
    features: [
      'Bulk CSV import from any job board',
      'PDF CV parsing via AI',
      'LinkedIn, Naukri & Indeed export guides',
      'Automatic duplicate detection',
    ],
  },
  {
    n:        '03',
    name:     'Sifter',
    role:     'Screening & Scoring',
    icon:     Brain,
    color:    'text-gold-700',
    border:   'border-gold-200',
    bg:       'bg-gold-50/50',
    badge:    'bg-gold-200 text-gold-800',
    dot:      'bg-gold-500',
    features: [
      'AI score vs. JD the moment a CV lands',
      'Strengths & gaps analysis per candidate',
      'Shortlist top 10% automatically',
      'Bulk stage moves & rejections',
    ],
  },
  {
    n:        '04',
    name:     'Scheduler',
    role:     'Interview Coordination',
    icon:     CalendarCheck,
    color:    'text-emerald-800',
    border:   'border-emerald-300',
    bg:       'bg-emerald-100/30',
    badge:    'bg-emerald-200 text-emerald-900',
    dot:      'bg-emerald-600',
    features: [
      'Automated interview invites & reminders',
      'Calendar availability sync (coming soon)',
      'Interview prep packs for candidates',
      'Structured scorecard collection',
    ],
  },
  {
    n:        '05',
    name:     'Closer',
    role:     'Offer Management',
    icon:     BadgeCheck,
    color:    'text-gold-600',
    border:   'border-gold-200/50',
    bg:       'bg-gold-50/30',
    badge:    'bg-gold-100 text-gold-700',
    dot:      'bg-gold-400',
    features: [
      'AI-drafted offer letters',
      'Approval workflow routing',
      'E-sign ready documentation',
      'Offer acceptance tracking',
    ],
  },
]

const INTEGRATIONS = [
  'Workday', 'Greenhouse', 'Lever', 'BambooHR',
  'SAP SuccessFactors', 'Slack', 'Google Workspace', 'Naukri', 'LinkedIn',
]

const HOW_IT_WORKS = [
  { n: '01', title: 'Connect your stack',   desc: 'Link RecruiterStack to your existing ATS, HRIS, or job boards via API or CSV. No data migration needed.' },
  { n: '02', title: 'Pick your agents',     desc: 'Deploy just the agents you need — or go full suite. Each agent activates independently in minutes.' },
  { n: '03', title: 'AI takes the wheel',   desc: 'Agents handle the repetitive work: scoring, shortlisting, scheduling, drafting. You review the best.' },
  { n: '04', title: 'Close faster',         desc: 'Your team focuses on the 10% of candidates that matter. Hire in days, not months.' },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { userId } = auth()
  if (userId) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <MarketingNav />

      {/* ══ HERO (Glass & Emerald) ═══════════════════════════════════ */}
      <section className="relative overflow-hidden bg-transparent">

        <div className="relative mx-auto max-w-5xl px-6 pb-24 pt-28 text-center">
          {/* Eyebrow */}
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-200/50 bg-white/50 px-4 py-1.5 text-xs font-medium text-emerald-800 backdrop-blur-md shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Introducing the fastest AI hiring platform
          </div>

          {/* Headline */}
          <h1 className="mx-auto max-w-4xl text-5xl font-black tracking-tight text-slate-800 sm:text-6xl lg:text-7xl leading-[1.05]">
            Hire smarter.{' '}
            <span className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-gold-500 bg-clip-text text-transparent">
              Ship faster.
            </span>
            <br />
            <span className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-500">
              With AI agents for every stage.
            </span>
          </h1>

          {/* Sub */}
          <p className="mx-auto mt-7 max-w-2xl text-lg text-slate-600 leading-relaxed">
            5 specialised AI agents that slot into your existing HR stack —
            no rip-and-replace, no 6-month implementation.
            Just deploy the agents you need and close roles faster.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="#agents"
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-500 transition-colors"
            >
              Meet the agents
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/sign-up"
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-6 py-3.5 text-sm font-medium text-slate-700 backdrop-blur-md hover:bg-white/90 hover:border-slate-300 transition-colors shadow-sm"
            >
              Start free — no card needed
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-400">Free to start · Deploy in minutes · No lock-in</p>

          {/* Agent funnel visual */}
          <div className="mt-16 flex items-center justify-center gap-0 overflow-x-auto pb-2">
            {AGENTS.map((agent, i) => {
              const Icon = agent.icon
              return (
                <div key={agent.name} className="flex items-center">
                  <div className={`flex flex-col items-center gap-2 rounded-2xl glass-panel px-4 py-4 min-w-[100px] sm:min-w-[110px]`}>
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 shadow-sm`}>
                      <Icon className={`h-4 w-4 ${agent.color}`} />
                    </div>
                    <span className={`text-xs font-bold text-slate-800`}>{agent.name}</span>
                    <span className="text-[10px] text-slate-500 text-center leading-tight">{agent.role}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${agent.badge} border border-white/50 backdrop-blur-md`}>{agent.n}</span>
                  </div>
                  {i < AGENTS.length - 1 && (
                    <div className="flex items-center px-1">
                      <div className="h-px w-6 bg-slate-200" />
                      <ChevronRight className="h-3 w-3 text-slate-300 -mx-1" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ══ INTEGRATION BAR ═══════════════════════════════════════════════════ */}
      <section className="border-y border-emerald-100 bg-white/50 backdrop-blur-sm py-8">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Works with your existing stack — no lock-in
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {INTEGRATIONS.map(name => (
              <span
                key={name}
                className="rounded-full border border-emerald-100/60 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm"
              >
                {name}
              </span>
            ))}
            <span className="rounded-full border border-dashed border-emerald-200 px-3.5 py-1.5 text-xs font-medium text-slate-400">
              + more
            </span>
          </div>
          <p className="mt-4 text-xs text-slate-400">Connects via API or CSV export · Bidirectional sync · No migration needed</p>
        </div>
      </section>

      {/* ══ AGENTS SECTION ════════════════════════════════════════════════════ */}
      <section id="agents" className="py-24 bg-transparent">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">The agents</p>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">
              Meet your{' '}
              <span className="bg-gradient-to-r from-emerald-600 to-gold-500 bg-clip-text text-transparent">AI recruiting team</span>
            </h2>
            <p className="mt-3 text-slate-500 max-w-xl mx-auto">
              Deploy one. Deploy all five. Each agent handles a specific stage of your funnel
              and plugs into your existing tools.
            </p>
          </div>

          {/* Funnel label row */}
          <div className="mt-12 mb-4 flex items-center justify-center gap-2 text-xs text-slate-400">
            <span>Job Creation</span>
            <ChevronRight className="h-3 w-3" />
            <span>Sourcing</span>
            <ChevronRight className="h-3 w-3" />
            <span>Screening</span>
            <ChevronRight className="h-3 w-3" />
            <span>Interviews</span>
            <ChevronRight className="h-3 w-3" />
            <span>Offer</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {AGENTS.map(agent => {
              const Icon = agent.icon
              return (
                <div
                  key={agent.name}
                  className="group relative rounded-2xl glass-panel p-5 transition-all flex flex-col"
                >
                  {/* Header */}
                  <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-emerald-100 shadow-sm`}>
                    <Icon className={`h-5 w-5 ${agent.color}`} />
                  </div>
                  <div className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${agent.color}`}>
                    Agent {agent.n}
                  </div>
                  <h3 className="text-base font-bold text-slate-900">{agent.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-500 mb-4">{agent.role}</p>

                  {/* Features */}
                  <ul className="space-y-2 flex-1">
                    {agent.features.map(f => (
                      <li key={f} className="flex items-start gap-2 text-xs text-slate-500">
                        <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${agent.dot} shrink-0`} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <Link
                    href={`/agents`}
                    className={`mt-5 flex items-center gap-1 text-xs font-semibold ${agent.color} hover:opacity-80 transition-opacity`}
                  >
                    Learn more <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              )
            })}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/agents"
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200/60 bg-white/70 px-5 py-2.5 text-sm font-medium text-emerald-800 shadow-sm hover:border-emerald-300 hover:bg-white transition-colors"
            >
              Deep-dive into every agent <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ══ PLUG & PLAY ═══════════════════════════════════════════════════════ */}
      <section className="py-24 bg-emerald-50/30">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 lg:grid-cols-2 items-center">

            {/* Copy */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-3">
                Plug &amp; Play
              </p>
              <h2 className="text-3xl font-bold text-slate-900 leading-tight">
                Drop in. <span className="text-slate-400">Not rip out.</span>
              </h2>
              <p className="mt-5 text-slate-500 leading-relaxed">
                RecruiterStack is designed to <strong className="text-slate-900">layer on top of your existing stack</strong>,
                not replace it. Connect to Workday, Greenhouse, Lever, or any ATS via our
                API — or start with CSV exports in minutes.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  { icon: Plug,     text: 'Connect via API, webhook, or CSV — your choice' },
                  { icon: Layers,   text: 'Agents run independently — no full-suite required' },
                  { icon: BarChart2, text: 'Data stays in your existing systems, enriched by AI' },
                  { icon: Shield,   text: 'Row-level data isolation — your data never touches another org' },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-3 text-sm text-slate-500">
                    <Icon className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    {text}
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors"
              >
                Connect your stack <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Architecture diagram */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 font-mono text-xs shadow-sm">
              <p className="text-slate-400 mb-4">{'// Your existing infrastructure'}</p>

              <div className="space-y-2 mb-6">
                {['Workday / SAP', 'Greenhouse / Lever', 'LinkedIn / Naukri', 'Google Calendar / Slack'].map(tool => (
                  <div key={tool} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="h-2 w-2 rounded-full bg-slate-300" />
                    <span className="text-slate-600">{tool}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 mb-4 text-slate-400">
                <div className="h-px flex-1 border-t border-dashed border-emerald-200" />
                <span className="text-emerald-600 font-bold text-[11px]">RecruiterStack layer</span>
                <div className="h-px flex-1 border-t border-dashed border-emerald-200" />
              </div>

              <div className="grid grid-cols-5 gap-1">
                {AGENTS.map(agent => (
                  <div
                    key={agent.name}
                    className={`rounded-lg border ${agent.border} ${agent.bg} px-1.5 py-2 text-center`}
                  >
                    <span className={`text-[10px] font-bold ${agent.color}`}>{agent.name}</span>
                  </div>
                ))}
              </div>

              <p className="text-slate-400 mt-4">{'// Bidirectional sync · No migration'}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══ AUDIENCE ══════════════════════════════════════════════════════════ */}
      <section className="py-24 bg-transparent">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">Built for</p>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">Every recruiting team</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                title:   'Recruiting Agencies',
                sub:     'Run multiple client mandates from one workspace.',
                agents:  ['Scout', 'Sifter'],
                bullets: ['Multi-client workspace isolation', 'AI screening saves 10+ hrs/week', 'Automated candidate shortlists'],
              },
              {
                title:   'Enterprise TA Teams',
                sub:     'Process hundreds of applications across dozens of reqs.',
                agents:  ['Drafter', 'Scout', 'Sifter', 'Scheduler', 'Closer'],
                bullets: ['Full-funnel automation', 'Cross-team pipeline visibility', 'Analytics & velocity reporting'],
              },
              {
                title:   'Startups & Small Teams',
                sub:     'No dedicated recruiter? AI fills the gap.',
                agents:  ['Sifter', 'Scheduler'],
                bullets: ['Zero setup — live in minutes', 'AI handles top-of-funnel entirely', 'Pay only for what you use'],
              },
            ].map(({ title, sub, agents, bullets }) => (
              <div key={title} className={`rounded-2xl glass-panel p-7 transition-shadow`}>
                <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm text-slate-500">{sub}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {agents.map(a => {
                    const agentDef = AGENTS.find(ag => ag.name === a)
                    return (
                      <span key={a} className={`text-xs px-2.5 py-1 rounded-full border ${agentDef?.border ?? 'border-emerald-200'} ${agentDef?.color ?? 'text-emerald-700'} ${agentDef?.bg ?? 'bg-emerald-50'}`}>{a}</span>
                    )
                  })}
                </div>
                <ul className="mt-5 space-y-2">
                  {bullets.map(b => (
                    <li key={b} className="flex items-start gap-2 text-xs text-slate-500">
                      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PRICING TEASER ════════════════════════════════════════════════════ */}
      <section className="py-24 bg-gold-50/30">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-3">Pricing</p>
          <h2 className="text-3xl font-bold text-slate-900">Pay only for what you deploy</h2>
          <p className="mt-3 text-slate-500">Individual agents or the full suite — your call.</p>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              {
                label:  'Individual Agents',
                price:  'From $19',
                period: '/mo per agent',
                desc:   'Pick exactly the agents you need. Add more anytime.',
                cta:    'See all modules',
                href:   '/pricing',
                highlight: false,
              },
              {
                label:  'RecruiterStack Pro',
                price:  '$149',
                period: '/mo',
                desc:   'All 5 agents. Unlimited candidates. Full analytics.',
                cta:    'Start Pro trial',
                href:   '/sign-up',
                highlight: true,
              },
              {
                label:  'Enterprise',
                price:  'Custom',
                period: '',
                desc:   'SSO, dedicated support, custom integrations, SLAs.',
                cta:    'Talk to sales',
                href:   '/contact',
                highlight: false,
              },
            ].map(({ label, price, period, desc, cta, href, highlight }) => (
              <div
                key={label}
                className={`rounded-2xl p-6 text-left transition-all ${
                  highlight
                    ? 'border-2 border-emerald-500 bg-white shadow-lg shadow-emerald-500/10 scale-105 relative z-10'
                    : 'glass-panel shadow-sm'
                }`}
              >
                {highlight && (
                  <span className="mb-3 inline-block rounded-full bg-gradient-to-r from-emerald-500 to-gold-500 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">
                    Most popular
                  </span>
                )}
                <p className="text-sm font-semibold text-slate-500">{label}</p>
                <p className="mt-1">
                  <span className="text-3xl font-black text-slate-900">{price}</span>
                  {period && <span className="text-sm text-slate-400 ml-1">{period}</span>}
                </p>
                <p className="mt-3 text-sm text-slate-500">{desc}</p>
                <Link
                  href={href}
                  className={`mt-5 block rounded-xl py-2.5 text-sm font-semibold text-center transition-colors ${
                    highlight
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm'
                      : 'border border-emerald-200/50 text-emerald-800 hover:border-emerald-300 hover:bg-white'
                  }`}
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>

          <Link href="/pricing" className="mt-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            See full pricing &amp; feature comparison <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* ══ HOW IT WORKS ══════════════════════════════════════════════════════ */}
      <section className="py-24 bg-transparent">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-14 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">How it works</p>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">Live in minutes, not months</h2>
          </div>
          <div className="space-y-3">
            {HOW_IT_WORKS.map(({ n, title, desc }) => (
              <div
                key={n}
                className="flex items-start gap-6 rounded-2xl glass-panel px-6 py-5 transition-shadow"
              >
                <span className="shrink-0 font-black text-3xl bg-gradient-to-br from-emerald-500 to-gold-500 bg-clip-text text-transparent leading-none tabular-nums">{n}</span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ LEAD CAPTURE ══════════════════════════════════════════════════════ */}
      <section className="py-24 bg-transparent">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <div className="rounded-3xl glass-panel px-8 py-14 shadow-lg shadow-emerald-500/5">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200/50 bg-emerald-50/80 px-3 py-1 text-xs font-medium text-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Now in early access
            </div>
            <h2 className="mt-5 text-3xl font-bold text-slate-900">
              Ready to deploy your AI recruiting team?
            </h2>
            <p className="mt-3 text-slate-600">
              Join teams already running AI agents across their hiring funnel.
              Drop your email and we&apos;ll walk you through the right agents for your workflow.
            </p>
            <div className="mt-8">
              <EmailCapture
                placeholder="you@company.com"
                buttonLabel="Get early access"
                source="homepage-cta"
              />
            </div>
            <p className="mt-5 text-xs text-slate-400">
              Or{' '}
              <Link href="/sign-up" className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors">
                create a free account
              </Link>{' '}
              — no credit card required.
            </p>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}
