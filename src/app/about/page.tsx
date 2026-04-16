import Link from 'next/link'
import { ArrowRight, Mail } from 'lucide-react'
import { MarketingNav } from '@/components/marketing/MarketingNav'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <MarketingNav />

      {/* Hero */}
      <section className="relative overflow-hidden bg-transparent">
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center">
          <div className="mt-0 h-[300px] w-[700px] rounded-full bg-emerald-500/10 blur-[120px]" />
        </div>
        <div className="relative mx-auto max-w-3xl px-6 py-24 text-center">
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Built for the next era of <span className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-gold-500 bg-clip-text text-transparent">recruiting</span>
          </h1>
          <p className="mt-5 text-lg text-slate-600 leading-relaxed">
            RecruiterStack was born from a simple frustration: too much time spent on tasks
            that don&apos;t require human judgment, and not enough time on the ones that do.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-20 border-b border-slate-200">
        <div className="mx-auto max-w-3xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-4">Our mission</p>
          <h2 className="text-2xl font-bold text-slate-900 mb-5">
            Make great hiring accessible to every team, not just those with big recruiting budgets.
          </h2>
          <p className="text-slate-500 leading-relaxed mb-4">
            Recruiting has been plagued by tools that were designed to track, not to act.
            Legacy ATS platforms collect data. RecruiterStack does something with it —
            scoring, shortlisting, scheduling, drafting — so your team can focus on the
            conversations that actually move the needle.
          </p>
          <p className="text-slate-500 leading-relaxed">
            We&apos;re building a suite of AI agents that plug into your existing infrastructure
            and eliminate the manual work at every stage of the funnel. From the first job
            description to the signed offer letter.
          </p>
        </div>
      </section>

      {/* Team placeholder */}
      <section className="py-20 border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-4 text-center">Team</p>
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-3">Our story is still being written</h2>
          <p className="text-slate-400 text-center mb-12 max-w-xl mx-auto">
            We&apos;re a small team of engineers, recruiters, and product people who&apos;ve seen firsthand
            how broken the hiring process is. Full team bios coming soon.
          </p>

          <div className="grid gap-5 sm:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-slate-100 border border-slate-200" />
                <div className="h-3 w-24 mx-auto rounded bg-slate-100 mb-2" />
                <div className="h-2 w-16 mx-auto rounded bg-slate-50" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="py-20">
        <div className="mx-auto max-w-xl px-6 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Get in touch</h2>
          <p className="text-slate-400 mb-8">
            Investors, press, partnerships — we&apos;d love to hear from you.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="mailto:hello@recruiterstack.in"
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors"
            >
              <Mail className="h-4 w-4" />
              hello@recruiterstack.in
            </a>
            <Link
              href="/contact"
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
            >
              Contact form <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}
