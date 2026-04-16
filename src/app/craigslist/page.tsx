import Link from 'next/link'
import {
  ArrowRight,
  Zap,
  BarChart2,
  Target,
  Code2,
  ShieldCheck,
  TrendingDown,
  Clock,
  Eye,
  AlertTriangle,
  ChevronRight,
  Upload,
  Bot,
  LineChart,
} from 'lucide-react'
import { MarketingNav } from '@/components/marketing/MarketingNav'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'

// ── Data ──────────────────────────────────────────────────────────────────────

const PAIN_POINTS = [
  {
    icon:  Clock,
    title: '100% manual posting',
    stat:  '83+ hours',
    desc:  '5 min per post × 1,000 jobs = 83 hours of manual work. That\'s two full work weeks spent copying and pasting.',
  },
  {
    icon:  Eye,
    title: 'Zero performance data',
    desc:  'Craigslist doesn\'t report impressions, clicks, applies, or hires. You\'re flying blind on every single posting.',
  },
  {
    icon:  AlertTriangle,
    title: 'Broken formatting',
    desc:  'Getting posts to look professional on Craigslist requires HTML. One wrong tag and your employer brand takes a hit.',
  },
]

const FEATURES = [
  {
    icon:  Zap,
    title: 'Automated Bulk Posting',
    desc:  'Post thousands of jobs to Craigslist in minutes, not weeks. Set it up once and CraigPost handles the rest — posting, renewing, and removing expired listings automatically.',
  },
  {
    icon:  BarChart2,
    title: 'Real-Time Performance Tracking',
    desc:  'See impressions, clicks, applications, and hires for every Craigslist posting in one dashboard. Know exactly what\'s working and where to double down.',
  },
  {
    icon:  Target,
    title: 'AI-Powered Micro-Market Targeting',
    desc:  'CraigPost uses data to identify the right Craigslist markets for each role. Target great-fit talent in the locations where they\'re actually looking.',
  },
  {
    icon:  Code2,
    title: 'Built-In HTML Editor & Preview',
    desc:  'Create professional, branded job posts with our visual editor. Preview exactly how they\'ll appear on Craigslist before going live — no HTML skills needed.',
  },
  {
    icon:  ShieldCheck,
    title: 'Quality Control & Monitoring',
    desc:  'Automated checks ensure every post is live, formatted correctly, and displaying properly. Get alerts if anything goes wrong so you can fix it instantly.',
  },
  {
    icon:  TrendingDown,
    title: 'Cost-Per-Hire Optimization',
    desc:  'Data-driven posting decisions that maximize conversions and reduce your cost per hire. Stop wasting budget on markets that don\'t convert.',
  },
]

const HOW_IT_WORKS = [
  {
    n:     '01',
    icon:  Upload,
    title: 'Connect your job feed',
    desc:  'Import jobs via CSV upload, API integration, or connect directly to your ATS. CraigPost ingests your open roles automatically.',
  },
  {
    n:     '02',
    icon:  Bot,
    title: 'CraigPost posts & optimizes',
    desc:  'Jobs are automatically posted to the right Craigslist markets with professional formatting. AI continuously optimizes targeting based on performance data.',
  },
  {
    n:     '03',
    icon:  LineChart,
    title: 'Track performance & hire faster',
    desc:  'Monitor every posting\'s performance in real time. See which markets drive the most applies and hires, and let CraigPost reallocate budget to top performers.',
  },
]

const AUDIENCES = [
  {
    title:   'Staffing Agencies',
    desc:    'Managing hundreds of requisitions across multiple clients and markets.',
    bullets: [
      'Post across dozens of Craigslist markets simultaneously',
      'Client-level reporting and budget tracking',
      'White-label posting with client branding',
    ],
  },
  {
    title:   'High-Volume Employers',
    desc:    'Retail, logistics, healthcare — roles that need volume and speed.',
    bullets: [
      'Automated posting for 1,000+ jobs at once',
      'Location-based targeting across metro areas',
      'Real-time pipeline visibility per region',
    ],
  },
  {
    title:   'Franchise Recruiters',
    desc:    'Hiring for multiple locations with different needs and budgets.',
    bullets: [
      'Per-location posting and performance tracking',
      'Standardized job templates with local customization',
      'Consolidated analytics across all franchise units',
    ],
  },
]

// ── Dashboard mockup ──────────────────────────────────────────────────────────

function DashboardMockup() {
  return (
    <div className="rounded-xl border border-emerald-500/20 bg-transparent p-5 text-xs shadow-2xl shadow-emerald-900/5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-emerald-400 font-semibold">CraigPost — Campaign Dashboard</span>
        </div>
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400">Live</span>
      </div>

      {/* Mini chart */}
      <div className="mb-4 rounded-lg bg-white/5 p-3">
        <div className="flex items-end justify-between gap-1 h-12">
          {[35, 42, 58, 45, 67, 72, 88, 76, 92, 85, 95, 98].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-gradient-to-t from-emerald-600 to-emerald-400"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[9px] text-slate-500">
          <span>Week 1</span>
          <span>Week 12</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { label: 'Postings', value: '1,247' },
          { label: 'Impressions', value: '45.2K' },
          { label: 'Applies', value: '683' },
          { label: 'CPA', value: '$38.50' },
        ].map(s => (
          <div key={s.label} className="rounded-lg bg-white/5 px-2 py-1.5 text-center">
            <p className="text-[9px] text-slate-500">{s.label}</p>
            <p className="text-[11px] font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table rows */}
      <div className="space-y-1">
        {[
          { market: 'San Francisco', posts: 142, applies: 89, cpa: '$32.10' },
          { market: 'Chicago',       posts: 98,  applies: 67, cpa: '$35.40' },
          { market: 'Dallas',        posts: 76,  applies: 54, cpa: '$41.20' },
        ].map(r => (
          <div key={r.market} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5">
            <span className="text-emerald-100 font-medium">{r.market}</span>
            <div className="flex gap-4 text-[10px]">
              <span className="text-slate-500">{r.posts} posts</span>
              <span className="text-slate-500">{r.applies} applies</span>
              <span className="text-emerald-400 font-semibold">{r.cpa}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CraigPostPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <MarketingNav />

      {/* ══ HERO ═════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-transparent">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full bg-emerald-500/10 blur-[120px]" />
          <div className="absolute -bottom-20 right-1/4 h-[400px] w-[400px] rounded-full bg-violet-500/10 blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-28">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            {/* Copy */}
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-emerald-200 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                CraigPost by RecruiterStack
              </div>

              <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl lg:text-[3.5rem] leading-[1.1]">
                Automated{' '}
                <span className="bg-gradient-to-r from-emerald-400 to-violet-400 bg-clip-text text-transparent">
                  Craigslist Job Posting
                </span>{' '}
                at Scale
              </h1>

              <p className="mt-6 text-lg text-emerald-100/70 leading-relaxed max-w-lg">
                Post and manage thousands of jobs on Craigslist effortlessly.
                Let data do the talking while AI targets great-fit talent
                in micro markets — maximizing conversions and bringing down
                your cost per hire.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/contact"
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400 transition-colors"
                >
                  Book a Demo
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#how-it-works"
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/10 transition-colors"
                >
                  See How It Works
                </a>
              </div>

              <p className="mt-4 text-xs text-slate-500">
                No setup fees · Go live in days · Cancel any time
              </p>
            </div>

            {/* Dashboard mockup */}
            <div className="hidden lg:block">
              <DashboardMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ══ PROBLEM ══════════════════════════════════════════════════════════ */}
      <section className="py-24 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">The problem</p>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">
              Craigslist is powerful.{' '}
              <span className="text-slate-400">Managing it isn&apos;t.</span>
            </h2>
            <p className="mt-3 text-slate-500 max-w-xl mx-auto">
              Craigslist has been a top-three job posting site since 1997, but posting
              at scale is painful, manual, and completely untrackable.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {PAIN_POINTS.map(({ icon: Icon, title, stat, desc }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 border border-red-200">
                  <Icon className="h-5 w-5 text-red-500" />
                </div>
                <h3 className="text-base font-bold text-slate-900">{title}</h3>
                {stat && (
                  <p className="mt-1 text-2xl font-black text-red-500">{stat}</p>
                )}
                <p className="mt-2 text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <p className="text-sm text-slate-500">
              Manual posting at scale wastes recruiter time and budget.{' '}
              <span className="font-semibold text-emerald-600">CraigPost fixes this.</span>
            </p>
          </div>
        </div>
      </section>

      {/* ══ FEATURES ═════════════════════════════════════════════════════════ */}
      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">Features</p>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">
              Everything you need to own Craigslist hiring
            </h2>
            <p className="mt-3 text-slate-500 max-w-xl mx-auto">
              Automated posting, real-time tracking, and AI-powered optimization —
              all from one dashboard.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200">
                  <Icon className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ═════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-24 bg-white">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-14 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">How it works</p>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">
              Go live in days, not months
            </h2>
          </div>

          <div className="space-y-4">
            {HOW_IT_WORKS.map(({ n, icon: Icon, title, desc }) => (
              <div
                key={n}
                className="flex items-start gap-6 rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <span className="shrink-0 font-black text-3xl bg-gradient-to-br from-emerald-500 to-violet-500 bg-clip-text text-transparent leading-none tabular-nums">
                  {n}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <Icon className="h-5 w-5 text-emerald-600" />
                    <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-400 transition-colors"
            >
              Book a Demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ══ BUILT FOR ════════════════════════════════════════════════════════ */}
      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">Built for</p>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">
              Teams that hire at volume
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {AUDIENCES.map(({ title, desc, bullets }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm hover:shadow-md transition-shadow"
              >
                <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm text-slate-500">{desc}</p>
                <ul className="mt-5 space-y-2">
                  {bullets.map(b => (
                    <li key={b} className="flex items-start gap-2 text-xs text-slate-500">
                      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ BOTTOM CTA ═══════════════════════════════════════════════════════ */}
      <section className="bg-transparent py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm px-8 py-14">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Now accepting new clients
            </div>
            <h2 className="mt-5 text-3xl font-bold text-slate-900">
              Ready to automate your Craigslist posting?
            </h2>
            <p className="mt-3 text-slate-600">
              Stop spending hours on manual postings. Let CraigPost handle the volume
              while you focus on closing the best candidates.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/contact"
                className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400 transition-colors"
              >
                Book a Demo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="mt-5 text-xs text-slate-500">
              No setup fees · Dedicated onboarding · ROI in the first month
            </p>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}
