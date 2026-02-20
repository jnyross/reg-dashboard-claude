"use strict";
/**
 * Full crawl + analyze pipeline orchestrator.
 * Coordinates: source registry → crawler → analyzer → persistence.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPipeline = runPipeline;
const sources_1 = require("./sources");
const crawler_1 = require("./crawler");
const analyzer_1 = require("./analyzer");
const db_1 = require("./db");
/**
 * Run the full crawl + analyze + persist pipeline.
 */
async function runPipeline(db, apiKey, options = {}) {
    const startTime = Date.now();
    const sources = options.sources ?? [...sources_1.sourceRegistry, ...sources_1.twitterSearchSources];
    const errors = [];
    const runId = (0, db_1.startCrawlRun)(db);
    options.onProgress?.("start", `Crawl run #${runId} started with ${sources.length} sources`);
    try {
        // 1. Crawl all sources
        options.onProgress?.("crawl", `Crawling ${sources.length} sources...`);
        const crawledItems = await (0, crawler_1.crawlAllSources)(sources, options.crawlConcurrency ?? 5, (completed, total, name) => {
            options.onProgress?.("crawl", `[${completed}/${total}] Crawled: ${name}`);
        });
        options.onProgress?.("crawl_done", `Crawled ${crawledItems.length} items from ${sources.length} sources`);
        if (crawledItems.length === 0) {
            (0, db_1.completeCrawlRun)(db, runId, { itemsFound: 0, itemsNew: 0, itemsUpdated: 0 });
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
        const analyzed = await (0, analyzer_1.analyzeItems)(crawledItems, apiKey, options.analyzeConcurrency ?? Math.max(10, Number(process.env.ANALYSIS_CONCURRENCY || 12)), (completed, total, title) => {
            options.onProgress?.("analyze", `[${completed}/${total}] Analyzed: ${title.slice(0, 60)}`);
        });
        options.onProgress?.("analyze_done", `${analyzed.length} relevant items found out of ${crawledItems.length}`);
        // 3. Persist to database
        options.onProgress?.("persist", `Persisting ${analyzed.length} items...`);
        let itemsNew = 0;
        let itemsUpdated = 0;
        let itemsDuplicate = 0;
        const persistTransaction = db.transaction(() => {
            for (const { item, analysis } of analyzed) {
                try {
                    // Ensure the source exists
                    const sourceId = (0, db_1.ensureSource)(db, {
                        name: item.source.name,
                        url: item.source.url,
                        authorityType: item.source.authorityType,
                        jurisdiction: item.source.jurisdiction,
                        reliabilityTier: item.source.reliabilityTier,
                    });
                    const input = {
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
                    const result = (0, db_1.upsertEvent)(db, input);
                    if (result === "new")
                        itemsNew++;
                    else if (result === "updated")
                        itemsUpdated++;
                    else
                        itemsDuplicate++;
                }
                catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    errors.push(`Failed to persist "${analysis.title}": ${msg}`);
                }
            }
        });
        persistTransaction();
        (0, db_1.completeCrawlRun)(db, runId, {
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
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        (0, db_1.failCrawlRun)(db, runId, msg);
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
//# sourceMappingURL=pipeline.js.map