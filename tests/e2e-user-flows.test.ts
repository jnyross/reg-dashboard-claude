import request from "supertest";
import { createApp } from "../src/app";
import { initializeSchema, openDatabase } from "../src/db";
import { seedSampleData } from "../src/seed";

function buildTestApp() {
  const db = openDatabase(":memory:");
  initializeSchema(db);
  seedSampleData(db);
  const app = createApp(db);
  return { app, db };
}

describe("E2E user flows", () => {
  it("supports search + advanced filters + pagination headers", async () => {
    const { app, db } = buildTestApp();

    const response = await request(app)
      .get("/api/events")
      .query({
        q: "privacy",
        jurisdictions: "United States",
        stages: "proposed,introduced",
        minRisk: 4,
        maxRisk: 5,
        sortBy: "risk",
        sortDir: "desc",
        page: 1,
        limit: 5,
      });

    expect(response.status).toBe(200);
    expect(response.headers["x-total-count"]).toBeDefined();
    expect(response.headers["x-total-pages"]).toBeDefined();
    expect(response.body.items.length).toBeGreaterThan(0);

    db.close();
  });

  it("supports saved search create/list/delete flow", async () => {
    const { app, db } = buildTestApp();

    const created = await request(app)
      .post("/api/saved-searches")
      .send({
        name: "High risk US",
        filters: {
          jurisdictions: ["United States"],
          minRisk: 4,
          sortBy: "risk",
        },
      })
      .set("Content-Type", "application/json");

    expect(created.status).toBe(201);
    expect(created.body.name).toBe("High risk US");

    const listed = await request(app).get("/api/saved-searches");
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);

    const deleted = await request(app).delete(`/api/saved-searches/${created.body.id}`);
    expect(deleted.status).toBe(204);

    const listedAgain = await request(app).get("/api/saved-searches");
    expect(listedAgain.body.items).toHaveLength(0);

    db.close();
  });

  it("supports event detail + edit + timeline history", async () => {
    const { app, db } = buildTestApp();
    const eventId = "11111111-1111-1111-1111-111111111101";

    const detail = await request(app).get(`/api/events/${eventId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.timeline.length).toBeGreaterThan(0);
    expect(detail.body.relatedEvents).toBeDefined();

    const patch = await request(app)
      .patch(`/api/events/${eventId}`)
      .send({
        stage: "enacted",
        summary: "Updated summary from e2e test",
        businessImpact: "Updated impact",
        chiliScore: 5,
      })
      .set("Content-Type", "application/json");

    expect(patch.status).toBe(200);

    const detailAfter = await request(app).get(`/api/events/${eventId}`);
    expect(detailAfter.status).toBe(200);
    expect(detailAfter.body.stage).toBe("enacted");
    expect(detailAfter.body.summary).toContain("Updated summary from e2e test");
    expect(detailAfter.body.history.length).toBeGreaterThan(0);

    db.close();
  });

  it("supports export endpoints (CSV + PDF)", async () => {
    const { app, db } = buildTestApp();

    const csv = await request(app).get("/api/export/csv").query({ minRisk: 3 });
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain("title");

    const pdf = await request(app).get("/api/export/pdf").query({ minRisk: 3 });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect((pdf.body as Buffer).length).toBeGreaterThan(200);

    db.close();
  });

  it("supports analytics + competitor intelligence endpoints", async () => {
    const { app, db } = buildTestApp();

    const summary = await request(app).get("/api/analytics/summary");
    const heatmap = await request(app).get("/api/analytics/heatmap");
    const trends = await request(app).get("/api/analytics/trends");
    const pipeline = await request(app).get("/api/analytics/pipeline");
    const competitors = await request(app).get("/api/competitors/overview");

    expect(summary.status).toBe(200);
    expect(heatmap.status).toBe(200);
    expect(trends.status).toBe(200);
    expect(pipeline.status).toBe(200);
    expect(competitors.status).toBe(200);
    expect(heatmap.body.items.length).toBeGreaterThan(0);

    db.close();
  });

  it("supports alert subscription + digest preview", async () => {
    const { app, db } = buildTestApp();

    const subscription = await request(app)
      .post("/api/alerts/subscriptions")
      .send({
        email: "analyst@example.com",
        frequency: "weekly",
        minChili: 4,
      })
      .set("Content-Type", "application/json");

    expect(subscription.status).toBe(201);

    const list = await request(app).get("/api/alerts/subscriptions");
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBe(1);

    const digest = await request(app)
      .post("/api/alerts/digest/preview")
      .send({ frequency: "weekly", minChili: 4 })
      .set("Content-Type", "application/json");

    expect(digest.status).toBe(200);
    expect(digest.body).toHaveProperty("summary");

    db.close();
  });
});
