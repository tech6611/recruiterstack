import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'
import { ClerkProvider } from '@clerk/nextjs'

const inter = Inter({ subsets: ['latin'] })

const GA_ID = 'G-DLRVVH1FBQ'

export const metadata: Metadata = {
  title: 'RecruiterStack',
  description: 'AI-powered recruiting platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
    <html lang="en">
      <body className={`${inter.className} relative`}>
        {/* Global decorative gradient orbs */}
        <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden bg-[var(--background)]">
          <div className="absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full bg-emerald-300/20 blur-[120px]" />
          <div className="absolute top-1/2 right-1/4 h-[400px] w-[400px] rounded-full bg-gold-300/20 blur-[100px]" />
        </div>
        
        {children}
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
