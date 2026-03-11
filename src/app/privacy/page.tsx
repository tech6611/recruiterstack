import Link from 'next/link'
import { MarketingNav } from '@/components/marketing/MarketingNav'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'

const SECTIONS = [
  {
    title: '1. Introduction',
    body:  'RecruiterStack ("we", "us", "our") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform. Please read this policy carefully. If you disagree with its terms, please discontinue use of the site.',
  },
  {
    title: '2. Information We Collect',
    body:  'We collect information you provide directly (name, email, company details), information generated automatically when you use our services (usage data, log files, device information), and candidate data you upload or import into the platform on behalf of your organisation.',
  },
  {
    title: '3. How We Use Your Information',
    body:  'We use the information we collect to provide, maintain, and improve our services; send transactional and promotional communications; monitor and analyse usage; detect and prevent fraud; and comply with legal obligations. We do not sell your personal data to third parties.',
  },
  {
    title: '4. Data Storage & Security',
    body:  'All data is stored on Supabase with row-level security enabled. Each organisation\'s data is logically isolated — no data from one organisation is accessible to another. We use industry-standard encryption in transit (TLS) and at rest.',
  },
  {
    title: '5. Data Retention',
    body:  'We retain your data for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time by contacting hello@recruiterstack.in.',
  },
  {
    title: '6. Third-Party Services',
    body:  'We use Clerk for authentication, Supabase for data storage, Vercel for hosting, and Anthropic\'s Claude API for AI features. Each of these services has their own privacy policy governing how they handle data.',
  },
  {
    title: '7. Your Rights',
    body:  'Depending on your location, you may have the right to access, correct, delete, or export your personal data. To exercise these rights, contact hello@recruiterstack.in. We will respond within 30 days.',
  },
  {
    title: '8. Contact Us',
    body:  'If you have questions about this Privacy Policy, please contact us at hello@recruiterstack.in or via our contact page.',
  },
]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <MarketingNav />

      <section className="py-20 border-b border-zinc-900">
        <div className="mx-auto max-w-3xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-500 mb-3">Legal</p>
          <h1 className="text-4xl font-black text-white mb-2">Privacy Policy</h1>
          <p className="text-sm text-zinc-600">
            Last updated: March 2026 · <span className="text-amber-600 font-medium">Placeholder — seek legal review before publishing</span>
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-3xl px-6 space-y-10">
          {SECTIONS.map(({ title, body }) => (
            <div key={title}>
              <h2 className="text-base font-bold text-white mb-2">{title}</h2>
              <p className="text-sm text-zinc-500 leading-relaxed">{body}</p>
            </div>
          ))}
          <div className="pt-4 border-t border-zinc-900">
            <p className="text-xs text-zinc-700">
              Questions?{' '}
              <Link href="/contact" className="text-violet-400 hover:text-violet-300 transition-colors">
                Contact us
              </Link>
            </p>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}
