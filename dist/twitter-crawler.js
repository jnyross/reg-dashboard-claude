"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crawlTwitterSources = crawlTwitterSources;
const TWITTER_RECENT_SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent";
const INTER_QUERY_DELAY_MS = 1_500;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
        url.searchParams.set("tweet.fields", "created_at,author_id,public_metrics,entities");
        url.searchParams.set("expansions", "author_id");
        url.searchParams.set("user.fields", "name,username,verified");
        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                Authorization: `Bearer ${bearerToken}`,
                Accept: "application/json",
            },
        });
        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(`X API ${response.status}: ${body.slice(0, 200)}`);
        }
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