"use strict";
/**
 * Crawler: fetches pages, RSS feeds, search results, and X/Twitter API items from the source registry.
 * Uses Node built-in fetch. Handles errors gracefully with per-source timeouts.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.crawlSource = crawlSource;
exports.crawlAllSources = crawlAllSources;
const node_crypto_1 = __importDefault(require("node:crypto"));
const twitter_crawler_1 = require("./twitter-crawler");
const FETCH_TIMEOUT_MS = 30_000;
const MAX_TEXT_LENGTH = 10_000;
const TWITTER_INTER_QUERY_DELAY_MS = 1_500;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** Strip HTML tags and collapse whitespace */
function stripHtml(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[\s\S]*?<\/footer>/gi, "")
        .replace(/<header[\s\S]*?<\/header>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#\d+;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
/** Extract <title> from HTML */
function extractTitle(html) {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? stripHtml(match[1]).slice(0, 200) : "";
}
/** Extract meta description / og:description as fallback content */
function extractMetaContent(html) {
    const parts = [];
    // og:description
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
        ?? html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
    if (ogDesc?.[1])
        parts.push(ogDesc[1]);
    // meta description
    const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
        ?? html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    if (metaDesc?.[1])
        parts.push(metaDesc[1]);
    // og:title
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogTitle?.[1])
        parts.push(ogTitle[1]);
    return parts.join(" | ");
}
/** Fetch a URL with timeout, return raw text */
async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            redirect: "follow",
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        return await response.text();
    }
    finally {
        clearTimeout(timer);
    }
}
/** Crawl a government page or legal database page */
async function crawlPage(source) {
    const html = await fetchWithTimeout(source.url);
    const title = extractTitle(html) || source.name;
    let text = stripHtml(html).slice(0, MAX_TEXT_LENGTH);
    // If main text is too thin, enrich with meta tags and source metadata
    if (text.length < 200) {
        const metaContent = extractMetaContent(html);
        const enrichment = [
            `Source: ${source.name}`,
            `Description: ${source.description}`,
            `Keywords: ${(source.searchKeywords ?? []).join(", ")}`,
            metaContent ? `Meta: ${metaContent}` : "",
        ].filter(Boolean).join("\n");
        text = `${enrichment}\n\n${text}`;
    }
    return [
        {
            source,
            url: source.url,
            title,
            text,
            fetchedAt: new Date().toISOString(),
        },
    ];
}
/** Parse RSS/Atom XML feed items */
function parseRssItems(xml, source) {
    const items = [];
    const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["']/i) ||
            block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
        const descMatch = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ||
            block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) ||
            block.match(/<content[^>]*>([\s\S]*?)<\/content>/i);
        const title = titleMatch ? stripHtml(titleMatch[1]) : source.name;
        const link = linkMatch ? stripHtml(linkMatch[1]) : source.url;
        const description = descMatch ? stripHtml(descMatch[1]).slice(0, MAX_TEXT_LENGTH) : "";
        items.push({
            source,
            url: link,
            title,
            text: `${title}\n\n${description}`,
            fetchedAt: new Date().toISOString(),
        });
        if (items.length >= 5)
            break;
    }
    return items;
}
/** Crawl an RSS feed */
async function crawlRssFeed(source) {
    const xml = await fetchWithTimeout(source.url);
    return parseRssItems(xml, source);
}
/** Crawl a news search source */
async function crawlNewsSearch(source) {
    return crawlPage(source);
}
/**
 * Crawl a single source. Returns items found, or empty array on error.
 */
async function crawlSource(source) {
    try {
        switch (source.type) {
            case "rss_feed":
                return await crawlRssFeed(source);
            case "news_search":
                return await crawlNewsSearch(source);
            case "twitter_search": {
                const bearerToken = process.env.X_BEARER_TOKEN;
                if (!bearerToken) {
                    console.warn(`[crawler] Skipping X source \"${source.name}\": X_BEARER_TOKEN not set`);
                    return [];
                }
                return await (0, twitter_crawler_1.crawlTwitterSources)([source], bearerToken);
            }
            case "government_page":
            case "legal_database":
            default:
                return await crawlPage(source);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[crawler] Failed to crawl \"${source.name}\": ${message}`);
        return [];
    }
}
function normalizeTextForHash(text) {
    return text.replace(/\s+/g, " ").trim().toLowerCase();
}
function hashText(text) {
    return node_crypto_1.default.createHash("sha1").update(normalizeTextForHash(text)).digest("hex");
}
function dedupeItems(items) {
    const deduped = new Map();
    for (const item of items) {
        const normalizedUrl = item.url?.trim().toLowerCase() ?? "";
        const textHash = hashText(item.text || item.title);
        const key = normalizedUrl
            ? `${item.source.name.toLowerCase()}::${normalizedUrl}`
            : `${item.source.name.toLowerCase()}::text:${textHash}`;
        if (!deduped.has(key)) {
            deduped.set(key, item);
        }
    }
    return [...deduped.values()];
}
/**
 * Crawl all sources from the registry. Returns all crawled items.
 * Runs non-Twitter sources in parallel; X/Twitter sources sequentially and conservatively.
 */
async function crawlAllSources(sources, concurrency = 5, onProgress) {
    const allItems = [];
    const nonTwitterSources = sources.filter((s) => s.type !== "twitter_search");
    const twitterSources = sources.filter((s) => s.type === "twitter_search");
    let completed = 0;
    for (let i = 0; i < nonTwitterSources.length; i += concurrency) {
        const batch = nonTwitterSources.slice(i, i + concurrency);
        const results = await Promise.allSettled(batch.map((s) => crawlSource(s)));
        for (let j = 0; j < results.length; j++) {
            completed++;
            const result = results[j];
            if (result.status === "fulfilled") {
                allItems.push(...result.value);
            }
            onProgress?.(completed, sources.length, batch[j].name);
        }
    }
    for (let i = 0; i < twitterSources.length; i++) {
        const source = twitterSources[i];
        const result = await crawlSource(source);
        allItems.push(...result);
        completed++;
        onProgress?.(completed, sources.length, source.name);
        if (i < twitterSources.length - 1) {
            await sleep(TWITTER_INTER_QUERY_DELAY_MS);
        }
    }
    return dedupeItems(allItems);
}
//# sourceMappingURL=crawler.js.map