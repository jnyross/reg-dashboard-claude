import request from "supertest";
import { createApp } from "../src/app";
import { initializeSchema, openDatabase, startCrawlRun, completeCrawlRun } from "../src/db";
import { seedSampleData } from "../src/seed";

function buildTestApp() {
  const db = openDatabase(":memory:");
  initializeSchema(db);
  seedSampleData(db);

  // Seed one completed crawl run so lastCrawledAt is present
  const runId = startCrawlRun(db);
  completeCrawlRun(db, runId, { itemsFound: 8, itemsNew: 8, itemsUpdated: 0 });

  const app = createApp(db);
  return { app, db };
}

describe("Feature Spec V2 E2E", () => {
  describe("Tier 1: Advanced Dashboard & Analytics", () => {
    it("GET /api/analytics/summary returns KPI cards data", async () => {
      const { app, db } = buildTestApp();

      const res = await request(app).get("/api/analytics/summary");
      expect(res.status).toBe(200);
      expect(res.body.totalEvents).toBeGreaterThan(0);
      expect(res.body.averageRisk).toBeGreaterThanOrEqual(1);
      expect(res.body.averageRisk).toBeLessThanOrEqual(5);
      expect(res.body.highRiskCount).toBeGreaterThanOrEqual(0);
      expect(res.body.topJurisdiction).toBeTruthy();
      expect(Array.isArray(res.body.stageDistribution)).toBe(true);
      expect(Array.isArray(res.body.riskDistribution)).toBe(true);

      db.close();
    });

    it("GET /api/analytics/trends returns monthly trends", async () => {
      const { app, db } = buildTestApp();

      const res = await request(app).get("/api/analytics/trends");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.monthlyTrends)).toBe(true);
      expect(Array.isArray(res.body.stageTrends)).toBe(true);
      expect(res.body.monthlyTrends.length).toBeGreaterThan(0);

      db.close();
    });

    it("GET /api/analytics/jurisdictions returns risk heatmap data", async () => {
      const { app, db } = buildTestApp();

      const res = await request(app).get("/api/analytics/jurisdictions");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.jurisdictions)).toBe(true);
      expect(res.body.jurisdictions.length).toBeGreaterThan(0);
      expect(res.body.jurisdictions[0]).toHaveProperty("country");
      expect(res.body.jurisdictions[0]).toHaveProperty("avgRisk");
      expect(res.body.jurisdictions[0]).toHaveProperty("eventCount");

      db.close();
    });

    it("GET /api/analytics/stages returns stage pipeline", async () => {
      const { app, db } = buildTestApp();

      const res = await request(app).get("/api/analytics/stages");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.pipeline)).toBe(true);
      expect(res.body.pipeline.length).toBeGreaterThan(0);

      db.close();
    });
  });

  describe("Tier 1: Search & Discovery", () => {
    it("GET /api/events supports full-text search (q)", async () => {
      const { app, db } = buildTestApp();

      const res = await request(app).get("/api/events?q=privacy");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeGreaterThan(0);

      db.close();
    });

    it("GET /api/events supports advanced filtering and sorting", async () => {
      const { app, db } = buildTestApp();

      const res = await request(app).get(
        "/api/events?jurisdiction=United%20States&stage=proposed,introduced&minRisk=3&dateFrom=2025-01-01&dateTo=2027-01-01&sortBy=chili_score&sortDir=desc",
      );

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(10);
      expect(res.headers["x-total-count"]).toBeDefined();
      expect(res.headers["x-total-pages"]).toBeDefined();
      expect(res.headers["x-current-page"]).toBeDefined();

      db.close();
    });

    it("GET /api/brief includes lastCrawledAt", async () => {
      const { app, db } = buildTestApp();

      const res = await request(app).get("/api/brief");
      expect(res.status).toBe(200);
      expect(res.body.lastCrawledAt).toBeTruthy();

      db.close();
    });
  });

  describe("Tier 1: Data Export", () => {
    it("GET /api/export/csv exports filtered events as CSV", async () => {
      const { app, db } = buildTestApp();

      const res = await request(app).get("/api/export/csv?jurisdiction=United%20States");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/csv");
      expect(res.header["content-disposition"]).toContain("attachment;");
      expect(res.text.toLowerCase()).toContain("id,title,country");

      db.close();
    });

    it("GET /api/export/json exports events as JSON", async () => {
      const { app, db } = buildTestApp();

      const res = await request(app).get("/api/export/json");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("exportedAt");
      expect(res.body).toHaveProperty("totalEvents");
      expect(Array.isArray(res.body.events)).toBe(true);

      db.close();
    });

    it("GET /api/export/pdf exports executive summary PDF", async () => {
      const { app, db } = buildTestApp();

      const res = await request(app).get("/api/export/pdf");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("application/pdf");
      expect(res.header["content-disposition"]).toContain("attachment;");
      const byteLength = Buffer.isBuffer(res.body)
        ? res.body.length
        : Buffer.from(res.text || "", "binary").length;
      expect(byteLength).toBeGreaterThan(500);

      db.close();
    });
  });

  describe("Tier 1: Event Detail & Edit", () => {
    it("GET /api/events/:id returns relatedEvents + feedback + history", async () => {
      const { app, db } = buildTestApp();
      const eventId = "11111111-1111-1111-1111-111111111101";

      const res = await request(app).get(`/api/events/${eventId}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(eventId);
      expect(Array.isArray(res.body.feedback)).toBe(true);
      expect(Array.isArray(res.body.relatedEvents)).toBe(true);
      expect(Array.isArray(res.body.history)).toBe(true);

      const historyRes = await request(app).get(`/api/events/${eventId}/history`);
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.eventId).toBe(eventId);
      expect(Array.isArray(historyRes.body.items)).toBe(true);

      db.close();
    });

    it("PATCH /api/events/:id allows analyst edits", async () => {
      const { app, db } = buildTestApp();
      const eventId = "11111111-1111-1111-1111-111111111101";

      const patch = await request(app)
        .patch(`/api/events/${eventId}`)
        .send({
          summary: "Updated analyst summary",
          stage: "enacted",
          chiliScore: 5,
        })
        .set("Content-Type", "application/json");

      expect(patch.status).toBe(200);
      expect(patch.body.summary).toBe("Updated analyst summary");
      expect(patch.body.stage).toBe("enacted");
      expect(patch.body.scores.chili).toBe(5);

      db.close();
    });
  });

  describe("Tier 1: Saved Searches", () => {
    it("supports saved search CRUD", async () => {
      const { app, db } = buildTestApp();

      const create = await request(app)
        .post("/api/saved-searches")
        .send({
          name: "US High Risk",
          filters: { jurisdiction: "United States", minRisk: "4" },
        })
        .set("Content-Type", "application/json");

      expect(create.status).toBe(201);
      expect(create.body.name).toBe("US High Risk");

      const list = await request(app).get("/api/saved-searches");
      expect(list.status).toBe(200);
      expect(list.body.items.length).toBeGreaterThan(0);

      const id = create.body.id;
      const del = await request(app).delete(`/api/saved-searches/${id}`);
      expect(del.status).toBe(204);

      db.close();
    });
  });

  describe("Tier 2: Notifications + Alerting + Map Support", () => {
    it("GET /api/notifications works and supports unread filter", async () => {
      const { app, db } = buildTestApp();

      const list = await request(app).get("/api/notifications");
      expect(list.status).toBe(200);
      expect(Array.isArray(list.body.items)).toBe(true);
      expect(list.body).toHaveProperty("unreadCount");

      const unread = await request(app).get("/api/notifications?unread=true");
      expect(unread.status).toBe(200);
      expect(Array.isArray(unread.body.items)).toBe(true);

      db.close();
    });

    it("supports alert subscription configuration + digest preview", async () => {
      const { app, db } = buildTestApp();

      const create = await request(app)
        .post("/api/alerts/subscriptions")
        .send({
          email: "alerts@example.com",
          frequency: "weekly",
          minChili: 4,
          webhookUrl: "https://example.com/webhook",
        })
        .set("Content-Type", "application/json");

      expect(create.status).toBe(201);
      expect(create.body.frequency).toBe("weekly");
      expect(create.body.minChili).toBe(4);

      const list = await request(app).get("/api/alerts/subscriptions");
      expect(list.status).toBe(200);
      expect(list.body.items.length).toBeGreaterThan(0);

      const patch = await request(app)
        .patch(`/api/alerts/subscriptions/${create.body.id}`)
        .send({ enabled: false, minChili: 5 })
        .set("Content-Type", "application/json");
      expect(patch.status).toBe(200);

      const digest = await request(app).get("/api/alerts/digest/preview?minChili=4&sinceDays=30");
      expect(digest.status).toBe(200);
      expect(Array.isArray(digest.body.items)).toBe(true);
      expect(digest.body).toHaveProperty("count");

      db.close();
    });

    it("GET /api/jurisdictions returns list for map/filter UX", async () => {
      const { app, db } = buildTestApp();

      const res = await request(app).get("/api/jurisdictions");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.jurisdictions)).toBe(true);
      expect(res.body.jurisdictions).toContain("United States");

      db.close();
    });
  });
});
