import { ArrowRight, Rss } from 'lucide-react'
import { EmailCapture } from '@/components/EmailCapture'
import { MarketingNav } from '@/components/marketing/MarketingNav'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'

const PLACEHOLDER_POSTS = [
  {
    category: 'Product',
    title:    'Introducing RecruiterStack Agents: AI for every stage of your hiring funnel',
    excerpt:  'We built 5 AI agents that plug into your existing recruiting stack. Here\'s why we designed them this way.',
    date:     'Coming soon',
    color:    'text-emerald-600',
    badge:    'bg-emerald-100 text-emerald-700',
  },
  {
    category: 'Guide',
    title:    'How to cut time-to-hire by 60% without changing your ATS',
    excerpt:  'A step-by-step guide to deploying AI agents on top of Greenhouse, Lever, or Workday without any migration.',
    date:     'Coming soon',
    color:    'text-emerald-600',
    badge:    'bg-emerald-100 text-emerald-700',
  },
  {
    category: 'Insights',
    title:    'The real cost of manual CV screening (it\'s not just time)',
    excerpt:  'Data from 50+ recruiting teams on what happens when screening is done entirely by hand — and what AI changes.',
    date:     'Coming soon',
    color:    'text-fuchsia-600',
    badge:    'bg-fuchsia-100 text-fuchsia-700',
  },
]

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <MarketingNav />

      {/* Hero */}
      <section className="bg-transparent py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Recruiting, <span className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-gold-500 bg-clip-text text-transparent">reimagined</span>
          </h1>
          <p className="mt-4 text-slate-600 text-lg">
            Guides, product updates, and insights on AI-powered hiring.
          </p>
        </div>
      </section>

      {/* Placeholder posts */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex items-center gap-2 mb-8">
            <Rss className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-semibold text-slate-500">Latest posts</span>
            <span className="text-xs text-slate-400 ml-2">— Content coming soon</span>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {PLACEHOLDER_POSTS.map(({ category, title, excerpt, date, color, badge }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col shadow-sm"
              >
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full self-start ${badge} mb-4`}>
                  {category}
                </span>
                <h3 className="text-sm font-bold text-slate-900 leading-snug flex-1">{title}</h3>
                <p className="mt-3 text-xs text-slate-400 leading-relaxed">{excerpt}</p>
                <div className="mt-5 flex items-center justify-between">
                  <span className="text-xs text-slate-400">{date}</span>
                  <span className={`flex items-center gap-1 text-xs font-semibold ${color} opacity-50`}>
                    Read <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Subscribe */}
      <section className="bg-transparent py-20">
        <div className="mx-auto max-w-xl px-6 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Stay in the loop</h2>
          <p className="text-slate-500 mb-8">
            Get notified when we publish new articles, product updates, and recruiting guides.
          </p>
          <EmailCapture
            placeholder="your@email.com"
            buttonLabel="Subscribe"
            source="blog-subscribe"
          />
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}
