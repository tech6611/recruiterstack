import Link from 'next/link'
import { MarketingNav } from '@/components/marketing/MarketingNav'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body:  'By accessing or using RecruiterStack, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the service. We reserve the right to modify these terms at any time — continued use constitutes acceptance of any changes.',
  },
  {
    title: '2. Use of the Service',
    body:  'RecruiterStack grants you a limited, non-exclusive, non-transferable licence to access and use the platform for your internal business purposes. You may not resell, sublicence, or otherwise commercialise the service without our prior written consent.',
  },
  {
    title: '3. User Accounts',
    body:  'You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. Notify us immediately of any unauthorised use of your account at hello@recruiterstack.in.',
  },
  {
    title: '4. Data Ownership',
    body:  'You retain ownership of all data you upload to RecruiterStack, including candidate information, job descriptions, and company data. By uploading data, you grant us the right to process it solely to provide the service. We do not claim any ownership over your data.',
  },
  {
    title: '5. Acceptable Use',
    body:  'You agree not to use RecruiterStack for unlawful purposes, to upload malicious code, to attempt to reverse engineer the platform, or to use our AI features to make discriminatory hiring decisions. We reserve the right to terminate accounts that violate these terms.',
  },
  {
    title: '6. AI Features',
    body:  'Our AI-powered features (scoring, drafting, scheduling) are provided to assist human decision-making. They should not be used as the sole basis for hiring decisions. You remain responsible for all final hiring decisions made using the platform.',
  },
  {
    title: '7. Payments & Refunds',
    body:  'Paid plans are billed monthly or annually as selected. All fees are non-refundable except where required by law. We reserve the right to change pricing with 30 days notice. You may cancel your subscription at any time; access continues until the end of the billing period.',
  },
  {
    title: '8. Limitation of Liability',
    body:  'To the maximum extent permitted by law, RecruiterStack shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service. Our total liability shall not exceed the amount you paid in the preceding 12 months.',
  },
  {
    title: '9. Contact',
    body:  'For questions about these Terms of Service, contact hello@recruiterstack.in.',
  },
]

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#061D46] text-white">
      <MarketingNav />

      <section className="py-20 border-b border-white/10">
        <div className="mx-auto max-w-3xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">Legal</p>
          <h1 className="text-4xl font-black text-white mb-2">Terms of Service</h1>
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
              <p className="text-sm text-blue-200/40 leading-relaxed">{body}</p>
            </div>
          ))}
          <div className="pt-4 border-t border-white/10">
            <p className="text-xs text-zinc-700">
              Questions?{' '}
              <Link href="/contact" className="text-blue-400 hover:text-blue-300 transition-colors">
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
