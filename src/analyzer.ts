/**
 * LLM Analysis Pipeline using MiniMax M2.5 API (Anthropic-compatible endpoint).
 * Sends crawled text to determine relevance and extract structured regulation data.
 */

import { type CrawledItem } from "./crawler";

const MINIMAX_API_URL = "https://api.minimax.io/anthropic/v1/messages";
const MINIMAX_MODEL = "MiniMax-M2.5";

export type AnalysisResult = {
  relevant: boolean;
  title: string;
  jurisdiction: string;
  jurisdictionState: string | null;
  stage: string;
  ageBracket: "13-15" | "16-18" | "both";
  affectedProducts: string[];
  summary: string;
  businessImpact: string;
  requiredSolutions: string[];
  competitorResponses: string[];
  impactScore: number;
  likelihoodScore: number;
  confidenceScore: number;
  chiliScore: number;
  effectiveDate: string | null;
  publishedDate: string | null;
};

const ANALYSIS_PROMPT = `You are a regulatory intelligence analyst specializing in teen online safety laws affecting Meta (Facebook, Instagram, WhatsApp, Threads, Messenger).

Analyze the following crawled text and determine:
1. Is this relevant to teen (ages 13-18) or children's online regulation that could affect Meta's products?
2. If relevant, extract structured data.

IMPORTANT: Mark as RELEVANT if the content relates to ANY of these topics (be INCLUSIVE — false positives are better than missing real regulations):
- Laws, regulations, bills, or enforcement actions about minors/teens/children online
- Platform safety obligations for users under 18 (including under-13, under-16)
- Age verification, parental consent, or children's data protection (e.g. COPPA, GDPR Article 8)
- Social media restrictions or duties of care for minors
- Data protection regulations that include specific children's provisions (GDPR, LGPD, DPDP, etc.)
- AI regulation with provisions affecting minors
- Online safety acts, digital services acts, or content moderation rules
- Advertising/profiling restrictions for children or teens
- Government consultations or proposals about children's online safety
- Even if the text is noisy, partial HTML, or a general overview page — if the SOURCE URL or title suggests it is about child/teen regulation, mark it RELEVANT

NOTE: The crawled text may be noisy HTML with navigation elements, cookie notices, etc. Focus on the core content and the source context (title, URL, source name) to determine relevance.

Respond with ONLY a JSON object (no markdown, no code fences):

{
  "relevant": true/false,
  "title": "Short descriptive title of the regulation/action",
  "jurisdiction": "Country name",
  "jurisdictionState": "State/province name or null",
  "stage": "one of: proposed, introduced, committee_review, passed, enacted, effective, amended, withdrawn, rejected",
  "ageBracket": "one of: 13-15, 16-18, both",
  "affectedProducts": ["Instagram", "Facebook", etc.],
  "summary": "2-3 sentence summary of the regulation and its implications for Meta",
  "businessImpact": "Description of how this affects Meta's business",
  "requiredSolutions": ["List of compliance actions Meta would need to take"],
  "competitorResponses": ["How competitors have responded, if mentioned"],
  "impactScore": 1-5,
  "likelihoodScore": 1-5,
  "confidenceScore": 1-5,
  "chiliScore": 1-5,
  "effectiveDate": "YYYY-MM-DD or null",
  "publishedDate": "YYYY-MM-DD or null"
}

Scoring guide:
- impactScore: 1=negligible, 2=minor process change, 3=moderate product changes, 4=major feature redesign, 5=existential/platform-wide
- likelihoodScore: 1=unlikely, 2=possible, 3=probable, 4=very likely, 5=certain/already enacted
- confidenceScore: 1=very low (speculation), 2=low, 3=moderate, 4=high (official source), 5=very high (enacted law text)
- chiliScore: overall urgency/heat = max(impactScore, likelihoodScore) adjusted for timeline

If the content is NOT relevant, return: {"relevant": false}`;

/** Clamp a score to valid 1-5 integer range */
function clampScore(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 3;
  return Math.max(1, Math.min(5, Math.round(num)));
}

const validStages = new Set([
  "proposed", "introduced", "committee_review", "passed",
  "enacted", "effective", "amended", "withdrawn", "rejected",
]);

const validAgeBrackets = new Set(["13-15", "16-18", "both"]);

/** Call MiniMax M2.5 API */
async function callMiniMax(text: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(MINIMAX_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: `${ANALYSIS_PROMPT}\n\n--- CRAWLED TEXT ---\n${text.slice(0, 8000)}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`MiniMax API error ${response.status}: ${errorBody.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text: string }>;
    };

    const textContent = data.content?.find((c) => c.type === "text");
    return textContent?.text ?? "";
  } finally {
    clearTimeout(timer);
  }
}

/** Parse the LLM response JSON, handling common issues */
function parseLlmResponse(raw: string): Record<string, unknown> | null {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object from the response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Analyze a single crawled item using MiniMax M2.5.
 * Returns null if the API key is missing or the call fails.
 */
export async function analyzeItem(
  item: CrawledItem,
  apiKey: string,
): Promise<AnalysisResult | null> {
  try {
    const inputText = `Source: ${item.source.name}\nURL: ${item.url}\nTitle: ${item.title}\n\n${item.text}`;
    const raw = await callMiniMax(inputText, apiKey);
    const parsed = parseLlmResponse(raw);

    if (!parsed) {
      console.warn(`[analyzer] Failed to parse LLM response for "${item.title}"`);
      return null;
    }

    if (parsed.relevant === false) {
      return { relevant: false } as AnalysisResult;
    }

    return {
      relevant: true,
      title: String(parsed.title || item.title).slice(0, 500),
      jurisdiction: String(parsed.jurisdiction || item.source.jurisdictionCountry),
      jurisdictionState: parsed.jurisdictionState ? String(parsed.jurisdictionState) : item.source.jurisdictionState ?? null,
      stage: validStages.has(String(parsed.stage)) ? String(parsed.stage) : "proposed",
      ageBracket: validAgeBrackets.has(String(parsed.ageBracket)) ? String(parsed.ageBracket) as AnalysisResult["ageBracket"] : "both",
      affectedProducts: Array.isArray(parsed.affectedProducts)
        ? parsed.affectedProducts.map(String)
        : ["Facebook", "Instagram"],
      summary: String(parsed.summary || "No summary available").slice(0, 2000),
      businessImpact: String(parsed.businessImpact || "").slice(0, 2000),
      requiredSolutions: Array.isArray(parsed.requiredSolutions)
        ? parsed.requiredSolutions.map(String)
        : [],
      competitorResponses: Array.isArray(parsed.competitorResponses)
        ? parsed.competitorResponses.map(String)
        : [],
      impactScore: clampScore(parsed.impactScore),
      likelihoodScore: clampScore(parsed.likelihoodScore),
      confidenceScore: clampScore(parsed.confidenceScore),
      chiliScore: clampScore(parsed.chiliScore),
      effectiveDate: typeof parsed.effectiveDate === "string" ? parsed.effectiveDate : null,
      publishedDate: typeof parsed.publishedDate === "string" ? parsed.publishedDate : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[analyzer] Analysis failed for "${item.title}": ${message}`);
    return null;
  }
}

/**
 * Analyze multiple crawled items with concurrency control.
 * Skips items that fail or are not relevant.
 */
export async function analyzeItems(
  items: CrawledItem[],
  apiKey: string,
  concurrency = 3,
  onProgress?: (completed: number, total: number, title: string) => void,
): Promise<Array<{ item: CrawledItem; analysis: AnalysisResult }>> {
  const results: Array<{ item: CrawledItem; analysis: AnalysisResult }> = [];
  let completed = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const analyses = await Promise.allSettled(
      batch.map((item) => analyzeItem(item, apiKey)),
    );

    for (let j = 0; j < analyses.length; j++) {
      completed++;
      const result = analyses[j];
      if (result.status === "fulfilled" && result.value?.relevant) {
        results.push({ item: batch[j], analysis: result.value });
      }
      onProgress?.(completed, items.length, batch[j].title);
    }
  }

  return results;
}
