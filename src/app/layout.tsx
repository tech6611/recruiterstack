import type { Metadata } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'
import { ClerkProvider } from '@clerk/nextjs'
import { Toaster } from 'sonner'

const inter = Inter({ subsets: ['latin'] })
// Display font for headings (Direction D — Warm Confident). Exposed as a CSS
// variable so globals.css can apply it to h1–h4 and `font-display` can opt in.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
})

const GA_ID = 'G-DLRVVH1FBQ'

export const metadata: Metadata = {
  title: 'RecruiterStack',
  description: 'AI-powered recruiting platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
    <html lang="en">
      <body className={`${inter.className} ${jakarta.variable} relative`}>
        {/* Global decorative gradient orbs — kept very subtle so the flat,
            warm Direction-D surfaces stay clean. */}
        <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden bg-[var(--background)]">
          <div className="absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full bg-emerald-300/10 blur-[120px]" />
          <div className="absolute top-1/2 right-1/4 h-[400px] w-[400px] rounded-full bg-gold-300/10 blur-[100px]" />
        </div>
        
        {children}
        <Toaster position="top-right" richColors closeButton />
        <Analytics />

        {/* Google Analytics */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
      </body>
    </html>
    </ClerkProvider>
  )
}
