import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Zap,
  ArrowRight,
  Brain,
  Users,
  BarChart2,
  CheckCircle,
  Shield,
  Inbox,
} from 'lucide-react'

export default function HomePage() {
  const { userId } = auth()
  if (userId) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-slate-100 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-bold tracking-tight">RecruiterStack</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Get started free
          </Link>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50/60 via-white to-white pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 mb-8">
            <Zap className="h-3 w-3" />
            AI-powered recruiting, built for modern teams
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight mb-6">
            Hire smarter.<br />
            <span className="text-blue-600">Close faster.</span>
          </h1>

          <p className="text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            RecruiterStack is the AI-native ATS that scores candidates automatically,
            keeps your pipeline moving, and lets you focus on the conversations that matter.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
            >
              Start hiring for free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/sign-in"
              className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-base font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Sign in to your workspace
            </Link>
          </div>

          <p className="mt-5 text-sm text-slate-400">Free to start · No credit card required</p>
        </div>
      </section>

      {/* ── Social proof bar ──────────────────────────────────────────────── */}
      <section className="border-y border-slate-100 bg-slate-50/60 py-6">
        <div className="max-w-4xl mx-auto px-6 flex flex-wrap items-center justify-center gap-8">
          {[
            { value: '10×', label: 'faster candidate review' },
            { value: '100%', label: 'data isolation per org' },
            { value: 'AI', label: 'scoring on every resume' },
            { value: '0', label: 'setup required' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-2xl font-extrabold text-blue-600">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-slate-900">Everything you need to hire well</h2>
          <p className="mt-3 text-lg text-slate-500">
            From the first application to the offer letter — all in one place.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Brain,
              color: 'bg-violet-100 text-violet-600',
              title: 'AI Candidate Scoring',
              desc: 'Every resume is automatically scored against your job requirements. Surface the best candidates instantly without manual screening.',
            },
            {
              icon: BarChart2,
              color: 'bg-blue-100 text-blue-600',
              title: 'Visual Pipeline',
              desc: 'Drag-and-drop stages, colour-coded by progress. See exactly where every candidate stands across all your open roles.',
            },
            {
              icon: Inbox,
              color: 'bg-amber-100 text-amber-600',
              title: 'Smart Inbox',
              desc: 'A single feed of what needs your attention — stale applications, recent activity, and follow-ups that are overdue.',
            },
            {
              icon: Users,
              color: 'bg-emerald-100 text-emerald-600',
              title: 'Team Workspaces',
              desc: 'Create a workspace for your company. Invite recruiters and hiring managers. Each org sees only their own data.',
            },
            {
              icon: Shield,
              color: 'bg-slate-100 text-slate-600',
              title: 'Multi-tenant Security',
              desc: 'Powered by Clerk + Supabase. Every query is scoped to your organisation — no data leaks, ever.',
            },
            {
              icon: CheckCircle,
              color: 'bg-green-100 text-green-600',
              title: 'Analytics & Reporting',
              desc: 'Pipeline funnel, source breakdown, time-in-stage velocity. Know exactly where your hiring process is breaking down.',
            },
          ].map(({ icon: Icon, color, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1.5">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="bg-slate-50 py-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900">Up and running in minutes</h2>
            <p className="mt-3 text-lg text-slate-500">No consultants. No lengthy onboarding. Just sign up and go.</p>
          </div>

          <div className="space-y-4">
            {[
              {
                step: '01',
                title: 'Create your workspace',
                desc: 'Sign up with Google or email, create your company org, and invite your team.',
              },
              {
                step: '02',
                title: 'Post your first job',
                desc: 'Write a job description (or let AI draft it) and get a shareable application link instantly.',
              },
              {
                step: '03',
                title: 'Let AI do the screening',
                desc: 'Candidates apply, resumes are parsed and scored automatically. You review only the top fits.',
              },
              {
                step: '04',
                title: 'Move fast, hire great',
                desc: 'Advance candidates through your pipeline, send AI-drafted outreach emails, and close roles faster.',
              },
            ].map(({ step, title, desc }) => (
              <div
                key={step}
                className="flex items-start gap-5 rounded-2xl border border-slate-200 bg-white px-6 py-5"
              >
                <span className="shrink-0 text-3xl font-black text-blue-100 leading-none">{step}</span>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-3xl bg-blue-600 px-8 py-14 shadow-xl shadow-blue-200">
            <h2 className="text-3xl font-extrabold text-white mb-4">
              Ready to hire better?
            </h2>
            <p className="text-blue-200 text-lg mb-8">
              Join teams already using RecruiterStack to build their dream teams.
            </p>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-base font-bold text-blue-600 hover:bg-blue-50 transition-colors shadow-lg"
            >
              Get started free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600">
              <Zap className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-700">RecruiterStack</span>
          </div>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} RecruiterStack. All rights reserved.</p>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <Link href="/sign-in" className="hover:text-slate-600 transition-colors">Sign in</Link>
            <Link href="/sign-up" className="hover:text-slate-600 transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
