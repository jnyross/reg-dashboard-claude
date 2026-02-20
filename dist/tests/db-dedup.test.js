"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../src/db");
function buildTestDb() {
    const db = (0, db_1.openDatabase)(":memory:");
    (0, db_1.initializeSchema)(db);
    return db;
}
function createTestInput(overrides = {}) {
    return {
        title: "Test Regulation",
        jurisdictionCountry: "United States",
        jurisdictionState: null,
        stage: "proposed",
        isUnder16Applicable: true,
        ageBracket: "both",
        impactScore: 3,
        likelihoodScore: 3,
        confidenceScore: 3,
        chiliScore: 3,
        summary: "A test regulation for testing dedup",
        businessImpact: "Medium impact",
        requiredSolutions: ["Solution 1"],
        affectedProducts: ["Instagram"],
        competitorResponses: null,
        rawText: "Raw crawled text here",
        sourceUrlLink: "https://example.com/test-page",
        effectiveDate: null,
        publishedDate: "2026-01-15",
        sourceId: 1,
        ...overrides,
    };
}
describe("upsertEvent deduplication", () => {
    it("inserts a new event and returns 'new'", () => {
        const db = buildTestDb();
        const sourceId = (0, db_1.ensureSource)(db, {
            name: "Test Source",
            url: "https://example.com",
            authorityType: "national",
            jurisdiction: "United States",
            reliabilityTier: 5,
        });
        const result = (0, db_1.upsertEvent)(db, createTestInput({ sourceId }));
        expect(result).toBe("new");
        const count = db.prepare("SELECT COUNT(*) AS c FROM regulation_events").get();
        expect(count.c).toBe(1);
        db.close();
    });
    it("returns 'duplicate' when same item is inserted unchanged", () => {
        const db = buildTestDb();
        const sourceId = (0, db_1.ensureSource)(db, {
            name: "Test Source",
            url: "https://example.com",
            authorityType: "national",
            jurisdiction: "United States",
            reliabilityTier: 5,
        });
        const input = createTestInput({ sourceId });
        (0, db_1.upsertEvent)(db, input);
        const result = (0, db_1.upsertEvent)(db, input);
        expect(result).toBe("duplicate");
        const count = db.prepare("SELECT COUNT(*) AS c FROM regulation_events").get();
        expect(count.c).toBe(1);
        db.close();
    });
    it("returns 'updated' when same item has changed fields", () => {
        const db = buildTestDb();
        const sourceId = (0, db_1.ensureSource)(db, {
            name: "Test Source",
            url: "https://example.com",
            authorityType: "national",
            jurisdiction: "United States",
            reliabilityTier: 5,
        });
        (0, db_1.upsertEvent)(db, createTestInput({ sourceId }));
        const updated = createTestInput({
            sourceId,
            stage: "enacted",
            summary: "Updated summary with new info",
        });
        const result = (0, db_1.upsertEvent)(db, updated);
        expect(result).toBe("updated");
        const row = db.prepare("SELECT stage, summary FROM regulation_events").get();
        expect(row.stage).toBe("enacted");
        expect(row.summary).toBe("Updated summary with new info");
        db.close();
    });
    it("treats different URLs as separate events", () => {
        const db = buildTestDb();
        const sourceId = (0, db_1.ensureSource)(db, {
            name: "Test Source",
            url: "https://example.com",
            authorityType: "national",
            jurisdiction: "United States",
            reliabilityTier: 5,
        });
        (0, db_1.upsertEvent)(db, createTestInput({ sourceId, sourceUrlLink: "https://example.com/page1" }));
        (0, db_1.upsertEvent)(db, createTestInput({ sourceId, sourceUrlLink: "https://example.com/page2" }));
        const count = db.prepare("SELECT COUNT(*) AS c FROM regulation_events").get();
        expect(count.c).toBe(2);
        db.close();
    });
    it("stores and retrieves JSON arrays for products and solutions", () => {
        const db = buildTestDb();
        const sourceId = (0, db_1.ensureSource)(db, {
            name: "Test Source",
            url: "https://example.com",
            authorityType: "national",
            jurisdiction: "United States",
            reliabilityTier: 5,
        });
        (0, db_1.upsertEvent)(db, createTestInput({
            sourceId,
            affectedProducts: ["Instagram", "Facebook", "WhatsApp"],
            requiredSolutions: ["Age verification", "Parental controls"],
        }));
        const row = db.prepare("SELECT affected_products, required_solutions FROM regulation_events").get();
        expect(JSON.parse(row.affected_products)).toEqual(["Instagram", "Facebook", "WhatsApp"]);
        expect(JSON.parse(row.required_solutions)).toEqual(["Age verification", "Parental controls"]);
        db.close();
    });
    it("stores age_bracket correctly", () => {
        const db = buildTestDb();
        const sourceId = (0, db_1.ensureSource)(db, {
            name: "Test Source",
            url: "https://example.com",
            authorityType: "national",
            jurisdiction: "United States",
            reliabilityTier: 5,
        });
        (0, db_1.upsertEvent)(db, createTestInput({ sourceId, ageBracket: "13-15" }));
        const row = db.prepare("SELECT age_bracket FROM regulation_events").get();
        expect(row.age_bracket).toBe("13-15");
        db.close();
    });
});
describe("ensureSource", () => {
    it("creates a new source and returns its ID", () => {
        const db = buildTestDb();
        const id = (0, db_1.ensureSource)(db, {
            name: "New Source",
            url: "https://new-source.com",
            authorityType: "national",
            jurisdiction: "United Kingdom",
            reliabilityTier: 4,
        });
        expect(id).toBeGreaterThan(0);
        const row = db.prepare("SELECT * FROM sources WHERE id = ?").get(id);
        expect(row.name).toBe("New Source");
        expect(row.reliability_tier).toBe(4);
        db.close();
    });
    it("returns existing source ID on duplicate name", () => {
        const db = buildTestDb();
        const id1 = (0, db_1.ensureSource)(db, {
            name: "Existing Source",
            url: "https://source.com",
            authorityType: "national",
            jurisdiction: "Australia",
            reliabilityTier: 3,
        });
        const id2 = (0, db_1.ensureSource)(db, {
            name: "Existing Source",
            url: "https://source.com",
            authorityType: "national",
            jurisdiction: "Australia",
            reliabilityTier: 5,
        });
        expect(id2).toBe(id1);
        // Reliability tier should be updated
        const row = db.prepare("SELECT reliability_tier FROM sources WHERE id = ?").get(id1);
        expect(row.reliability_tier).toBe(5);
        db.close();
    });
});
describe("crawl_runs", () => {
    it("creates and completes a crawl run", () => {
        const db = buildTestDb();
        const runId = (0, db_1.startCrawlRun)(db);
        expect(runId).toBeGreaterThan(0);
        let latest = (0, db_1.getLatestCrawlRun)(db);
        expect(latest).not.toBeNull();
        expect(latest.status).toBe("running");
        (0, db_1.completeCrawlRun)(db, runId, { itemsFound: 10, itemsNew: 5, itemsUpdated: 2 });
        latest = (0, db_1.getLatestCrawlRun)(db);
        expect(latest.status).toBe("completed");
        expect(latest.itemsFound).toBe(10);
        expect(latest.itemsNew).toBe(5);
        expect(latest.itemsUpdated).toBe(2);
        expect(latest.completedAt).toBeTruthy();
        db.close();
    });
    it("marks a crawl run as failed", () => {
        const db = buildTestDb();
        const runId = (0, db_1.startCrawlRun)(db);
        (0, db_1.failCrawlRun)(db, runId, "Something went wrong");
        const latest = (0, db_1.getLatestCrawlRun)(db);
        expect(latest.status).toBe("failed");
        expect(latest.errorMessage).toBe("Something went wrong");
        db.close();
    });
    it("returns null when no crawl runs exist", () => {
        const db = buildTestDb();
        const latest = (0, db_1.getLatestCrawlRun)(db);
        expect(latest).toBeNull();
        db.close();
    });
});
//# sourceMappingURL=db-dedup.test.js.map