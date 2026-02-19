import { analyzeItem, analyzeItems, type AnalysisResult } from "../src/analyzer";
import { type CrawledItem } from "../src/crawler";
import { type RegistrySource } from "../src/sources";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

const testSource: RegistrySource = {
  name: "Test Source",
  url: "https://example.com/test",
  type: "government_page",
  authorityType: "national",
  jurisdiction: "United States",
  jurisdictionCountry: "United States",
  reliabilityTier: 5,
  description: "Test source",
};

const testItem: CrawledItem = {
  source: testSource,
  url: "https://example.com/test",
  title: "Test Regulation Article",
  text: "This is about children's online safety regulation affecting social media platforms.",
  fetchedAt: new Date().toISOString(),
};

function mockMiniMaxResponse(content: Record<string, unknown>) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      content: [{ type: "text", text: JSON.stringify(content) }],
    }),
  }) as unknown as typeof fetch;
}

describe("analyzeItem", () => {
  it("parses a relevant LLM response correctly", async () => {
    mockMiniMaxResponse({
      relevant: true,
      title: "US Children's Privacy Act",
      jurisdiction: "United States",
      jurisdictionState: null,
      stage: "proposed",
      ageBracket: "both",
      affectedProducts: ["Instagram", "Facebook"],
      summary: "A new proposal targeting teen privacy on social media.",
      businessImpact: "Would require age verification for all users under 18.",
      requiredSolutions: ["Implement age verification", "Update privacy settings"],
      competitorResponses: ["TikTok already complies"],
      impactScore: 4,
      likelihoodScore: 3,
      confidenceScore: 4,
      chiliScore: 4,
      effectiveDate: "2026-06-01",
      publishedDate: "2026-01-15",
    });

    const result = await analyzeItem(testItem, "test-api-key");

    expect(result).not.toBeNull();
    expect(result!.relevant).toBe(true);
    expect(result!.title).toBe("US Children's Privacy Act");
    expect(result!.jurisdiction).toBe("United States");
    expect(result!.stage).toBe("proposed");
    expect(result!.ageBracket).toBe("both");
    expect(result!.affectedProducts).toEqual(["Instagram", "Facebook"]);
    expect(result!.impactScore).toBe(4);
    expect(result!.likelihoodScore).toBe(3);
    expect(result!.confidenceScore).toBe(4);
    expect(result!.chiliScore).toBe(4);
    expect(result!.requiredSolutions).toHaveLength(2);
    expect(result!.effectiveDate).toBe("2026-06-01");
  });

  it("returns irrelevant result when LLM says not relevant", async () => {
    mockMiniMaxResponse({ relevant: false });

    const result = await analyzeItem(testItem, "test-api-key");
    expect(result).not.toBeNull();
    expect(result!.relevant).toBe(false);
  });

  it("clamps scores to valid 1-5 range", async () => {
    mockMiniMaxResponse({
      relevant: true,
      title: "Test",
      jurisdiction: "United States",
      stage: "enacted",
      ageBracket: "both",
      affectedProducts: [],
      summary: "Test summary",
      businessImpact: "",
      requiredSolutions: [],
      competitorResponses: [],
      impactScore: 10,
      likelihoodScore: -1,
      confidenceScore: 0,
      chiliScore: 6,
    });

    const result = await analyzeItem(testItem, "test-api-key");
    expect(result!.impactScore).toBe(5);
    expect(result!.likelihoodScore).toBe(1);
    expect(result!.confidenceScore).toBe(1);
    expect(result!.chiliScore).toBe(5);
  });

  it("handles invalid stage by defaulting to proposed", async () => {
    mockMiniMaxResponse({
      relevant: true,
      title: "Test",
      jurisdiction: "UK",
      stage: "invalid_stage",
      ageBracket: "both",
      affectedProducts: [],
      summary: "Summary",
      businessImpact: "",
      requiredSolutions: [],
      competitorResponses: [],
      impactScore: 3,
      likelihoodScore: 3,
      confidenceScore: 3,
      chiliScore: 3,
    });

    const result = await analyzeItem(testItem, "test-api-key");
    expect(result!.stage).toBe("proposed");
  });

  it("handles markdown-wrapped JSON response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{
          type: "text",
          text: '```json\n{"relevant": true, "title": "Test", "jurisdiction": "US", "stage": "enacted", "ageBracket": "both", "affectedProducts": [], "summary": "Test", "businessImpact": "", "requiredSolutions": [], "competitorResponses": [], "impactScore": 3, "likelihoodScore": 3, "confidenceScore": 3, "chiliScore": 3}\n```',
        }],
      }),
    }) as unknown as typeof fetch;

    const result = await analyzeItem(testItem, "test-api-key");
    expect(result).not.toBeNull();
    expect(result!.relevant).toBe(true);
  });

  it("returns null on API error", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    }) as unknown as typeof fetch;

    const result = await analyzeItem(testItem, "test-api-key");
    expect(result).toBeNull();
  });

  it("returns null on network failure", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error")) as unknown as typeof fetch;

    const result = await analyzeItem(testItem, "test-api-key");
    expect(result).toBeNull();
  });
});

describe("analyzeItems", () => {
  it("filters out irrelevant and failed items", async () => {
    let callCount = 0;
    global.fetch = jest.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: () => Promise.resolve({
            content: [{
              type: "text",
              text: JSON.stringify({
                relevant: true,
                title: "Relevant Item",
                jurisdiction: "US",
                stage: "proposed",
                ageBracket: "both",
                affectedProducts: ["Instagram"],
                summary: "Relevant regulation",
                businessImpact: "High",
                requiredSolutions: [],
                competitorResponses: [],
                impactScore: 4,
                likelihoodScore: 4,
                confidenceScore: 4,
                chiliScore: 4,
              }),
            }],
          }),
        };
      }
      return {
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: "text", text: JSON.stringify({ relevant: false }) }],
        }),
      };
    }) as unknown as typeof fetch;

    const items: CrawledItem[] = [
      { ...testItem, title: "Relevant" },
      { ...testItem, title: "Irrelevant" },
    ];

    const results = await analyzeItems(items, "test-key", 2);
    expect(results).toHaveLength(1);
    expect(results[0].analysis.title).toBe("Relevant Item");
  });

  it("reports progress", async () => {
    mockMiniMaxResponse({ relevant: false });

    const items: CrawledItem[] = [testItem, testItem];
    const progress: string[] = [];

    await analyzeItems(items, "test-key", 2, (completed, total) => {
      progress.push(`${completed}/${total}`);
    });

    expect(progress).toHaveLength(2);
  });
});
