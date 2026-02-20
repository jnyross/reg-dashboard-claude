import request from "supertest";
import { createApp } from "../src/app";
import { backfillLawsFromEvents, ensureSource, initializeSchema, openDatabase, upsertEvent } from "../src/db";
import { seedSampleData } from "../src/seed";

function buildTestApp() {
  const db = openDatabase(":memory:");
  initializeSchema(db);
  seedSampleData(db);
  const app = createApp(db);
  return { app, db };
}

describe("law-centric APIs", () => {
  it("GET /api/laws returns canonical law entities", async () => {
    const { app, db } = buildTestApp();

    const response = await request(app).get("/api/laws?limit=5");
    expect(response.status).toBe(200);
    expect(response.body.items.length).toBeGreaterThan(0);
    expect(response.body.items[0]).toHaveProperty("lawKey");
    expect(response.body.items[0]).toHaveProperty("updateCount");

    db.close();
  });

  it("backfill merges multiple updates under one canonical law and exposes timeline", async () => {
    const { app, db } = buildTestApp();

    const sourceId = ensureSource(db, {
      name: "FTC",
      url: "https://www.ftc.gov",
      authorityType: "national",
      jurisdiction: "United States",
      reliabilityTier: 5,
    });

    upsertEvent(db, {
      title: "FTC publishes COPPA Rule amendments",
      jurisdictionCountry: "United States",
      jurisdictionState: null,
      stage: "proposed",
      isUnder16Applicable: true,
      ageBracket: "both",
      impactScore: 4,
      likelihoodScore: 4,
      confidenceScore: 4,
      chiliScore: 4,
      summary: "First COPPA update",
      businessImpact: "Compliance updates required",
      requiredSolutions: ["Age assurance"],
      affectedProducts: ["Instagram"],
      competitorResponses: null,
      rawText: "COPPA Rule amendment published by FTC",
      sourceUrlLink: "https://www.ftc.gov/coppa-rule-amendments",
      effectiveDate: null,
      publishedDate: "2026-01-10",
      sourceId,
    });

    upsertEvent(db, {
      title: "FTC issues COPPA enforcement guidance",
      jurisdictionCountry: "United States",
      jurisdictionState: null,
      stage: "enacted",
      isUnder16Applicable: true,
      ageBracket: "both",
      impactScore: 5,
      likelihoodScore: 5,
      confidenceScore: 5,
      chiliScore: 5,
      summary: "Second COPPA update",
      businessImpact: "Expanded penalties",
      requiredSolutions: ["Policy updates"],
      affectedProducts: ["Instagram", "Facebook"],
      competitorResponses: null,
      rawText: "COPPA enforcement guidance from FTC",
      sourceUrlLink: "https://www.ftc.gov/coppa-enforcement-guidance",
      effectiveDate: "2026-02-10",
      publishedDate: "2026-02-01",
      sourceId,
    });

    const stats = backfillLawsFromEvents(db);
    expect(stats.laws).toBeGreaterThan(0);

    const laws = await request(app).get("/api/laws?q=COPPA");
    expect(laws.status).toBe(200);

    const coppaLaw = laws.body.items.find((item: { lawName: string }) => /COPPA/i.test(item.lawName));
    expect(coppaLaw).toBeDefined();
    expect(coppaLaw.updateCount).toBeGreaterThanOrEqual(2);

    const detail = await request(app).get(`/api/laws/${encodeURIComponent(coppaLaw.lawKey)}`);
    expect(detail.status).toBe(200);
    expect(detail.body.updates.length).toBeGreaterThanOrEqual(2);
    expect(detail.body.timeline.length).toBeGreaterThanOrEqual(2);

    db.close();
  });

  it("GET /api/brief is law-first and includes update counts", async () => {
    const { app, db } = buildTestApp();

    const response = await request(app).get("/api/brief?limit=3");
    expect(response.status).toBe(200);
    expect(response.body.view).toBe("laws");
    expect(response.body.items).toHaveLength(3);
    expect(response.body.items[0]).toHaveProperty("lawKey");
    expect(response.body.items[0]).toHaveProperty("updateCount");

    db.close();
  });
});
