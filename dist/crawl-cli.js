"use strict";
/**
 * CLI entry point: `npm run crawl`
 * Runs the full crawl + analyze + persist pipeline.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("./db");
const pipeline_1 = require("./pipeline");
async function main() {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
        console.error("Error: MINIMAX_API_KEY environment variable is required.");
        console.error("Set it with: export MINIMAX_API_KEY=your-key-here");
        process.exit(1);
    }
    const databasePath = process.env.DATABASE_PATH ?? undefined;
    const db = (0, db_1.openDatabase)(databasePath);
    (0, db_1.initializeSchema)(db);
    (0, db_1.migrateSchema)(db);
    // Skip seed data for clean crawl results
    // seedSampleData(db);
    console.log("Starting crawl pipeline...\n");
    const result = await (0, pipeline_1.runPipeline)(db, apiKey, {
        onProgress: (stage, message) => {
            const prefix = stage.toUpperCase().padEnd(12);
            console.log(`[${prefix}] ${message}`);
        },
    });
    console.log("\n=== Pipeline Results ===");
    console.log(`  Run ID:        ${result.runId}`);
    console.log(`  Items crawled:  ${result.itemsCrawled}`);
    console.log(`  Items analyzed: ${result.itemsAnalyzed}`);
    console.log(`  Relevant:       ${result.itemsRelevant}`);
    console.log(`  New:            ${result.itemsNew}`);
    console.log(`  Updated:        ${result.itemsUpdated}`);
    console.log(`  Duplicate:      ${result.itemsDuplicate}`);
    console.log(`  Duration:       ${(result.durationMs / 1000).toFixed(1)}s`);
    if (result.errors.length > 0) {
        console.log(`\n  Errors (${result.errors.length}):`);
        for (const err of result.errors.slice(0, 10)) {
            console.log(`    - ${err}`);
        }
    }
    db.close();
    console.log("\nDone.");
}
main().catch((err) => {
    console.error("Pipeline failed:", err);
    process.exit(1);
});
//# sourceMappingURL=crawl-cli.js.map