/**
 * Full crawl + analyze pipeline orchestrator.
 * Coordinates: source registry → crawler → analyzer → persistence.
 */

import crypto from "node:crypto";
import DatabaseConstructor from "better-sqlite3";
import { sourceRegistry, twitterSearchSources, type RegistrySource } from "./sources";
import { crawlAllSources } from "./crawler";
import { analyzeItems } from "./analyzer";
import {
  ensureSource,
  upsertEvent,
  startCrawlRun,
  completeCrawlRun,
  failCrawlRun,
  type UpsertEventInput,
} from "./db";

export type PipelineResult = {
  runId: number;
  itemsCrawled: number;
  itemsAnalyzed: number;
  itemsRelevant: number;
  itemsNew: number;
  itemsUpdated: number;
  itemsDuplicate: number;
  errors: string[];
  durationMs: number;
};

export type PipelineOptions = {
  sources?: RegistrySource[];
  crawlConcurrency?: number;
  analyzeConcurrency?: number;
  onProgress?: (stage: string, message: string) => void;
};

function normalizeForHash(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function hashText(value: string): string {
  return crypto.createHash("sha1").update(normalizeForHash(value)).digest("hex");
}

function buildRegulationKey(country: string, state: string | null, title: string): string {
  return [normalizeForHash(country || "unknown"), normalizeForHash(state || ""), normalizeForHash(title || "untitled")].join("|");
}

function buildDeduplicationKey(
  country: string,
  state: string | null,
  title: string,
  sourceUrl: string | null,
  rawText: string,
): string {
  const regulationKey = buildRegulationKey(country, state, title);
  const normalizedUrl = (sourceUrl || "").trim().toLowerCase();
  const textHash = hashText(rawText || title);
  const itemIdentity = normalizedUrl || `text:${textHash}`;
  return `${regulationKey}::${itemIdentity}`;
}

/**
 * Run the full crawl + analyze + persist pipeline.
 */
export async function runPipeline(
  db: DatabaseConstructor.Database,
  apiKey: string,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const startTime = Date.now();
  const sources = options.sources ?? [...sourceRegistry, ...twitterSearchSources];
  const errors: string[] = [];

  const runId = startCrawlRun(db);
  options.onProgress?.("start", `Crawl run #${runId} started with ${sources.length} sources`);

  try {
    // 1. Crawl all sources
    options.onProgress?.("crawl", `Crawling ${sources.length} sources...`);
    const crawledItems = await crawlAllSources(
      sources,
      options.crawlConcurrency ?? 5,
      (completed, total, name) => {
        options.onProgress?.("crawl", `[${completed}/${total}] Crawled: ${name}`);
      },
    );

    options.onProgress?.("crawl_done", `Crawled ${crawledItems.length} items from ${sources.length} sources`);

    if (crawledItems.length === 0) {
      completeCrawlRun(db, runId, { itemsFound: 0, itemsNew: 0, itemsUpdated: 0 });
      return {
        runId,
        itemsCrawled: 0,
        itemsAnalyzed: 0,
        itemsRelevant: 0,
        itemsNew: 0,
        itemsUpdated: 0,
        itemsDuplicate: 0,
        errors: ["No items crawled from any source"],
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Analyze with LLM
    options.onProgress?.("analyze", `Analyzing ${crawledItems.length} items with MiniMax M2.5...`);
    const analyzed = await analyzeItems(
      crawledItems,
      apiKey,
      options.analyzeConcurrency ?? Math.max(10, Number(process.env.ANALYSIS_CONCURRENCY || 12)),
      (completed, total, title) => {
        options.onProgress?.("analyze", `[${completed}/${total}] Analyzed: ${title.slice(0, 60)}`);
      },
    );

    options.onProgress?.("analyze_done", `${analyzed.length} relevant items found out of ${crawledItems.length}`);

    // 3. Persist to database
    options.onProgress?.("persist", `Persisting ${analyzed.length} items...`);

    let itemsNew = 0;
    let itemsUpdated = 0;
    let itemsDuplicate = 0;
    const seenDeduplicationKeys = new Set<string>();

    const persistTransaction = db.transaction(() => {
      for (const { item, analysis } of analyzed) {
        try {
          // Ensure the source exists
          const sourceId = ensureSource(db, {
            name: item.source.name,
            url: item.source.url,
            authorityType: item.source.authorityType,
            jurisdiction: item.source.jurisdiction,
            reliabilityTier: item.source.reliabilityTier,
          });

          const input: UpsertEventInput = {
            title: analysis.title,
            jurisdictionCountry: analysis.jurisdiction,
            jurisdictionState: analysis.jurisdictionState,
            stage: analysis.stage,
            isUnder16Applicable: true,
            ageBracket: analysis.ageBracket,
            impactScore: analysis.impactScore,
            likelihoodScore: analysis.likelihoodScore,
            confidenceScore: analysis.confidenceScore,
            chiliScore: analysis.chiliScore,
            summary: analysis.summary,
            businessImpact: analysis.businessImpact,
            requiredSolutions: analysis.requiredSolutions,
            affectedProducts: analysis.affectedProducts,
            competitorResponses: analysis.competitorResponses,
            rawText: item.text.slice(0, 5000),
            sourceUrlLink: item.url,
            effectiveDate: analysis.effectiveDate,
            publishedDate: analysis.publishedDate,
            sourceId,
          };

          const deduplicationKey = buildDeduplicationKey(
            input.jurisdictionCountry,
            input.jurisdictionState,
            input.title,
            input.sourceUrlLink,
            input.rawText ?? "",
          );

          if (seenDeduplicationKeys.has(deduplicationKey)) {
            itemsDuplicate++;
            continue;
          }
          seenDeduplicationKeys.add(deduplicationKey);

          const result = upsertEvent(db, input);
          if (result === "new") itemsNew++;
          else if (result === "updated") itemsUpdated++;
          else itemsDuplicate++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to persist "${analysis.title}": ${msg}`);
        }
      }
    });

    persistTransaction();

    completeCrawlRun(db, runId, {
      itemsFound: crawledItems.length,
      itemsNew,
      itemsUpdated,
    });

    options.onProgress?.("done", `Pipeline complete: ${itemsNew} new, ${itemsUpdated} updated, ${itemsDuplicate} duplicate`);

    return {
      runId,
      itemsCrawled: crawledItems.length,
      itemsAnalyzed: analyzed.length + (crawledItems.length - analyzed.length),
      itemsRelevant: analyzed.length,
      itemsNew,
      itemsUpdated,
      itemsDuplicate,
      errors,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    failCrawlRun(db, runId, msg);
    return {
      runId,
      itemsCrawled: 0,
      itemsAnalyzed: 0,
      itemsRelevant: 0,
      itemsNew: 0,
      itemsUpdated: 0,
      itemsDuplicate: 0,
      errors: [msg],
      durationMs: Date.now() - startTime,
    };
  }
}
