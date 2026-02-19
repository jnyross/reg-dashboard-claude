/**
 * Crawler: fetches pages, RSS feeds, and search results from the source registry.
 * Uses Node built-in fetch. Handles errors gracefully with per-source timeouts.
 */

import { type RegistrySource } from "./sources";

export type CrawledItem = {
  source: RegistrySource;
  url: string;
  title: string;
  text: string;
  fetchedAt: string;
};

const FETCH_TIMEOUT_MS = 15_000;
const MAX_TEXT_LENGTH = 10_000;

/** Strip HTML tags and collapse whitespace */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract <title> from HTML */
function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]).slice(0, 200) : "";
}

/** Fetch a URL with timeout, return raw text */
async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "RegDashboard/2.0 (regulatory-monitoring-bot)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Crawl a government page or legal database page */
async function crawlPage(source: RegistrySource): Promise<CrawledItem[]> {
  const html = await fetchWithTimeout(source.url);
  const title = extractTitle(html) || source.name;
  const text = stripHtml(html).slice(0, MAX_TEXT_LENGTH);

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
function parseRssItems(xml: string, source: RegistrySource): CrawledItem[] {
  const items: CrawledItem[] = [];

  const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch =
      block.match(/<link[^>]*href=["']([^"']+)["']/i) ||
      block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const descMatch =
      block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ||
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

    if (items.length >= 10) break;
  }

  return items;
}

/** Crawl an RSS feed */
async function crawlRssFeed(source: RegistrySource): Promise<CrawledItem[]> {
  const xml = await fetchWithTimeout(source.url);
  return parseRssItems(xml, source);
}

/** Crawl a news search source */
async function crawlNewsSearch(source: RegistrySource): Promise<CrawledItem[]> {
  return crawlPage(source);
}

/**
 * Crawl a single source. Returns items found, or empty array on error.
 */
export async function crawlSource(source: RegistrySource): Promise<CrawledItem[]> {
  try {
    switch (source.type) {
      case "rss_feed":
        return await crawlRssFeed(source);
      case "news_search":
        return await crawlNewsSearch(source);
      case "government_page":
      case "legal_database":
      default:
        return await crawlPage(source);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[crawler] Failed to crawl "${source.name}": ${message}`);
    return [];
  }
}

/**
 * Crawl all sources from the registry. Returns all crawled items.
 * Runs sources in parallel with concurrency limit.
 */
export async function crawlAllSources(
  sources: RegistrySource[],
  concurrency = 5,
  onProgress?: (completed: number, total: number, sourceName: string) => void,
): Promise<CrawledItem[]> {
  const allItems: CrawledItem[] = [];
  let completed = 0;

  for (let i = 0; i < sources.length; i += concurrency) {
    const batch = sources.slice(i, i + concurrency);
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

  return allItems;
}
