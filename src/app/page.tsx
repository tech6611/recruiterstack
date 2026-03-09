import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Zap,
  ArrowRight,
  Brain,
  BarChart2,
  Inbox,
  Users,
  Shield,
  Workflow,
  Building2,
  Briefcase,
  Bot,
  ChevronRight,
} from 'lucide-react'
import { EmailCapture } from '@/components/EmailCapture'

export default function HomePage() {
  const { userId } = auth()
  if (userId) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600">
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">RecruiterStack</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:border-zinc-500 hover:bg-zinc-800 transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Radial glow */}
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center">
          <div className="mt-10 h-[400px] w-[900px] rounded-full bg-violet-900/20 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pb-28 pt-24 text-center">
          {/* Eyebrow */}
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-3.5 py-1.5 text-xs font-medium text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            AI-native Recruitment Operating System
          </div>

          {/* Headline */}
          <h1 className="mx-auto max-w-4xl text-5xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl leading-[1.05]">
            The OS for{' '}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400 bg-clip-text text-transparent">
              modern recruiting
            </span>
          </h1>

          {/* Sub-headline */}
          <p className="mx-auto mt-7 max-w-2xl text-lg text-zinc-400 leading-relaxed">
            RecruiterStack is the first AI-native recruitment operating system —
            built for agencies running mandates, enterprise TA teams drowning in
            applications, and lean teams that need AI to recruit for them.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/sign-up"
              className="flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
            >
              Start for free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/sign-in"
              className="flex items-center gap-2 rounded-xl border border-zinc-800 px-6 py-3.5 text-sm font-medium text-zinc-300 hover:border-zinc-600 hover:text-white transition-colors"
            >
              Sign in to your workspace
            </Link>
          </div>

          <p className="mt-4 text-xs text-zinc-600">Free to start · No credit card required</p>
        </div>
      </section>

      {/* ── Who it's for ─────────────────────────────────────────────────── */}
      <section className="border-t border-zinc-900 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-500">
              Built for
            </p>
            <h2 className="mt-3 text-3xl font-bold text-white">
              Three types of recruiting teams
            </h2>
            <p className="mt-3 text-zinc-500">
              One platform. Three distinct workflows. All powered by AI.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {/* Agencies */}
            <div className="group relative rounded-2xl border border-zinc-800 bg-zinc-900/50 p-7 hover:border-zinc-700 transition-colors">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600/10 border border-violet-600/20">
                <Briefcase className="h-5 w-5 text-violet-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Recruiting Agencies</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                Manage multiple client mandates from a single workspace. AI workflows handle
                sourcing, screening, and shortlisting — so your team closes roles, not
                spreadsheets.
              </p>
              <ul className="mt-5 space-y-2">
                {[
                  'Multi-client workspace management',
                  'AI candidate screening & scoring',
                  'Automated outreach sequences',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2 text-xs text-zinc-500">
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Enterprises */}
            <div className="group relative rounded-2xl border border-zinc-800 bg-zinc-900/50 p-7 hover:border-zinc-700 transition-colors">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600/10 border border-indigo-600/20">
                <Building2 className="h-5 w-5 text-indigo-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Enterprise TA Teams</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                Hundreds of applications per role. Dozens of open reqs. RecruiterStack
                processes the volume so your TA team can focus on the humans, not the
                inbox.
              </p>
              <ul className="mt-5 space-y-2">
                {[
                  'High-volume application processing',
                  'Cross-team pipeline visibility',
                  'Analytics & hiring velocity reporting',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2 text-xs text-zinc-500">
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Small teams */}
            <div className="group relative rounded-2xl border border-zinc-800 bg-zinc-900/50 p-7 hover:border-zinc-700 transition-colors">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-fuchsia-600/10 border border-fuchsia-600/20">
                <Bot className="h-5 w-5 text-fuchsia-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Small Teams</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                No dedicated recruiter? No problem. Our AI agents run your entire
                hiring pipeline — from job description to shortlist — while you
                stay focused on building.
              </p>
              <ul className="mt-5 space-y-2">
                {[
                  'AI-drafted job descriptions',
                  'Autonomous candidate pipeline',
                  'Zero-setup recruiting agents',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2 text-xs text-zinc-500">
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fuchsia-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── What makes it an OS ───────────────────────────────────────────── */}
      <section className="border-t border-zinc-900 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-500">
              Capabilities
            </p>
            <h2 className="mt-3 text-3xl font-bold text-white">
              Not just an ATS. An operating system.
            </h2>
            <p className="mt-3 max-w-xl mx-auto text-zinc-500">
              Traditional ATS tools track candidates. RecruiterStack runs your
              entire recruiting operation end-to-end.
            </p>
          </div>

          <div className="grid gap-px bg-zinc-800 rounded-2xl overflow-hidden sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Brain,
                color: 'text-violet-400',
                title: 'AI Candidate Scoring',
                desc: 'Every resume scored against your JD the moment it lands. Surface top 10% in seconds, not days.',
              },
              {
                icon: Workflow,
                color: 'text-indigo-400',
                title: 'AI Recruiting Workflows',
                desc: 'Automated screening, stage moves, follow-ups, and rejections — triggered by rules you set.',
              },
              {
                icon: Inbox,
                color: 'text-fuchsia-400',
                title: 'Unified Recruiting Inbox',
                desc: 'One feed for everything that needs attention. Stale apps, interview requests, urgent follow-ups.',
              },
              {
                icon: BarChart2,
                color: 'text-sky-400',
                title: 'Pipeline Analytics',
                desc: 'Funnel drop-off, source attribution, time-to-hire, and stage velocity — all live.',
              },
              {
                icon: Users,
                color: 'text-emerald-400',
                title: 'Multi-Org Tenancy',
                desc: 'Each company or client gets their own isolated workspace. Secure by default, no data bleed.',
              },
              {
                icon: Shield,
                color: 'text-amber-400',
                title: 'Enterprise-grade Security',
                desc: 'Built on Clerk + Supabase with row-level isolation. Your data never touches another org.',
              },
            ].map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="bg-zinc-950 p-7 hover:bg-zinc-900/60 transition-colors">
                <Icon className={`mb-4 h-5 w-5 ${color}`} />
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="border-t border-zinc-900 py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-14 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-500">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-bold text-white">
              Live in minutes, not months
            </h2>
          </div>

          <div className="space-y-3">
            {[
              {
                n: '01',
                title: 'Create your workspace',
                desc: 'Sign up, create your company workspace, invite your team. Done in under two minutes.',
              },
              {
                n: '02',
                title: 'Post a role',
                desc: 'Write a job description or let AI draft it. Get a shareable application link instantly.',
              },
              {
                n: '03',
                title: 'AI handles the top of funnel',
                desc: 'Candidates apply, resumes are parsed and scored automatically against your requirements.',
              },
              {
                n: '04',
                title: 'You close the best fits',
                desc: 'Review only the candidates worth your time. Move them through stages, send AI-drafted emails, hire faster.',
              },
            ].map(({ n, title, desc }) => (
              <div
                key={n}
                className="flex items-start gap-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 px-6 py-5 hover:bg-zinc-900/60 transition-colors"
              >
                <span className="shrink-0 font-black text-3xl text-zinc-800 leading-none tabular-nums">
                  {n}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-white">{title}</h3>
                  <p className="mt-1 text-sm text-zinc-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Lead capture ─────────────────────────────────────────────────── */}
      <section className="border-t border-zinc-900 py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 px-8 py-14">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Now in early access
            </div>
            <h2 className="mt-5 text-3xl font-bold text-white">
              Ready to modernise how you hire?
            </h2>
            <p className="mt-3 text-zinc-500">
              Join teams already using RecruiterStack. Or drop your email and
              we'll reach out to walk you through the platform.
            </p>

            <div className="mt-8">
              <EmailCapture
                placeholder="you@company.com"
                buttonLabel="Get early access"
                source="homepage-cta"
              />
            </div>

            <p className="mt-5 text-xs text-zinc-600">
              Or{' '}
              <Link href="/sign-up" className="text-violet-400 hover:text-violet-300 transition-colors">
                create a free account now
              </Link>{' '}
              — no credit card required.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-900 py-8 px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-600">
              <Zap className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm font-semibold text-zinc-400">RecruiterStack</span>
          </div>
          <p className="text-xs text-zinc-700">
            © {new Date().getFullYear()} RecruiterStack. All rights reserved.
          </p>
          <div className="flex items-center gap-5 text-xs text-zinc-600">
            <Link href="/sign-in" className="hover:text-zinc-400 transition-colors">Sign in</Link>
            <Link href="/sign-up" className="hover:text-zinc-400 transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
