import express, { Request, Response } from "express";
import path from "node:path";
import DatabaseConstructor from "better-sqlite3";
import PDFDocument from "pdfkit";
import { runPipeline } from "./pipeline";
import { getLatestCrawlRun } from "./db";

type Stage =
  | "proposed"
  | "introduced"
  | "committee_review"
  | "passed"
  | "enacted"
  | "effective"
  | "amended"
  | "withdrawn"
  | "rejected";

type FeedbackRow = {
  id: number;
  event_id: string;
  rating: "good" | "bad";
  note: string | null;
  created_at: string;
};

type DbEventRow = {
  id: string;
  title: string;
  jurisdiction_country: string;
  jurisdiction_state: string | null;
  stage: Stage;
  is_under16_applicable: number;
  age_bracket: string | null;
  impact_score: number;
  likelihood_score: number;
  confidence_score: number;
  chili_score: number;
  summary: string | null;
  business_impact: string | null;
  affected_products: string | null;
  required_solutions: string | null;
  competitor_responses: string | null;
  source_url_link: string | null;
  effective_date: string | null;
  published_date: string | null;
  source_name: string;
  source_url: string;
  source_reliability_tier: number;
  updated_at: string;
  created_at: string;
  urgency_rank?: number;
};

type SavedSearchRow = {
  id: number;
  name: string;
  filters_json: string;
  created_at: string;
};

type NotificationRow = {
  id: number;
  event_id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  created_at: string;
  read_at: string | null;
};

type AlertSubscriptionRow = {
  id: number;
  email: string | null;
  frequency: "daily" | "weekly";
  min_chili: number;
  webhook_url: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
};

const allowedStages: Stage[] = [
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

const stageUrgency: Record<Stage, number> = {
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

const stageColors: Record<Stage, string> = {
  proposed: "#2563eb",
  introduced: "#0ea5e9",
  committee_review: "#64748b",
  passed: "#16a34a",
  enacted: "#dc2626",
  effective: "#7c3aed",
  amended: "#9333ea",
  withdrawn: "#f59e0b",
  rejected: "#b91c1c",
};

const countryFlags: Record<string, string> = {
  "United States": "🇺🇸",
  "United Kingdom": "🇬🇧",
  "European Union": "🇪🇺",
  Singapore: "🇸🇬",
  Brazil: "🇧🇷",
  Australia: "🇦🇺",
  India: "🇮🇳",
  Canada: "🇨🇦",
  France: "🇫🇷",
  Germany: "🇩🇪",
  Italy: "🇮🇹",
  Spain: "🇪🇸",
  Ireland: "🇮🇪",
  Netherlands: "🇳🇱",
  China: "🇨🇳",
  "South Korea": "🇰🇷",
  Japan: "🇯🇵",
  California: "🇺🇸",
  "New York": "🇺🇸",
};

const worldCoordinates: Record<string, { lat: number; lon: number }> = {
  "United States": { lat: 39, lon: -98 },
  "United Kingdom": { lat: 54, lon: -2 },
  "European Union": { lat: 50, lon: 10 },
  Singapore: { lat: 1.35, lon: 103.8 },
  Brazil: { lat: -14.2, lon: -51.9 },
  Australia: { lat: -25.3, lon: 133.8 },
  India: { lat: 20.6, lon: 78.9 },
  Canada: { lat: 56.1, lon: -106.3 },
  France: { lat: 46.2, lon: 2.2 },
  Germany: { lat: 51.2, lon: 10.4 },
  Italy: { lat: 41.9, lon: 12.6 },
  Spain: { lat: 40.4, lon: -3.7 },
  Ireland: { lat: 53.3, lon: -8.2 },
  Netherlands: { lat: 52.2, lon: 5.3 },
  China: { lat: 35.9, lon: 104.2 },
  "South Korea": { lat: 36.5, lon: 127.8 },
  Japan: { lat: 36.2, lon: 138.2 },
};

const defaultBriefLimit = 5;
const allowedRatings = new Set(["good", "bad"]);
const allowedAgeBrackets = new Set(["13-15", "16-18", "both"]);

function parsePaging(value: unknown, defaultValue: number, maxValue?: number): number {
  if (value === undefined) return defaultValue;

  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return defaultValue;
  if (maxValue !== undefined) return Math.min(parsed, maxValue);
  return parsed;
}

function parseStageList(value: string | undefined): Stage[] {
  if (!value) return [];

  const requested = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean) as Stage[];

  return requested.filter((v) => allowedStages.includes(v));
}

function parseSingleInt(value: unknown, min?: number, max?: number): number | undefined {
  if (value === undefined) return undefined;

  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) return undefined;
  if (min !== undefined && parsed < min) return undefined;
  if (max !== undefined && parsed > max) return undefined;
  return parsed;
}

function safeJsonParse(value: string | null): string[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function decodeEntities(text: string | null): string | null {
  if (!text) return text;
  return text
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number.parseInt(dec, 10)));
}

function cleanText(text: string | null): string | null {
  if (!text) return text;
  const stripped = text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return decodeEntities(stripped);
}

function mapEvent(row: DbEventRow) {
  const jurisdictionName = row.jurisdiction_state || row.jurisdiction_country;
  return {
    id: row.id,
    title: decodeEntities(row.title),
    jurisdiction: {
      country: row.jurisdiction_country,
      state: row.jurisdiction_state || null,
      flag: countryFlags[jurisdictionName] ?? countryFlags[row.jurisdiction_country] ?? "🌐",
    },
    stage: row.stage,
    stageColor: stageColors[row.stage],
    isUnder16Applicable: Boolean(row.is_under16_applicable),
    ageBracket: row.age_bracket ?? "both",
    scores: {
      impact: row.impact_score,
      likelihood: row.likelihood_score,
      confidence: row.confidence_score,
      chili: row.chili_score,
    },
    summary: cleanText(row.summary),
    businessImpact: cleanText(row.business_impact),
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

function createBriefSelect(sqlLimit: number): string {
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

function ensureFeatureTables(db: DatabaseConstructor.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      filters_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT,
      FOREIGN KEY (event_id) REFERENCES regulation_events (id) ON DELETE CASCADE
    );
  `);

  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
        title,
        summary,
        business_impact,
        jurisdiction_country,
        content='regulation_events',
        content_rowid='rowid'
      );
    `);

    const ftsCount = db.prepare("SELECT COUNT(*) AS c FROM events_fts").get() as { c: number };
    if ((ftsCount?.c ?? 0) === 0) {
      db.exec(`
        INSERT INTO events_fts (rowid, title, summary, business_impact, jurisdiction_country)
        SELECT rowid, title, COALESCE(summary,''), COALESCE(business_impact,''), jurisdiction_country
        FROM regulation_events;
      `);
    }
  } catch {
    // FTS unavailable, no-op. /api/events falls back to LIKE search.
  }
}

function escapeCSV(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function eventRowsToCsv(rows: ReturnType<typeof mapEvent>[]): string {
  const headers = [
    "id",
    "title",
    "country",
    "state",
    "stage",
    "under16Applicable",
    "ageBracket",
    "impactScore",
    "likelihoodScore",
    "confidenceScore",
    "chiliScore",
    "summary",
    "businessImpact",
    "affectedProducts",
    "requiredSolutions",
    "sourceName",
    "sourceURL",
    "sourceLink",
    "publishedDate",
    "effectiveDate",
    "updatedAt",
  ];

  const body = rows.map((row) => {
    return [
      escapeCSV(row.id),
      escapeCSV(row.title),
      escapeCSV(row.jurisdiction.country),
      escapeCSV(row.jurisdiction.state),
      escapeCSV(row.stage),
      row.isUnder16Applicable ? "true" : "false",
      escapeCSV(row.ageBracket),
      String(row.scores.impact),
      String(row.scores.likelihood),
      String(row.scores.confidence),
      String(row.scores.chili),
      escapeCSV(row.summary),
      escapeCSV(row.businessImpact),
      escapeCSV(row.affectedProducts?.join("; ") ?? ""),
      escapeCSV(row.requiredSolutions?.join("; ") ?? ""),
      escapeCSV(row.source.name),
      escapeCSV(row.source.url),
      escapeCSV(row.sourceUrlLink),
      escapeCSV(row.publishedDate),
      escapeCSV(row.effectiveDate),
      escapeCSV(row.updatedAt),
    ].join(",");
  });

  return [headers.join(","), ...body].join("\n");
}

export function createApp(db: DatabaseConstructor.Database) {
  const app = express();
  app.use(express.json());

  ensureFeatureTables(db);

  // Serve frontend static files
  app.use(express.static(path.join(process.cwd(), "web")));

  app.get("/api/health", (_req: Request, res: Response) => {
    const lastCrawl = getLatestCrawlRun(db);
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

  app.get("/api/brief", (req: Request, res: Response) => {
    const limit = parsePaging(req.query.limit, defaultBriefLimit, 20);
    const rows = db.prepare(createBriefSelect(limit)).all() as DbEventRow[];
    const lastCrawl = getLatestCrawlRun(db);

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

  app.get("/api/events", (req: Request, res: Response) => {
    const singleJurisdiction = typeof req.query.jurisdiction === "string" ? req.query.jurisdiction.trim() : "";
    const jurisdictionsRaw = typeof req.query.jurisdictions === "string" ? req.query.jurisdictions : "";
    const jurisdictions = [...new Set([
      ...jurisdictionsRaw.split(",").map((value) => value.trim()).filter(Boolean),
      ...(singleJurisdiction ? [singleJurisdiction] : []),
    ])];

    const stageRaw = typeof req.query.stage === "string" ? req.query.stage : undefined;
    const stagesRaw = typeof req.query.stages === "string" ? req.query.stages : undefined;
    const minRisk = parseSingleInt(req.query.minRisk, 1, 5);
    const maxRisk = parseSingleInt(req.query.maxRisk, 1, 5);
    const ageBracket = typeof req.query.ageBracket === "string" ? req.query.ageBracket.trim() : undefined;
    const dateFrom =
      typeof req.query.dateFrom === "string"
        ? req.query.dateFrom.trim()
        : typeof req.query.fromDate === "string"
          ? req.query.fromDate.trim()
          : undefined;
    const dateTo =
      typeof req.query.dateTo === "string"
        ? req.query.dateTo.trim()
        : typeof req.query.toDate === "string"
          ? req.query.toDate.trim()
          : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
    const sortByRaw = typeof req.query.sortBy === "string" ? req.query.sortBy.trim() : "updated_at";
    const sortBy =
      sortByRaw === "recently_updated"
        ? "updated_at"
        : sortByRaw === "date"
          ? "published_date"
          : sortByRaw === "risk"
            ? "chili_score"
            : sortByRaw;
    const sortDir = typeof req.query.sortDir === "string" && req.query.sortDir.toLowerCase() === "asc" ? "ASC" : "DESC";

    if (req.query.minRisk !== undefined && minRisk === undefined) {
      return res.status(400).json({ error: "minRisk must be an integer between 1 and 5" });
    }

    if (req.query.maxRisk !== undefined && maxRisk === undefined) {
      return res.status(400).json({ error: "maxRisk must be an integer between 1 and 5" });
    }

    if (ageBracket !== undefined && !allowedAgeBrackets.has(ageBracket)) {
      return res.status(400).json({ error: "ageBracket must be one of: 13-15, 16-18, both" });
    }

    const page = parsePaging(req.query.page, 1);
    const limit = parsePaging(req.query.limit, 10, 100);
    const offset = (page - 1) * limit;

    const requestedStages = parseStageList(stagesRaw ?? stageRaw);
    if ((stageRaw !== undefined || stagesRaw !== undefined) && requestedStages.length === 0) {
      return res.status(400).json({ error: "stage must use valid lifecycle values" });
    }

    const whereClauses: string[] = [];
    const params: (string | number)[] = [];

    if (jurisdictions.length > 0) {
      const placeholders = jurisdictions.map(() => "?").join(", ");
      whereClauses.push(`(e.jurisdiction_country IN (${placeholders}) OR e.jurisdiction_state IN (${placeholders}))`);
      params.push(...jurisdictions, ...jurisdictions);
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

    if (maxRisk !== undefined) {
      whereClauses.push("e.chili_score <= ?");
      params.push(maxRisk);
    }

    if (ageBracket) {
      whereClauses.push("(e.age_bracket = ? OR e.age_bracket = 'both')");
      params.push(ageBracket);
    }

    if (dateFrom) {
      whereClauses.push("date(COALESCE(e.published_date, e.effective_date, substr(e.updated_at, 1, 10))) >= date(?)");
      params.push(dateFrom);
    }

    if (dateTo) {
      whereClauses.push("date(COALESCE(e.published_date, e.effective_date, substr(e.updated_at, 1, 10))) <= date(?)");
      params.push(dateTo);
    }

    if (q) {
      whereClauses.push("(e.title LIKE ? OR e.summary LIKE ? OR e.business_impact LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const allowedSortColumns: Record<string, string> = {
      updated_at: "e.updated_at",
      recently_updated: "e.updated_at",
      created_at: "e.created_at",
      published_date: "COALESCE(e.published_date, e.effective_date, substr(e.updated_at, 1, 10))",
      date: "COALESCE(e.published_date, e.effective_date, substr(e.updated_at, 1, 10))",
      chili_score: "e.chili_score",
      risk: "e.chili_score",
      jurisdiction: "e.jurisdiction_country",
      stage: `CASE e.stage
        WHEN 'proposed' THEN 9
        WHEN 'introduced' THEN 8
        WHEN 'committee_review' THEN 7
        WHEN 'passed' THEN 6
        WHEN 'enacted' THEN 5
        WHEN 'effective' THEN 4
        WHEN 'amended' THEN 3
        WHEN 'withdrawn' THEN 2
        WHEN 'rejected' THEN 1
      END`,
      title: "e.title",
    };

    const orderCol = allowedSortColumns[sortBy] ?? "e.updated_at";

    const countRow = db.prepare(`SELECT COUNT(*) AS total FROM regulation_events e ${where}`).get(...params) as {
      total: number;
    };
    const total = countRow?.total ?? 0;

    const rows = db
      .prepare(
        `
      SELECT
        ${eventSelectColumns}
      FROM regulation_events e
      JOIN sources s ON s.id = e.source_id
      ${where}
      ORDER BY ${orderCol} ${sortDir}, e.id ASC
      LIMIT ? OFFSET ?
    `,
      )
      .all(...params, limit, offset) as DbEventRow[];

    res.set("X-Total-Count", String(total));
    res.set("X-Total-Pages", String(Math.max(1, Math.ceil(total / limit))));
    res.set("X-Current-Page", String(page));
    res.set("X-Page", String(page));
    res.set("X-Limit", String(limit));

    res.json({
      items: rows.map(mapEvent),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  });

  app.get("/api/events/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    const row = db
      .prepare(
        `
      SELECT
        ${eventSelectColumns}
      FROM regulation_events e
      JOIN sources s ON s.id = e.source_id
      WHERE e.id = ?
    `,
      )
      .get(id) as DbEventRow | undefined;

    if (!row) {
      return res.status(404).json({ error: "event not found" });
    }

    const feedbackRows = db
      .prepare(
        `
      SELECT id, event_id, rating, note, created_at
      FROM feedback
      WHERE event_id = ?
      ORDER BY created_at DESC, id DESC
      `,
      )
      .all(id) as FeedbackRow[];

    const relatedRows = db
      .prepare(
        `
      SELECT ${eventSelectColumns}
      FROM regulation_events e
      JOIN sources s ON s.id = e.source_id
      WHERE e.id != ? AND (e.jurisdiction_country = ? OR e.jurisdiction_state = ?)
      ORDER BY e.chili_score DESC, e.updated_at DESC
      LIMIT 5
      `,
      )
      .all(id, row.jurisdiction_country, row.jurisdiction_country) as DbEventRow[];

    const historyRows = db
      .prepare(
        `
      SELECT id, changed_at, changed_by, change_type, field_name, previous_value, new_value
      FROM event_history
      WHERE event_id = ?
      ORDER BY changed_at DESC, id DESC
      LIMIT 50
      `,
      )
      .all(id) as Array<{
      id: number;
      changed_at: string;
      changed_by: string;
      change_type: string;
      field_name: string | null;
      previous_value: string | null;
      new_value: string | null;
    }>;

    res.json({
      ...mapEvent(row),
      feedback: feedbackRows.map((feedback) => ({
        id: feedback.id,
        eventId: feedback.event_id,
        rating: feedback.rating,
        note: feedback.note,
        createdAt: feedback.created_at,
      })),
      relatedEvents: relatedRows.map(mapEvent),
      history: historyRows.map((h) => ({
        id: h.id,
        changedAt: h.changed_at,
        changedBy: h.changed_by,
        changeType: h.change_type,
        fieldName: h.field_name,
        previousValue: h.previous_value,
        newValue: h.new_value,
      })),
      timeline: historyRows.map((h) => ({
        id: h.id,
        changedAt: h.changed_at,
        changedBy: h.changed_by,
        changeType: h.change_type,
        fieldName: h.field_name,
        previousValue: h.previous_value,
        newValue: h.new_value,
      })),
    });
  });

  app.get("/api/events/:id/history", (req: Request, res: Response) => {
    const { id } = req.params;

    const rows = db
      .prepare(
        `
      SELECT id, changed_at, changed_by, change_type, field_name, previous_value, new_value
      FROM event_history
      WHERE event_id = ?
      ORDER BY changed_at DESC, id DESC
      LIMIT 100
      `,
      )
      .all(id) as Array<{
      id: number;
      changed_at: string;
      changed_by: string;
      change_type: string;
      field_name: string | null;
      previous_value: string | null;
      new_value: string | null;
    }>;

    res.json({
      eventId: id,
      items: rows.map((row) => ({
        id: row.id,
        changedAt: row.changed_at,
        changedBy: row.changed_by,
        changeType: row.change_type,
        fieldName: row.field_name,
        previousValue: row.previous_value,
        newValue: row.new_value,
      })),
    });
  });

  app.patch("/api/events/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;

    const eventExists = db.prepare("SELECT 1 FROM regulation_events WHERE id = ?").get(id);
    if (!eventExists) {
      return res.status(404).json({ error: "event not found" });
    }

    const allowedFields: Record<string, string> = {
      title: "title",
      summary: "summary",
      businessImpact: "business_impact",
      stage: "stage",
      ageBracket: "age_bracket",
      impactScore: "impact_score",
      likelihoodScore: "likelihood_score",
      confidenceScore: "confidence_score",
      chiliScore: "chili_score",
      effectiveDate: "effective_date",
      publishedDate: "published_date",
    };

    const setClauses: string[] = [];
    const params: (string | number)[] = [];

    for (const [apiField, dbField] of Object.entries(allowedFields)) {
      if (body[apiField] !== undefined) {
        setClauses.push(`${dbField} = ?`);
        params.push(body[apiField] as string | number);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    setClauses.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(String(id));

    db.prepare(`UPDATE regulation_events SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);

    db.prepare(
      `
      INSERT INTO event_history (event_id, changed_at, changed_by, change_type, field_name, previous_value, new_value)
      VALUES (?, ?, 'analyst', 'updated', 'manual_edit', NULL, ?)
      `,
    ).run(id, new Date().toISOString(), JSON.stringify(body));

    const updated = db
      .prepare(
        `
      SELECT ${eventSelectColumns}
      FROM regulation_events e
      JOIN sources s ON s.id = e.source_id
      WHERE e.id = ?
      `,
      )
      .get(id) as DbEventRow;

    res.json(mapEvent(updated));
  });

  app.post("/api/events/:id/feedback", (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body as { rating?: unknown; note?: unknown };
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

  // Analytics endpoints
  app.get("/api/analytics/summary", (_req: Request, res: Response) => {
    const totalEvents = (db.prepare("SELECT COUNT(*) AS c FROM regulation_events").get() as { c: number }).c;
    const avgRisk = (db.prepare("SELECT AVG(chili_score) AS avg FROM regulation_events").get() as { avg: number }).avg;
    const highRiskCount = (
      db.prepare("SELECT COUNT(*) AS c FROM regulation_events WHERE chili_score >= 4").get() as { c: number }
    ).c;
    const topJurisdiction = db
      .prepare(
        `SELECT jurisdiction_country AS name, COUNT(*) AS count
         FROM regulation_events
         GROUP BY jurisdiction_country
         ORDER BY count DESC
         LIMIT 1`,
      )
      .get() as { name: string; count: number } | undefined;

    const newestRow = db
      .prepare(
        `
      SELECT ${eventSelectColumns}
      FROM regulation_events e
      JOIN sources s ON s.id = e.source_id
      ORDER BY e.created_at DESC
      LIMIT 1
      `,
      )
      .get() as DbEventRow | undefined;

    const stageDistribution = db.prepare("SELECT stage, COUNT(*) AS count FROM regulation_events GROUP BY stage").all() as Array<{
      stage: string;
      count: number;
    }>;

    const riskDistribution = db
      .prepare("SELECT chili_score, COUNT(*) AS count FROM regulation_events GROUP BY chili_score ORDER BY chili_score ASC")
      .all() as Array<{ chili_score: number; count: number }>;

    const lastCrawl = getLatestCrawlRun(db);

    res.json({
      totalEvents,
      averageRisk: Number.isFinite(avgRisk) ? Number(avgRisk.toFixed(2)) : 0,
      highRiskCount,
      topJurisdiction: topJurisdiction ?? null,
      newestEvent: newestRow ? mapEvent(newestRow) : null,
      stageDistribution,
      riskDistribution,
      lastCrawledAt: lastCrawl?.completedAt ?? null,
    });
  });

  app.get("/api/analytics/trends", (_req: Request, res: Response) => {
    const monthlyTrends = db
      .prepare(
        `
      SELECT SUBSTR(COALESCE(published_date, created_at), 1, 7) AS month,
             COUNT(*) AS count,
             AVG(chili_score) AS avgRisk
      FROM regulation_events
      GROUP BY month
      ORDER BY month ASC
      `,
      )
      .all() as Array<{ month: string; count: number; avgRisk: number }>;

    const stageTrends = db
      .prepare(
        `
      SELECT SUBSTR(COALESCE(published_date, created_at), 1, 7) AS month,
             stage,
             COUNT(*) AS count
      FROM regulation_events
      GROUP BY month, stage
      ORDER BY month ASC
      `,
      )
      .all() as Array<{ month: string; stage: string; count: number }>;

    res.json({ monthlyTrends, stageTrends });
  });

  app.get("/api/analytics/jurisdictions", (_req: Request, res: Response) => {
    const jurisdictions = db
      .prepare(
        `
      SELECT jurisdiction_country AS country,
             COUNT(*) AS eventCount,
             AVG(chili_score) AS avgRisk,
             MAX(chili_score) AS maxRisk,
             SUM(CASE WHEN chili_score >= 4 THEN 1 ELSE 0 END) AS highRiskCount
      FROM regulation_events
      GROUP BY jurisdiction_country
      ORDER BY avgRisk DESC, eventCount DESC
      `,
      )
      .all();

    res.json({ jurisdictions });
  });

  app.get("/api/analytics/heatmap", (_req: Request, res: Response) => {
    const items = db
      .prepare(
        `
      SELECT jurisdiction_country AS country,
             COUNT(*) AS eventCount,
             AVG(chili_score) AS avgRisk,
             MAX(chili_score) AS maxRisk,
             SUM(CASE WHEN chili_score >= 4 THEN 1 ELSE 0 END) AS highRiskCount
      FROM regulation_events
      GROUP BY jurisdiction_country
      ORDER BY avgRisk DESC, eventCount DESC
      `,
      )
      .all() as Array<{ country: string; eventCount: number; avgRisk: number; maxRisk: number; highRiskCount: number }>;

    res.json({
      items: items.map((row) => ({
        country: row.country,
        jurisdiction: row.country,
        flag: countryFlags[row.country] ?? "🌐",
        eventCount: row.eventCount,
        avgRisk: Number(row.avgRisk.toFixed(2)),
        averageRisk: Number(row.avgRisk.toFixed(2)),
        maxRisk: row.maxRisk,
        highRiskCount: row.highRiskCount,
      })),
    });
  });

  app.get("/api/analytics/stages", (_req: Request, res: Response) => {
    const pipeline = db
      .prepare(
        `
      SELECT stage,
             COUNT(*) AS count,
             AVG(chili_score) AS avgRisk
      FROM regulation_events
      GROUP BY stage
      ORDER BY CASE stage
        WHEN 'proposed' THEN 1
        WHEN 'introduced' THEN 2
        WHEN 'committee_review' THEN 3
        WHEN 'passed' THEN 4
        WHEN 'enacted' THEN 5
        WHEN 'effective' THEN 6
        WHEN 'amended' THEN 7
        WHEN 'withdrawn' THEN 8
        WHEN 'rejected' THEN 9
      END ASC
      `,
      )
      .all() as Array<{ stage: string; count: number; avgRisk: number }>;

    res.json({ pipeline });
  });

  // Aliases for enhanced frontend contracts
  app.get("/api/analytics/heatmap", (_req: Request, res: Response) => {
    const jurisdictions = db
      .prepare(
        `
      SELECT jurisdiction_country AS country,
             COUNT(*) AS eventCount,
             AVG(chili_score) AS avgRisk
      FROM regulation_events
      GROUP BY jurisdiction_country
      ORDER BY avgRisk DESC, eventCount DESC
      `,
      )
      .all() as Array<{ country: string; eventCount: number; avgRisk: number }>;

    res.json({
      items: jurisdictions.map((row) => ({
        jurisdiction: row.country,
        flag: countryFlags[row.country] ?? "🌐",
        eventCount: row.eventCount,
        averageRisk: Number(row.avgRisk.toFixed(2)),
      })),
    });
  });

  app.get("/api/analytics/pipeline", (_req: Request, res: Response) => {
    const pipeline = db
      .prepare(
        `
      SELECT stage,
             COUNT(*) AS count
      FROM regulation_events
      GROUP BY stage
      `,
      )
      .all() as Array<{ stage: Stage; count: number }>;

    const map = new Map<Stage, number>(pipeline.map((row) => [row.stage, row.count]));

    res.json({
      items: allowedStages.map((stage) => ({
        stage,
        count: map.get(stage) ?? 0,
        color: stageColors[stage],
      })),
    });
  });

  app.get("/api/analytics/world-map", (_req: Request, res: Response) => {
    const jurisdictions = db
      .prepare(
        `
      SELECT jurisdiction_country AS country,
             COUNT(*) AS eventCount,
             AVG(chili_score) AS avgRisk
      FROM regulation_events
      GROUP BY jurisdiction_country
      ORDER BY eventCount DESC
      `,
      )
      .all() as Array<{ country: string; eventCount: number; avgRisk: number }>;

    res.json({
      points: jurisdictions.map((row) => {
        const coord = worldCoordinates[row.country] ?? { lat: 0, lon: 0 };
        return {
          jurisdiction: row.country,
          flag: countryFlags[row.country] ?? "🌐",
          eventCount: row.eventCount,
          averageRisk: Number(row.avgRisk.toFixed(2)),
          lat: coord.lat,
          lon: coord.lon,
        };
      }),
    });
  });

  app.get("/api/analytics/pipeline", (_req: Request, res: Response) => {
    const items = db
      .prepare(
        `
      SELECT stage,
             COUNT(*) AS count,
             AVG(chili_score) AS avgRisk
      FROM regulation_events
      GROUP BY stage
      ORDER BY CASE stage
        WHEN 'proposed' THEN 1
        WHEN 'introduced' THEN 2
        WHEN 'committee_review' THEN 3
        WHEN 'passed' THEN 4
        WHEN 'enacted' THEN 5
        WHEN 'effective' THEN 6
        WHEN 'amended' THEN 7
        WHEN 'withdrawn' THEN 8
        WHEN 'rejected' THEN 9
      END ASC
      `,
      )
      .all();

    res.json({ items });
  });

  // Competitor intelligence
  app.get("/api/competitors/overview", (_req: Request, res: Response) => {
    const rows = db
      .prepare(
        `
      SELECT competitor_responses, updated_at
      FROM regulation_events
      WHERE competitor_responses IS NOT NULL
      `,
      )
      .all() as Array<{ competitor_responses: string; updated_at: string }>;

    const knownCompetitors = ["Meta", "TikTok", "Snap", "YouTube", "Google", "X", "Reddit", "Discord"];
    const aggregate = new Map<string, { responseCount: number; latest: string; samples: string[] }>();

    for (const row of rows) {
      const responses = safeJsonParse(row.competitor_responses) ?? [];
      for (const response of responses) {
        const detected = knownCompetitors.find((name) => new RegExp(`\\b${name}\\b`, "i").test(response)) ?? "Other";
        const existing = aggregate.get(detected) ?? { responseCount: 0, latest: row.updated_at, samples: [] };
        existing.responseCount += 1;
        if (row.updated_at > existing.latest) {
          existing.latest = row.updated_at;
        }
        if (existing.samples.length < 3) {
          existing.samples.push(response);
        }
        aggregate.set(detected, existing);
      }
    }

    const items = [...aggregate.entries()]
      .map(([competitor, stats]) => ({
        competitor,
        responseCount: stats.responseCount,
        latestActivityAt: stats.latest,
        samples: stats.samples,
      }))
      .sort((a, b) => b.responseCount - a.responseCount);

    res.json({ items });
  });

  app.get("/api/competitors/timeline", (_req: Request, res: Response) => {
    const rows = db
      .prepare(
        `
      SELECT competitor_responses, updated_at
      FROM regulation_events
      WHERE competitor_responses IS NOT NULL
      `,
      )
      .all() as Array<{ competitor_responses: string; updated_at: string }>;

    const timeline = new Map<string, Map<string, number>>();

    for (const row of rows) {
      const month = row.updated_at.slice(0, 7);
      const responses = safeJsonParse(row.competitor_responses) ?? [];
      const monthly = timeline.get(month) ?? new Map<string, number>();

      for (const response of responses) {
        const match = response.match(/\b(Meta|TikTok|Snap|YouTube|Google|X|Reddit|Discord)\b/i);
        const competitor = match ? match[1] : "Other";
        monthly.set(competitor, (monthly.get(competitor) ?? 0) + 1);
      }

      timeline.set(month, monthly);
    }

    const items = [...timeline.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, competitors]) => ({
        month,
        competitors: [...competitors.entries()].map(([name, count]) => ({ name, count })),
      }));

    res.json({ items });
  });

  // Reporting endpoints
  app.get("/api/reports/trend-analysis", (_req: Request, res: Response) => {
    const rows = db
      .prepare(
        `
      SELECT SUBSTR(COALESCE(published_date, created_at), 1, 7) AS month,
             COUNT(*) AS count,
             AVG(chili_score) AS avgRisk
      FROM regulation_events
      GROUP BY month
      ORDER BY month ASC
      `,
      )
      .all() as Array<{ month: string; count: number; avgRisk: number }>;

    const items = rows.map((row, index) => {
      const prev = index > 0 ? rows[index - 1] : null;
      return {
        month: row.month,
        count: row.count,
        averageRisk: Number(row.avgRisk.toFixed(2)),
        deltaFromPreviousMonth: prev ? row.count - prev.count : null,
      };
    });

    res.json({ items });
  });

  app.get("/api/reports/jurisdiction/:country", (req: Request, res: Response) => {
    const country = String(req.params.country);
    const rows = db
      .prepare(
        `
      SELECT ${eventSelectColumns}
      FROM regulation_events e
      JOIN sources s ON s.id = e.source_id
      WHERE e.jurisdiction_country = ?
      ORDER BY e.chili_score DESC, e.updated_at DESC
      `,
      )
      .all(country) as DbEventRow[];

    const mapped = rows.map(mapEvent);
    const averageRisk =
      mapped.length > 0
        ? Number((mapped.reduce((sum, event) => sum + event.scores.chili, 0) / mapped.length).toFixed(2))
        : 0;

    res.json({
      jurisdiction: country,
      flag: countryFlags[country] ?? "🌐",
      totalEvents: mapped.length,
      averageRisk,
      items: mapped,
    });
  });

  // Export endpoints
  app.get("/api/export/csv", (req: Request, res: Response) => {
    const jurisdiction = typeof req.query.jurisdiction === "string" ? req.query.jurisdiction.trim() : undefined;
    const minRisk = parseSingleInt(req.query.minRisk, 1, 5);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;

    const whereClauses: string[] = [];
    const params: (string | number)[] = [];

    if (jurisdiction) {
      whereClauses.push("(e.jurisdiction_country = ? OR e.jurisdiction_state = ?)");
      params.push(jurisdiction, jurisdiction);
    }

    if (minRisk !== undefined) {
      whereClauses.push("e.chili_score >= ?");
      params.push(minRisk);
    }

    if (q) {
      whereClauses.push("(e.title LIKE ? OR e.summary LIKE ? OR e.business_impact LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const rows = db
      .prepare(
        `
      SELECT ${eventSelectColumns}
      FROM regulation_events e
      JOIN sources s ON s.id = e.source_id
      ${where}
      ORDER BY e.chili_score DESC, e.updated_at DESC
      `,
      )
      .all(...params) as DbEventRow[];

    const csv = eventRowsToCsv(rows.map(mapEvent));

    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="regulation-events-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  });

  app.get("/api/export/json", (_req: Request, res: Response) => {
    const rows = db
      .prepare(
        `
      SELECT ${eventSelectColumns}
      FROM regulation_events e
      JOIN sources s ON s.id = e.source_id
      ORDER BY e.chili_score DESC, e.updated_at DESC
      `,
      )
      .all() as DbEventRow[];

    res.set("Content-Type", "application/json; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="regulation-events-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      totalEvents: rows.length,
      events: rows.map(mapEvent),
    });
  });

  app.get("/api/export/pdf", (_req: Request, res: Response) => {
    const totalEvents = (db.prepare("SELECT COUNT(*) AS c FROM regulation_events").get() as { c: number }).c;
    const highRisk = (
      db.prepare("SELECT COUNT(*) AS c FROM regulation_events WHERE chili_score >= 4").get() as { c: number }
    ).c;
    const avgRisk = (db.prepare("SELECT AVG(chili_score) AS avg FROM regulation_events").get() as { avg: number }).avg;

    const topEvents = db
      .prepare(
        `
      SELECT ${eventSelectColumns}
      FROM regulation_events e
      JOIN sources s ON s.id = e.source_id
      ORDER BY e.chili_score DESC, e.updated_at DESC
      LIMIT 12
      `,
      )
      .all() as DbEventRow[];

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="executive-brief-${new Date().toISOString().slice(0, 10)}.pdf"`);

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    doc.fontSize(20).text("RegWatch Executive Regulatory Brief", { align: "left" });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor("#666").text(`Generated: ${new Date().toISOString()}`);
    doc.fillColor("black");
    doc.moveDown(1);

    doc.fontSize(12).text(`Total tracked events: ${totalEvents}`);
    doc.text(`High-risk events (chili ≥ 4): ${highRisk}`);
    doc.text(`Average risk score: ${Number.isFinite(avgRisk) ? avgRisk.toFixed(2) : "0.00"}`);
    doc.moveDown(1);

    doc.fontSize(14).text("Top Priority Events", { underline: true });
    doc.moveDown(0.6);

    topEvents.forEach((event, index) => {
      const mapped = mapEvent(event);
      doc.fontSize(11).text(`${index + 1}. ${mapped.title}`);
      doc.fontSize(9).fillColor("#444").text(
        `${mapped.jurisdiction.country}${mapped.jurisdiction.state ? ` (${mapped.jurisdiction.state})` : ""} • stage: ${mapped.stage} • chili: ${mapped.scores.chili}/5`,
      );
      if (mapped.summary) {
        doc.text(mapped.summary.slice(0, 220));
      }
      doc.fillColor("black");
      doc.moveDown(0.5);
    });

    doc.end();
  });

  // Saved searches
  app.get("/api/saved-searches", (_req: Request, res: Response) => {
    const rows = db.prepare("SELECT id, name, filters_json, created_at FROM saved_searches ORDER BY created_at DESC").all() as SavedSearchRow[];

    res.json({
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        filters: JSON.parse(row.filters_json),
        createdAt: row.created_at,
      })),
    });
  });

  app.post("/api/saved-searches", (req: Request, res: Response) => {
    const body = req.body as { name?: unknown; filters?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name || !body.filters || typeof body.filters !== "object") {
      return res.status(400).json({ error: "name and filters are required" });
    }

    const createdAt = new Date().toISOString();
    const result = db
      .prepare("INSERT INTO saved_searches (name, filters_json, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(name, JSON.stringify(body.filters), createdAt, createdAt);

    res.status(201).json({
      id: Number(result.lastInsertRowid),
      name,
      filters: body.filters,
      createdAt,
    });
  });

  app.delete("/api/saved-searches/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    const result = db.prepare("DELETE FROM saved_searches WHERE id = ?").run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "saved search not found" });
    }

    return res.status(204).send();
  });

  // Notifications
  app.get("/api/notifications", (req: Request, res: Response) => {
    const unreadOnly = req.query.unread === "true" || req.query.unreadOnly === "true";
    const limit = parsePaging(req.query.limit, 20, 100);

    const where = unreadOnly ? "WHERE read_at IS NULL" : "";
    const rows = db
      .prepare(
        `
      SELECT id, event_id, severity, message, created_at, read_at
      FROM notifications
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
      `,
      )
      .all(limit) as NotificationRow[];

    const unreadCount = (db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE read_at IS NULL").get() as { c: number }).c;

    res.json({
      items: rows.map((row) => ({
        id: row.id,
        eventId: row.event_id,
        severity: row.severity,
        message: row.message,
        read: Boolean(row.read_at),
        createdAt: row.created_at,
      })),
      unreadCount,
    });
  });

  app.post("/api/notifications/:id/read", (req: Request, res: Response) => {
    const { id } = req.params;
    db.prepare("UPDATE notifications SET read_at = ? WHERE id = ?").run(new Date().toISOString(), id);
    res.json({ success: true });
  });

  app.post("/api/notifications/read-all", (_req: Request, res: Response) => {
    db.prepare("UPDATE notifications SET read_at = ? WHERE read_at IS NULL").run(new Date().toISOString());
    res.json({ success: true });
  });

  // Alert subscriptions (email/webhook digest configuration)
  app.get("/api/alerts/subscriptions", (_req: Request, res: Response) => {
    const rows = db
      .prepare("SELECT * FROM alert_subscriptions ORDER BY created_at DESC")
      .all() as AlertSubscriptionRow[];

    res.json({
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        frequency: row.frequency,
        minChili: row.min_chili,
        webhookUrl: row.webhook_url,
        enabled: Boolean(row.enabled),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  });

  app.post("/api/alerts/subscriptions", (req: Request, res: Response) => {
    const body = req.body as {
      email?: unknown;
      frequency?: unknown;
      minChili?: unknown;
      webhookUrl?: unknown;
      enabled?: unknown;
    };

    const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
    const webhookUrl =
      typeof body.webhookUrl === "string" && body.webhookUrl.trim() ? body.webhookUrl.trim() : null;
    const frequency = body.frequency === "weekly" ? "weekly" : "daily";
    const minChili = parseSingleInt(body.minChili, 1, 5) ?? 4;
    const enabled = body.enabled === false ? 0 : 1;

    if (!email && !webhookUrl) {
      return res.status(400).json({ error: "Either email or webhookUrl is required" });
    }

    const now = new Date().toISOString();
    const result = db
      .prepare(
        `
      INSERT INTO alert_subscriptions (email, frequency, min_chili, webhook_url, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(email, frequency, minChili, webhookUrl, enabled, now, now);

    res.status(201).json({
      id: Number(result.lastInsertRowid),
      email,
      frequency,
      minChili,
      webhookUrl,
      enabled: Boolean(enabled),
      createdAt: now,
      updatedAt: now,
    });
  });

  app.patch("/api/alerts/subscriptions/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body as {
      frequency?: unknown;
      minChili?: unknown;
      enabled?: unknown;
    };

    const updates: string[] = [];
    const params: Array<string | number> = [];

    if (body.frequency !== undefined) {
      const frequency = body.frequency === "weekly" ? "weekly" : "daily";
      updates.push("frequency = ?");
      params.push(frequency);
    }

    if (body.minChili !== undefined) {
      const minChili = parseSingleInt(body.minChili, 1, 5);
      if (minChili === undefined) {
        return res.status(400).json({ error: "minChili must be an integer between 1 and 5" });
      }
      updates.push("min_chili = ?");
      params.push(minChili);
    }

    if (body.enabled !== undefined) {
      updates.push("enabled = ?");
      params.push(body.enabled === false ? 0 : 1);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    updates.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(String(id));

    const result = db.prepare(`UPDATE alert_subscriptions SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    if (result.changes === 0) {
      return res.status(404).json({ error: "subscription not found" });
    }

    res.json({ success: true });
  });

  function buildDigestPreview(minChili: number, sinceDays: number) {
    const sinceDate = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const rows = db
      .prepare(
        `
      SELECT ${eventSelectColumns}
      FROM regulation_events e
      JOIN sources s ON s.id = e.source_id
      WHERE e.chili_score >= ?
        AND COALESCE(e.published_date, SUBSTR(e.created_at, 1, 10)) >= ?
      ORDER BY e.chili_score DESC, e.updated_at DESC
      LIMIT 100
      `,
      )
      .all(minChili, sinceDate) as DbEventRow[];

    const items = rows.map(mapEvent);
    return {
      generatedAt: new Date().toISOString(),
      sinceDate,
      minChili,
      count: items.length,
      summary: `Found ${items.length} events with chili score >= ${minChili} since ${sinceDate}`,
      items,
    };
  }

  app.get("/api/alerts/digest/preview", (req: Request, res: Response) => {
    const minChili = parseSingleInt(req.query.minChili, 1, 5) ?? 4;
    const sinceDays = parseSingleInt(req.query.sinceDays, 1, 90) ?? 7;
    res.json(buildDigestPreview(minChili, sinceDays));
  });

  app.post("/api/alerts/digest/preview", (req: Request, res: Response) => {
    const body = req.body as { minChili?: unknown; sinceDays?: unknown; frequency?: unknown };
    const minChili = parseSingleInt(body.minChili, 1, 5) ?? 4;
    const sinceDays = parseSingleInt(body.sinceDays, 1, 90) ?? (body.frequency === "weekly" ? 7 : 1);
    res.json(buildDigestPreview(minChili, sinceDays));
  });

  app.post("/api/alerts/dispatch", async (req: Request, res: Response) => {
    const body = req.body as { webhookUrl?: unknown; minChili?: unknown; sinceDays?: unknown; frequency?: unknown };
    const webhookUrl = typeof body.webhookUrl === "string" ? body.webhookUrl.trim() : "";
    if (!webhookUrl) {
      return res.status(400).json({ error: "webhookUrl is required" });
    }

    const minChili = parseSingleInt(body.minChili, 1, 5) ?? 4;
    const sinceDays = parseSingleInt(body.sinceDays, 1, 90) ?? (body.frequency === "weekly" ? 7 : 1);
    const preview = buildDigestPreview(minChili, sinceDays);

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "regulatory_digest",
          ...preview,
        }),
      });

      if (!response.ok) {
        const responseText = await response.text();
        return res.status(502).json({
          error: "webhook dispatch failed",
          status: response.status,
          response: responseText.slice(0, 300),
        });
      }

      return res.json({ status: "sent", destination: webhookUrl, eventCount: preview.count });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(502).json({ error: "webhook dispatch failed", message });
    }
  });

  app.get("/api/competitors/overview", (_req: Request, res: Response) => {
    const rows = db
      .prepare(
        `
      SELECT id, title, jurisdiction_country, chili_score, competitor_responses
      FROM regulation_events
      ORDER BY updated_at DESC
      LIMIT 300
      `,
      )
      .all() as Array<{
      id: string;
      title: string;
      jurisdiction_country: string;
      chili_score: number;
      competitor_responses: string | null;
    }>;

    const companies = ["Meta", "TikTok", "Snap", "Google", "YouTube", "Apple", "Microsoft", "X", "Amazon"];
    const byCompany: Record<string, Array<{ eventId: string; title: string; jurisdiction: string; risk: number; note: string }>> = {};

    for (const row of rows) {
      const responses = safeJsonParse(row.competitor_responses) ?? [];
      for (const response of responses) {
        const matched = companies.find((company) => response.toLowerCase().includes(company.toLowerCase()));
        if (!matched) continue;

        if (!byCompany[matched]) byCompany[matched] = [];
        byCompany[matched].push({
          eventId: row.id,
          title: row.title,
          jurisdiction: row.jurisdiction_country,
          risk: row.chili_score,
          note: response,
        });
      }
    }

    const items = Object.entries(byCompany).map(([company, entries]) => ({
      company,
      totalMentions: entries.length,
      averageRisk:
        entries.length > 0
          ? Number((entries.reduce((sum, entry) => sum + entry.risk, 0) / entries.length).toFixed(2))
          : 0,
      entries,
    }));

    res.json({ items });
  });

  app.get("/api/jurisdictions", (_req: Request, res: Response) => {
    const rows = db
      .prepare("SELECT DISTINCT jurisdiction_country AS country FROM regulation_events ORDER BY jurisdiction_country ASC")
      .all() as Array<{ country: string }>;

    res.json({ jurisdictions: rows.map((r) => r.country) });
  });

  // POST /api/crawl — trigger a full crawl + analysis run
  app.post("/api/crawl", async (_req: Request, res: Response) => {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "MINIMAX_API_KEY not configured. Set it as an environment variable.",
      });
    }

    // Check if a crawl is already running
    const lastRun = getLatestCrawlRun(db);
    if (lastRun?.status === "running") {
      return res.status(409).json({
        error: "A crawl is already running",
        runId: lastRun.id,
        startedAt: lastRun.startedAt,
      });
    }

    // Start pipeline asynchronously, return immediately
    res.json({
      status: "started",
      message: "Crawl pipeline started. Check /api/crawl/status for progress.",
    });

    // Run in background
    runPipeline(db, apiKey, {
      onProgress: (_stage, message) => {
        console.log(`[crawl] ${message}`);
      },
    })
      .then((result) => {
        console.log(`[crawl] Completed: ${result.itemsNew} new, ${result.itemsUpdated} updated`);

        const highRiskNew = db
          .prepare(
            `
            SELECT id, title, chili_score
            FROM regulation_events
            WHERE chili_score >= 4
            ORDER BY created_at DESC
            LIMIT 20
            `,
          )
          .all() as Array<{ id: string; title: string; chili_score: number }>;

        for (const event of highRiskNew) {
          const exists = db.prepare("SELECT 1 FROM notifications WHERE event_id = ?").get(event.id);
          if (!exists) {
            db.prepare("INSERT INTO notifications (event_id, severity, message, created_at) VALUES (?, ?, ?, ?)").run(
              event.id,
              event.chili_score >= 5 ? "critical" : "warning",
              `🔥 High-risk event: ${event.title} (Risk ${event.chili_score}/5)`,
              new Date().toISOString(),
            );
          }
        }
      })
      .catch((err) => {
        console.error("[crawl] Pipeline error:", err);
      });
  });

  // GET /api/crawl/status — check crawl status
  app.get("/api/crawl/status", (_req: Request, res: Response) => {
    const lastRun = getLatestCrawlRun(db);
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
