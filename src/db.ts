import fs from "node:fs";
import path from "node:path";
import DatabaseConstructor from "better-sqlite3";
import crypto from "node:crypto";

export const databasePathDefault = path.join(process.cwd(), "data", "reg-regulation-dashboard.sqlite");

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

const allowedAuthorities = ["national", "state", "local", "supranational"];

export function openDatabase(databasePath = databasePathDefault): DatabaseConstructor.Database {
  if (databasePath !== ":memory:") {
    const directory = path.dirname(databasePath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
  }

  const db = new DatabaseConstructor(databasePath);
  db.pragma("foreign_keys = ON");
  return db;
}

export function initializeSchema(db: DatabaseConstructor.Database): void {
  const authorityList = allowedAuthorities.map((a) => `'${a}'`).join(",");
  const stageList = allowedStages.map((s) => `'${s}'`).join(",");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL UNIQUE,
      authority_type TEXT NOT NULL CHECK (authority_type IN (${authorityList})),
      jurisdiction TEXT NOT NULL,
      reliability_tier INTEGER NOT NULL DEFAULT 3 CHECK (reliability_tier BETWEEN 1 AND 5),
      last_crawled_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS regulation_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      jurisdiction_country TEXT NOT NULL,
      jurisdiction_state TEXT,
      stage TEXT NOT NULL CHECK (stage IN (${stageList})),
      is_under16_applicable INTEGER NOT NULL CHECK (is_under16_applicable IN (0,1)),
      age_bracket TEXT DEFAULT 'both' CHECK (age_bracket IN ('13-15', '16-18', 'both')),
      impact_score INTEGER NOT NULL CHECK (impact_score BETWEEN 1 AND 5),
      likelihood_score INTEGER NOT NULL CHECK (likelihood_score BETWEEN 1 AND 5),
      confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 1 AND 5),
      chili_score INTEGER NOT NULL CHECK (chili_score BETWEEN 1 AND 5),
      summary TEXT,
      business_impact TEXT,
      required_solutions TEXT,
      affected_products TEXT,
      competitor_responses TEXT,
      raw_text TEXT,
      source_url_link TEXT,
      effective_date TEXT,
      published_date TEXT,
      source_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (source_id) REFERENCES sources (id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      rating TEXT NOT NULL CHECK (rating IN ('good', 'bad')),
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES regulation_events (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS crawl_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
      items_found INTEGER DEFAULT 0,
      items_new INTEGER DEFAULT 0,
      items_updated INTEGER DEFAULT 0,
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_regulation_events_stage
      ON regulation_events(stage);
    CREATE INDEX IF NOT EXISTS idx_regulation_events_jurisdiction_country
      ON regulation_events(jurisdiction_country);
    CREATE INDEX IF NOT EXISTS idx_regulation_events_jurisdiction_state
      ON regulation_events(jurisdiction_state);
    CREATE INDEX IF NOT EXISTS idx_regulation_events_age_bracket
      ON regulation_events(age_bracket);
    CREATE INDEX IF NOT EXISTS idx_feedback_event_id
      ON feedback(event_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dedup_url_jurisdiction_title
      ON regulation_events(source_url_link, jurisdiction_country, title);
  `);
}

/** Safely add a column to a table if it doesn't already exist */
function addColumnIfNotExists(
  db: DatabaseConstructor.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** Run migrations for Phase 2 columns on an existing database */
export function migrateSchema(db: DatabaseConstructor.Database): void {
  addColumnIfNotExists(db, "sources", "reliability_tier", "INTEGER NOT NULL DEFAULT 3");
  addColumnIfNotExists(db, "sources", "last_crawled_at", "TEXT");
  addColumnIfNotExists(db, "regulation_events", "age_bracket", "TEXT DEFAULT 'both'");
  addColumnIfNotExists(db, "regulation_events", "business_impact", "TEXT");
  addColumnIfNotExists(db, "regulation_events", "required_solutions", "TEXT");
  addColumnIfNotExists(db, "regulation_events", "affected_products", "TEXT");
  addColumnIfNotExists(db, "regulation_events", "competitor_responses", "TEXT");
  addColumnIfNotExists(db, "regulation_events", "raw_text", "TEXT");
  addColumnIfNotExists(db, "regulation_events", "source_url_link", "TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS crawl_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      items_found INTEGER DEFAULT 0,
      items_new INTEGER DEFAULT 0,
      items_updated INTEGER DEFAULT 0,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_regulation_events_age_bracket ON regulation_events(age_bracket);
  `);
}

export type CrawlRun = {
  id: number;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  itemsFound: number;
  itemsNew: number;
  itemsUpdated: number;
  errorMessage: string | null;
};

export function startCrawlRun(db: DatabaseConstructor.Database): number {
  const result = db
    .prepare("INSERT INTO crawl_runs (started_at, status) VALUES (?, 'running')")
    .run(new Date().toISOString());
  return Number(result.lastInsertRowid);
}

export function completeCrawlRun(
  db: DatabaseConstructor.Database,
  runId: number,
  stats: { itemsFound: number; itemsNew: number; itemsUpdated: number },
): void {
  db.prepare(
    `UPDATE crawl_runs SET completed_at = ?, status = 'completed',
     items_found = ?, items_new = ?, items_updated = ? WHERE id = ?`,
  ).run(new Date().toISOString(), stats.itemsFound, stats.itemsNew, stats.itemsUpdated, runId);
}

export function failCrawlRun(db: DatabaseConstructor.Database, runId: number, error: string): void {
  db.prepare(
    "UPDATE crawl_runs SET completed_at = ?, status = 'failed', error_message = ? WHERE id = ?",
  ).run(new Date().toISOString(), error, runId);
}

export function getLatestCrawlRun(db: DatabaseConstructor.Database): CrawlRun | null {
  const row = db
    .prepare("SELECT * FROM crawl_runs ORDER BY id DESC LIMIT 1")
    .get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as number,
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | null,
    status: row.status as CrawlRun["status"],
    itemsFound: row.items_found as number,
    itemsNew: row.items_new as number,
    itemsUpdated: row.items_updated as number,
    errorMessage: row.error_message as string | null,
  };
}

export type UpsertEventInput = {
  title: string;
  jurisdictionCountry: string;
  jurisdictionState: string | null;
  stage: string;
  isUnder16Applicable: boolean;
  ageBracket: "13-15" | "16-18" | "both";
  impactScore: number;
  likelihoodScore: number;
  confidenceScore: number;
  chiliScore: number;
  summary: string;
  businessImpact: string | null;
  requiredSolutions: string[] | null;
  affectedProducts: string[] | null;
  competitorResponses: string[] | null;
  rawText: string | null;
  sourceUrlLink: string | null;
  effectiveDate: string | null;
  publishedDate: string | null;
  sourceId: number;
};

/**
 * Upsert a regulation event. Dedup by (source_url_link, jurisdiction_country, title).
 * Returns 'new' if inserted, 'updated' if changed, 'duplicate' if unchanged.
 */
export function upsertEvent(
  db: DatabaseConstructor.Database,
  input: UpsertEventInput,
): "new" | "updated" | "duplicate" {
  const existing = db
    .prepare(
      `SELECT id, stage, summary, impact_score, chili_score
       FROM regulation_events
       WHERE source_url_link = ? AND jurisdiction_country = ? AND title = ?`,
    )
    .get(input.sourceUrlLink, input.jurisdictionCountry, input.title) as Record<string, unknown> | undefined;

  const now = new Date().toISOString();

  if (existing) {
    const changed =
      existing.stage !== input.stage ||
      existing.summary !== input.summary ||
      existing.impact_score !== input.impactScore ||
      existing.chili_score !== input.chiliScore;

    if (!changed) return "duplicate";

    db.prepare(
      `UPDATE regulation_events SET
        stage = ?, summary = ?, business_impact = ?, required_solutions = ?,
        affected_products = ?, competitor_responses = ?, age_bracket = ?,
        impact_score = ?, likelihood_score = ?, confidence_score = ?, chili_score = ?,
        updated_at = ?
       WHERE id = ?`,
    ).run(
      input.stage,
      input.summary,
      input.businessImpact,
      input.requiredSolutions ? JSON.stringify(input.requiredSolutions) : null,
      input.affectedProducts ? JSON.stringify(input.affectedProducts) : null,
      input.competitorResponses ? JSON.stringify(input.competitorResponses) : null,
      input.ageBracket,
      input.impactScore,
      input.likelihoodScore,
      input.confidenceScore,
      input.chiliScore,
      now,
      existing.id,
    );
    return "updated";
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO regulation_events (
      id, title, jurisdiction_country, jurisdiction_state, stage,
      is_under16_applicable, age_bracket,
      impact_score, likelihood_score, confidence_score, chili_score,
      summary, business_impact, required_solutions, affected_products,
      competitor_responses, raw_text, source_url_link,
      effective_date, published_date, source_id, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?
    )`,
  ).run(
    id,
    input.title,
    input.jurisdictionCountry,
    input.jurisdictionState,
    input.stage,
    input.isUnder16Applicable ? 1 : 0,
    input.ageBracket,
    input.impactScore,
    input.likelihoodScore,
    input.confidenceScore,
    input.chiliScore,
    input.summary,
    input.businessImpact,
    input.requiredSolutions ? JSON.stringify(input.requiredSolutions) : null,
    input.affectedProducts ? JSON.stringify(input.affectedProducts) : null,
    input.competitorResponses ? JSON.stringify(input.competitorResponses) : null,
    input.rawText,
    input.sourceUrlLink,
    input.effectiveDate,
    input.publishedDate,
    input.sourceId,
    now,
    now,
  );
  return "new";
}

/** Ensure a source exists in the database, return its ID */
export function ensureSource(
  db: DatabaseConstructor.Database,
  source: {
    name: string;
    url: string;
    authorityType: string;
    jurisdiction: string;
    reliabilityTier: number;
  },
): number {
  const existing = db.prepare("SELECT id FROM sources WHERE name = ?").get(source.name) as
    | { id: number }
    | undefined;
  if (existing) {
    db.prepare("UPDATE sources SET reliability_tier = ?, last_crawled_at = ? WHERE id = ?").run(
      source.reliabilityTier,
      new Date().toISOString(),
      existing.id,
    );
    return existing.id;
  }

  const result = db
    .prepare(
      "INSERT INTO sources (name, url, authority_type, jurisdiction, reliability_tier, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(source.name, source.url, source.authorityType, source.jurisdiction, source.reliabilityTier, new Date().toISOString());
  return Number(result.lastInsertRowid);
}

