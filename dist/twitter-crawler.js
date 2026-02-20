"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crawlTwitterSources = crawlTwitterSources;
const TWITTER_RECENT_SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent";
const INTER_QUERY_DELAY_MS = 1_500;
const TWITTER_TIMEOUT_MS = Number(process.env.X_API_TIMEOUT_MS || 30_000);
const TWITTER_MAX_RETRIES = Number(process.env.X_API_MAX_RETRIES || 4);
const TWITTER_BASE_BACKOFF_MS = Number(process.env.X_API_BASE_BACKOFF_MS || 1_500);
const TWITTER_MAX_BACKOFF_MS = Number(process.env.X_API_MAX_BACKOFF_MS || 30_000);
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function isRetriableStatus(status) {
    return status === 429 || status === 408 || (status >= 500 && status <= 599);
}
function getRateLimitDelayMs(headers) {
    const resetHeader = headers.get("x-rate-limit-reset");
    if (!resetHeader) {
        return null;
    }
    const resetEpochSeconds = Number(resetHeader);
    if (!Number.isFinite(resetEpochSeconds)) {
        return null;
    }
    const resetMs = resetEpochSeconds * 1000;
    const delay = resetMs - Date.now();
    return delay > 0 ? delay : 0;
}
async function fetchTwitterRecentSearchWithRetry(url, bearerToken) {
    let lastError = null;
    for (let attempt = 1; attempt <= TWITTER_MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TWITTER_TIMEOUT_MS);
        try {
            const response = await fetch(url.toString(), {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${bearerToken}`,
                    Accept: "application/json",
                },
                signal: controller.signal,
            });
            if (response.ok) {
                return response;
            }
            const body = await response.text().catch(() => "");
            const errorMessage = `X API ${response.status}: ${body.slice(0, 200)}`;
            const retriable = isRetriableStatus(response.status);
            if (!retriable || attempt === TWITTER_MAX_RETRIES) {
                throw new Error(errorMessage);
            }
            const retryAfterSeconds = Number(response.headers.get("retry-after") || "0");
            const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
                ? retryAfterSeconds * 1000
                : 0;
            const rateLimitDelayMs = getRateLimitDelayMs(response.headers) ?? 0;
            const backoffMs = Math.min(TWITTER_BASE_BACKOFF_MS * 2 ** (attempt - 1), TWITTER_MAX_BACKOFF_MS);
            const waitMs = Math.max(backoffMs, retryAfterMs, rateLimitDelayMs);
            await sleep(waitMs);
            continue;
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt === TWITTER_MAX_RETRIES) {
                break;
            }
            const waitMs = Math.min(TWITTER_BASE_BACKOFF_MS * 2 ** (attempt - 1), TWITTER_MAX_BACKOFF_MS);
            await sleep(waitMs);
        }
        finally {
            clearTimeout(timer);
        }
    }
    throw lastError ?? new Error("X API request failed");
}
function normalizeWhitespace(input) {
    return input.replace(/\s+/g, " ").trim();
}
function buildTweetUrl(tweetId, username) {
    const safeUser = username || "i";
    return `https://x.com/${safeUser}/status/${tweetId}`;
}
async function crawlTwitterSources(twitterSources, bearerToken) {
    const allItems = [];
    const seenTweetIds = new Set();
    for (let i = 0; i < twitterSources.length; i++) {
        const source = twitterSources[i];
        const query = source.twitterQuery?.trim();
        if (!query)
            continue;
        const url = new URL(TWITTER_RECENT_SEARCH_URL);
        url.searchParams.set("query", query);
        url.searchParams.set("max_results", "100");
        url.searchParams.set("tweet.fields", "created_at,author_id,public_metrics");
        url.searchParams.set("expansions", "author_id");
        url.searchParams.set("user.fields", "name,username");
        const response = await fetchTwitterRecentSearchWithRetry(url, bearerToken);
        const payload = (await response.json());
        const users = new Map((payload.includes?.users ?? []).map((user) => [user.id, user]));
        for (const tweet of payload.data ?? []) {
            if (!tweet.id || !tweet.text || seenTweetIds.has(tweet.id))
                continue;
            seenTweetIds.add(tweet.id);
            const user = tweet.author_id ? users.get(tweet.author_id) : undefined;
            const username = user?.username || "unknown";
            const authorLabel = user?.name
                ? `${user.name} (@${username})${user.verified ? " ✓" : ""}`
                : `@${username}`;
            const text = normalizeWhitespace(tweet.text);
            const title = text.slice(0, 180) || `Tweet by ${authorLabel}`;
            const tweetUrl = buildTweetUrl(tweet.id, username);
            const metrics = tweet.public_metrics;
            allItems.push({
                source,
                url: tweetUrl,
                title,
                text: [
                    `Tweet Author: ${authorLabel}`,
                    `Tweet URL: ${tweetUrl}`,
                    `Published: ${tweet.created_at || "unknown"}`,
                    `Search Query: ${query}`,
                    metrics
                        ? `Metrics: ${metrics.like_count ?? 0} likes, ${metrics.retweet_count ?? 0} reposts, ${metrics.reply_count ?? 0} replies, ${metrics.quote_count ?? 0} quotes`
                        : "",
                    "",
                    text,
                ]
                    .filter(Boolean)
                    .join("\n"),
                fetchedAt: new Date().toISOString(),
            });
        }
        if (i < twitterSources.length - 1) {
            await sleep(INTER_QUERY_DELAY_MS);
        }
    }
    return allItems;
}
//# sourceMappingURL=twitter-crawler.js.map