"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const node_path_1 = __importDefault(require("node:path"));
const pipeline_1 = require("./pipeline");
const db_1 = require("./db");
const allowedStages = [
    "proposed",
    "introduced",
    "committee_review",
    "passed",
    "enacted",
    "effective",
    "amended",
    "withdrawn",
    "rejected",
];
const stageUrgency = {
    proposed: 9,
    introduced: 8,
    committee_review: 7,
    passed: 6,
    enacted: 5,
    effective: 4,
    amended: 3,
    withdrawn: 2,
    rejected: 1,
};
const defaultBriefLimit = 5;
const allowedRatings = new Set(["good", "bad"]);
const allowedAgeBrackets = new Set(["13-15", "16-18", "both"]);
function parsePaging(value, defaultValue, maxValue) {
    if (value === undefined) {
        return defaultValue;
    }
    const parsed = Number.parseInt(String(value), 10);
    if (Number.isNaN(parsed)) {
        return defaultValue;
    }
    if (parsed <= 0) {
        return defaultValue;
    }
    if (maxValue !== undefined) {
        return Math.min(parsed, maxValue);
    }
    return parsed;
}
function parseStageList(value) {
    if (!value)
        return [];
    const requested = value
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    return requested.filter((value) => allowedStages.includes(value));
}
function parseSingleInt(value, min, max) {
    if (value === undefined) {
        return undefined;
    }
    const parsed = Number.parseInt(String(value), 10);
    if (Number.isNaN(parsed)) {
        return undefined;
    }
    if (min !== undefined && parsed < min) {
        return undefined;
    }
    if (max !== undefined && parsed > max) {
        return undefined;
    }
    return parsed;
}
function safeJsonParse(value) {
    if (!value)
        return null;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function mapEvent(row) {
    return {
        id: row.id,
        title: row.title,
        jurisdiction: {
            country: row.jurisdiction_country,
            state: row.jurisdiction_state,
        },
        stage: row.stage,
        isUnder16Applicable: Boolean(row.is_under16_applicable),
        ageBracket: row.age_bracket ?? "both",
        scores: {
            impact: row.impact_score,
            likelihood: row.likelihood_score,
            confidence: row.confidence_score,
            chili: row.chili_score,
        },
        summary: row.summary,
        businessImpact: row.business_impact ?? null,
        affectedProducts: safeJsonParse(row.affected_products),
        requiredSolutions: safeJsonParse(row.required_solutions),
        competitorResponses: safeJsonParse(row.competitor_responses),
        sourceUrlLink: row.source_url_link ?? null,
        effectiveDate: row.effective_date,
        publishedDate: row.published_date,
        source: {
            name: row.source_name,
            url: row.source_url,
            reliabilityTier: row.source_reliability_tier ?? 3,
        },
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
const eventSelectColumns = `
  e.id,
  e.title,
  e.jurisdiction_country,
  e.jurisdiction_state,
  e.stage,
  e.is_under16_applicable,
  e.age_bracket,
  e.impact_score,
  e.likelihood_score,
  e.confidence_score,
  e.chili_score,
  e.summary,
  e.business_impact,
  e.affected_products,
  e.required_solutions,
  e.competitor_responses,
  e.source_url_link,
  e.effective_date,
  e.published_date,
  e.updated_at,
  e.created_at,
  s.name AS source_name,
  s.url AS source_url,
  COALESCE(s.reliability_tier, 3) AS source_reliability_tier
`;
function createBriefSelect(sqlLimit) {
    return `
    SELECT
      ${eventSelectColumns},
      CASE e.stage
        WHEN 'proposed' THEN 9
        WHEN 'introduced' THEN 8
        WHEN 'committee_review' THEN 7
        WHEN 'passed' THEN 6
        WHEN 'enacted' THEN 5
        WHEN 'effective' THEN 4
        WHEN 'amended' THEN 3
        WHEN 'withdrawn' THEN 2
        WHEN 'rejected' THEN 1
      END AS urgency_rank
    FROM regulation_events e
    JOIN sources s ON s.id = e.source_id
    ORDER BY
      e.chili_score DESC,
      urgency_rank DESC,
      e.updated_at DESC,
      e.id ASC
    LIMIT ${sqlLimit};
  `;
}
function createApp(db) {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    // Serve frontend static files
    app.use(express_1.default.static(node_path_1.default.join(process.cwd(), "web")));
    app.get("/api/health", (req, res) => {
        const lastCrawl = (0, db_1.getLatestCrawlRun)(db);
        res.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            version: "v2",
            lastCrawl: lastCrawl
                ? {
                    id: lastCrawl.id,
                    status: lastCrawl.status,
                    completedAt: lastCrawl.completedAt,
                    itemsNew: lastCrawl.itemsNew,
                    itemsUpdated: lastCrawl.itemsUpdated,
                }
                : null,
        });
    });
    app.get("/api/brief", (req, res) => {
        const limit = parsePaging(req.query.limit, defaultBriefLimit, 20);
        const rows = db.prepare(createBriefSelect(limit)).all();
        const lastCrawl = (0, db_1.getLatestCrawlRun)(db);
        const items = rows.map((row) => ({
            ...mapEvent(row),
            urgencyScore: stageUrgency[row.stage] ?? 0,
            chiliScore: row.chili_score,
        }));
        res.json({
            generatedAt: new Date().toISOString(),
            lastCrawledAt: lastCrawl?.completedAt ?? null,
            items,
            total: rows.length,
            limit,
        });
    });
    app.get("/api/events", (req, res) => {
        const jurisdiction = typeof req.query.jurisdiction === "string" ? req.query.jurisdiction.trim() : undefined;
        const stageRaw = typeof req.query.stage === "string" ? req.query.stage : undefined;
        const minRisk = parseSingleInt(req.query.minRisk, 1, 5);
        const ageBracket = typeof req.query.ageBracket === "string" ? req.query.ageBracket.trim() : undefined;
        if (req.query.minRisk !== undefined && minRisk === undefined) {
            return res.status(400).json({ error: "minRisk must be an integer between 1 and 5" });
        }
        if (ageBracket !== undefined && !allowedAgeBrackets.has(ageBracket)) {
            return res.status(400).json({ error: "ageBracket must be one of: 13-15, 16-18, both" });
        }
        const page = parsePaging(req.query.page, 1);
        const limit = parsePaging(req.query.limit, 10, 100);
        const offset = (page - 1) * limit;
        const requestedStages = parseStageList(stageRaw);
        if (stageRaw !== undefined && requestedStages.length === 0) {
            return res.status(400).json({ error: "stage must use valid lifecycle values" });
        }
        const whereClauses = [];
        const params = [];
        if (jurisdiction) {
            whereClauses.push("(e.jurisdiction_country = ? OR e.jurisdiction_state = ?)");
            params.push(jurisdiction, jurisdiction);
        }
        if (requestedStages.length > 0) {
            const placeholders = requestedStages.map(() => "?").join(", ");
            whereClauses.push(`e.stage IN (${placeholders})`);
            params.push(...requestedStages);
        }
        if (minRisk !== undefined) {
            whereClauses.push("e.chili_score >= ?");
            params.push(minRisk);
        }
        if (ageBracket) {
            whereClauses.push("(e.age_bracket = ? OR e.age_bracket = 'both')");
            params.push(ageBracket);
        }
        const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
        const countRow = db.prepare(`SELECT COUNT(*) AS total FROM regulation_events e ${where}`).get(...params);
        const total = countRow?.total ?? 0;
        const rows = db
            .prepare(`
      SELECT
        ${eventSelectColumns}
      FROM regulation_events e
      JOIN sources s ON s.id = e.source_id
      ${where}
      ORDER BY e.updated_at DESC, e.id ASC
      LIMIT ? OFFSET ?
    `)
            .all(...params, limit, offset);
        res.json({
            items: rows.map(mapEvent),
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        });
    });
    app.get("/api/events/:id", (req, res) => {
        const { id } = req.params;
        const row = db
            .prepare(`
      SELECT
        ${eventSelectColumns}
      FROM regulation_events e
      JOIN sources s ON s.id = e.source_id
      WHERE e.id = ?
    `)
            .get(id);
        if (!row) {
            return res.status(404).json({ error: "event not found" });
        }
        const feedbackRows = db
            .prepare(`
      SELECT id, event_id, rating, note, created_at
      FROM feedback
      WHERE event_id = ?
      ORDER BY created_at DESC, id DESC
      `)
            .all(id);
        res.json({
            ...mapEvent(row),
            feedback: feedbackRows.map((feedback) => ({
                id: feedback.id,
                eventId: feedback.event_id,
                rating: feedback.rating,
                note: feedback.note,
                createdAt: feedback.created_at,
            })),
        });
    });
    app.post("/api/events/:id/feedback", (req, res) => {
        const { id } = req.params;
        const body = req.body;
        const rating = typeof body.rating === "string" ? body.rating.toLowerCase() : "";
        const note = typeof body.note === "string" ? body.note.trim() : undefined;
        if (!allowedRatings.has(rating)) {
            return res.status(400).json({ error: "rating must be good or bad" });
        }
        const eventExists = db.prepare("SELECT 1 FROM regulation_events WHERE id = ?").get(id);
        if (!eventExists) {
            return res.status(404).json({ error: "event not found" });
        }
        const createdAt = new Date().toISOString();
        const result = db
            .prepare("INSERT INTO feedback (event_id, rating, note, created_at) VALUES (?, ?, ?, ?)")
            .run(id, rating, note ?? null, createdAt);
        res.status(201).json({
            id: result.lastInsertRowid,
            eventId: id,
            rating,
            note: note ?? null,
            createdAt,
        });
    });
    // POST /api/crawl — trigger a full crawl + analysis run
    app.post("/api/crawl", async (req, res) => {
        const apiKey = process.env.MINIMAX_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                error: "MINIMAX_API_KEY not configured. Set it as an environment variable.",
            });
        }
        // Check if a crawl is already running
        const lastRun = (0, db_1.getLatestCrawlRun)(db);
        if (lastRun?.status === "running") {
            return res.status(409).json({
                error: "A crawl is already running",
                runId: lastRun.id,
                startedAt: lastRun.startedAt,
            });
        }
        // Start pipeline asynchronously, return immediately
        const logs = [];
        res.json({
            status: "started",
            message: "Crawl pipeline started. Check /api/crawl/status for progress.",
        });
        // Run in background
        (0, pipeline_1.runPipeline)(db, apiKey, {
            onProgress: (stage, message) => {
                logs.push(`[${stage}] ${message}`);
                console.log(`[crawl] ${message}`);
            },
        }).then((result) => {
            console.log(`[crawl] Completed: ${result.itemsNew} new, ${result.itemsUpdated} updated`);
        }).catch((err) => {
            console.error("[crawl] Pipeline error:", err);
        });
    });
    // GET /api/crawl/status — check crawl status
    app.get("/api/crawl/status", (req, res) => {
        const lastRun = (0, db_1.getLatestCrawlRun)(db);
        if (!lastRun) {
            return res.json({ status: "never_run", message: "No crawl has been run yet." });
        }
        res.json({
            runId: lastRun.id,
            status: lastRun.status,
            startedAt: lastRun.startedAt,
            completedAt: lastRun.completedAt,
            itemsFound: lastRun.itemsFound,
            itemsNew: lastRun.itemsNew,
            itemsUpdated: lastRun.itemsUpdated,
            errorMessage: lastRun.errorMessage,
        });
    });
    return app;
}
//# sourceMappingURL=app.js.map