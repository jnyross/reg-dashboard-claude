import DatabaseConstructor from "better-sqlite3";
import { validateScoringBounds } from "./validation";

type SeedSource = {
  name: string;
  url: string;
  authorityType: "national" | "state" | "local" | "supranational";
  jurisdiction: string;
  reliabilityTier: number;
};

type SeedEvent = {
  id: string;
  title: string;
  jurisdictionCountry: string;
  jurisdictionState: string | null;
  stage:
    | "proposed"
    | "introduced"
    | "committee_review"
    | "passed"
    | "enacted"
    | "effective"
    | "amended"
    | "withdrawn"
    | "rejected";
  isUnder16Applicable: boolean;
  ageBracket: "13-15" | "16-18" | "both";
  impactScore: number;
  likelihoodScore: number;
  confidenceScore: number;
  chiliScore: number;
  summary: string;
  businessImpact: string;
  requiredSolutions: string[];
  affectedProducts: string[];
  competitorResponses: string[];
  effectiveDate: string | null;
  publishedDate: string;
  sourceName: string;
  sourceUrlLink: string;
  updatedAt: string;
  createdAt: string;
};

const sources: SeedSource[] = [
  {
    name: "US Federal Register",
    url: "https://www.federalregister.gov",
    authorityType: "national",
    jurisdiction: "United States",
    reliabilityTier: 5,
  },
  {
    name: "California State Legislature",
    url: "https://leginfo.legislature.ca.gov",
    authorityType: "state",
    jurisdiction: "California",
    reliabilityTier: 5,
  },
  {
    name: "European Commission",
    url: "https://digital-strategy.ec.europa.eu",
    authorityType: "supranational",
    jurisdiction: "European Union",
    reliabilityTier: 5,
  },
  {
    name: "UK Office of Communications",
    url: "https://www.ofcom.org.uk",
    authorityType: "national",
    jurisdiction: "United Kingdom",
    reliabilityTier: 5,
  },
  {
    name: "Singapore Government Gazette",
    url: "https://www.egazette.gov.sg",
    authorityType: "national",
    jurisdiction: "Singapore",
    reliabilityTier: 4,
  },
];

const events: SeedEvent[] = [
  {
    id: "11111111-1111-1111-1111-111111111101",
    title: "US Federal Youth Privacy Modernization Proposal",
    jurisdictionCountry: "United States",
    jurisdictionState: null,
    stage: "proposed",
    isUnder16Applicable: true,
    ageBracket: "both",
    impactScore: 5,
    likelihoodScore: 5,
    confidenceScore: 4,
    chiliScore: 5,
    summary: "Draft proposal expands affirmative age-verification requirements for under-16 user features.",
    businessImpact: "Would require product-wide updates to age assurance, parental controls, and ads defaults.",
    requiredSolutions: ["Age verification", "Parental dashboard", "Ad targeting controls"],
    affectedProducts: ["Instagram", "Facebook", "Messenger"],
    competitorResponses: ["TikTok piloted stricter age checks", "Snap expanded teen account protections"],
    effectiveDate: "2026-04-30",
    publishedDate: "2026-02-10",
    sourceName: "US Federal Register",
    sourceUrlLink: "https://www.federalregister.gov/documents/2026/02/youth-privacy-proposal",
    createdAt: "2026-01-10T10:00:00.000Z",
    updatedAt: "2026-02-10T10:00:00.000Z",
  },
  {
    id: "11111111-1111-1111-1111-111111111102",
    title: "California Digital Product Risk Assessment Rule",
    jurisdictionCountry: "United States",
    jurisdictionState: "California",
    stage: "introduced",
    isUnder16Applicable: true,
    ageBracket: "13-15",
    impactScore: 4,
    likelihoodScore: 4,
    confidenceScore: 5,
    chiliScore: 5,
    summary: "State bill requires algorithmic auditing for minors' recommendation systems.",
    businessImpact: "Introduces recurring state audits and transparency obligations for youth recommendation engines.",
    requiredSolutions: ["Algorithmic audit trail", "Risk documentation", "Regulator reporting"],
    affectedProducts: ["Instagram Reels", "Facebook Feed"],
    competitorResponses: ["YouTube tested reduced autoplay for minors"],
    effectiveDate: "2026-06-01",
    publishedDate: "2026-02-02",
    sourceName: "California State Legislature",
    sourceUrlLink: "https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260AB9999",
    createdAt: "2026-01-12T08:00:00.000Z",
    updatedAt: "2026-02-11T09:30:00.000Z",
  },
  {
    id: "11111111-1111-1111-1111-111111111103",
    title: "EU Child-Centric Digital Service Safeguards",
    jurisdictionCountry: "European Union",
    jurisdictionState: null,
    stage: "committee_review",
    isUnder16Applicable: true,
    ageBracket: "both",
    impactScore: 4,
    likelihoodScore: 4,
    confidenceScore: 4,
    chiliScore: 5,
    summary: "Committee review discusses additional default safety controls for youth-targeted feeds.",
    businessImpact: "Likely requires safer defaults and expanded audit evidence under DSA child provisions.",
    requiredSolutions: ["Default private profiles", "Youth feed guardrails", "Safety impact assessments"],
    affectedProducts: ["Instagram", "Threads"],
    competitorResponses: ["TikTok announced expanded Family Pairing controls"],
    effectiveDate: "2026-07-15",
    publishedDate: "2026-01-30",
    sourceName: "European Commission",
    sourceUrlLink: "https://digital-strategy.ec.europa.eu/en/library/child-centric-digital-service-safeguards",
    createdAt: "2026-01-15T12:00:00.000Z",
    updatedAt: "2026-02-09T12:00:00.000Z",
  },
  {
    id: "11111111-1111-1111-1111-111111111104",
    title: "UK Online Safety Enforcement Action",
    jurisdictionCountry: "United Kingdom",
    jurisdictionState: null,
    stage: "enacted",
    isUnder16Applicable: true,
    ageBracket: "both",
    impactScore: 3,
    likelihoodScore: 3,
    confidenceScore: 4,
    chiliScore: 4,
    summary: "Enforcement penalties clarified for noncompliant age verification flows.",
    businessImpact: "Increases near-term enforcement risk and incident response requirements.",
    requiredSolutions: ["Compliance evidence retention", "Escalation playbooks"],
    affectedProducts: ["Instagram", "Facebook"],
    competitorResponses: ["Snap published updated UK compliance center"],
    effectiveDate: "2026-01-20",
    publishedDate: "2025-12-12",
    sourceName: "UK Office of Communications",
    sourceUrlLink: "https://www.ofcom.org.uk/online-safety/enforcement-child-safety-2026",
    createdAt: "2025-12-01T11:00:00.000Z",
    updatedAt: "2026-02-03T10:00:00.000Z",
  },
  {
    id: "11111111-1111-1111-1111-111111111105",
    title: "Singapore PDPA Clarification for Minors",
    jurisdictionCountry: "Singapore",
    jurisdictionState: null,
    stage: "effective",
    isUnder16Applicable: true,
    ageBracket: "16-18",
    impactScore: 3,
    likelihoodScore: 2,
    confidenceScore: 4,
    chiliScore: 4,
    summary: "Data-controller obligations updated with clearer consent documentation requirements.",
    businessImpact: "Requires jurisdiction-specific consent records and policy language for teen users.",
    requiredSolutions: ["Consent records", "Jurisdiction policy routing"],
    affectedProducts: ["Facebook", "Messenger"],
    competitorResponses: ["TikTok added localized consent copy in Singapore"],
    effectiveDate: "2025-09-01",
    publishedDate: "2025-08-15",
    sourceName: "Singapore Government Gazette",
    sourceUrlLink: "https://www.egazette.gov.sg/child-data-guidance-2025",
    createdAt: "2025-08-16T09:15:00.000Z",
    updatedAt: "2026-01-28T08:30:00.000Z",
  },
  {
    id: "11111111-1111-1111-1111-111111111106",
    title: "Brazil LGPD Under-16 Update Monitoring Note",
    jurisdictionCountry: "Brazil",
    jurisdictionState: null,
    stage: "passed",
    isUnder16Applicable: true,
    ageBracket: "13-15",
    impactScore: 2,
    likelihoodScore: 3,
    confidenceScore: 3,
    chiliScore: 3,
    summary: "Compliance update indicates probable under-16 protections in implementation guidance.",
    businessImpact: "Potential medium-term localization work once implementing decree is finalized.",
    requiredSolutions: ["Policy watch", "Regional compliance mapping"],
    affectedProducts: ["Instagram"],
    competitorResponses: ["YouTube expanded teen wellbeing defaults in Brazil"],
    effectiveDate: "2026-03-12",
    publishedDate: "2026-01-18",
    sourceName: "European Commission",
    sourceUrlLink: "https://example.org/brazil-lgpd-under16-monitoring-note",
    createdAt: "2026-01-18T08:45:00.000Z",
    updatedAt: "2026-01-25T13:30:00.000Z",
  },
  {
    id: "11111111-1111-1111-1111-111111111107",
    title: "Australia Minor Services Consultation",
    jurisdictionCountry: "Australia",
    jurisdictionState: null,
    stage: "introduced",
    isUnder16Applicable: true,
    ageBracket: "13-15",
    impactScore: 2,
    likelihoodScore: 2,
    confidenceScore: 3,
    chiliScore: 2,
    summary: "New public consultation on default feed-limits and parental control notices.",
    businessImpact: "Could require additional in-product disclosures and parental tools.",
    requiredSolutions: ["Consultation response", "UX disclosure review"],
    affectedProducts: ["Instagram", "Threads"],
    competitorResponses: [],
    effectiveDate: null,
    publishedDate: "2026-01-22",
    sourceName: "US Federal Register",
    sourceUrlLink: "https://example.org/australia-consultation-minor-services",
    createdAt: "2026-01-22T14:20:00.000Z",
    updatedAt: "2026-01-29T11:11:00.000Z",
  },
  {
    id: "11111111-1111-1111-1111-111111111108",
    title: "India Emerging Digital Advertising Rules",
    jurisdictionCountry: "India",
    jurisdictionState: null,
    stage: "amended",
    isUnder16Applicable: true,
    ageBracket: "16-18",
    impactScore: 1,
    likelihoodScore: 2,
    confidenceScore: 3,
    chiliScore: 2,
    summary: "Ad disclosure additions for minor audiences in beta product categories.",
    businessImpact: "Low-to-medium product labeling changes for teen ad experiences.",
    requiredSolutions: ["Ad label updates", "Teen audience controls"],
    affectedProducts: ["Facebook Ads", "Instagram Ads"],
    competitorResponses: ["Google strengthened youth ad transparency labels"],
    effectiveDate: "2026-05-01",
    publishedDate: "2025-11-10",
    sourceName: "UK Office of Communications",
    sourceUrlLink: "https://example.org/india-advertising-rules-minors",
    createdAt: "2025-11-11T17:55:00.000Z",
    updatedAt: "2026-01-10T07:05:00.000Z",
  },
];

export function seedSampleData(db: DatabaseConstructor.Database): void {
  const seeded = db.prepare("SELECT COUNT(*) AS count FROM regulation_events").get() as { count: number };
  if (seeded.count > 0) {
    return;
  }

  const sourceUpsert = db.prepare(
    `
    INSERT OR IGNORE INTO sources (name, url, authority_type, jurisdiction, reliability_tier, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
  );
  const sourceLookup = db.prepare("SELECT id, name FROM sources");
  const insertEvent = db.prepare(`
    INSERT OR REPLACE INTO regulation_events (
      id, title, jurisdiction_country, jurisdiction_state, stage,
      is_under16_applicable, age_bracket,
      impact_score, likelihood_score, confidence_score,
      chili_score, summary, business_impact, required_solutions, affected_products,
      competitor_responses, raw_text, source_url_link,
      effective_date, published_date, source_id, created_at, updated_at
    ) VALUES (
      @id, @title, @jurisdictionCountry, @jurisdictionState, @stage,
      @isUnder16Applicable, @ageBracket,
      @impactScore, @likelihoodScore, @confidenceScore,
      @chiliScore, @summary, @businessImpact, @requiredSolutions, @affectedProducts,
      @competitorResponses, @rawText, @sourceUrlLink,
      @effectiveDate, @publishedDate, @sourceId, @createdAt, @updatedAt
    )
  `);

  const insertHistory = db.prepare(`
    INSERT INTO event_history (event_id, changed_at, changed_by, change_type, field_name, previous_value, new_value)
    VALUES (@eventId, @changedAt, 'seed', 'created', 'event', NULL, 'Seeded baseline event')
  `);

  const txn = db.transaction(() => {
    for (const source of sources) {
      sourceUpsert.run(
        source.name,
        source.url,
        source.authorityType,
        source.jurisdiction,
        source.reliabilityTier,
        new Date().toISOString(),
      );
    }

    const sourceMap = new Map<string, number>((sourceLookup.all() as Array<{ id: number; name: string }>).map((row) => [row.name, row.id]));

    for (const event of events) {
      const validation = validateScoringBounds({
        impactScore: event.impactScore,
        likelihoodScore: event.likelihoodScore,
        confidenceScore: event.confidenceScore,
        chiliScore: event.chiliScore,
      });

      if (!validation.valid) {
        throw new Error(`Invalid seed score for event ${event.id}: ${validation.errors.join(", ")}`);
      }

      const sourceId = sourceMap.get(event.sourceName);
      if (!sourceId) {
        throw new Error(`Source not found for event ${event.id}: ${event.sourceName}`);
      }

      insertEvent.run({
        ...event,
        sourceId,
        requiredSolutions: JSON.stringify(event.requiredSolutions),
        affectedProducts: JSON.stringify(event.affectedProducts),
        competitorResponses: JSON.stringify(event.competitorResponses),
        rawText: `${event.title}. ${event.summary}`,
        isUnder16Applicable: event.isUnder16Applicable ? 1 : 0,
      });

      insertHistory.run({
        eventId: event.id,
        changedAt: event.createdAt,
      });
    }
  });

  txn();
}
