/**
 * Source registry: 20+ real regulator URLs, RSS feeds, and news search queries
 * covering US federal + states, EU, UK, Australia, Canada, APAC.
 * Each source has a reliability tier (1-5).
 */

export type SourceType = "government_page" | "rss_feed" | "news_search" | "legal_database";

export type ReliabilityTier = 1 | 2 | 3 | 4 | 5;

export type RegistrySource = {
  name: string;
  url: string;
  type: SourceType;
  authorityType: "national" | "state" | "local" | "supranational";
  jurisdiction: string;
  jurisdictionCountry: string;
  jurisdictionState?: string;
  reliabilityTier: ReliabilityTier;
  searchKeywords?: string[];
  description: string;
};

export const sourceRegistry: RegistrySource[] = [
  // ── US Federal ──────────────────────────────────────────
  {
    name: "FTC Children's Privacy",
    url: "https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "United States",
    jurisdictionCountry: "United States",
    reliabilityTier: 5,
    searchKeywords: ["COPPA", "children privacy", "FTC teen"],
    description: "FTC COPPA rule page — primary US federal child privacy regulation",
  },
  {
    name: "FTC Press Releases",
    url: "https://www.ftc.gov/news-events/news/press-releases",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "United States",
    jurisdictionCountry: "United States",
    reliabilityTier: 5,
    searchKeywords: ["FTC", "enforcement", "COPPA", "children privacy"],
    description: "FTC press releases including COPPA enforcement actions",
  },
  {
    name: "Google News - KOSA Kids Online Safety Act",
    url: "https://news.google.com/rss/search?q=KOSA+Kids+Online+Safety+Act+2024+2025",
    type: "rss_feed",
    authorityType: "national",
    jurisdiction: "United States",
    jurisdictionCountry: "United States",
    reliabilityTier: 3,
    searchKeywords: ["KOSA", "Kids Online Safety Act", "teen social media"],
    description: "News coverage of Kids Online Safety Act",
  },
  {
    name: "Google News - COPPA 2.0",
    url: "https://news.google.com/rss/search?q=COPPA+2.0+children+privacy+teen+2024+2025",
    type: "rss_feed",
    authorityType: "national",
    jurisdiction: "United States",
    jurisdictionCountry: "United States",
    reliabilityTier: 3,
    searchKeywords: ["COPPA 2.0", "children data privacy", "teen privacy"],
    description: "News about COPPA 2.0 extending protections to teens under 17",
  },
  {
    name: "Federal Register - Youth Privacy RSS",
    url: "https://www.federalregister.gov/documents/search.rss?conditions%5Bterm%5D=children+online+privacy+social+media",
    type: "rss_feed",
    authorityType: "national",
    jurisdiction: "United States",
    jurisdictionCountry: "United States",
    reliabilityTier: 5,
    searchKeywords: ["federal register", "children online privacy", "youth digital"],
    description: "Federal Register search for children's online privacy documents",
  },

  // ── US States ───────────────────────────────────────────
  {
    name: "California AADC (Age-Appropriate Design Code)",
    url: "https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202120220AB2273",
    type: "government_page",
    authorityType: "state",
    jurisdiction: "California",
    jurisdictionCountry: "United States",
    jurisdictionState: "California",
    reliabilityTier: 5,
    searchKeywords: ["California AADC", "age appropriate design", "AB 2273"],
    description: "California Age-Appropriate Design Code Act — landmark state child safety law",
  },
  {
    name: "Utah Social Media Regulation",
    url: "https://le.utah.gov/~2023/bills/static/SB0152.html",
    type: "government_page",
    authorityType: "state",
    jurisdiction: "Utah",
    jurisdictionCountry: "United States",
    jurisdictionState: "Utah",
    reliabilityTier: 5,
    searchKeywords: ["Utah social media", "minor social media", "parental consent"],
    description: "Utah Social Media Regulation Act — parental consent for minor accounts",
  },
  {
    name: "Texas HB 18 - Securing Children Online",
    url: "https://capitol.texas.gov/BillLookup/History.aspx?LegSess=88R&Bill=HB18",
    type: "government_page",
    authorityType: "state",
    jurisdiction: "Texas",
    jurisdictionCountry: "United States",
    jurisdictionState: "Texas",
    reliabilityTier: 5,
    searchKeywords: ["Texas HB 18", "securing children online", "minor verification"],
    description: "Texas Securing Children Online through Parental Empowerment Act",
  },
  {
    name: "New York SAFE for Kids Act",
    url: "https://www.nysenate.gov/legislation/bills/2023/S7694",
    type: "government_page",
    authorityType: "state",
    jurisdiction: "New York",
    jurisdictionCountry: "United States",
    jurisdictionState: "New York",
    reliabilityTier: 5,
    searchKeywords: ["New York SAFE for Kids", "algorithmic feeds minors", "addictive feeds"],
    description: "NY Stop Addictive Feeds Exploitation for Kids Act",
  },

  // ── European Union ──────────────────────────────────────
  {
    name: "EU Digital Services Act",
    url: "https://digital-strategy.ec.europa.eu/en/policies/digital-services-act-package",
    type: "government_page",
    authorityType: "supranational",
    jurisdiction: "European Union",
    jurisdictionCountry: "European Union",
    reliabilityTier: 5,
    searchKeywords: ["DSA", "Digital Services Act", "minor protection EU"],
    description: "EU DSA — platform obligations including minor protection provisions",
  },
  {
    name: "EU GDPR - Children's Data",
    url: "https://commission.europa.eu/law/law-topic/data-protection_en",
    type: "government_page",
    authorityType: "supranational",
    jurisdiction: "European Union",
    jurisdictionCountry: "European Union",
    reliabilityTier: 5,
    searchKeywords: ["GDPR children", "Article 8", "child consent", "parental consent EU"],
    description: "GDPR Article 8 — conditions for child's consent for information society services",
  },
  {
    name: "EU AI Act - Minor Protections",
    url: "https://artificialintelligenceact.eu/",
    type: "legal_database",
    authorityType: "supranational",
    jurisdiction: "European Union",
    jurisdictionCountry: "European Union",
    reliabilityTier: 4,
    searchKeywords: ["EU AI Act", "children AI", "minor algorithmic protection"],
    description: "EU AI Act reference — includes provisions on AI systems affecting children",
  },

  // ── United Kingdom ──────────────────────────────────────
  {
    name: "UK Online Safety Act",
    url: "https://www.legislation.gov.uk/ukpga/2023/50/contents/enacted",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "United Kingdom",
    jurisdictionCountry: "United Kingdom",
    reliabilityTier: 5,
    searchKeywords: ["Online Safety Act", "UK child safety", "Ofcom codes"],
    description: "UK Online Safety Act 2023 — comprehensive child safety duties for platforms",
  },
  {
    name: "Ofcom Online Safety Codes",
    url: "https://www.ofcom.org.uk/online-safety",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "United Kingdom",
    jurisdictionCountry: "United Kingdom",
    reliabilityTier: 5,
    searchKeywords: ["Ofcom", "codes of practice", "children online safety"],
    description: "Ofcom implementation codes for the Online Safety Act",
  },
  {
    name: "UK ICO Age-Appropriate Design Code",
    url: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "United Kingdom",
    jurisdictionCountry: "United Kingdom",
    reliabilityTier: 5,
    searchKeywords: ["ICO children's code", "age appropriate design UK", "AADC UK"],
    description: "UK ICO Children's Code — 15 standards for online services likely accessed by children",
  },

  // ── Australia ───────────────────────────────────────────
  {
    name: "Australia Online Safety Act",
    url: "https://www.legislation.gov.au/C2021A00076/latest/text",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "Australia",
    jurisdictionCountry: "Australia",
    reliabilityTier: 5,
    searchKeywords: ["Australia Online Safety Act", "eSafety", "social media ban minors"],
    description: "Australia Online Safety Act 2021 and subsequent amendments including minimum age",
  },
  {
    name: "Australia eSafety Commissioner",
    url: "https://www.esafety.gov.au/industry/basic-online-safety-expectations",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "Australia",
    jurisdictionCountry: "Australia",
    reliabilityTier: 5,
    searchKeywords: ["eSafety", "basic online safety expectations", "BOSE"],
    description: "eSafety Commissioner's Basic Online Safety Expectations for platforms",
  },

  // ── Canada ──────────────────────────────────────────────
  {
    name: "Canada Online Harms Act",
    url: "https://www.parl.ca/legisinfo/en/bill/44-1/c-63",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "Canada",
    jurisdictionCountry: "Canada",
    reliabilityTier: 5,
    searchKeywords: ["Canada Online Harms Act", "Bill C-63", "child protection online Canada"],
    description: "Canada Online Harms Act (Bill C-63) — platform duties to protect children",
  },

  // ── APAC ────────────────────────────────────────────────
  {
    name: "Singapore Online Safety Act",
    url: "https://www.mci.gov.sg/what-we-do/online-safety/",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "Singapore",
    jurisdictionCountry: "Singapore",
    reliabilityTier: 5,
    searchKeywords: ["Singapore online safety", "IMDA codes", "minor protection Singapore"],
    description: "Singapore Online Safety (Miscellaneous Amendments) Act",
  },
  {
    name: "South Korea Youth Protection Act",
    url: "https://elaw.klri.re.kr/eng_mobile/viewer.do?hseq=25668&type=part&key=34",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "South Korea",
    jurisdictionCountry: "South Korea",
    reliabilityTier: 4,
    searchKeywords: ["South Korea youth protection", "minor gaming curfew", "teen online Korea"],
    description: "South Korea Youth Protection Act — digital platform obligations for minors",
  },
  {
    name: "Japan Act on Regulation of Soliciting Children",
    url: "https://www.japaneselawtranslation.go.jp/en/laws/view/4210",
    type: "legal_database",
    authorityType: "national",
    jurisdiction: "Japan",
    jurisdictionCountry: "Japan",
    reliabilityTier: 4,
    searchKeywords: ["Japan child online safety", "minor solicitation regulation", "teen internet Japan"],
    description: "Japan regulations on protecting minors from online solicitation",
  },
  {
    name: "India IT Rules - Child Safety",
    url: "https://www.meity.gov.in/writereaddata/files/Information%20Technology%20%28Intermediary%20Guidelines%20and%20Digital%20Media%20Ethics%20Code%29%20Rules%2C%202021.pdf",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "India",
    jurisdictionCountry: "India",
    reliabilityTier: 5,
    searchKeywords: ["India IT rules children", "digital media minor", "DPDP Act children"],
    description: "India IT Intermediary Guidelines with child safety provisions; also DPDP Act 2023",
  },

  // ── EU Individual Country DPAs ────────────────────────────
  {
    name: "France CNIL",
    url: "https://www.cnil.fr/en/news?field_news_type_target_id=All",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "France",
    jurisdictionCountry: "France",
    reliabilityTier: 5,
    searchKeywords: ["CNIL", "children data", "minors France", "privacy France"],
    description: "French data protection authority — active on children's privacy",
  },
  {
    name: "Ireland DPC",
    url: "https://www.dataprotection.ie/en/news-media/press-releases",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "Ireland",
    jurisdictionCountry: "Ireland",
    reliabilityTier: 5,
    searchKeywords: ["DPC Ireland", "Meta fine", "children data", "Instagram investigation"],
    description: "Irish DPC — lead EU supervisory authority for Meta",
  },
  {
    name: "Germany BfDI News",
    url: "https://www.bfdi.bund.de/EN/Home/home_node.html",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "Germany",
    jurisdictionCountry: "Germany",
    reliabilityTier: 5,
    searchKeywords: ["BfDI", "children data Germany", "youth protection"],
    description: "German Federal Data Protection Commissioner",
  },

  // ── APAC Additional ─────────────────────────────────────
  {
    name: "Google News - China Children Internet",
    url: "https://news.google.com/rss/search?q=China+children+internet+regulation+minor+protection+2024+2025",
    type: "rss_feed",
    authorityType: "national",
    jurisdiction: "China",
    jurisdictionCountry: "China",
    reliabilityTier: 3,
    searchKeywords: ["China minors", "internet regulation", "gaming curfew"],
    description: "China regulations on minors' internet use",
  },
  {
    name: "Google News - South Korea Youth Online",
    url: "https://news.google.com/rss/search?q=South+Korea+youth+online+protection+children+internet+2024+2025",
    type: "rss_feed",
    authorityType: "national",
    jurisdiction: "South Korea",
    jurisdictionCountry: "South Korea",
    reliabilityTier: 3,
    searchKeywords: ["South Korea youth", "gaming curfew", "teen online Korea"],
    description: "South Korea youth online protection coverage",
  },
  {
    name: "Google News - Japan Children Online Safety",
    url: "https://news.google.com/rss/search?q=Japan+children+online+safety+regulation+social+media+2024+2025",
    type: "rss_feed",
    authorityType: "national",
    jurisdiction: "Japan",
    jurisdictionCountry: "Japan",
    reliabilityTier: 3,
    searchKeywords: ["Japan child safety", "minor online protection"],
    description: "Japan children's online safety regulation coverage",
  },

  // ── Think Tanks & Advocacy ──────────────────────────────
  {
    name: "5Rights Foundation",
    url: "https://5rightsfoundation.com/in-action/news",
    type: "government_page",
    authorityType: "supranational",
    jurisdiction: "Global",
    jurisdictionCountry: "Global",
    reliabilityTier: 4,
    searchKeywords: ["5Rights", "age appropriate design", "children digital rights"],
    description: "5Rights Foundation — leading children's digital rights advocacy",
  },
  {
    name: "EPIC - Children's Privacy",
    url: "https://epic.org/issues/consumer-privacy/childrens-privacy/",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "United States",
    jurisdictionCountry: "United States",
    reliabilityTier: 4,
    searchKeywords: ["EPIC", "children privacy", "COPPA", "student privacy"],
    description: "Electronic Privacy Information Center — children's privacy tracker",
  },

  // ── News & Legal Databases (lower tier) ─────────────────
  {
    name: "Google News - Child Safety Regulation Meta",
    url: "https://news.google.com/rss/search?q=Meta+child+safety+regulation+teen+social+media+2024+2025",
    type: "rss_feed",
    authorityType: "national",
    jurisdiction: "Global",
    jurisdictionCountry: "Global",
    reliabilityTier: 3,
    searchKeywords: ["child safety regulation tech", "Meta teen policy", "social media minors"],
    description: "Google News coverage of Meta child safety regulation",
  },
  {
    name: "Google News - Online Safety Children Regulation",
    url: "https://news.google.com/rss/search?q=online+safety+children+regulation+age+verification+2024+2025",
    type: "rss_feed",
    authorityType: "national",
    jurisdiction: "Global",
    jurisdictionCountry: "Global",
    reliabilityTier: 3,
    searchKeywords: ["online safety", "children regulation", "age verification"],
    description: "Global news on children's online safety regulation",
  },
  {
    name: "IAPP News RSS",
    url: "https://iapp.org/news/rss/",
    type: "rss_feed",
    authorityType: "supranational",
    jurisdiction: "Global",
    jurisdictionCountry: "Global",
    reliabilityTier: 4,
    searchKeywords: ["children privacy law", "teen data regulation", "COPPA age verification"],
    description: "IAPP news — professional privacy law coverage including children's regulations",
  },
];

/** Get all sources for a specific jurisdiction */
export function getSourcesByJurisdiction(country: string): RegistrySource[] {
  return sourceRegistry.filter(
    (s) => s.jurisdictionCountry === country || s.jurisdiction === country,
  );
}

/** Get sources at or above a reliability threshold */
export function getSourcesByMinReliability(minTier: ReliabilityTier): RegistrySource[] {
  return sourceRegistry.filter((s) => s.reliabilityTier >= minTier);
}

/** Get all unique jurisdictions in the registry */
export function getRegisteredJurisdictions(): string[] {
  return [...new Set(sourceRegistry.map((s) => s.jurisdictionCountry))];
}
