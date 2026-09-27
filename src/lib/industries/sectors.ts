/**
 * INDUSTRY SECTORS — the handful of words a recruiter actually searches on
 * ("fintech background", "worked in healthcare"), mapped from the 991 distinct raw
 * strings our company enrichment produced.
 *
 * WHY A TAXONOMY AND NOT THE RAW STRING. The enrichment returns whatever its sources
 * call a company, and 714 of those 991 strings appear exactly once. It gives us
 * "Fintech", "FinTech", "Financial Software", "financial services" and "financial
 * sector" for the same idea, and "Business/Productivity Software" for something nobody
 * would ever type into a filter. A chip built on the raw value would be a different
 * word for every company — the opposite of a chip.
 *
 * ORDER IS THE ALGORITHM. Rules are tried top to bottom and the first match wins, so
 * the specific sits above the general: "Financial Software" must reach Fintech before
 * Enterprise Software, "Higher Education" must reach universities before EdTech, and
 * "Medical Equipment Manufacturing" must reach Healthcare before Manufacturing. Moving
 * a rule up or down changes results — the ordering is not cosmetic.
 *
 * NULL IS A REAL ANSWER. "Conglomerate" and "International Standard Industrial
 * Classification" describe no sector anyone hires for; they return null and the profile
 * simply has no industry chip. A wrong sector is worse than a missing one.
 *
 * PURE. No I/O, no React.
 */

/**
 * How much a sector tells you about a company.
 *
 * 1 — THE MARKET IT SELLS INTO. Fintech, Healthcare, Gaming. The strongest answer to
 *     "what does this company do", and what a recruiter filters on.
 * 2 — WHAT IT SELLS INTO ANY MARKET. AI, data, developer tools, consulting. True and
 *     useful, but it loses to a market: Ironclad is Legal Tech that uses AI, Lattice is
 *     HR Tech that uses AI, and labelling both "AI" tells you nothing about either.
 * 3 — GENERIC. "Software", "Internet", "Technology" — a last resort so a company with
 *     nothing better still gets a chip.
 *
 * The tier is explicit rather than implied by position, because position already does a
 * job: within a tier it breaks ties, which is how "Higher Education" beats "Education".
 */
export type SectorTier = 1 | 2 | 3

export interface SectorRule {
  sector: string
  tier: SectorTier
  /** Tested against the normalized string. */
  match: RegExp
}

/** lowercase, ampersands spelled out, punctuation to spaces, spaces collapsed. */
export function normalizeIndustry(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
}

export const SECTOR_RULES: SectorRule[] = [
  { sector: 'Crypto & Web3',        tier: 1, match: /\b(crypto|blockchain|web3|defi|nft)\b/ },
  { sector: 'Cybersecurity',        tier: 1, match: /\b(cyber ?security|infosec|information security|network security|computer security|security software)\b/ },
  { sector: 'AI & Machine Learning', tier: 2, match: /\b(artificial intelligence|machine learning|deep learning|generative ai|conversational ai|computer vision|nlp|ai)\b/ },
  { sector: 'Fintech',              tier: 1, match: /\b(fintech|financial technology|payments?|payment system|financial software|neobank|lending|wealthtech)\b/ },
  { sector: 'Insurance',            tier: 1, match: /\b(insurtech)\b|(?<!except )\binsurance\b/ },
  { sector: 'Banking & Finance',    tier: 1, match: /\b(bank|banking|financial services?|financial sector|financial service|capital markets?|investment|asset management|brokerage|private equity|venture capital|accounting|tax|treasury|economics of banking)\b/ },
  { sector: 'HR Tech',              tier: 1, match: /\b(hr tech|hrtech|human resources?|human resource management|human capital|recruiting|staffing|talent|payroll|employment services)\b/ },
  { sector: 'Legal Tech',           tier: 1, match: /\b(legal ?tech|legal services|law practice)\b/ },
  { sector: 'Higher Education',     tier: 1, match: /\b(higher education|universit(y|ies)|college|academia|research services|research and development|scientific research)\b/ },
  { sector: 'Education',            tier: 1, match: /\b(ed ?tech|e ?learning|education|educational|training|coaching|schools?|tutoring)\b|^learning$/ },
  { sector: 'Biotech & Pharma',     tier: 1, match: /\b(biotech|biotechnology|pharmaceutical|pharma|drug discovery|genomics|life sciences)\b/ },
  { sector: 'Healthcare',           tier: 1, match: /\b(health ?care|health ?tech|healthcare|hospitals?|medical|clinical|wellness|fitness|telehealth|diagnostics|pharmacy|health)\b/ },
  // Above E-commerce on purpose: Shadowfax lists "Logistics" and "E-commerce logistics",
  // and it is a logistics company. Bare "delivery" is gone so a food-delivery firm
  // still reads as Food & Beverage.
  { sector: 'Logistics & Supply Chain', tier: 1, match: /\b(logistics|supply chain|freight|shipping|warehousing|last mile|ship management|transport\w*)\b/ },
  { sector: 'E-commerce & Retail',  tier: 1, match: /\b(e ?commerce|ecommerce|retail|marketplace|online shopping|consumer goods|apparel|fashion|grocery)\b/ },
  { sector: 'Travel & Hospitality', tier: 1, match: /\b(travel|hospitality|tourism|airline|hotels?|restaurants?)\b/ },
  { sector: 'Real Estate & PropTech', tier: 1, match: /\b(real estate|prop ?tech|construction|property)\b/ },
  { sector: 'Food & Beverage',      tier: 1, match: /\b(food|beverage|agritech|restaurant|dairy|nutrition)\b/ },
  { sector: 'Agriculture',          tier: 1, match: /\b(agriculture|agri|farming|agro)\b/ },
  { sector: 'Energy & Climate',     tier: 1, match: /\b(energy|solar|renewable|clean ?tech|climate|oil and gas|utilities|electricity|power|sustainability)\b/ },
  { sector: 'Automotive & Mobility', tier: 1, match: /\b(automotive|automobile|mobility|electric vehicle|ev|telematics|ride ?hailing)\b/ },
  { sector: 'Aerospace & Defence',  tier: 1, match: /\b(aerospace|defen[cs]e|aviation|space|satellite)\b/ },
  { sector: 'Hardware & Robotics',  tier: 1, match: /\b(robotics|semiconductor|consumer electronics|electronics|hardware|iot|embedded|semiconductors?|drones?)\b/ },
  // "industrial" needs a noun after it: the bare word matched "International Standard
  // Industrial Classification", which is a taxonomy, not an industry.
  { sector: 'Manufacturing',        tier: 1, match: /\b(manufactur\w*|industrials|industrial (automation|machinery|equipment|goods|products)|chemicals?|materials|textiles?|machinery|engineering services)\b/ },
  // CPaaS belongs here, not in Developer Tools. Plivo and Twilio sell telecoms — SMS,
  // voice, numbers — and the cloud is how it is delivered, not what it is. By this
  // file's own rule the MARKET beats the delivery layer, and "Cloud Communications"
  // was hitting the word "cloud" in tier 2 before anything reached telecom.
  //
  // "Communication Software" stays out: that is a software product (Zulip, Bolna), not
  // a carrier service.
  { sector: 'Telecom',              tier: 1, match: /\b(telecom\w*|telephony|wireless|broadband|computer network\w*|cpaas|cloud communications|communications platform|voice api|messaging api|communications? (industry|services))\b|^communications?$/ },
  { sector: 'Security Services',    tier: 1, match: /\b(security and investigations|physical security|guarding|surveillance services)\b/ },
  { sector: 'Design & Creative',    tier: 1, match: /\b(interior design|graphic design|fine art|arts|photography|writing and editing|creative services|architecture services)\b/ },
  { sector: 'Sports & Recreation',  tier: 1, match: /\b(sports|recreation|fitness facilities|outdoor recreation|athletics)\b/ },
  { sector: 'Gaming',               tier: 1, match: /\b(gaming|video games?|computer games?|game development|esports)\b/ },
  { sector: 'Media & Entertainment', tier: 1, match: /\b(media|entertainment|publishing|music|film|broadcast|streaming|news|podcasts?|content)\b/ },
  // Deliberately NOT the bare word "marketing": every company markets, and "internet
  // marketing" in Google's industry list was enough to file Google under AdTech. A
  // company is in this sector when marketing is the product it sells.
  { sector: 'Marketing & AdTech',   tier: 1, match: /\b(marketing services|advertis\w*|ad ?tech|marketing (tech\w*|software|automation|and pr)|digital marketing|growth marketing|public relations)\b/ },
  { sector: 'Data & Analytics',     tier: 2, match: /\b(big data|data analytics|analytics|data science|business intelligence|data infrastructure|data)\b/ },
  { sector: 'Developer Tools & Cloud', tier: 2, match: /\b(developer tools?|dev ?ops|cloud ?tech|cloud computing|cloud|web hosting|database software|infrastructure|api|observability|it performance management|application performance|network management|systems and information management|it service management)\b/ },
  { sector: 'Consulting',           tier: 2, match: /\b(management consulting|business consulting|consulting|consultanc\w*|market research|professional services|advisory|strategy)\b/ },
  // Needs a SERVICES word. Bare "information technology" is something Google lists
  // about itself, and it was enough to file Google as an IT services firm.
  { sector: 'IT Services',          tier: 2, match: /\b(it services|it consulting|information technology (and )?(services|consulting)|outsourcing|systems integrat\w*|managed services)\b/ },
  { sector: 'Government & Public Sector', tier: 1, match: /\b(government|public sector|public administration|defen[cs]e ministry|municipal|political|policy)\b/ },
  { sector: 'Non-profit',           tier: 1, match: /\b(non ?profit|nonprofit|ngo|charity|civic|social (impact|organizations?)|international affairs|think tanks?|voluntary sector|philanthrop\w*)\b/ },
  { sector: 'Enterprise Software',  tier: 3, match: /\b(saas|software as a service|enterprise software|business software|productivity software|application software|software development|software solutions|software industry|experience management|video conferenc\w*|software|platform)\b/ },
  { sector: 'Consumer Internet',    tier: 3, match: /\b(internet|information and internet|consumer services|technology|information services|information)\b/ },
]

/** The sector a single raw industry string belongs to, or null when none fits. */
export function canonicalIndustry(raw: string | null | undefined): string | null {
  const n = normalizeIndustry(raw ?? '')
  if (!n) return null
  return SECTOR_RULES.find((r) => r.match.test(n))?.sector ?? null
}

/**
 * The sector for a COMPANY, whose enrichment returns two or three strings.
 *
 * THE MOST TELLING STRING WINS, not the first one. Taking the first put Razorpay in
 * Enterprise Software (its strings are "software industry", "payment system") and
 * Stripe in Banking & Finance ("financial services", "mobile payment industry") — the
 * vaguer word happened to be listed first and buried the one that describes the
 * company. So every string is read and the best tier wins, ties broken by position.
 */
export function companySector(industries: string[] | null | undefined): string | null {
  let best: { sector: string; tier: SectorTier; rank: number; pos: number } | null = null

  ;(industries ?? []).forEach((raw, pos) => {
    const n = normalizeIndustry(raw)
    if (!n) return
    const rank = SECTOR_RULES.findIndex((r) => r.match.test(n))
    if (rank < 0) return
    const cand = { sector: SECTOR_RULES[rank].sector, tier: SECTOR_RULES[rank].tier, rank, pos }
    if (best == null || cand.tier < best.tier) { best = cand; return }
    if (cand.tier > best.tier) return

    // Same tier. WHAT BREAKS THE TIE DEPENDS ON THE TIER, because the two orderings
    // carry information in different places.
    //
    // TIER 1 — rule order. Here the rules really are written specific to general, and
    // that ordering is a judgement the source cannot make. Stripe lists "financial
    // services" before "mobile payment industry"; Fintech sits above Banking & Finance,
    // so it reads as Fintech rather than as a bank.
    //
    // TIERS 2 AND 3 — the SOURCE's order. Within a tier these rules are peers: AI is
    // not inherently more telling than developer tools, and "Software" is not more
    // telling than "Internet". Using rule order here meant whichever peer happened to
    // be written first swallowed the rest — with AI first, Postman came back as an AI
    // company on the strength of its fifth listed industry. The source lists what a
    // company is mainly about first, and that is the only signal available.
    const better = best.tier === 1 ? cand.rank < best.rank : cand.pos < best.pos
    if (better) best = cand
  })

  return best ? (best as { sector: string }).sector : null
}
