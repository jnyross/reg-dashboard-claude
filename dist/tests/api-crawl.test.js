"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
const db_1 = require("../src/db");
const seed_1 = require("../src/seed");
function buildTestApp() {
    const db = (0, db_1.openDatabase)(":memory:");
    (0, db_1.initializeSchema)(db);
    (0, seed_1.seedSampleData)(db);
    const app = (0, app_1.createApp)(db);
    return { app, db };
}
describe("GET /api/health", () => {
    it("returns v2 with lastCrawl info", async () => {
        const { app, db } = buildTestApp();
        const response = await (0, supertest_1.default)(app).get("/api/health");
        expect(response.status).toBe(200);
        expect(response.body.version).toBe("v2");
        expect(response.body).toHaveProperty("lastCrawl");
        db.close();
    });
});
describe("GET /api/brief", () => {
    it("includes lastCrawledAt and ageBracket in response", async () => {
        const { app, db } = buildTestApp();
        const response = await (0, supertest_1.default)(app).get("/api/brief");
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("lastCrawledAt");
        expect(response.body.items[0]).toHaveProperty("ageBracket");
        db.close();
    });
    it("includes source reliability tier", async () => {
        const { app, db } = buildTestApp();
        const response = await (0, supertest_1.default)(app).get("/api/brief");
        expect(response.status).toBe(200);
        expect(response.body.items[0].source).toHaveProperty("reliabilityTier");
        db.close();
    });
});
describe("GET /api/events with ageBracket filter", () => {
    it("accepts valid ageBracket filter values", async () => {
        const { app, db } = buildTestApp();
        const r1 = await (0, supertest_1.default)(app).get("/api/events?ageBracket=13-15");
        expect(r1.status).toBe(200);
        const r2 = await (0, supertest_1.default)(app).get("/api/events?ageBracket=16-18");
        expect(r2.status).toBe(200);
        const r3 = await (0, supertest_1.default)(app).get("/api/events?ageBracket=both");
        expect(r3.status).toBe(200);
        db.close();
    });
    it("rejects invalid ageBracket values", async () => {
        const { app, db } = buildTestApp();
        const response = await (0, supertest_1.default)(app).get("/api/events?ageBracket=invalid");
        expect(response.status).toBe(400);
        expect(response.body.error).toContain("ageBracket");
        db.close();
    });
    it("returns events including ageBracket in response items", async () => {
        const { app, db } = buildTestApp();
        const response = await (0, supertest_1.default)(app).get("/api/events");
        expect(response.status).toBe(200);
        for (const item of response.body.items) {
            expect(item).toHaveProperty("ageBracket");
        }
        db.close();
    });
});
describe("GET /api/events/:id", () => {
    it("returns extended fields including businessImpact", async () => {
        const { app, db } = buildTestApp();
        const eventId = "11111111-1111-1111-1111-111111111101";
        const response = await (0, supertest_1.default)(app).get(`/api/events/${eventId}`);
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("ageBracket");
        expect(response.body).toHaveProperty("businessImpact");
        expect(response.body).toHaveProperty("affectedProducts");
        expect(response.body.source).toHaveProperty("reliabilityTier");
        db.close();
    });
});
describe("POST /api/crawl", () => {
    it("returns 500 when MINIMAX_API_KEY is not set", async () => {
        const original = process.env.MINIMAX_API_KEY;
        delete process.env.MINIMAX_API_KEY;
        const { app, db } = buildTestApp();
        const response = await (0, supertest_1.default)(app)
            .post("/api/crawl")
            .set("Content-Type", "application/json");
        expect(response.status).toBe(500);
        expect(response.body.error).toContain("MINIMAX_API_KEY");
        process.env.MINIMAX_API_KEY = original;
        db.close();
    });
});
describe("GET /api/crawl/status", () => {
    it("returns never_run when no crawl has happened", async () => {
        const { app, db } = buildTestApp();
        const response = await (0, supertest_1.default)(app).get("/api/crawl/status");
        expect(response.status).toBe(200);
        expect(response.body.status).toBe("never_run");
        db.close();
    });
});
describe("backward compatibility", () => {
    it("existing brief ordering is preserved", async () => {
        const { app, db } = buildTestApp();
        const response = await (0, supertest_1.default)(app).get("/api/brief?limit=3");
        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(3);
        expect(response.body.items[0].id).toBe("11111111-1111-1111-1111-111111111101");
        expect(response.body.items[1].id).toBe("11111111-1111-1111-1111-111111111102");
        expect(response.body.items[2].id).toBe("11111111-1111-1111-1111-111111111103");
        db.close();
    });
    it("feedback persistence still works", async () => {
        const { app, db } = buildTestApp();
        const eventId = "11111111-1111-1111-1111-111111111101";
        const create = await (0, supertest_1.default)(app)
            .post(`/api/events/${eventId}/feedback`)
            .send({ rating: "good", note: "Test note" })
            .set("Content-Type", "application/json");
        expect(create.status).toBe(201);
        expect(create.body.rating).toBe("good");
        db.close();
    });
});
//# sourceMappingURL=api-crawl.test.js.map