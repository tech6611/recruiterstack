import Link from 'next/link'
import { Zap, Twitter, Linkedin } from 'lucide-react'

export function MarketingFooter() {
  return (
    <footer className="border-t border-zinc-900 bg-zinc-950">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">

          {/* Brand */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600">
                <Zap className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-white">RecruiterStack</span>
            </Link>
            <p className="text-sm text-zinc-500 leading-relaxed max-w-[200px]">
              AI agents for every stage of your hiring funnel.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <a
                href="https://twitter.com/recruiterstack"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-600 hover:text-zinc-400 transition-colors"
                aria-label="Twitter"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                href="https://linkedin.com/company/recruiterstack"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-600 hover:text-zinc-400 transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">Product</p>
            <ul className="space-y-3">
              {[
                { href: '/features', label: 'Features'       },
                { href: '/agents',   label: 'Agents'         },
                { href: '/pricing',  label: 'Pricing'        },
                { href: '/sign-up',  label: 'Get started'    },
              ].map(l => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">Company</p>
            <ul className="space-y-3">
              {[
                { href: '/about',   label: 'About'             },
                { href: '/blog',    label: 'Blog'              },
                { href: '/contact', label: 'Contact'           },
                { href: '/about',   label: 'Careers (soon)'    },
              ].map(l => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">Legal</p>
            <ul className="space-y-3">
              {[
                { href: '/privacy', label: 'Privacy Policy' },
                { href: '/terms',   label: 'Terms of Service' },
              ].map(l => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-zinc-900 px-6 py-5">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs text-zinc-700">
            © {new Date().getFullYear()} RecruiterStack. All rights reserved.
          </p>
          <p className="text-xs text-zinc-700">Built with ❤️ for recruiters</p>
        </div>
      </div>
    </footer>
  )
}
