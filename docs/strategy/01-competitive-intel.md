# 01 — Competitive Intelligence (2026)

> **Date:** 2026-05-28
> **Scope:** AI-native ATS, incumbent ATS, India-focused HRTech/ATS, and adjacent agentic/orchestration plays.
> **Method:** Web research with sources cited inline; knowledge cutoff Jan 2026 supplemented with current web data.

This is the "what is actually true about the market right now" doc. No category framing or RecruiterStack-specific recommendations live here — those move to [02-whitespace-and-icp.md](./02-whitespace-and-icp.md).

---

## 1. Executive read of the 2026 ATS market

Five things matter most for any strategic decision RecruiterStack makes:

1. **The incumbents got bought.** In Q3/Q4 2025, two of the four "incumbent ATS as standalone" labels disappeared: **SAP acquired SmartRecruiters** ([SAP press release, Sept 2025](https://news.sap.com/2025/09/sap-completes-smartrecruiters-acquisition/); deal reported ~$1.5B per [WebProNews](https://www.webpronews.com/sap-acquires-smartrecruiters-for-1-5b-to-enhance-ai-hr-tools/)) and **Workday acquired Paradox for ~$1B** ([Workday 8-K via Yahoo](https://finance.yahoo.com/news/workday-inc-wday-finalizes-acquisition-124156097.html)). The "AI-first conversational scheduler" is now an HCM feature, not a startup. Lever has been inside Employ Inc. since 2022; Employ itself acquired Pillar in March 2025 ([Employ release](https://www.employinc.com/blog/employ-pillar-supercharged-ai-to-strengthen-human-connection/)).

2. **The AI-native winners are Ashby, Gem, and Mercor — but Mercor stopped being an ATS.** Ashby raised a $50M Series D at >$500M valuation in July 2025, grew from 2,400 to 4,400 customers in 12 months ([Crunchbase](https://news.crunchbase.com/venture/ai-powered-hr-platform-ashby-raise/); [PitchBook](https://pitchbook.com/profiles/company/438877-63)), and acquired Talent Llama in Dec 2025 to ship a native AI Interviewer ([Ashby blog](https://www.ashbyhq.com/blog/culture/ashby-one-2026-keynote)). Gem raised $100M at $1.2B valuation ([SIA](https://www.staffingindustry.com/news/global-daily-news/recruitment-software-provider-gem-announces-100-million-funding-round)). Mercor pivoted entirely out of "AI recruiting" into AI-training-data labor markets and is now valued at **$10B** ([CNBC, Oct 2025](https://www.cnbc.com/2025/10/27/ai-hiring-startup-mercor-funding.html)).

3. **"AI" in 2025 was cosmetic; "agentic" in 2026 is the new claim — but mostly still theatre.** Workable, Greenhouse, Lever, and SmartRecruiters all shipped "AI" in 2024–25, but it's resume-summarization plus matching with an LLM glaze. Genuine multi-step agentic execution exists at scale at **Paradox** (high-volume frontline), **Carv** (RPO/agency), **Maki** (screening), **Sense** (CRM/messaging), and **Juicebox** (outbound sourcing). Even these are narrow agents, not "horizontal ATS agents."

4. **The AI hiring tools are now sued.** Eightfold AI is a defendant in a putative class action under FCRA filed January 2026 ([Fortune](https://fortune.com/2026/01/26/job-seekers-suing-ai-hiring-tool-eightfold-allegedly-compiling-secretive-reports/); [Outten & Golden](https://www.outtengolden.com/newsroom/landmark-class-action-accuses-eightfold-ai-of-illegally-producing-hidden-credit-reports-on-job-applicants)). Workday faces a parallel age-discrimination suit. **NYC Local Law 144 enforcement accelerated in Dec 2025** ([NY State Comptroller](https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools)). The EU AI Act treats hiring-AI as high-risk with up to ~$15M per-violation penalties ([Lexara](https://lexaraadvisory.com/blog/eu-ai-act-vs-local-law-144-nyc-companies.html)). India's **DPDP Act Phase 1 went live Nov 13, 2025** with an 18-month full-compliance window ([Deloitte India](https://www.deloitte.com/in/en/services/consulting/about/indias-dpdp-rules-2025-leading-digital-privacy-compliance.html)). Compliance is now a forcing function, not a checkbox.

5. **Indian HRtech has matured but the ATS layer remains thin.** Keka raised $57M Series A in 2022 and reached ~6.5K customers, ~$86M ARR ([Latka](https://getlatka.com/companies/keka-hr); [Keka](https://www.keka.com/keka-secures-indias-largest-series-a-saas-funding-with-57m-dollars)). Darwinbox raised **$180M in 2025** — $140M Partners Group/KKR in March + $40M Ontario Teachers' in August — at >$1B ([TechCrunch March 2025](https://techcrunch.com/2025/03/05/darwinbox-the-hr-upstart-from-india-raises-140m-to-take-on-deel-and-rippling/); [UNLEASH](https://www.unleash.ai/hr-technology/hr-technology-unicorn-darwinbox-attracts-new-40-million-investment/)). The **India ATS market is only ~$300M total** ([IMARC](https://www.imarcgroup.com/india-applicant-tracking-system-market)) — small enough that nobody got rich pure-play; everyone bundles ATS into HRMS/payroll.

**Bottom line:** the 2026 ATS market is well-funded, consolidating into HCM platforms, legally exposed, and ~80% of incumbent "AI" is still cosmetic. There is a real opening for an actually-agentic ATS, but the moat is execution + compliance, not features.

---

## 2. Per-comp-set deep dives

### 2.1 AI-native ATS / recruiting platforms

| Vendor | Positioning | ICP | Pricing | Differentiator | AI maturity | 2025–26 moves | G2 | Weaknesses |
|---|---|---|---|---|---|---|---|---|
| **Ashby** | "The only all-in-one platform for ambitious talent teams." | Series A→D tech, 50–2,000 EE, US/EU | $400/mo floor; $30K–$120K/yr typical mid-market ([Pin](https://www.pin.com/blog/ashby-pricing/)) | Best-in-class analytics + structured hiring | Cosmetic → Agentic (Talent Llama Dec 2025) | $50M Series D Jul 2025 @ ~$503M ([PitchBook](https://pitchbook.com/profiles/company/438877-63)); 2.4K→4.4K customers; OpenAI, Shopify | 4.7 | Steep learning curve, "Interview Scheduling has 14 settings tabs" ([curriculo](https://curriculo.me/blogs/reddit-ats-complaints-2026/)) |
| **Gem** | "The only AI-first all-in-one recruiting platform." | Mid-mkt & enterprise, 500–10K EE, US-skewed | Custom; SMB free <15 EE; mid ~$25K–$60K/yr ([Spendflo](https://www.spendflo.com/blog/gem-pricing-guide)) | Sourcing CRM + outbound; LinkedIn-adjacent | Cosmetic → Agentic 2025 | $100M Series C @ $1.2B Iconiq ([SIA](https://www.staffingindustry.com/news/global-daily-news/recruitment-software-provider-gem-announces-100-million-funding-round)); 1,200+ customers | 4.7 (281) | "Laggy UI, too many clicks," weak ATS integrations ([Juicebox](https://juicebox.ai/blog/gem-reviews)) |
| **Paradox (Olivia)** | "Conversational hiring software that gets work done." | Enterprise high-volume frontline (retail/QSR/healthcare) | ~$15K floor, scales with volume; ROI clear at >500 hires/yr ([Index.dev](https://www.index.dev/blog/paradox-ai-recruitment-chatbot-review)) | Real conversational AI at scale; 500+ enterprise customers | **Agentic (genuine)** | **Acquired by Workday Oct 1 2025 for ~$1B** ([Workday 8-K](https://finance.yahoo.com/news/workday-inc-wday-finalizes-acquisition-124156097.html)) | 4.7 | Now a Workday feature; standalone roadmap captured |
| **Eightfold AI** | "Talent Intelligence Platform." | F500 enterprise, 5K+ EE, global | $200K–$1M+/yr ([Paraform](https://www.paraform.com/blog/eightfold-ai-pricing-2025)) | Career-graph + internal mobility | Cosmetic-deep | **FCRA class action Jan 2026** ([Fortune](https://fortune.com/2026/01/26/job-seekers-suing-ai-hiring-tool-eightfold-allegedly-compiling-secretive-reports/)); 90 layoffs ([Sunset](https://www.sunsethq.com/layoff-tracker/eightfold-ai)); ARR ~$168M; valuation reset to $2.1B | 4.3 mixed | Black-box scoring; reputational hit; customer panic |
| **Findem** | "AI talent intelligence." | Enterprise, US | Per-seat, up to $500+/user/mo ([Findem](https://www.findem.ai/knowledge-center/hireez-vs-seekout-vs-findem)) | "Expert-labeled talent dataset" | Cosmetic → agentic | **$51M Series C Oct 2025** ($36M SLW equity + $15M JPM debt); 12K customers cited ([Findem](https://www.findem.ai/news/findem-series-c-funding)) | 4.6 | Marketing-heavy; sourcing-only |
| **hireEZ** | "Agentic AI recruiting platform; hire 75% faster." | Mid-mkt enterprise corp + RPO | $169–$199/user/mo + custom; median contract $13K ([Juicebox](https://juicebox.ai/blog/hireez-pricing)) | Open-web sourcing + agentic claims | Cosmetic → Agentic | $8M Series B-IV early 2025; ~$75M ARR; rebranded as "agentic" mid-2025 | 4.4 | "Agentic" mostly marketing; mid-market squeeze |
| **Fetcher** | "Automated outbound sourcing." | SMB→mid agencies/in-house | $149/user/mo self-serve; $499–$849 managed ([SSR](https://www.selectsoftwarereviews.com/blog/recruitment-software-pricing)) | Sourcing-as-a-service hybrid | Cosmetic | $38.9M total; no major 2025 round ([CB Insights](https://www.cbinsights.com/company/fetcher)) | 4.5 | Narrow; commoditizing |
| **SeekOut** | "AI sourcing for hard-to-find and diverse talent." | Enterprise | $200/mo solo–$27K avg enterprise ([Pin](https://www.pin.com/blog/seekout-pricing/)) | Diversity sourcing + internal mobility | Cosmetic → "Spot" agent | **Burned $2 per $1**; 30% layoff May 2024; unbundled ([TechCrunch](https://techcrunch.com/2024/05/20/seekout-layoffs-30percent-talent-search-tigerglobal/)); last raise $115M Jan 2022 | 4.4 | Cash-stressed; market doubts standalone future |

**AI-native takeaway:** Ashby and Gem are the legitimate growth stories. Paradox got bought. Eightfold is on fire (literally — lawsuit + layoffs combo). The sourcing pure-plays (Fetcher, SeekOut, hireEZ, Findem) are commoditizing into each other; LLMs ate the differentiator.

---

### 2.2 Incumbent ATS

| Vendor | Positioning | ICP | Pricing | Differentiator | AI | 2025–26 moves | G2 | Weaknesses |
|---|---|---|---|---|---|---|---|---|
| **Greenhouse** | "Hiring platform of choice for ambitious companies." | Mid-mkt→enterprise tech, 100–5K EE | $6–$8K floor; $12–18K @ 200 EE; up to $70K ([Pin](https://www.pin.com/blog/greenhouse-pricing/)) | Structured hiring + ecosystem breadth | Cosmetic (partner add-ons) | June 2025 CLEAR partnership; Dream Job launch; **TPG owns majority since 2021** $500M @ $820M ([TPG](https://press.tpg.com/news-releases/news-release-details/tpg-growth-and-rise-fund-make-major-investment-greenhouse)); $266M ARR 2024 ([Latka](https://getlatka.com/companies/greenhouse)); 4,000 customers | **4.4 — #1 ATS on G2 Winter 2026** | Dated UI; click-heavy; weak reporting; expensive add-ons |
| **Lever (Employ Inc.)** | "Modern talent acquisition." | Mid-mkt tech & global | Per-EE, similar to Greenhouse | CRM-style nurture | Cosmetic + Pillar | **Active domains 917 (Nov 2024) → 649 (Jul 2025): −29 %** ([Treegarden](https://treegarden.io/blog/lever-review-2026/)); Pillar tucked Mar 2025 | 4.3 | Contracting; product staleness; Employ overload (3 ATSes in portfolio) |
| **Workable** | "Find and hire great people." | SMB→mid; 50–500 EE; global w/ India hub Gurgaon | $299 Standard / $599 Premier / $719 Enterprise/mo + per-EE ([Pin](https://www.pin.com/blog/workable-pricing/)) | Publicly priced; job-board reach; SMB-first | Cosmetic ("Workable Agent" 2025) | Forbes "Best AI-Powered Recruiting Platform 2025"; $69.5M revenue 2024, 20K customers ([Latka](https://getlatka.com/companies/workable)) | 4.5 | Mid-market squeeze; AI Agent is summarization-tier |
| **SmartRecruiters** | "Talent acquisition suite for global enterprise." | Mid-mkt→enterprise, global | $14,995/yr floor + per-EE; free SmartStart <250 EE ([Pin](https://www.pin.com/blog/smartrecruiters-pricing/)) | Global compliance + free SMB tier | Cosmetic | **Acquired by SAP Sept 2025 (~$1.5B)** ([SAP](https://news.sap.com/2025/09/sap-completes-smartrecruiters-acquisition/)); SAP licensing changes expected early 2026 | 4.3 | Now SAP; expect price hike + SuccessFactors collision |
| **iCIMS** | "Talent Cloud." | Enterprise; F500; 4K customers | $14.5K–$635K/yr; $20.8K avg; $6–$9 PEPM ([Pin](https://www.pin.com/blog/icims-pricing/)) | High-volume + healthcare/retail; deep integrations | Cosmetic (Copilot brand) | None major 2025–26 | 4.1 | Heavy, expensive, slow; legacy |
| **JazzHR** | "Recruiting software for small business." | SMB <500 EE | $75 Hero/mo (3 jobs) → $269 Plus → custom Pro ([JazzHR](https://www.jazzhr.com/)) | Cheap + simple | None | Inside Employ; static | 4.3 | Bare-bones record-keeping ATS |
| **BambooHR ATS** | "All-in-one HR with hiring." | SMB HR-led, US | $300/mo (50 EE) Essentials + $100 for Advantage w/ ATS ([SaaSPricePulse](https://www.saaspricepulse.com/tools/bamboohr)) | HRIS-bundled ATS | Cosmetic | Stable | 4.5 | ATS is "feature not product" |
| **Recruitee** | "Collaborative hiring software." | SMB→mid EU | €270–€301/mo Start; €1,374/mo Enterprise ([Recruitee](https://recruitee.com/blog/teamtailor-alternatives)) | EU-friendly; team collaboration | Cosmetic | Inside Tellent group | 4.5 | Pricing crept up 2024–26 |

**Incumbent takeaway:** Greenhouse remains the gold-standard mid-mkt — but it's a TPG-owned cash cow, not an innovator. SmartRecruiters + Paradox + Lever consolidation means three of the four "second-tier" enterprise ATSes are now inside platform giants. The independent incumbent shelf is thinning fast.

---

### 2.3 India-focused HRTech / ATS

| Vendor | Positioning | ICP | Pricing | Differentiator | AI | 2025–26 moves | Weaknesses |
|---|---|---|---|---|---|---|---|
| **Keka** | "HR Software, redefined." | India mid-mkt 100–2,000 EE, IT/services | ₹6,999/mo (100 EE) Foundation; custom for Strength/Growth ([Keka](https://www.keka.com/keka-secures-indias-largest-series-a-saas-funding-with-57m-dollars)) | India payroll + HRMS depth | None → cosmetic | ~$86M ARR; 6.5K customers ([Latka](https://getlatka.com/companies/keka-hr)); $57M Series A WestBridge ([Inc42](https://inc42.com/startups/how-saas-startup-keka-is-automating-hr-processes-for-10k-businesses-in-india-and-abroad/)) | **ATS is the weakest module**; tech debt; no real AI |
| **Darwinbox** | "Future of work platform." | Mid-mkt→enterprise APAC, 500–50K EE | Per-EE custom, ~$3–$8/EE/mo enterprise | HCM breadth + Asia-first compliance | Cosmetic | **2025 raises: $140M (Partners/KKR Mar) + $40M (Teachers' VG Aug) = $180M**; **>$1B**; $100M ARR ([TechCrunch](https://techcrunch.com/2025/03/05/darwinbox-the-hr-upstart-from-india-raises-140m-to-take-on-deel-and-rippling/); [UNLEASH](https://www.unleash.ai/hr-technology/hr-technology-unicorn-darwinbox-attracts-new-40-million-investment/)) | Sells HRMS first; recruitment is depth-poor; complex to deploy |
| **Zoho Recruit** | "All-in-one recruitment software." | Indian SMB + global agencies | $25/$50/$75/user/mo; ₹1,250/recruiter/mo India ([Zoho](https://www.zoho.com/recruit/pricing.html)) | Zoho suite integration; cheap; **8 new AI features Oct 2025 (Zia)** ([System Ratings](https://systemratings.com/review/zoho-recruit-review-analysis-2025)) | Cosmetic, improving | Zia AI free in paid tiers | Generic; agency-heavy product |
| **Naukri RMS (Info Edge)** | "End-to-end recruitment management." | Enterprise + staffing India | Custom; bundled with Naukri board | Captive Naukri integration | None | Info Edge Q2 FY26 revenue ₹805 Cr (~$95M), Recruitment Solutions +12.9% YoY ([SIA](https://www.staffingindustry.com/news/global-daily-news/info-edge-q2-revenue-rises-strongly-with-recruitment-solutions-up)); Naukri leadership reshuffle Nov 2025 ([AIM](https://aimgroup.com/2025/11/03/info-edge-reshuffles-management-team-at-recruitment-marketplace-naukri/)) | Aging; tied to dying job-board model |
| **Pocket HRMS** | "HRMS for India." | SMB India 25–250 EE | ₹2,995/mo (50 EE) Standard; ₹4,495 Pro ([PocketHRMS](https://www.pockethrms.com/pricing/)) | Cheapest viable HRMS | None | Static | ATS is checklist |
| **GreytHR** | "Indian HRMS + payroll." | India SMB | From ₹35/EE; ₹3,495/mo floor ([GreytHR](https://www.greythr.com/pricing/)) | Cheapest payroll | None | Static | ATS is afterthought |
| **HROne** | "Best HRMS in India." | India mid-mkt | Custom, mid-range | Modular HRMS | Cosmetic | $8.36M total ([Tracxn](https://tracxn.com/d/companies/hrone/__BNrFS0lS7TqZ1ax1BYmH4pbjaa0aWk9lZNkaquoLxxA)) | 3rd-tier; ATS shallow |
| **Sense (India ops)** | "Conversational AI recruiting." | US enterprise high-volume staffing | Custom | SMS/chat-led nurture | Agentic-ish | $50M Series D SoftBank; 600+ customers; HR Tech Award 2025 ([Sense](https://www.sensehq.com/blog/sense-raises-50-million-to-simplify-and-personalize-hiring-at-scale-series-d)) | US product; India is back-office |

**India takeaway:** This market is **HRMS + payroll-led**, not hiring-led. Keka and Darwinbox dominate because they own statutory payroll. ATS as a standalone product in India is small ($300M, [IMARC](https://www.imarcgroup.com/india-applicant-tracking-system-market)) and bundled. Naukri owns the candidate-pool moat; nobody else has replicated that. **There is no AI-native Indian ATS that has crossed $10M ARR yet.** HireBound ($2M seed Kalaari, Aug 2025 [PeopleMatters](https://www.peoplematters.in/news/funding-and-investment/hirebound-raises-dollar2-million-to-automate-hiring-with-ai-48548)) is the closest seed-stage attempt.

---

### 2.4 Adjacent agentic / orchestration plays

| Vendor | Positioning | ICP | Pricing | Differentiator | 2025–26 moves |
|---|---|---|---|---|---|
| **Mercor** | "Unlocking human potential in the AI economy." | AI labs needing labeled training labor | Hourly finder + match fee | **Pivoted from AI recruiting → AI-training-data labor** | **$350M Series C Oct 2025 @ $10B**; 30K contractors; $1.5M/day payouts ([TechCrunch](https://techcrunch.com/2025/10/27/mercor-quintuples-valuation-to-10b-with-350m-series-c/); [CNBC](https://www.cnbc.com/2025/10/27/ai-hiring-startup-mercor-funding.html)) |
| **Micro1** | Same play as Mercor | AI labs | Custom | Same as Mercor | $35M Series A @ $500M; $50M ARR ([TechCrunch](https://techcrunch.com/2025/09/12/micro1-a-competitor-to-scale-ai-raises-funds-at-500m-valuation/)) |
| **Carv** | "Agentic AI for volume hiring." | RPO + high-volume agencies | Custom | True multi-agent autonomous workflow | **ManpowerGroup partnership July 2025** ([ManpowerGroup](https://www.manpowergroup.com/en/news-releases/news/manpowergroup-talent-solutions-partners-with-carv-as-part-of-its-strategy-to-embed-gen-ai-within-recruitment)); DHL saves 26h/wk per recruiter |
| **Maki People** | "Conversational AI agents for HR." | Mid-mkt→enterprise EU/global | Custom | Skills-based screening agent | **$28.6M Series A Jan 2025** (Blossom + DST); H&M, BNP, FIFA customers; 300% growth 2024 ([BusinessWire](https://www.businesswire.com/news/home/20250115141347/en/Maki-Raised-%2428.6M-Series-A-to-Redefine-HR-with-Conversational-AI-Agents)) |
| **Juicebox** | "AI recruiting agents (PeopleGPT)." | SMB→mid; agencies + in-house | $79–$299/user/mo | LLM-powered Boolean replacement; outbound agent | **$30M Series A Sept 2025 Sequoia + $80M Series B 2026 @ $850M** ([TechCrunch](https://techcrunch.com/2025/09/25/juicebox-raises-30m-from-sequoia-to-revolutionize-hiring-with-llm-powered-search/); [TFN](https://techfundingnews.com/slug-juicebox-80m-series-b-recruiting-ai/)); ARR tripled to 5K customers |
| **Tezi** | "Max, the AI recruiter." | SMB→mid | Custom | Sourcing/screening/scheduling agent | Founded 2024 Menlo Park; $9M raised 2025 |
| **Pillar** | "AI interview intelligence." | Mid-mkt | n/a | Interview analysis | **Acquired by Employ Mar 2025** ([globenewswire](https://www.globenewswire.com/news-release/2025/03/05/3037538/0/en/Revolutionizing-Hiring-One-Interview-at-a-Time-Employ-Acquires-Pillar-the-Leading-AI-Interview-Intelligence-Platform.html)) |
| **Conversica** | "AI revenue digital assistant." | Sales/marketing | Custom | Lead engagement | $46M ARR 2025 ([Latka](https://getlatka.com/companies/conversica)) — **not recruiting** |
| **Sana AI** | "Enterprise knowledge agent platform." | F500 industrial | Custom | Permission-mirroring; 100+ connectors | Industrial focus, not recruiting |
| **Decagon** | "Concierge customer experience AI." | Enterprise CX (analogue to recruiting Olivia) | Custom | Production-grade CX agents | **$131M Series C @ $1.5B June 2025; $250M Series D @ $4.5B Jan 2026** ([Decagon](https://decagon.ai/resources/series-c-announcement)) — analogue precedent for "agentic ATS" valuation |
| **CrewAI / LangChain** | Agent orchestration frameworks | Devs | OSS + cloud | Multi-agent runtime | Used downstream by ATS builders |
| **Bullhorn** | "Staffing agency OS." | Staffing agencies (33.9% market share) | Custom $99–$315/user/mo | Salesforce ecosystem + agency depth | **TargetRecruit acquisition Aug 2025**; 10K+ orgs ([6sense](https://6sense.com/tech/recruiting-agency/bullhorn-market-share)) |

**Adjacent takeaway:** This is the most interesting zone. Carv + Maki are doing actual agentic execution; Mercor proved that the "agentic recruiter" thesis pays better when reframed as a labor marketplace, not as software. Decagon's $4.5B Series D is the analogue valuation that suggests an "agentic enterprise ATS" has a clear public-comps path.

---

## 3. Market map and pricing benchmarks

### 3.1 Market map (2×2: AI-native ↔ Incumbent × Global ↔ India)

```
                          GLOBAL
                            ▲
  AI-NATIVE                 │              INCUMBENT
    Mercor ($10B) ──────────┼────────── Workday / Paradox
    Gem ($1.2B) ─ Findem ───┼────────── SAP / SmartRecruiters
    Ashby ($503M) ──────────┼────────── Greenhouse (TPG-owned)
    Juicebox ($850M) ───────┼────────── iCIMS
    Maki / Carv ────────────┼────────── Lever (Employ)
    hireEZ / SeekOut ───────┼────────── Workable / BambooHR
    Eightfold ($2.1B)       │
                            │
  ──────────────────────────┼────────────────────────►
                            │
    [VERY THIN]             │              Keka (~$300M est.)
    HireBound seed ─────────┼────────── Darwinbox ($1B+)
    Pitch N Hire ───────────┼────────── Zoho Recruit
                            │           Naukri RMS / Info Edge
                            │           GreytHR / Pocket HRMS / HROne
                            ▼
                          INDIA
```

The bottom-left quadrant — **AI-native + India-focused** — is the most under-populated cell on the map. Three weak entrants (HireBound seed, Pitch N Hire, TheHireHub) and nothing scaled.

### 3.2 Pricing benchmarks (USD-equivalent per seat or per month)

| Segment | Global market | India market |
|---|---|---|
| Startup / <50 EE | $0 free tier (SmartStart, Gem startup, Workable Starter $149) | ₹6,999/mo (~$83) Keka; Zoho ₹1,250/recruiter |
| SMB 50–250 EE | $300–$1,500/mo bundled ($6–$8 PEPM) | ₹3K–₹15K/mo (~$36–$180) |
| Mid-mkt 250–1,000 EE | $15K–$70K/yr ($5–$8 PEPM) — Greenhouse, Lever, Ashby | ₹40K–₹2L/mo (~$480–$2,400); Darwinbox $3–$8/EE/mo |
| Enterprise 1,000+ EE | $70K–$635K/yr; Eightfold $200K–$1M | Custom, typically $50K–$300K/yr |
| Sourcing add-on | $169–$500/user/mo (hireEZ, Findem, SeekOut, Loxo) | Mostly N/A; bundled |
| AI Interview | $10K–$50K/yr (Maki, Pillar standalone) | N/A standalone |

**INR rule of thumb:** Indian mid-market buyers will not pay >₹1,500/EE/mo for an ATS feature. Total HRMS budget caps around ₹250–₹600/EE/mo all-in. This is the **structural pricing wall** any India-focused product faces.

### 3.3 Funding-stage map (2024–2026, recruiting-relevant)

| Stage | Notable raises |
|---|---|
| Seed | HireBound $2M Kalaari (2025); Tezi (2024) |
| Series A | Maki $28.6M Blossom (Jan 2025); Micro1 $35M @ $500M (Sept 2025) |
| Series B | Mercor $100M @ $2B Felicis (Feb 2025); Juicebox $80M @ $850M (2026) |
| Series C | Findem $51M SLW (Oct 2025); Ashby $50M Series D @ $503M (Jul 2025); Decagon $131M @ $1.5B (June 2025) |
| Series D/E | Sense $50M SoftBank; Gem $100M @ $1.2B Iconiq; Decagon $250M @ $4.5B (Jan 2026) |
| Growth / PE | Darwinbox $180M (Partners/KKR + Ontario Teachers') 2025 @ >$1B |
| Mega / Strategic | Mercor $350M @ $10B Felicis/Benchmark (Oct 2025) |
| M&A | SAP→SmartRecruiters ~$1.5B (Sept 2025); Workday→Paradox ~$1B (Oct 2025); Employ→Pillar (Mar 2025); Ashby→Talent Llama (Dec 2025); Bullhorn→TargetRecruit (Aug 2025) |

The pattern: **the top end is melting up** (Mercor $10B, Decagon $4.5B, Gem $1.2B) while **the mid-stage independent ATS path is closing** — exits route to platform players.

---

## 4. What's actually moving the market in 2026

Three currents matter more than feature lists:

1. **Platform absorption.** Workday, SAP, Employ are all eating standalone players. The implication for any new ATS entrant: assume your exit is either (a) M&A to a platform within ~3–4 years, or (b) you must own a moat that platforms can't replicate (compliance, geography, vertical depth, or a labor marketplace).

2. **Regulatory weaponization.** The Eightfold lawsuit will produce discovery and case law that ripples across every "AI ATS." Vendors with weak audit trails will lose RFPs. Vendors that ship compliance UX as a first-class feature will win them. The window where you can ship "we used AI to pick the best candidates" without a bias audit and a human-approval gate **closed in 2025**.

3. **Bundling pressure.** In India, the buyer pays for HRMS+payroll and expects ATS in the bundle. Standalone ATS only wins where the buyer is genuinely hiring-led (export-SaaS, GCCs, agencies). Globally, the SMB end is being absorbed into HRIS (BambooHR, Rippling, Deel); the enterprise end is being absorbed into HCM (Workday, SAP, Oracle). The standalone mid-market is where the air is thinnest.

These three are the *structural facts* the [02-whitespace-and-icp.md](./02-whitespace-and-icp.md) document interprets.

---

## 5. Sources (full list)

### Ashby
- [Ashby pricing 2026 — Pin](https://www.pin.com/blog/ashby-pricing/)
- [Ashby — PitchBook](https://pitchbook.com/profiles/company/438877-63)
- [Ashby Series D — Crunchbase News](https://news.crunchbase.com/venture/ai-powered-hr-platform-ashby-raise/)
- [Ashby One 2026 / Talent Llama](https://www.ashbyhq.com/blog/culture/ashby-one-2026-keynote)
- [Ashby G2](https://www.g2.com/products/ashby-ashby/reviews)

### Gem
- [Gem Series C — SIA](https://www.staffingindustry.com/news/global-daily-news/recruitment-software-provider-gem-announces-100-million-funding-round)
- [Gem pricing — Spendflo](https://www.spendflo.com/blog/gem-pricing-guide)
- [Gem reviews — Juicebox](https://juicebox.ai/blog/gem-reviews)

### Paradox / Workday
- [Workday acquires Paradox — Yahoo Finance / 8-K](https://finance.yahoo.com/news/workday-inc-wday-finalizes-acquisition-124156097.html)
- [Workday→Paradox — Investing.com](https://www.investing.com/news/company-news/workday-to-acquire-paradox-expanding-aipowered-recruitment-capabilities-93CH-4205445)
- [Paradox AI review — Index.dev](https://www.index.dev/blog/paradox-ai-recruitment-chatbot-review)

### Eightfold
- [FCRA class action — Fortune](https://fortune.com/2026/01/26/job-seekers-suing-ai-hiring-tool-eightfold-allegedly-compiling-secretive-reports/)
- [Class action — Outten & Golden](https://www.outtengolden.com/newsroom/landmark-class-action-accuses-eightfold-ai-of-illegally-producing-hidden-credit-reports-on-job-applicants)
- [Eightfold layoffs — Sunset](https://www.sunsethq.com/layoff-tracker/eightfold-ai)
- [Eightfold revenue — Latka](https://getlatka.com/companies/eightfold)
- [Eightfold pricing — Paraform](https://www.paraform.com/blog/eightfold-ai-pricing-2025)

### Findem, hireEZ, Fetcher, SeekOut
- [Findem $51M Series C](https://www.findem.ai/news/findem-series-c-funding)
- [Findem PRNewswire](https://www.prnewswire.com/news-releases/findem-raises-51-million-to-transform-how-companies-hire-with-the-worlds-largest-expert-labeled-talent-dataset-302589634.html)
- [hireEZ vs SeekOut — Pin](https://www.pin.com/blog/hireez-vs-seekout/)
- [hireEZ pricing — Juicebox](https://juicebox.ai/blog/hireez-pricing)
- [SeekOut layoffs — TechCrunch](https://techcrunch.com/2024/05/20/seekout-layoffs-30percent-talent-search-tigerglobal/)
- [SeekOut pricing — Pin](https://www.pin.com/blog/seekout-pricing/)

### Greenhouse, Lever, Workable, SmartRecruiters, iCIMS, JazzHR, BambooHR, Recruitee
- [Greenhouse pricing — Pin](https://www.pin.com/blog/greenhouse-pricing/)
- [Greenhouse G2](https://www.g2.com/products/greenhouse/reviews)
- [TPG / Greenhouse](https://press.tpg.com/news-releases/news-release-details/tpg-growth-and-rise-fund-make-major-investment-greenhouse)
- [Greenhouse revenue — Latka](https://getlatka.com/companies/greenhouse)
- [Lever Review 2026 — Treegarden](https://treegarden.io/blog/lever-review-2026/)
- [Employ → Pillar — globenewswire](https://www.globenewswire.com/news-release/2025/03/05/3037538/0/en/Revolutionizing-Hiring-One-Interview-at-a-Time-Employ-Acquires-Pillar-the-Leading-AI-Interview-Intelligence-Platform.html)
- [Employ → Pillar — Employ blog](https://www.employinc.com/blog/employ-pillar-supercharged-ai-to-strengthen-human-connection/)
- [Workable pricing — Pin](https://www.pin.com/blog/workable-pricing/)
- [Workable revenue — Latka](https://getlatka.com/companies/workable)
- [SAP → SmartRecruiters — SAP](https://news.sap.com/2025/09/sap-completes-smartrecruiters-acquisition/)
- [SAP / SmartRecruiters $1.5B — WebProNews](https://www.webpronews.com/sap-acquires-smartrecruiters-for-1-5b-to-enhance-ai-hr-tools/)
- [SAP → SmartRecruiters — TechCrunch](https://techcrunch.com/2025/08/03/sap-is-acquiring-smartrecruiters/)
- [SmartRecruiters pricing — Pin](https://www.pin.com/blog/smartrecruiters-pricing/)
- [iCIMS pricing — Pin](https://www.pin.com/blog/icims-pricing/)
- [JazzHR](https://www.jazzhr.com/)
- [BambooHR pricing — SaaSPricePulse](https://www.saaspricepulse.com/tools/bamboohr)
- [Recruitee — Recruitee/Tellent](https://recruitee.com/blog/teamtailor-alternatives)
- [Recruitment software pricing — SSR](https://www.selectsoftwarereviews.com/blog/recruitment-software-pricing)

### Keka, Darwinbox, Zoho, Naukri, Indian SaaS HR
- [Keka Series A](https://www.keka.com/keka-secures-indias-largest-series-a-saas-funding-with-57m-dollars)
- [Keka — Inc42](https://inc42.com/startups/how-saas-startup-keka-is-automating-hr-processes-for-10k-businesses-in-india-and-abroad/)
- [Keka revenue — Latka](https://getlatka.com/companies/keka-hr)
- [Darwinbox $140M Partners/KKR — TechCrunch](https://techcrunch.com/2025/03/05/darwinbox-the-hr-upstart-from-india-raises-140m-to-take-on-deel-and-rippling/)
- [Darwinbox $40M Ontario Teachers' — UNLEASH](https://www.unleash.ai/hr-technology/hr-technology-unicorn-darwinbox-attracts-new-40-million-investment/)
- [Darwinbox — Latka](https://getlatka.com/companies/darwinbox)
- [Zoho Recruit pricing](https://www.zoho.com/recruit/pricing.html)
- [Zoho Recruit review — System Ratings](https://systemratings.com/review/zoho-recruit-review-analysis-2025)
- [Info Edge Q2 FY26 — SIA](https://www.staffingindustry.com/news/global-daily-news/info-edge-q2-revenue-rises-strongly-with-recruitment-solutions-up)
- [Naukri reshuffle — AIM](https://aimgroup.com/2025/11/03/info-edge-reshuffles-management-team-at-recruitment-marketplace-naukri/)
- [Pocket HRMS pricing](https://www.pockethrms.com/pricing/)
- [GreytHR pricing](https://www.greythr.com/pricing/)
- [HROne — Tracxn](https://tracxn.com/d/companies/hrone/__BNrFS0lS7TqZ1ax1BYmH4pbjaa0aWk9lZNkaquoLxxA)
- [Sense $50M Series D](https://www.sensehq.com/blog/sense-raises-50-million-to-simplify-and-personalize-hiring-at-scale-series-d)

### Mercor, Micro1, Juicebox, Tezi, Maki, Carv, Decagon
- [Mercor $350M @ $10B — CNBC](https://www.cnbc.com/2025/10/27/ai-hiring-startup-mercor-funding.html)
- [Mercor Series C — TechCrunch](https://techcrunch.com/2025/10/27/mercor-quintuples-valuation-to-10b-with-350m-series-c/)
- [Mercor Series B — TechCrunch](https://techcrunch.com/2025/02/20/mercor-an-ai-recruiting-startup-founded-by-21-year-olds-raises-100m-at-2b-valuation/)
- [Micro1 — TechCrunch](https://techcrunch.com/2025/09/12/micro1-a-competitor-to-scale-ai-raises-funds-at-500m-valuation/)
- [Juicebox Series B](https://techfundingnews.com/slug-juicebox-80m-series-b-recruiting-ai/)
- [Juicebox Series A — TechCrunch](https://techcrunch.com/2025/09/25/juicebox-raises-30m-from-sequoia-to-revolutionize-hiring-with-llm-powered-search/)
- [Maki Series A — BusinessWire](https://www.businesswire.com/news/home/20250115141347/en/Maki-Raised-%2428.6M-Series-A-to-Redefine-HR-with-Conversational-AI-Agents)
- [Maki — TechCrunch](https://techcrunch.com/2025/01/15/as-gen-z-job-applicants-balloon-companies-are-turning-to-ai-agent-recruiters/)
- [Carv / ManpowerGroup](https://www.manpowergroup.com/en/news-releases/news/manpowergroup-talent-solutions-partners-with-carv-as-part-of-its-strategy-to-embed-gen-ai-within-recruitment)
- [Decagon Series C](https://decagon.ai/resources/series-c-announcement)
- [Decagon Series D — BusinessWire](https://www.businesswire.com/news/home/20250623894798/en/Decagon-Raises-$131M-at-$1.5B-Valuation-to-Deliver-Concierge-Customer-Experience-with-AI-Agents)
- [Conversica — Latka](https://getlatka.com/companies/conversica)

### Bullhorn / staffing / Loxo / Recruiterflow / Manatal
- [Bullhorn market share — 6sense](https://6sense.com/tech/recruiting-agency/bullhorn-market-share)
- [Bullhorn alternatives — Pin](https://www.pin.com/blog/staffing-agency-software/)
- [Loxo pricing](https://www.loxo.co/pricing)
- [Manatal pricing](https://www.manatal.com/pricing)

### Compliance, market size, India startups
- [India ATS market — IMARC](https://www.imarcgroup.com/india-applicant-tracking-system-market)
- [DPDP Rules 2025 — Deloitte India](https://www.deloitte.com/in/en/services/consulting/about/indias-dpdp-rules-2025-leading-digital-privacy-compliance.html)
- [DPDP TA leader's guide — RippleHire](https://www.ripplehire.com/blog/the-ta-leaders-guide-to-the-dpdp-act-in-2026)
- [NYC LL144 enforcement — NY State Comptroller](https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools)
- [EU AI Act vs LL144 — Lexara](https://lexaraadvisory.com/blog/eu-ai-act-vs-local-law-144-nyc-companies.html)
- [HireBound seed — PeopleMatters](https://www.peoplematters.in/news/funding-and-investment/hirebound-raises-dollar2-million-to-automate-hiring-with-ai-48548)
- [Indian AI startups — Inc42](https://inc42.com/startups/indian-ai-startup-tracker/)
- [India startup funding 2025 — TechCrunch](https://techcrunch.com/2025/12/27/india-startup-funding-hits-11b-in-2025-as-investors-grow-more-selective/)
- [Reddit ATS complaints — curriculo](https://curriculo.me/blogs/reddit-ats-complaints-2026/)

---

*End of competitive intel.*
