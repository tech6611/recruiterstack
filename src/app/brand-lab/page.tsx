'use client'

/**
 * Brand Lab — a throwaway preview page for evaluating rebrand directions.
 * Self-contained: imports nothing from the app, alters nothing. Safe to delete.
 * Visit /brand-lab while signed in.
 */

import { useState } from 'react'
import { Inter, Plus_Jakarta_Sans, Fraunces } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], display: 'swap' })
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', weight: ['500', '600', '700', '800'] })
const fraunces = Fraunces({ subsets: ['latin'], display: 'swap', weight: ['400', '500', '600', '700'] })

type Theme = {
  id: string
  name: string
  tagline: string
  vibe: string
  fontHeading: string
  fontBody: string
  fontHeadingName: string
  fontBodyName: string
  swatches: { name: string; hex: string; ring?: boolean }[]
  pageBg: string
  surface: string // app frame background
  sidebar: string
  sidebarBrandText: string
  logoBox: string
  navActive: string
  navIdle: string
  navIcon: string
  topbar: string
  searchBox: string
  primaryBtn: string
  accentText: string
  heading: string
  subtext: string
  card: string // the ONE surface treatment
  cardPad: string
  sectionDivide: string // "dissolved card" style — dividers not boxes
  statTiles: { label: string; value: string; delta: string; accent: string }[]
  tableHead: string
  tableRow: string
  tableDivide: string
  badge: (k: 'new' | 'review' | 'offer' | 'hold') => string
}

const THEMES: Theme[] = [
  {
    id: 'A',
    name: 'Clean Enterprise',
    tagline: 'Cool grays · Indigo · Flat hairline surfaces',
    vibe: 'Calm, trustworthy, “obviously pays for itself.” Linear / Stripe lineage.',
    fontHeading: inter.className,
    fontBody: inter.className,
    fontHeadingName: 'Inter (tight, semibold)',
    fontBodyName: 'Inter',
    swatches: [
      { name: 'Ink', hex: '#111827' },
      { name: 'Indigo 600', hex: '#4f46e5', ring: true },
      { name: 'Gray 200', hex: '#e5e7eb' },
      { name: 'Gray 50', hex: '#f9fafb' },
      { name: 'Emerald', hex: '#059669' },
      { name: 'Amber', hex: '#d97706' },
    ],
    pageBg: 'bg-[#f7f8fa]',
    surface: 'bg-[#f7f8fa]',
    sidebar: 'bg-white border-r border-gray-200',
    sidebarBrandText: 'text-gray-900',
    logoBox: 'bg-indigo-600',
    navActive: 'bg-indigo-50 text-indigo-700 font-medium',
    navIdle: 'text-gray-500 hover:bg-gray-50 hover:text-gray-900',
    navIcon: 'text-current',
    topbar: 'bg-white/80 border-b border-gray-200 backdrop-blur',
    searchBox: 'bg-gray-50 border border-gray-200 text-gray-400',
    primaryBtn: 'bg-indigo-600 text-white hover:bg-indigo-700',
    accentText: 'text-indigo-600',
    heading: 'text-gray-900 tracking-tight font-semibold',
    subtext: 'text-gray-500',
    card: 'bg-white border border-gray-200 rounded-lg',
    cardPad: 'p-5',
    sectionDivide: 'divide-y divide-gray-100',
    statTiles: [
      { label: 'Open roles', value: '24', delta: '+3', accent: 'text-indigo-600' },
      { label: 'In pipeline', value: '312', delta: '+18', accent: 'text-emerald-600' },
      { label: 'Offers out', value: '7', delta: '+1', accent: 'text-amber-600' },
    ],
    tableHead: 'text-gray-400 border-b border-gray-200',
    tableRow: 'hover:bg-gray-50',
    tableDivide: 'divide-y divide-gray-100',
    badge: (k) =>
      ({
        new: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100',
        review: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
        offer: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
        hold: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
      })[k],
  },
  {
    id: 'B',
    name: 'Modern SaaS',
    tagline: 'High contrast · Dark sidebar · Confident emerald',
    vibe: 'Bold, modern, product-led. Keeps your brand green but makes it deliberate. Vercel / Resend energy.',
    fontHeading: jakarta.className,
    fontBody: inter.className,
    fontHeadingName: 'Plus Jakarta Sans (extrabold)',
    fontBodyName: 'Inter',
    swatches: [
      { name: 'Near-black', hex: '#0b0d10' },
      { name: 'Emerald 500', hex: '#10b981', ring: true },
      { name: 'White', hex: '#ffffff' },
      { name: 'Gray 200', hex: '#e5e7eb' },
      { name: 'Sky', hex: '#0ea5e9' },
      { name: 'Rose', hex: '#f43f5e' },
    ],
    pageBg: 'bg-white',
    surface: 'bg-white',
    sidebar: 'bg-[#0b0d10] border-r border-black/30',
    sidebarBrandText: 'text-white',
    logoBox: 'bg-emerald-500',
    navActive: 'bg-emerald-500/15 text-emerald-400 font-medium',
    navIdle: 'text-gray-400 hover:bg-white/5 hover:text-white',
    navIcon: 'text-current',
    topbar: 'bg-white border-b border-gray-200',
    searchBox: 'bg-gray-100 border border-gray-200 text-gray-400',
    primaryBtn: 'bg-emerald-500 text-white hover:bg-emerald-600',
    accentText: 'text-emerald-600',
    heading: 'text-gray-900 tracking-tight font-extrabold',
    subtext: 'text-gray-500',
    card: 'bg-white border border-gray-200 rounded-xl shadow-sm',
    cardPad: 'p-5',
    sectionDivide: 'divide-y divide-gray-100',
    statTiles: [
      { label: 'Open roles', value: '24', delta: '+3', accent: 'text-emerald-600' },
      { label: 'In pipeline', value: '312', delta: '+18', accent: 'text-sky-600' },
      { label: 'Offers out', value: '7', delta: '+1', accent: 'text-emerald-600' },
    ],
    tableHead: 'text-gray-400 border-b border-gray-200',
    tableRow: 'hover:bg-gray-50',
    tableDivide: 'divide-y divide-gray-100',
    badge: (k) =>
      ({
        new: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
        review: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
        offer: 'bg-sky-50 text-sky-700 ring-1 ring-sky-100',
        hold: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
      })[k],
  },
  {
    id: 'C',
    name: 'Warm Editorial',
    tagline: 'Cream paper · Pine green · Serif headings',
    vibe: 'Human, premium, calm. Almost no hard boxes — whitespace does the work. Notion / Mercury feel.',
    fontHeading: fraunces.className,
    fontBody: inter.className,
    fontHeadingName: 'Fraunces (serif)',
    fontBodyName: 'Inter',
    swatches: [
      { name: 'Bark', hex: '#2a2118' },
      { name: 'Pine 700', hex: '#14573f', ring: true },
      { name: 'Cream', hex: '#faf7f2' },
      { name: 'Sand 200', hex: '#ece4d6' },
      { name: 'Clay', hex: '#b4612f' },
      { name: 'Sage', hex: '#6f8a73' },
    ],
    pageBg: 'bg-[#faf7f2]',
    surface: 'bg-[#faf7f2]',
    sidebar: 'bg-[#f4efe7] border-r border-[#e7ded0]',
    sidebarBrandText: 'text-[#2a2118]',
    logoBox: 'bg-[#14573f]',
    navActive: 'bg-[#e4ede7] text-[#14573f] font-medium',
    navIdle: 'text-[#6b6256] hover:bg-[#efe8dd] hover:text-[#2a2118]',
    navIcon: 'text-current',
    topbar: 'bg-[#faf7f2]/80 border-b border-[#ece4d6] backdrop-blur',
    searchBox: 'bg-white border border-[#ece4d6] text-[#a89c88]',
    primaryBtn: 'bg-[#14573f] text-white hover:bg-[#0f4530]',
    accentText: 'text-[#14573f]',
    heading: 'text-[#2a2118]',
    subtext: 'text-[#8a7f6f]',
    card: 'bg-white border border-[#ece4d6] rounded-2xl',
    cardPad: 'p-6',
    sectionDivide: 'divide-y divide-[#f0e9dd]',
    statTiles: [
      { label: 'Open roles', value: '24', delta: '+3', accent: 'text-[#14573f]' },
      { label: 'In pipeline', value: '312', delta: '+18', accent: 'text-[#b4612f]' },
      { label: 'Offers out', value: '7', delta: '+1', accent: 'text-[#6f8a73]' },
    ],
    tableHead: 'text-[#a89c88] border-b border-[#ece4d6]',
    tableRow: 'hover:bg-[#f7f2ea]',
    tableDivide: 'divide-y divide-[#f0e9dd]',
    badge: (k) =>
      ({
        new: 'bg-[#e4ede7] text-[#14573f] ring-1 ring-[#cfe0d6]',
        review: 'bg-[#f6e9da] text-[#b4612f] ring-1 ring-[#ecd9c2]',
        offer: 'bg-[#e9efe8] text-[#4f6b53] ring-1 ring-[#d6e2d6]',
        hold: 'bg-[#efe8dd] text-[#8a7f6f] ring-1 ring-[#e2d8c8]',
      })[k],
  },
  {
    id: 'D',
    name: 'Warm Confident',
    tagline: 'Cream content · Espresso sidebar · Sans headings · Pine',
    vibe: 'A blend of B and C — Editorial’s warm cream paper with the confidence of a bold dark sidebar and crisp sans headings.',
    fontHeading: jakarta.className,
    fontBody: inter.className,
    fontHeadingName: 'Plus Jakarta Sans',
    fontBodyName: 'Inter',
    swatches: [
      { name: 'Espresso', hex: '#221b14' },
      { name: 'Pine 700', hex: '#15604a', ring: true },
      { name: 'Cream', hex: '#faf7f2' },
      { name: 'Sand 200', hex: '#ece4d6' },
      { name: 'Clay', hex: '#b4612f' },
      { name: 'Sage', hex: '#6f8a73' },
    ],
    pageBg: 'bg-[#faf7f2]',
    surface: 'bg-[#faf7f2]',
    sidebar: 'bg-[#221b14] border-r border-black/30',
    sidebarBrandText: 'text-[#f3ece0]',
    logoBox: 'bg-[#15604a]',
    navActive: 'bg-white/10 text-[#f3ece0] font-medium',
    navIdle: 'text-[#a89a85] hover:bg-white/5 hover:text-[#f3ece0]',
    navIcon: 'text-current',
    topbar: 'bg-[#faf7f2]/80 border-b border-[#ece4d6] backdrop-blur',
    searchBox: 'bg-white border border-[#ece4d6] text-[#a89c88]',
    primaryBtn: 'bg-[#15604a] text-white hover:bg-[#11503d]',
    accentText: 'text-[#15604a]',
    heading: 'text-[#2a2118]',
    subtext: 'text-[#8a7f6f]',
    card: 'bg-white border border-[#ece4d6] rounded-2xl',
    cardPad: 'p-6',
    sectionDivide: 'divide-y divide-[#f0e9dd]',
    statTiles: [
      { label: 'Open roles', value: '24', delta: '+3', accent: 'text-[#15604a]' },
      { label: 'In pipeline', value: '312', delta: '+18', accent: 'text-[#b4612f]' },
      { label: 'Offers out', value: '7', delta: '+1', accent: 'text-[#6f8a73]' },
    ],
    tableHead: 'text-[#a89c88] border-b border-[#ece4d6]',
    tableRow: 'hover:bg-[#f7f2ea]',
    tableDivide: 'divide-y divide-[#f0e9dd]',
    badge: (k) =>
      ({
        new: 'bg-[#e4ede7] text-[#15604a] ring-1 ring-[#cfe0d6]',
        review: 'bg-[#f6e9da] text-[#b4612f] ring-1 ring-[#ecd9c2]',
        offer: 'bg-[#e9efe8] text-[#4f6b53] ring-1 ring-[#d6e2d6]',
        hold: 'bg-[#efe8dd] text-[#8a7f6f] ring-1 ring-[#e2d8c8]',
      })[k],
  },
  {
    id: 'E',
    name: 'Editorial Ink',
    tagline: 'Cream paper · Ink navy · Serif headings',
    vibe: 'Warm Editorial’s classier cousin — same serif paper feel, but a deep ink-navy accent reads more classic and authoritative than green.',
    fontHeading: fraunces.className,
    fontBody: inter.className,
    fontHeadingName: 'Fraunces (serif)',
    fontBodyName: 'Inter',
    swatches: [
      { name: 'Bark', hex: '#241f1a' },
      { name: 'Ink 700', hex: '#1b3a5b', ring: true },
      { name: 'Cream', hex: '#f8f5ef' },
      { name: 'Sand 200', hex: '#e9e1d4' },
      { name: 'Brass', hex: '#a87f3d' },
      { name: 'Slate-blue', hex: '#5b7596' },
    ],
    pageBg: 'bg-[#f8f5ef]',
    surface: 'bg-[#f8f5ef]',
    sidebar: 'bg-[#f1ece2] border-r border-[#e4dccd]',
    sidebarBrandText: 'text-[#241f1a]',
    logoBox: 'bg-[#1b3a5b]',
    navActive: 'bg-[#e2e8ef] text-[#1b3a5b] font-medium',
    navIdle: 'text-[#6b6256] hover:bg-[#ebe4d8] hover:text-[#241f1a]',
    navIcon: 'text-current',
    topbar: 'bg-[#f8f5ef]/80 border-b border-[#e9e1d4] backdrop-blur',
    searchBox: 'bg-white border border-[#e9e1d4] text-[#a89c88]',
    primaryBtn: 'bg-[#1b3a5b] text-white hover:bg-[#152e49]',
    accentText: 'text-[#1b3a5b]',
    heading: 'text-[#241f1a]',
    subtext: 'text-[#8a7f6f]',
    card: 'bg-white border border-[#e9e1d4] rounded-2xl',
    cardPad: 'p-6',
    sectionDivide: 'divide-y divide-[#efe7da]',
    statTiles: [
      { label: 'Open roles', value: '24', delta: '+3', accent: 'text-[#1b3a5b]' },
      { label: 'In pipeline', value: '312', delta: '+18', accent: 'text-[#a87f3d]' },
      { label: 'Offers out', value: '7', delta: '+1', accent: 'text-[#5b7596]' },
    ],
    tableHead: 'text-[#a89c88] border-b border-[#e9e1d4]',
    tableRow: 'hover:bg-[#f4efe6]',
    tableDivide: 'divide-y divide-[#efe7da]',
    badge: (k) =>
      ({
        new: 'bg-[#e2e8ef] text-[#1b3a5b] ring-1 ring-[#cdd9e4]',
        review: 'bg-[#f3e9d4] text-[#a87f3d] ring-1 ring-[#e7d6b4]',
        offer: 'bg-[#e6ece6] text-[#4f6b53] ring-1 ring-[#d4e0d4]',
        hold: 'bg-[#ece4d8] text-[#8a7f6f] ring-1 ring-[#ddd3c2]',
      })[k],
  },
  {
    id: 'F',
    name: 'Modern Violet',
    tagline: 'High contrast · Dark sidebar · Electric violet',
    vibe: 'Modern SaaS’s structure with a different pulse — swap emerald for an electric violet. Same bold frame, more distinctive, less “every startup is green.”',
    fontHeading: jakarta.className,
    fontBody: inter.className,
    fontHeadingName: 'Plus Jakarta Sans (extrabold)',
    fontBodyName: 'Inter',
    swatches: [
      { name: 'Near-black', hex: '#0c0a14' },
      { name: 'Violet 500', hex: '#7c5cff', ring: true },
      { name: 'White', hex: '#ffffff' },
      { name: 'Gray 200', hex: '#e5e7eb' },
      { name: 'Fuchsia', hex: '#d946ef' },
      { name: 'Cyan', hex: '#06b6d4' },
    ],
    pageBg: 'bg-white',
    surface: 'bg-white',
    sidebar: 'bg-[#0c0a14] border-r border-black/30',
    sidebarBrandText: 'text-white',
    logoBox: 'bg-[#7c5cff]',
    navActive: 'bg-[#7c5cff]/15 text-[#b9a6ff] font-medium',
    navIdle: 'text-gray-400 hover:bg-white/5 hover:text-white',
    navIcon: 'text-current',
    topbar: 'bg-white border-b border-gray-200',
    searchBox: 'bg-gray-100 border border-gray-200 text-gray-400',
    primaryBtn: 'bg-[#7c5cff] text-white hover:bg-[#6a48f0]',
    accentText: 'text-[#6a48f0]',
    heading: 'text-gray-900 tracking-tight font-extrabold',
    subtext: 'text-gray-500',
    card: 'bg-white border border-gray-200 rounded-xl shadow-sm',
    cardPad: 'p-5',
    sectionDivide: 'divide-y divide-gray-100',
    statTiles: [
      { label: 'Open roles', value: '24', delta: '+3', accent: 'text-[#6a48f0]' },
      { label: 'In pipeline', value: '312', delta: '+18', accent: 'text-cyan-600' },
      { label: 'Offers out', value: '7', delta: '+1', accent: 'text-fuchsia-600' },
    ],
    tableHead: 'text-gray-400 border-b border-gray-200',
    tableRow: 'hover:bg-gray-50',
    tableDivide: 'divide-y divide-gray-100',
    badge: (k) =>
      ({
        new: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
        review: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
        offer: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100',
        hold: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
      })[k],
  },
  {
    id: 'G',
    name: 'Midnight',
    tagline: 'Full dark · Emerald glow · Premium night mode',
    vibe: 'The boldest option — a true dark product. Reads expensive and focused; great if your users live in the app all day.',
    fontHeading: jakarta.className,
    fontBody: inter.className,
    fontHeadingName: 'Plus Jakarta Sans',
    fontBodyName: 'Inter',
    swatches: [
      { name: 'Base', hex: '#0b0f14' },
      { name: 'Panel', hex: '#141a21' },
      { name: 'Emerald', hex: '#34d399', ring: true },
      { name: 'Border', hex: '#233040' },
      { name: 'Sky', hex: '#38bdf8' },
      { name: 'Amber', hex: '#fbbf24' },
    ],
    pageBg: 'bg-[#0b0f14]',
    surface: 'bg-[#0b0f14]',
    sidebar: 'bg-[#0b0f14] border-r border-[#1c2733]',
    sidebarBrandText: 'text-white',
    logoBox: 'bg-emerald-500',
    navActive: 'bg-emerald-500/15 text-emerald-300 font-medium',
    navIdle: 'text-[#7d8a99] hover:bg-white/5 hover:text-white',
    navIcon: 'text-current',
    topbar: 'bg-[#0b0f14]/90 border-b border-[#1c2733] backdrop-blur',
    searchBox: 'bg-[#141a21] border border-[#233040] text-[#6b7787]',
    primaryBtn: 'bg-emerald-500 text-[#06231a] hover:bg-emerald-400',
    accentText: 'text-emerald-400',
    heading: 'text-[#e8edf2]',
    subtext: 'text-[#8290a0]',
    card: 'bg-[#141a21] border border-[#202a36] rounded-xl',
    cardPad: 'p-5',
    sectionDivide: 'divide-y divide-[#202a36]',
    statTiles: [
      { label: 'Open roles', value: '24', delta: '+3', accent: 'text-emerald-400' },
      { label: 'In pipeline', value: '312', delta: '+18', accent: 'text-sky-400' },
      { label: 'Offers out', value: '7', delta: '+1', accent: 'text-amber-400' },
    ],
    tableHead: 'text-[#6b7787] border-b border-[#202a36]',
    tableRow: 'hover:bg-white/5',
    tableDivide: 'divide-y divide-[#202a36]',
    badge: (k) =>
      ({
        new: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20',
        review: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/20',
        offer: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/20',
        hold: 'bg-white/5 text-[#8290a0] ring-1 ring-white/10',
      })[k],
  },
]

const NAV = ['Dashboard', 'Candidates', 'Jobs', 'Pipeline', 'Offers', 'Settings']

const CANDIDATES: { name: string; role: string; stage: string; score: number; status: 'new' | 'review' | 'offer' | 'hold' }[] = [
  { name: 'Aisha Verma', role: 'Senior Backend Engineer', stage: 'Technical', score: 92, status: 'offer' },
  { name: 'Daniel Okoro', role: 'Product Designer', stage: 'Screening', score: 78, status: 'review' },
  { name: 'Mei Tanaka', role: 'Senior Backend Engineer', stage: 'Applied', score: 64, status: 'new' },
  { name: 'Luca Rossi', role: 'Growth Marketer', stage: 'On hold', score: 51, status: 'hold' },
  { name: 'Priya Nair', role: 'Product Designer', stage: 'Technical', score: 88, status: 'offer' },
]

const STATUS_LABEL: Record<string, string> = { new: 'New', review: 'In review', offer: 'Offer', hold: 'On hold' }

function MockApp({ t }: { t: Theme }) {
  return (
    <div className={`${t.fontBody} ${t.surface} overflow-hidden rounded-xl border border-black/10 shadow-2xl`}>
      {/* spec strip */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-black/10 bg-white px-6 py-4">
        <div>
          <div className={`${t.fontHeading} text-lg ${t.heading}`}>{t.name}</div>
          <div className="text-xs text-gray-500">{t.tagline}</div>
        </div>
        <div className="flex items-center gap-2">
          {t.swatches.map((s) => (
            <div key={s.name} className="flex flex-col items-center gap-1">
              <div
                className="h-9 w-9 rounded-md border border-black/10"
                style={{ background: s.hex, outline: s.ring ? '2px solid rgba(0,0,0,.12)' : undefined, outlineOffset: 2 }}
                title={`${s.name} · ${s.hex}`}
              />
              <span className="text-[9px] text-gray-400">{s.name}</span>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-500">
          <div><span className="text-gray-400">Headings:</span> {t.fontHeadingName}</div>
          <div><span className="text-gray-400">Body:</span> {t.fontBodyName}</div>
        </div>
      </div>

      {/* the mock app */}
      <div className="flex h-[560px]">
        {/* sidebar */}
        <aside className={`${t.sidebar} flex w-52 shrink-0 flex-col`}>
          <div className="flex h-14 items-center gap-2 px-4">
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${t.logoBox} text-white`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" /></svg>
            </div>
            <span className={`${t.fontHeading} text-sm font-semibold ${t.sidebarBrandText}`}>RecruiterStack</span>
          </div>
          <nav className="mt-3 flex flex-col gap-0.5 px-2">
            {NAV.map((n, i) => (
              <a key={n} className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${i === 1 ? t.navActive : t.navIdle}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${i === 1 ? 'bg-current' : 'bg-current opacity-40'}`} />
                {n}
              </a>
            ))}
          </nav>
        </aside>

        {/* main */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* topbar */}
          <div className={`${t.topbar} flex h-14 items-center gap-4 px-6`}>
            <div className={`flex h-8 flex-1 max-w-xs items-center rounded-md px-3 text-xs ${t.searchBox}`}>Search candidates…</div>
            <button className={`rounded-md px-3 py-1.5 text-xs font-medium shadow-sm ${t.primaryBtn}`}>+ Add candidate</button>
          </div>

          <div className="flex-1 space-y-5 overflow-auto p-6">
            {/* page header */}
            <div className="flex items-end justify-between">
              <div>
                <h1 className={`${t.fontHeading} text-2xl ${t.heading}`}>Candidates</h1>
                <p className={`mt-0.5 text-sm ${t.subtext}`}>312 people across 24 open roles</p>
              </div>
            </div>

            {/* stat tiles — ONE surface treatment, restrained */}
            <div className="grid grid-cols-3 gap-4">
              {t.statTiles.map((s) => (
                <div key={s.label} className={`${t.card} ${t.cardPad}`}>
                  <div className={`text-xs ${t.subtext}`}>{s.label}</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className={`${t.fontHeading} text-2xl ${t.heading}`}>{s.value}</span>
                    <span className={`text-xs font-medium ${s.accent}`}>{s.delta}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* MAIN: a single table (not 12 little cards) + a "dissolved" panel */}
            <div className="grid grid-cols-3 gap-5">
              {/* table */}
              <div className={`col-span-2 ${t.card} overflow-hidden`}>
                <div className={`flex items-center justify-between px-5 py-3.5 ${t.subtext}`}>
                  <span className={`${t.fontHeading} text-sm ${t.heading}`}>Active pipeline</span>
                  <span className="text-xs">Sorted by score</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`text-left text-[11px] uppercase tracking-wide ${t.tableHead}`}>
                      <th className="px-5 py-2 font-medium">Candidate</th>
                      <th className="px-5 py-2 font-medium">Stage</th>
                      <th className="px-5 py-2 font-medium">Score</th>
                      <th className="px-5 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className={t.tableDivide}>
                    {CANDIDATES.map((c) => (
                      <tr key={c.name} className={`${t.tableRow} transition-colors`}>
                        <td className="px-5 py-3">
                          <div className={`font-medium ${t.heading}`}>{c.name}</div>
                          <div className={`text-xs ${t.subtext}`}>{c.role}</div>
                        </td>
                        <td className={`px-5 py-3 ${t.subtext}`}>{c.stage}</td>
                        <td className="px-5 py-3">
                          <span className={`${t.fontHeading} font-semibold ${t.heading}`}>{c.score}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${t.badge(c.status)}`}>
                            {STATUS_LABEL[c.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* "dissolved cards": one container, sections via dividers, not 4 boxes */}
              <div className={`${t.card} overflow-hidden`}>
                <div className={`px-5 py-3.5 ${t.fontHeading} text-sm ${t.heading}`}>Recent activity</div>
                <div className={t.sectionDivide}>
                  {[
                    ['Offer accepted', 'Aisha Verma · 2h ago'],
                    ['Moved to Technical', 'Priya Nair · 4h ago'],
                    ['New application', 'Mei Tanaka · 6h ago'],
                    ['Interview scheduled', 'Daniel Okoro · 1d ago'],
                  ].map(([a, b]) => (
                    <div key={a} className="flex items-start gap-3 px-5 py-3">
                      <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${t.logoBox}`} />
                      <div>
                        <div className={`text-sm ${t.heading}`}>{a}</div>
                        <div className={`text-xs ${t.subtext}`}>{b}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default function BrandLab() {
  const [active, setActive] = useState<string>('all')
  const shown = active === 'all' ? THEMES : THEMES.filter((t) => t.id === active)
  const tabs = [...THEMES.map((t) => t.id), 'all']

  return (
    <div className={`${inter.className} min-h-screen bg-gray-100 text-gray-900`}>
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Brand Lab</h1>
            <p className="text-sm text-gray-500">Three rebrand directions, shown as a real candidates screen. Pick a feeling — we refine from there.</p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
            {tabs.map((k) => (
              <button
                key={k}
                onClick={() => setActive(k)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {k === 'all' ? 'Compare all' : `${k} · ${THEMES.find((t) => t.id === k)!.name}`}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] space-y-10 px-6 py-8">
        {shown.map((t) => (
          <section key={t.id} className="space-y-3">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">Direction {t.id} — {t.name}.</span> {t.vibe}
            </p>
            <MockApp t={t} />
          </section>
        ))}
        <p className="pt-2 text-center text-xs text-gray-400">
          This is a preview page at <code>/brand-lab</code>. It touches nothing in the real app and is safe to delete.
        </p>
      </main>
    </div>
  )
}
