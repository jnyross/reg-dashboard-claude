"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.databasePathDefault = void 0;
exports.openDatabase = openDatabase;
exports.initializeSchema = initializeSchema;
exports.migrateSchema = migrateSchema;
exports.addEventHistory = addEventHistory;
exports.getEventHistory = getEventHistory;
exports.startCrawlRun = startCrawlRun;
exports.completeCrawlRun = completeCrawlRun;
exports.failCrawlRun = failCrawlRun;
exports.getLatestCrawlRun = getLatestCrawlRun;
exports.upsertEvent = upsertEvent;
exports.ensureSource = ensureSource;
exports.backfillLawsFromEvents = backfillLawsFromEvents;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const law_canonical_1 = require("./law-canonical");
exports.databasePathDefault = node_path_1.default.join(process.cwd(), "data", "reg-regulation-dashboard.sqlite");
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
function openDatabase(databasePath = exports.databasePathDefault) {
    if (databasePath !== ":memory:") {
        const directory = node_path_1.default.dirname(databasePath);
        if (!node_fs_1.default.existsSync(directory)) {
            node_fs_1.default.mkdirSync(directory, { recursive: true });
        }
    }
    const db = new better_sqlite3_1.default(databasePath);
    db.pragma("foreign_keys = ON");
    return db;
}
function initializeSchema(db) {
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

    CREATE TABLE IF NOT EXISTS event_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      changed_by TEXT NOT NULL DEFAULT 'system',
      change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'status_changed', 'amended', 'deleted', 'feedback')),
      field_name TEXT,
      previous_value TEXT,
      new_value TEXT,
      FOREIGN KEY (event_id) REFERENCES regulation_events (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saved_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      filters_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly')),
      min_chili INTEGER NOT NULL DEFAULT 4 CHECK (min_chili BETWEEN 1 AND 5),
      webhook_url TEXT,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
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

    CREATE TABLE IF NOT EXISTS laws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      law_key TEXT NOT NULL UNIQUE,
      law_name TEXT NOT NULL,
      jurisdiction_country TEXT NOT NULL,
      jurisdiction_state TEXT,
      law_type TEXT,
      stage TEXT,
      status TEXT,
      first_seen_at TEXT,
      last_seen_at TEXT,
      latest_effective_date TEXT,
      aggregate_risk_max REAL NOT NULL DEFAULT 0,
      aggregate_risk_recent_weighted REAL NOT NULL DEFAULT 0,
      aggregate_risk_overall REAL NOT NULL DEFAULT 0,
      source_confidence REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS law_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      law_id INTEGER NOT NULL,
      event_id TEXT NOT NULL,
      source_item_id TEXT,
      update_title TEXT NOT NULL,
      update_summary TEXT,
      source_url TEXT,
      source_name TEXT,
      published_date TEXT,
      effective_date TEXT,
      stage TEXT,
      chili_score INTEGER,
      impact_score INTEGER,
      likelihood_score INTEGER,
      confidence_score INTEGER,
      created_at TEXT NOT NULL,
      raw_metadata TEXT,
      FOREIGN KEY (law_id) REFERENCES laws (id) ON DELETE CASCADE,
      FOREIGN KEY (event_id) REFERENCES regulation_events (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_regulation_events_stage
      ON regulation_events(stage);
    CREATE INDEX IF NOT EXISTS idx_regulation_events_jurisdiction_country
      ON regulation_events(jurisdiction_country);
    CREATE INDEX IF NOT EXISTS idx_regulation_events_jurisdiction_state
      ON regulation_events(jurisdiction_state);
    CREATE INDEX IF NOT EXISTS idx_regulation_events_age_bracket
      ON regulation_events(age_bracket);
    CREATE INDEX IF NOT EXISTS idx_regulation_events_published_date
      ON regulation_events(published_date);
    CREATE INDEX IF NOT EXISTS idx_regulation_events_updated_at
      ON regulation_events(updated_at);
    CREATE INDEX IF NOT EXISTS idx_feedback_event_id
      ON feedback(event_id);
    CREATE INDEX IF NOT EXISTS idx_event_history_event_id
      ON event_history(event_id, changed_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_event_id
      ON notifications(event_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dedup_url_jurisdiction_title
      ON regulation_events(source_url_link, jurisdiction_country, title);
    CREATE INDEX IF NOT EXISTS idx_laws_jurisdiction
      ON laws(jurisdiction_country, jurisdiction_state);
    CREATE INDEX IF NOT EXISTS idx_laws_stage
      ON laws(stage);
    CREATE INDEX IF NOT EXISTS idx_laws_risk
      ON laws(aggregate_risk_max DESC, aggregate_risk_recent_weighted DESC);
    CREATE INDEX IF NOT EXISTS idx_law_updates_law_id
      ON law_updates(law_id, published_date DESC, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_law_updates_event_id
      ON law_updates(event_id);
  `);
}
/** Safely add a column to a table if it doesn't already exist */
function addColumnIfNotExists(db, table, column, definition) {
    const columns = db.pragma(`table_info(${table})`);
    if (!columns.some((c) => c.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}
/** Run migrations for existing databases */
function migrateSchema(db) {
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

    CREATE TABLE IF NOT EXISTS event_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      changed_by TEXT NOT NULL DEFAULT 'system',
      change_type TEXT NOT NULL DEFAULT 'updated',
      field_name TEXT,
      previous_value TEXT,
      new_value TEXT,
      FOREIGN KEY (event_id) REFERENCES regulation_events (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saved_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      filters_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      frequency TEXT NOT NULL DEFAULT 'daily',
      min_chili INTEGER NOT NULL DEFAULT 4,
      webhook_url TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT,
      FOREIGN KEY (event_id) REFERENCES regulation_events (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS laws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      law_key TEXT NOT NULL UNIQUE,
      law_name TEXT NOT NULL,
      jurisdiction_country TEXT NOT NULL,
      jurisdiction_state TEXT,
      law_type TEXT,
      stage TEXT,
      status TEXT,
      first_seen_at TEXT,
      last_seen_at TEXT,
      latest_effective_date TEXT,
      aggregate_risk_max REAL NOT NULL DEFAULT 0,
      aggregate_risk_recent_weighted REAL NOT NULL DEFAULT 0,
      aggregate_risk_overall REAL NOT NULL DEFAULT 0,
      source_confidence REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS law_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      law_id INTEGER NOT NULL,
      event_id TEXT NOT NULL,
      source_item_id TEXT,
      update_title TEXT NOT NULL,
      update_summary TEXT,
      source_url TEXT,
      source_name TEXT,
      published_date TEXT,
      effective_date TEXT,
      stage TEXT,
      chili_score INTEGER,
      impact_score INTEGER,
      likelihood_score INTEGER,
      confidence_score INTEGER,
      created_at TEXT NOT NULL,
      raw_metadata TEXT,
      FOREIGN KEY (law_id) REFERENCES laws (id) ON DELETE CASCADE,
      FOREIGN KEY (event_id) REFERENCES regulation_events (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_regulation_events_age_bracket ON regulation_events(age_bracket);
    CREATE INDEX IF NOT EXISTS idx_regulation_events_published_date ON regulation_events(published_date);
    CREATE INDEX IF NOT EXISTS idx_regulation_events_updated_at ON regulation_events(updated_at);
    CREATE INDEX IF NOT EXISTS idx_event_history_event_id ON event_history(event_id, changed_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_event_id ON notifications(event_id);
    CREATE INDEX IF NOT EXISTS idx_laws_jurisdiction ON laws(jurisdiction_country, jurisdiction_state);
    CREATE INDEX IF NOT EXISTS idx_laws_stage ON laws(stage);
    CREATE INDEX IF NOT EXISTS idx_laws_risk ON laws(aggregate_risk_max DESC, aggregate_risk_recent_weighted DESC);
    CREATE INDEX IF NOT EXISTS idx_law_updates_law_id ON law_updates(law_id, published_date DESC, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_law_updates_event_id ON law_updates(event_id);
  `);
    addColumnIfNotExists(db, "laws", "stage", "TEXT");
    addColumnIfNotExists(db, "laws", "status", "TEXT");
    addColumnIfNotExists(db, "laws", "aggregate_risk_max", "REAL NOT NULL DEFAULT 0");
    addColumnIfNotExists(db, "laws", "aggregate_risk_recent_weighted", "REAL NOT NULL DEFAULT 0");
    addColumnIfNotExists(db, "laws", "aggregate_risk_overall", "REAL NOT NULL DEFAULT 0");
    addColumnIfNotExists(db, "laws", "source_confidence", "REAL NOT NULL DEFAULT 0");
    addColumnIfNotExists(db, "law_updates", "source_item_id", "TEXT");
    addColumnIfNotExists(db, "law_updates", "effective_date", "TEXT");
    addColumnIfNotExists(db, "law_updates", "stage", "TEXT");
    addColumnIfNotExists(db, "law_updates", "chili_score", "INTEGER");
    addColumnIfNotExists(db, "law_updates", "impact_score", "INTEGER");
    addColumnIfNotExists(db, "law_updates", "likelihood_score", "INTEGER");
    addColumnIfNotExists(db, "law_updates", "confidence_score", "INTEGER");
}
function addEventHistory(db, entry) {
    db.prepare(`INSERT INTO event_history (event_id, changed_at, changed_by, change_type, field_name, previous_value, new_value)
     VALUES (?, ?, ?, ?, ?, ?, ?)`).run(entry.eventId, entry.changedAt ?? new Date().toISOString(), entry.changedBy ?? "system", entry.changeType, entry.fieldName ?? null, entry.previousValue ?? null, entry.newValue ?? null);
}
function getEventHistory(db, eventId) {
    const rows = db
        .prepare(`SELECT id, event_id, changed_at, changed_by, change_type, field_name, previous_value, new_value
       FROM event_history
       WHERE event_id = ?
       ORDER BY changed_at DESC, id DESC`)
        .all(eventId);
    return rows.map((row) => ({
        id: row.id,
        eventId: row.event_id,
        changedAt: row.changed_at,
        changedBy: row.changed_by,
        changeType: row.change_type,
        fieldName: row.field_name ?? null,
        previousValue: row.previous_value ?? null,
        newValue: row.new_value ?? null,
    }));
}
function startCrawlRun(db) {
    const result = db
        .prepare("INSERT INTO crawl_runs (started_at, status) VALUES (?, 'running')")
        .run(new Date().toISOString());
    return Number(result.lastInsertRowid);
}
function completeCrawlRun(db, runId, stats) {
    db.prepare(`UPDATE crawl_runs SET completed_at = ?, status = 'completed',
     items_found = ?, items_new = ?, items_updated = ? WHERE id = ?`).run(new Date().toISOString(), stats.itemsFound, stats.itemsNew, stats.itemsUpdated, runId);
}
function failCrawlRun(db, runId, error) {
    db.prepare("UPDATE crawl_runs SET completed_at = ?, status = 'failed', error_message = ? WHERE id = ?").run(new Date().toISOString(), error, runId);
}
function getLatestCrawlRun(db) {
    const row = db
        .prepare("SELECT * FROM crawl_runs ORDER BY id DESC LIMIT 1")
        .get();
    if (!row)
        return null;
    return {
        id: row.id,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        status: row.status,
        itemsFound: row.items_found,
        itemsNew: row.items_new,
        itemsUpdated: row.items_updated,
        errorMessage: row.error_message,
    };
}
function normalizeForHash(value) {
    return value.replace(/\s+/g, " ").trim().toLowerCase();
}
function hashText(value) {
    return node_crypto_1.default.createHash("sha1").update(normalizeForHash(value ?? "")).digest("hex");
}
function buildRegulationKey(country, state, title) {
    return [normalizeForHash(country), normalizeForHash(state ?? ""), normalizeForHash(title)].join("|");
}
/**
 * Upsert a regulation event. Dedup by URL, text hash, and regulation key.
 * Returns 'new' if inserted, 'updated' if changed, 'duplicate' if unchanged.
 */
function upsertEvent(db, input) {
    const regulationKey = buildRegulationKey(input.jurisdictionCountry, input.jurisdictionState, input.title);
    const normalizedSourceUrl = (input.sourceUrlLink ?? "").trim().toLowerCase();
    const contentHash = hashText(input.rawText);
    const candidates = db
        .prepare(`SELECT id, stage, summary, business_impact, age_bracket,
              impact_score, likelihood_score, confidence_score, chili_score,
              jurisdiction_country, jurisdiction_state, title, source_url_link, raw_text
       FROM regulation_events
       WHERE lower(jurisdiction_country) = lower(?)
         AND lower(COALESCE(jurisdiction_state, '')) = lower(COALESCE(?, ''))
         AND (
           lower(title) = lower(?)
           OR (source_url_link IS NOT NULL AND lower(source_url_link) = lower(?))
         )
       ORDER BY updated_at DESC`)
        .all(input.jurisdictionCountry, input.jurisdictionState ?? "", input.title, input.sourceUrlLink ?? "");
    const existing = candidates.find((candidate) => {
        const candidateRegulationKey = buildRegulationKey(String(candidate.jurisdiction_country ?? ""), candidate.jurisdiction_state ? String(candidate.jurisdiction_state) : "", String(candidate.title ?? ""));
        const candidateUrl = String(candidate.source_url_link ?? "").trim().toLowerCase();
        const candidateHash = hashText(String(candidate.raw_text ?? ""));
        const urlMatch = Boolean(normalizedSourceUrl && candidateUrl && normalizedSourceUrl === candidateUrl);
        const hashMatch = Boolean(contentHash && candidateHash && contentHash === candidateHash);
        const regulationMatch = candidateRegulationKey === regulationKey;
        const bothHaveDistinctUrls = Boolean(normalizedSourceUrl
            && candidateUrl
            && normalizedSourceUrl !== candidateUrl);
        return (urlMatch && regulationMatch) || (!bothHaveDistinctUrls && hashMatch && regulationMatch);
    });
    const now = new Date().toISOString();
    if (existing) {
        const changed = existing.stage !== input.stage ||
            existing.summary !== input.summary ||
            existing.business_impact !== input.businessImpact ||
            existing.age_bracket !== input.ageBracket ||
            existing.impact_score !== input.impactScore ||
            existing.likelihood_score !== input.likelihoodScore ||
            existing.confidence_score !== input.confidenceScore ||
            existing.chili_score !== input.chiliScore;
        if (!changed)
            return "duplicate";
        db.prepare(`UPDATE regulation_events SET
        stage = ?, summary = ?, business_impact = ?, required_solutions = ?,
        affected_products = ?, competitor_responses = ?, age_bracket = ?,
        impact_score = ?, likelihood_score = ?, confidence_score = ?, chili_score = ?,
        updated_at = ?
       WHERE id = ?`).run(input.stage, input.summary, input.businessImpact, input.requiredSolutions ? JSON.stringify(input.requiredSolutions) : null, input.affectedProducts ? JSON.stringify(input.affectedProducts) : null, input.competitorResponses ? JSON.stringify(input.competitorResponses) : null, input.ageBracket, input.impactScore, input.likelihoodScore, input.confidenceScore, input.chiliScore, now, existing.id);
        if (existing.stage !== input.stage) {
            addEventHistory(db, {
                eventId: String(existing.id),
                changeType: "status_changed",
                fieldName: "stage",
                previousValue: String(existing.stage),
                newValue: input.stage,
                changedBy: "pipeline",
                changedAt: now,
            });
        }
        else {
            addEventHistory(db, {
                eventId: String(existing.id),
                changeType: "updated",
                fieldName: "analysis",
                previousValue: null,
                newValue: "Pipeline refresh",
                changedBy: "pipeline",
                changedAt: now,
            });
        }
        return "updated";
    }
    const id = node_crypto_1.default.randomUUID();
    db.prepare(`INSERT INTO regulation_events (
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
    )`).run(id, input.title, input.jurisdictionCountry, input.jurisdictionState, input.stage, input.isUnder16Applicable ? 1 : 0, input.ageBracket, input.impactScore, input.likelihoodScore, input.confidenceScore, input.chiliScore, input.summary, input.businessImpact, input.requiredSolutions ? JSON.stringify(input.requiredSolutions) : null, input.affectedProducts ? JSON.stringify(input.affectedProducts) : null, input.competitorResponses ? JSON.stringify(input.competitorResponses) : null, input.rawText, input.sourceUrlLink, input.effectiveDate, input.publishedDate, input.sourceId, now, now);
    addEventHistory(db, {
        eventId: id,
        changeType: "created",
        fieldName: "event",
        previousValue: null,
        newValue: "Event created",
        changedBy: "pipeline",
        changedAt: now,
    });
    return "new";
}
/** Ensure a source exists in the database, return its ID */
function ensureSource(db, source) {
    const existing = db.prepare("SELECT id FROM sources WHERE name = ? OR url = ? LIMIT 1").get(source.name, source.url);
    if (existing) {
        db.prepare("UPDATE sources SET name = ?, url = ?, authority_type = ?, jurisdiction = ?, reliability_tier = ?, last_crawled_at = ? WHERE id = ?").run(source.name, source.url, source.authorityType, source.jurisdiction, source.reliabilityTier, new Date().toISOString(), existing.id);
        return existing.id;
    }
    const result = db
        .prepare("INSERT INTO sources (name, url, authority_type, jurisdiction, reliability_tier, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(source.name, source.url, source.authorityType, source.jurisdiction, source.reliabilityTier, new Date().toISOString());
    return Number(result.lastInsertRowid);
}
function parseDateOr(value, fallback) {
    if (!value)
        return fallback;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? fallback : parsed;
}
function pickEventReferenceDate(row) {
    return row.published_date ?? row.effective_date ?? row.updated_at ?? row.created_at;
}
function computeRecencyWeight(referenceDate, nowTs) {
    const ageDays = Math.max(0, (nowTs - parseDateOr(referenceDate, nowTs)) / (1000 * 60 * 60 * 24));
    if (ageDays <= 30)
        return 1;
    if (ageDays <= 90)
        return 0.9;
    if (ageDays <= 180)
        return 0.8;
    if (ageDays <= 365)
        return 0.65;
    if (ageDays <= 730)
        return 0.5;
    return 0.35;
}
function computeOverallEventRisk(row) {
    return (row.chili_score * 0.4) + (row.impact_score * 0.3) + (row.likelihood_score * 0.2) + (row.confidence_score * 0.1);
}
function backfillLawsFromEvents(db) {
    const eventRows = db
        .prepare(`
      SELECT
        e.id,
        e.title,
        e.jurisdiction_country,
        e.jurisdiction_state,
        e.stage,
        e.age_bracket,
        e.impact_score,
        e.likelihood_score,
        e.confidence_score,
        e.chili_score,
        e.summary,
        e.source_url_link,
        e.effective_date,
        e.published_date,
        e.created_at,
        e.updated_at,
        e.raw_text,
        s.name AS source_name,
        s.url AS source_url,
        COALESCE(s.reliability_tier, 3) AS source_reliability_tier
      FROM regulation_events e
      JOIN sources s ON s.id = e.source_id
      ORDER BY e.updated_at DESC, e.id ASC
      `)
        .all();
    const tx = db.transaction(() => {
        db.exec("DELETE FROM law_updates");
        db.exec("DELETE FROM laws");
        const nowIso = new Date().toISOString();
        const nowTs = Date.now();
        const groups = new Map();
        for (const row of eventRows) {
            const canonical = (0, law_canonical_1.inferCanonicalLaw)({
                title: row.title,
                summary: row.summary,
                content: row.raw_text,
                jurisdictionCountry: row.jurisdiction_country,
                jurisdictionState: row.jurisdiction_state,
            });
            const existing = groups.get(canonical.lawKey);
            if (existing) {
                existing.updates.push(row);
                if (canonical.lawName.length > existing.lawName.length) {
                    existing.lawName = canonical.lawName;
                }
                if (existing.lawType === "law" && canonical.lawType && canonical.lawType !== "law") {
                    existing.lawType = canonical.lawType;
                }
            }
            else {
                groups.set(canonical.lawKey, {
                    lawName: canonical.lawName,
                    lawType: canonical.lawType,
                    jurisdictionCountry: row.jurisdiction_country,
                    jurisdictionState: row.jurisdiction_state,
                    updates: [row],
                });
            }
        }
        const insertLaw = db.prepare(`
      INSERT INTO laws (
        law_key,
        law_name,
        jurisdiction_country,
        jurisdiction_state,
        law_type,
        stage,
        status,
        first_seen_at,
        last_seen_at,
        latest_effective_date,
        aggregate_risk_max,
        aggregate_risk_recent_weighted,
        aggregate_risk_overall,
        source_confidence,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
        const insertLawUpdate = db.prepare(`
      INSERT INTO law_updates (
        law_id,
        event_id,
        source_item_id,
        update_title,
        update_summary,
        source_url,
        source_name,
        published_date,
        effective_date,
        stage,
        chili_score,
        impact_score,
        likelihood_score,
        confidence_score,
        created_at,
        raw_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
        for (const [lawKey, group] of groups) {
            const updatesSorted = [...group.updates].sort((a, b) => parseDateOr(pickEventReferenceDate(b), 0) - parseDateOr(pickEventReferenceDate(a), 0));
            const latest = updatesSorted[0];
            const firstSeen = group.updates.reduce((min, row) => {
                const candidate = pickEventReferenceDate(row);
                return parseDateOr(candidate, Number.MAX_SAFE_INTEGER) < parseDateOr(min, Number.MAX_SAFE_INTEGER)
                    ? candidate
                    : min;
            }, pickEventReferenceDate(group.updates[0]));
            const lastSeen = group.updates.reduce((max, row) => {
                const candidate = row.updated_at ?? pickEventReferenceDate(row);
                return parseDateOr(candidate, 0) > parseDateOr(max, 0) ? candidate : max;
            }, latest.updated_at ?? pickEventReferenceDate(latest));
            const latestEffectiveDate = group.updates
                .map((row) => row.effective_date)
                .filter((value) => Boolean(value))
                .sort((a, b) => parseDateOr(b, 0) - parseDateOr(a, 0))[0] ?? null;
            const aggregateRiskMax = Math.max(...group.updates.map((row) => row.chili_score));
            let weightedRiskNumerator = 0;
            let weightedRiskDenominator = 0;
            let riskOverallSum = 0;
            let sourceConfidenceSum = 0;
            for (const row of group.updates) {
                const referenceDate = pickEventReferenceDate(row);
                const weight = computeRecencyWeight(referenceDate, nowTs);
                weightedRiskNumerator += row.chili_score * weight;
                weightedRiskDenominator += weight;
                riskOverallSum += computeOverallEventRisk(row);
                sourceConfidenceSum += row.source_reliability_tier;
            }
            const aggregateRiskRecentWeighted = weightedRiskDenominator > 0
                ? weightedRiskNumerator / weightedRiskDenominator
                : aggregateRiskMax;
            const aggregateRiskOverall = group.updates.length > 0 ? riskOverallSum / group.updates.length : aggregateRiskMax;
            const sourceConfidence = group.updates.length > 0 ? sourceConfidenceSum / group.updates.length : 0;
            const lawResult = insertLaw.run(lawKey, group.lawName, group.jurisdictionCountry, group.jurisdictionState, group.lawType, latest.stage, latest.stage, firstSeen, lastSeen, latestEffectiveDate, aggregateRiskMax, aggregateRiskRecentWeighted, aggregateRiskOverall, sourceConfidence, nowIso, nowIso);
            const lawId = Number(lawResult.lastInsertRowid);
            for (const update of updatesSorted) {
                insertLawUpdate.run(lawId, update.id, null, update.title, update.summary, update.source_url_link, update.source_name, update.published_date, update.effective_date, update.stage, update.chili_score, update.impact_score, update.likelihood_score, update.confidence_score, update.updated_at ?? nowIso, JSON.stringify({
                    ageBracket: update.age_bracket,
                    jurisdictionCountry: update.jurisdiction_country,
                    jurisdictionState: update.jurisdiction_state,
                    sourceReliabilityTier: update.source_reliability_tier,
                    sourceUrl: update.source_url,
                }));
            }
        }
        return {
            laws: groups.size,
            lawUpdates: eventRows.length,
            mergedDuplicates: Math.max(0, eventRows.length - groups.size),
        };
    });
    return tx();
}
//# sourceMappingURL=db.js.map