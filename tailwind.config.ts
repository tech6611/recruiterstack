import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    // Scan all of src — not just pages/components/app — so class names defined in
    // helpers under src/lib (e.g. stat-tones) and src/modules are generated too.
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Headings use Plus Jakarta Sans (loaded in layout.tsx as --font-display);
        // body inherits Inter from <body>. `font-display` opts an element in.
        display: ['var(--font-display)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // ── Brand: "emerald" is redefined as pine green (Direction D). Every
        //    existing `emerald-*` class across the app now reads as pine. ──────
        emerald: {
          50:  '#ecf3ef',
          100: '#d9e8e0',
          200: '#b7d3c4',
          300: '#8bbaa3',
          400: '#4f9a7b',
          500: '#1f7a5a',
          600: '#15604a', // primary action / accent
          700: '#11503d', // hover
          800: '#0e4232',
          900: '#0c362a',
          950: '#062019',
        },
        // ── Neutral: "slate" is redefined as a warm sand→bark ramp. Every
        //    existing `slate-*` class now reads warm instead of cool gray. ─────
        slate: {
          50:  '#faf7f2', // page background (cream)
          100: '#f4efe7', // subtle fills / hover
          200: '#ece4d6', // hairline borders (sand)
          300: '#ddd2bf',
          400: '#b3a791', // muted icons / placeholder
          500: '#8a7f6f', // secondary text
          600: '#544c42',
          700: '#363029',
          800: '#262019',
          900: '#181310', // headings (bark)
          950: '#1c1610',
        },
        gold: {
          50: '#fdf8ec',
          100: '#fbeef0',
          200: '#f8dfa1',
          300: '#f4cc6a',
          400: '#ebb137',
          500: '#e19717',
          600: '#c57410',
          700: '#a55411',
          800: '#864315',
          900: '#6f3815',
          950: '#401c08',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(21, 96, 74, 0.05)',
        'glass-hover': '0 8px 32px 0 rgba(21, 96, 74, 0.12)',
      }
    },
  },
  plugins: [],
};
export default config;
