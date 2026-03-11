'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  FileText,
  Search,
  Brain,
  CalendarCheck,
  BadgeCheck,
  Check,
  X,
  Plus,
  Minus,
} from 'lucide-react'
import { MarketingNav } from '@/components/marketing/MarketingNav'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgentCard {
  name: string
  role: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  border: string
  bg: string
  badge: string
  iconColor: string
  btnBg: string
  monthlyPrice: number
  features: string[]
}

interface FaqItem {
  q: string
  a: string
}

// ── Data ───────────────────────────────────────────────────────────────────────

const AGENT_CARDS: AgentCard[] = [
  {
    name:         'Drafter',
    role:         'Job Creation & Tracking',
    icon:         FileText,
    color:        'text-violet-400',
    border:       'border-violet-500/30',
    bg:           'bg-violet-500/10',
    badge:        'bg-violet-500/20 text-violet-300',
    iconColor:    'text-violet-400',
    btnBg:        'bg-violet-600 hover:bg-violet-500',
    monthlyPrice: 19,
    features: [
      'AI-drafted job descriptions',
      'Requisition approval workflows',
      'Multi-board posting links',
      'Role status tracking',
      'Hiring manager collaboration',
    ],
  },
  {
    name:         'Scout',
    role:         'Sourcing',
    icon:         Search,
    color:        'text-blue-400',
    border:       'border-blue-500/30',
    bg:           'bg-blue-500/10',
    badge:        'bg-blue-500/20 text-blue-300',
    iconColor:    'text-blue-400',
    btnBg:        'bg-blue-600 hover:bg-blue-500',
    monthlyPrice: 29,
    features: [
      'Bulk CSV import',
      'PDF CV parsing',
      'Paste-to-candidate',
      'Auto deduplication',
      'Source attribution tracking',
    ],
  },
  {
    name:         'Sifter',
    role:         'Screening & Scoring',
    icon:         Brain,
    color:        'text-fuchsia-400',
    border:       'border-fuchsia-500/30',
    bg:           'bg-fuchsia-500/10',
    badge:        'bg-fuchsia-500/20 text-fuchsia-300',
    iconColor:    'text-fuchsia-400',
    btnBg:        'bg-fuchsia-600 hover:bg-fuchsia-500',
    monthlyPrice: 29,
    features: [
      'JD-vs-CV fit scoring (0–100)',
      'Strengths & gaps analysis',
      'Auto top-10% shortlist',
      'Bulk stage moves',
      'Custom scoring criteria',
    ],
  },
  {
    name:         'Scheduler',
    role:         'Interview Coordination',
    icon:         CalendarCheck,
    color:        'text-emerald-400',
    border:       'border-emerald-500/30',
    bg:           'bg-emerald-500/10',
    badge:        'bg-emerald-500/20 text-emerald-300',
    iconColor:    'text-emerald-400',
    btnBg:        'bg-emerald-600 hover:bg-emerald-500',
    monthlyPrice: 19,
    features: [
      'Automated interview invites',
      'Candidate prep packs',
      'Multi-round scheduling',
      'Automatic reminders',
      'Interview feedback templates',
    ],
  },
  {
    name:         'Closer',
    role:         'Offer Management',
    icon:         BadgeCheck,
    color:        'text-amber-400',
    border:       'border-amber-500/30',
    bg:           'bg-amber-500/10',
    badge:        'bg-amber-500/20 text-amber-300',
    iconColor:    'text-amber-400',
    btnBg:        'bg-amber-600 hover:bg-amber-500',
    monthlyPrice: 19,
    features: [
      'AI-drafted offer letters',
      'Offer approval workflows',
      'Digital delivery & e-signature',
      'Acceptance tracking',
      'Onboarding handoff trigger',
    ],
  },
]

const FAQ_ITEMS: FaqItem[] = [
  {
    q: 'Can I mix and match agents?',
    a: 'Yes, each agent is completely independent. Add or remove any agent at any time directly from your account settings — no contract changes required.',
  },
  {
    q: 'Is there a free tier?',
    a: 'Yes — sign up for free to get 1 active job, up to 50 candidates, and basic AI scoring included. No credit card required.',
  },
  {
    q: 'How does plug-and-play work?',
    a: 'Connect via our API or upload a CSV from any job board. There is no data migration, no downtime, and no engineering work required to get started.',
  },
  {
    q: 'Where is my data stored?',
    a: 'All data is stored on Supabase with row-level security enforced. Your data is completely isolated and is never shared with or visible to other organisations.',
  },
  {
    q: 'Do you offer annual contracts?',
    a: 'Yes — annual billing saves 20% across all plans and includes priority support. Contact us to set up an annual contract for your team.',
  },
]

const PRO_FEATURES = [
  'All 5 agents included',
  'Up to 10 seats',
  'Standard integrations (CSV, API)',
  'Email & chat support',
  'Full pipeline analytics',
  'Role & candidate history',
]

const ENTERPRISE_FEATURES = [
  'All agents + custom agents',
  'Unlimited seats',
  'SSO + custom integrations',
  'Dedicated Customer Success Manager',
  'Custom dashboards & reporting',
  'SLAs & uptime guarantees',
]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly')
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  function toggleFaq(idx: number) {
    if (openFaq === idx) {
      setOpenFaq(null)
    } else {
      setOpenFaq(idx)
    }
  }

  function displayPrice(monthlyPrice: number) {
    if (billingPeriod === 'annual') {
      return Math.floor(monthlyPrice * 0.8)
    }
    return monthlyPrice
  }

  const proMonthly = billingPeriod === 'annual' ? 119 : 149

  return (
    <div className="min-h-screen bg-zinc-950">
      <MarketingNav />

      {/* Hero */}
      <section className="border-b border-zinc-900 py-24 text-center">
        <div className="mx-auto max-w-6xl px-6">
          <span className="mb-4 inline-block rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-violet-400">
            Pricing
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Pay only for what<br className="hidden sm:block" /> you deploy
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-400">
            Individual agents or the full suite — no hidden fees.
          </p>

          {/* Billing toggle */}
          <div className="mt-10 inline-flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${
                billingPeriod === 'monthly'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('annual')}
              className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${
                billingPeriod === 'annual'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Annual
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">
                20% off
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Build your own stack */}
      <section className="border-b border-zinc-900 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Meet the agents</h2>
            <p className="mt-2 text-zinc-400">All five are included in Pro. Buy individually coming soon.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {AGENT_CARDS.map((agent) => {
              const Icon = agent.icon
              const price = displayPrice(agent.monthlyPrice)
              return (
                <div
                  key={agent.name}
                  className={`flex flex-col rounded-2xl border ${agent.border} bg-zinc-900/50 p-6`}
                >
                  <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${agent.bg}`}>
                    <Icon className={`h-5 w-5 ${agent.iconColor}`} />
                  </div>
                  <div className={`mb-1 inline-block self-start rounded-full px-2.5 py-0.5 text-xs font-bold ${agent.badge}`}>
                    {agent.name}
                  </div>
                  <p className={`mt-0.5 text-xs font-medium ${agent.color}`}>{agent.role}</p>

                  <div className="mt-4 flex items-end gap-1">
                    <span className="text-3xl font-bold text-white">${price}</span>
                    <span className="mb-1 text-sm text-zinc-500">/mo</span>
                  </div>
                  {billingPeriod === 'annual' && (
                    <p className="mt-0.5 text-xs text-zinc-600 line-through">
                      ${agent.monthlyPrice}/mo
                    </p>
                  )}

                  <ul className="my-5 flex-1 space-y-2">
                    {agent.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${agent.iconColor}`} />
                        <span className="text-xs text-zinc-400">{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <a
                    href="#full-suite"
                    className="mt-auto block rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-center text-sm font-semibold text-zinc-300 hover:border-zinc-600 hover:text-white transition-colors"
                  >
                    Included in Pro ↓
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Full suite */}
      <section id="full-suite" className="border-b border-zinc-900 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Full suite</h2>
            <p className="mt-2 text-zinc-400">All 5 agents. One flat price. Zero per-agent billing.</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Pro */}
            <div className="relative flex flex-col rounded-2xl border border-violet-500/40 bg-violet-500/5 p-8">
              <div className="absolute -top-3 left-6">
                <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-bold text-white">
                  Most popular
                </span>
              </div>
              <h3 className="text-xl font-bold text-white">Pro</h3>
              <p className="mt-1 text-sm text-zinc-400">For growing teams ready to automate the full funnel.</p>
              <div className="mt-6 flex items-end gap-2">
                <span className="text-5xl font-bold text-white">${proMonthly}</span>
                <span className="mb-2 text-sm text-zinc-500">/mo</span>
              </div>
              {billingPeriod === 'annual' && (
                <p className="mt-0.5 text-xs text-zinc-600 line-through">$149/mo</p>
              )}
              <ul className="my-8 space-y-3">
                {PRO_FEATURES.map((feat) => (
                  <li key={feat} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                    <span className="text-sm text-zinc-300">{feat}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className="mt-auto block rounded-xl bg-violet-600 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
              >
                Get started with Pro
              </Link>
            </div>

            {/* Enterprise */}
            <div className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
              <h3 className="text-xl font-bold text-white">Enterprise</h3>
              <p className="mt-1 text-sm text-zinc-400">For large teams with complex workflows and compliance needs.</p>
              <div className="mt-6 flex items-end gap-2">
                <span className="text-5xl font-bold text-white">Custom</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Pricing based on seats and usage</p>
              <ul className="my-8 space-y-3">
                {ENTERPRISE_FEATURES.map((feat) => (
                  <li key={feat} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <span className="text-sm text-zinc-300">{feat}</span>
                  </li>
                ))}
              </ul>
              <a
                href="mailto:enterprise@recruiterstack.com"
                className="mt-auto block rounded-xl border border-zinc-700 px-6 py-3 text-center text-sm font-semibold text-white hover:border-zinc-600 hover:bg-zinc-800 transition-colors"
              >
                Contact sales
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison row: free vs pro vs enterprise */}
      <section className="border-b border-zinc-900 py-14">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="mb-8 text-center text-xl font-bold text-white">Plan comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="pb-4 text-left font-medium text-zinc-500">Feature</th>
                  <th className="pb-4 text-center font-medium text-zinc-500">Free</th>
                  <th className="pb-4 text-center font-semibold text-violet-400">Pro</th>
                  <th className="pb-4 text-center font-medium text-amber-400">Enterprise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {[
                  { label: 'Active jobs',       free: '1',          pro: 'Unlimited',    ent: 'Unlimited' },
                  { label: 'Candidates',        free: '50',         pro: 'Unlimited',    ent: 'Unlimited' },
                  { label: 'AI scoring',        free: 'Basic',      pro: 'Full',         ent: 'Full + custom' },
                  { label: 'Agents',            free: 'Sifter only',pro: 'All 5',        ent: 'All 5 + custom' },
                  { label: 'Seats',             free: '1',          pro: 'Up to 10',     ent: 'Unlimited' },
                  { label: 'SSO',               free: false,        pro: false,          ent: true },
                  { label: 'Dedicated CSM',     free: false,        pro: false,          ent: true },
                  { label: 'SLA',               free: false,        pro: false,          ent: true },
                ].map((row) => (
                  <tr key={row.label} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="py-3.5 text-zinc-300">{row.label}</td>
                    <td className="py-3.5 text-center text-zinc-500">
                      {typeof row.free === 'boolean' ? (
                        row.free ? <Check className="mx-auto h-4 w-4 text-emerald-400" /> : <X className="mx-auto h-4 w-4 text-zinc-700" />
                      ) : row.free}
                    </td>
                    <td className="py-3.5 text-center text-zinc-300">
                      {typeof row.pro === 'boolean' ? (
                        row.pro ? <Check className="mx-auto h-4 w-4 text-emerald-400" /> : <X className="mx-auto h-4 w-4 text-zinc-700" />
                      ) : row.pro}
                    </td>
                    <td className="py-3.5 text-center text-zinc-300">
                      {typeof row.ent === 'boolean' ? (
                        row.ent ? <Check className="mx-auto h-4 w-4 text-emerald-400" /> : <X className="mx-auto h-4 w-4 text-zinc-700" />
                      ) : row.ent}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="mb-10 text-center text-2xl font-bold text-white sm:text-3xl">
            Frequently asked questions
          </h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, idx) => (
              <div
                key={item.q}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
                  aria-expanded={openFaq === idx}
                >
                  <span className="text-sm font-semibold text-white">{item.q}</span>
                  {openFaq === idx ? (
                    <Minus className="h-4 w-4 shrink-0 text-zinc-500" />
                  ) : (
                    <Plus className="h-4 w-4 shrink-0 text-zinc-500" />
                  )}
                </button>
                {openFaq === idx && (
                  <div className="border-t border-zinc-800 px-6 py-4">
                    <p className="text-sm text-zinc-400 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}
